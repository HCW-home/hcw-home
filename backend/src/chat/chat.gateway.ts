import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { UseGuards } from '@nestjs/common';
import { WsAuthGuard } from 'src/auth/guards/ws-auth.guard';
import { CreateMessageDto } from './dto/create-message.dto';
import { ReadMessageDto } from './dto/read-message.dto';
import { TypingIndicatorDto } from './dto/typing-indicator.dto';
import { Logger } from '@nestjs/common';
import { ConfigService } from '../config/config.service';

@UseGuards(WsAuthGuard)
@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: '*', // Allow all origins in development
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['*'],
    transports: ['websocket', 'polling'],
  },
  allowEIO3: true,
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private readonly typingUsers = new Map<
    string,
    { userId: number; consultationId: number; timeout: NodeJS.Timeout }
  >();
  // Rate limiting: userId -> { timestamps: number[] }
  private readonly messageRateLimit = new Map<number, number[]>();
  private readonly typingRateLimit = new Map<number, number[]>();
  private readonly MESSAGE_LIMIT = 10; // max messages per window
  private readonly MESSAGE_WINDOW_MS = 10000; // 10 seconds
  private readonly TYPING_LIMIT = 20; // max typing events per window
  private readonly TYPING_WINDOW_MS = 10000; // 10 seconds

  constructor(
    private readonly chatService: ChatService,
    private readonly configService: ConfigService,
  ) { }

  async handleConnection(client: Socket) {
    try {
      const { consultationId, userId, userRole, joinType } =
        client.handshake.query;

      if (!consultationId || !userId) {
        client.emit('error', {
          message: 'consultationId and userId are required',
        });
        client.disconnect();
        return;
      }

      const consultationRoom = `consultation:${consultationId}`;
      await client.join(consultationRoom);

      // Store user data on client
      client.data = {
        consultationId: Number(consultationId),
        userId: Number(userId),
        userRole: userRole as string,
        joinType: joinType as string, // 'magic-link', 'dashboard', 'readmission'
        joinedAt: new Date(),
      };

      this.logger.log(
        `Chat client connected: ${client.id}, User: ${userId}, Role: ${userRole}, JoinType: ${joinType}, Consultation: ${consultationId}`,
      );

      // Enhanced join notification with context
      client.to(consultationRoom).emit('user_joined_chat', {
        userId: Number(userId),
        consultationId: Number(consultationId),
        userRole: userRole as string,
        joinType: joinType as string,
        joinedAt: new Date().toISOString(),
        context: this.getJoinContext(joinType as string, userRole as string),
      });

      // Send recent messages to newly connected client
      const recentMessages = await this.chatService.getMessages(
        Number(consultationId),
      );
      client.emit('message_history', {
        messages: recentMessages,
        consultationId: Number(consultationId),
        timestamp: new Date().toISOString(),
      });

      // Send appropriate system message based on join context
      await this.handleSystemJoinMessage(
        Number(consultationId),
        Number(userId),
        userRole as string,
        joinType as string,
      );
    } catch (error) {
      this.logger.error('Chat connection error:', error);
      client.emit('error', { message: 'Connection failed' });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    try {
      const { consultationId, userId, userRole, joinType } = client.data || {};

      if (consultationId && userId) {
        // Stop typing indicator if user was typing
        this.stopTyping(client);

        // Notify other participants that user left chat
        const consultationRoom = `consultation:${consultationId}`;
        client.to(consultationRoom).emit('user_left_chat', {
          userId,
          consultationId,
          userRole,
          joinType,
          leftAt: new Date().toISOString(),
          context: `${userRole === 'PATIENT' ? 'Patient' : userRole.toLowerCase()} left the chat`,
        });

        // Create system message for user leaving
        this.handleSystemLeaveMessage(consultationId, userId, userRole);

        this.logger.log(
          `Chat client disconnected: ${client.id}, User: ${userId}, Role: ${userRole}, Consultation: ${consultationId}`,
        );
      }
    } catch (error) {
      this.logger.error('Chat disconnect error:', error);
    }
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CreateMessageDto,
  ) {
    try {
      const { consultationId, userId } = client.data;

      // Validate that message belongs to user's consultation
      if (
        payload.consultationId !== consultationId ||
        payload.userId !== userId
      ) {
        throw new WsException('Invalid consultation or user for message');
      }

      // Rate limiting check
      const now = Date.now();
      const timestamps = this.messageRateLimit.get(userId) || [];
      // Remove timestamps outside window
      const recent = timestamps.filter(ts => now - ts < this.MESSAGE_WINDOW_MS);
      if (recent.length >= this.MESSAGE_LIMIT) {
        client.emit('message_error', {
          error: 'Rate limit exceeded. Please wait before sending more messages.',
          timestamp: new Date().toISOString(),
        });
        return;
      }
      recent.push(now);
      this.messageRateLimit.set(userId, recent);

      // Create message in database
      const createdMessage = await this.chatService.createMessage(payload);

      // Stop typing indicator since user sent message
      this.stopTyping(client);

      // Emit message to all participants in consultation
      const consultationRoom = `consultation:${consultationId}`;
      this.server.to(consultationRoom).emit('new_message', {
        message: createdMessage,
        consultationId,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(
        `Message sent: User ${userId}, Consultation ${consultationId}, Message ID: ${createdMessage.id}`,
      );
    } catch (error) {
      this.logger.error('Send message error:', error);
      client.emit('message_error', {
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @SubscribeMessage('mark_message_read')
  async handleMarkMessageRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ReadMessageDto,
  ) {
    try {
      const { consultationId, userId } = client.data;

      // Validate that read receipt belongs to user's consultation
      if (
        payload.consultationId !== consultationId ||
        payload.userId !== userId
      ) {
        throw new WsException('Invalid consultation or user for read receipt');
      }

      await this.chatService.markMessageAsRead(payload);

      // Emit read receipt to all participants
      const consultationRoom = `consultation:${consultationId}`;
      this.server.to(consultationRoom).emit('message_read', {
        messageId: payload.messageId,
        userId,
        consultationId,
        readAt: new Date().toISOString(),
      });

      this.logger.log(
        `Message marked as read: Message ${payload.messageId}, User ${userId}, Consultation ${consultationId}`,
      );
    } catch (error) {
      this.logger.error('Mark message read error:', error);
      client.emit('read_receipt_error', {
        error: error.message,
        messageId: payload.messageId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @SubscribeMessage('start_typing')
  handleStartTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { consultationId: number },
  ) {
    try {
      const { consultationId, userId } = client.data;

      if (payload.consultationId !== consultationId) {
        throw new WsException('Invalid consultation for typing indicator');
      }

      // Rate limiting check for typing
      const now = Date.now();
      const timestamps = this.typingRateLimit.get(userId) || [];
      const recent = timestamps.filter(ts => now - ts < this.TYPING_WINDOW_MS);
      if (recent.length >= this.TYPING_LIMIT) {
        client.emit('error', {
          message: 'Rate limit exceeded for typing events. Please wait.',
        });
        return;
      }
      recent.push(now);
      this.typingRateLimit.set(userId, recent);

      this.stopTyping(client);

      const timeout = setTimeout(() => {
        this.stopTyping(client);
      }, this.configService.chatTypingTimeoutMs);

      this.typingUsers.set(client.id, { userId, consultationId, timeout });

      // Emit typing indicator to other participants
      const consultationRoom = `consultation:${consultationId}`;
      client.to(consultationRoom).emit('user_typing', {
        userId,
        consultationId,
        isTyping: true,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Start typing error:', error);
    }
  }

  @SubscribeMessage('stop_typing')
  handleStopTyping(@ConnectedSocket() client: Socket) {
    this.stopTyping(client);
  }

  @SubscribeMessage('request_message_history')
  async handleRequestMessageHistory(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { consultationId: number; limit?: number; offset?: number },
  ) {
    try {
      const { consultationId } = client.data;

      if (payload.consultationId !== consultationId) {
        throw new WsException('Invalid consultation for message history');
      }

      const messages = await this.chatService.getMessages(
        consultationId,
        payload.limit || this.configService.chatMessageHistoryLimit,
        payload.offset || 0,
      );

      client.emit('message_history', {
        messages,
        consultationId,
        hasMore: messages.length === (payload.limit || this.configService.chatMessageHistoryLimit),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Request message history error:', error);
      client.emit('message_history_error', {
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @SubscribeMessage('mark_all_read')
  async handleMarkAllRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { consultationId: number },
  ) {
    try {
      const { consultationId, userId } = client.data;

      if (payload.consultationId !== consultationId) {
        throw new WsException('Invalid consultation for mark all read');
      }

      await this.chatService.markAllMessagesAsReadForUser(userId, consultationId);

      // Emit read status update to all participants
      const consultationRoom = `consultation:${consultationId}`;
      this.server.to(consultationRoom).emit('all_messages_read', {
        userId,
        consultationId,
        readAt: new Date().toISOString(),
      });

      this.logger.log(`All messages marked as read for user ${userId} in consultation ${consultationId}`);
    } catch (error) {
      this.logger.error('Mark all read error:', error);
      client.emit('mark_all_read_error', {
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @SubscribeMessage('get_typing_users')
  handleGetTypingUsers(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { consultationId: number },
  ) {
    try {
      const { consultationId } = client.data;

      if (payload.consultationId !== consultationId) {
        throw new WsException('Invalid consultation for typing users');
      }

      const typingUsers = this.chatService.getTypingUsers(consultationId);

      client.emit('typing_users', {
        consultationId,
        typingUsers,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Get typing users error:', error);
    }
  }

  @SubscribeMessage('request_participants')
  async handleRequestParticipants(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { consultationId: number },
  ) {
    try {
      const { consultationId } = client.data;

      if (payload.consultationId !== consultationId) {
        throw new WsException('Invalid consultation for participants');
      }

      const participants = await this.chatService.getConsultationParticipants(consultationId);

      client.emit('participants_list', {
        consultationId,
        participants,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Request participants error:', error);
      client.emit('participants_error', {
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @SubscribeMessage('bulk_mark_read')
  async handleBulkMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { consultationId: number; messageIds: number[] },
  ) {
    try {
      const { consultationId, userId } = client.data;

      if (payload.consultationId !== consultationId) {
        throw new WsException('Invalid consultation for bulk read');
      }

      await this.chatService.bulkMarkMessagesAsRead(
        payload.messageIds,
        userId,
        consultationId,
      );

      // Emit bulk read receipt to all participants
      const consultationRoom = `consultation:${consultationId}`;
      this.server.to(consultationRoom).emit('messages_bulk_read', {
        messageIds: payload.messageIds,
        userId,
        consultationId,
        readAt: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Bulk mark read error:', error);
      client.emit('bulk_read_error', {
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @SubscribeMessage('edit_message')
  async handleEditMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { messageId: number; content: string; consultationId: number },
  ) {
    try {
      const { consultationId, userId } = client.data;

      if (payload.consultationId !== consultationId) {
        throw new WsException('Invalid consultation for message edit');
      }

      const editedMessage = await this.chatService.editMessage(
        payload.messageId,
        userId,
        payload.content,
        consultationId,
      );

      // Emit edited message to all participants
      const consultationRoom = `consultation:${consultationId}`;
      this.server.to(consultationRoom).emit('message_edited', {
        message: editedMessage,
        consultationId,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(
        `Message edited: Message ${payload.messageId}, User ${userId}, Consultation ${consultationId}`,
      );
    } catch (error) {
      this.logger.error('Edit message error:', error);
      client.emit('edit_message_error', {
        error: error.message,
        messageId: payload.messageId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @SubscribeMessage('delete_message')
  async handleDeleteMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { messageId: number; consultationId: number },
  ) {
    try {
      const { consultationId, userId } = client.data;

      if (payload.consultationId !== consultationId) {
        throw new WsException('Invalid consultation for message delete');
      }

      const deletedMessage = await this.chatService.deleteMessage(
        payload.messageId,
        userId,
        consultationId,
      );

      // Emit deleted message to all participants
      const consultationRoom = `consultation:${consultationId}`;
      this.server.to(consultationRoom).emit('message_deleted', {
        message: deletedMessage,
        consultationId,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(
        `Message deleted: Message ${payload.messageId}, User ${userId}, Consultation ${consultationId}`,
      );
    } catch (error) {
      this.logger.error('Delete message error:', error);
      client.emit('delete_message_error', {
        error: error.message,
        messageId: payload.messageId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @SubscribeMessage('patient_state_transition')
  async handlePatientStateTransition(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      consultationId: number;
      fromState: 'waiting' | 'admitted' | 'disconnected';
      toState: 'waiting' | 'admitted' | 'consultation' | 'rejoining';
      patientId: number;
    },
  ) {
    try {
      const { consultationId, userId } = client.data;

      if (payload.consultationId !== consultationId) {
        throw new WsException('Invalid consultation for state transition');
      }

      // Emit state transition to all participants
      const consultationRoom = `consultation:${consultationId}`;
      this.server.to(consultationRoom).emit('patient_state_changed', {
        consultationId,
        patientId: payload.patientId,
        fromState: payload.fromState,
        toState: payload.toState,
        timestamp: new Date().toISOString(),
        triggeredBy: userId,
      });

      // Create system message for state transition
      const stateMessage = this.getStateTransitionMessage(
        payload.fromState,
        payload.toState,
      );
      if (stateMessage) {
        await this.chatService.createSystemMessage(
          consultationId,
          stateMessage,
        );

        this.server.to(consultationRoom).emit('system_message', {
          consultationId,
          content: stateMessage,
          timestamp: new Date().toISOString(),
          type: 'state_transition',
          context: {
            patientId: payload.patientId,
            fromState: payload.fromState,
            toState: payload.toState,
          },
        });
      }

      this.logger.log(
        `Patient state transition: Patient ${payload.patientId}, ${payload.fromState} → ${payload.toState}, Consultation ${consultationId}`,
      );
    } catch (error) {
      this.logger.error('Patient state transition error:', error);
      client.emit('state_transition_error', {
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private stopTyping(client: Socket) {
    const typingInfo = this.typingUsers.get(client.id);
    if (typingInfo) {
      clearTimeout(typingInfo.timeout);
      this.typingUsers.delete(client.id);

      // Emit stop typing to other participants
      const consultationRoom = `consultation:${typingInfo.consultationId}`;
      client.to(consultationRoom).emit('user_typing', {
        userId: typingInfo.userId,
        consultationId: typingInfo.consultationId,
        isTyping: false,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Get context message for different join types
   */
  private getJoinContext(joinType: string, userRole: string): string {
    switch (joinType) {
      case 'magic-link':
        return userRole === 'PATIENT'
          ? 'Patient joined via invitation link'
          : `${userRole.toLowerCase()} joined via invitation link`;
      case 'dashboard':
        return userRole === 'PATIENT'
          ? 'Patient rejoined from dashboard'
          : `${userRole.toLowerCase()} joined from dashboard`;
      case 'readmission':
        return 'Patient returned to active consultation';
      case 'waiting-room':
        return 'Patient waiting for admission';
      default:
        return `${userRole.toLowerCase()} joined the consultation`;
    }
  }

  /**
   * Handle system messages for user leaving
   */
  private async handleSystemLeaveMessage(
    consultationId: number,
    userId: number,
    userRole: string,
  ): Promise<void> {
    try {
      const systemMessage =
        userRole === 'PATIENT'
          ? 'Patient has left the consultation'
          : `${userRole.toLowerCase()} has left the consultation`;

      await this.chatService.createSystemMessage(consultationId, systemMessage);

      // Emit system message to remaining participants
      const consultationRoom = `consultation:${consultationId}`;
      this.server.to(consultationRoom).emit('system_message', {
        consultationId,
        content: systemMessage,
        timestamp: new Date().toISOString(),
        type: 'user_left',
        context: {
          userId,
          userRole,
        },
      });
    } catch (error) {
      this.logger.error('Failed to create system leave message:', error);
    }
  }

  /**
   * Get appropriate message for state transitions
   */
  private getStateTransitionMessage(
    fromState: string,
    toState: string,
  ): string {
    const transitions: Record<string, Record<string, string>> = {
      waiting: {
        admitted: 'Patient has been admitted to the consultation',
        consultation: 'Patient has joined the consultation room',
      },
      admitted: {
        consultation: 'Patient is now in the consultation room',
        waiting: 'Patient has returned to waiting room',
      },
      disconnected: {
        waiting: 'Patient has reconnected and is waiting',
        consultation: 'Patient has rejoined the consultation',
        rejoining: 'Patient is rejoining the consultation',
      },
    };

    return (
      transitions[fromState]?.[toState] ||
      `Patient state changed from ${fromState} to ${toState}`
    );
  }
  private async handleSystemJoinMessage(
    consultationId: number,
    userId: number,
    userRole: string,
    joinType: string,
  ): Promise<void> {
    try {
      let systemMessage = '';

      switch (joinType) {
        case 'magic-link':
          if (userRole === 'PATIENT') {
            systemMessage = 'Patient has joined and is waiting for admission';
          } else {
            systemMessage = `${userRole.toLowerCase()} has joined the consultation`;
          }
          break;
        case 'dashboard':
          systemMessage =
            userRole === 'PATIENT'
              ? 'Patient has rejoined the consultation'
              : `${userRole.toLowerCase()} has rejoined`;
          break;
        case 'readmission':
          systemMessage = 'Patient has returned to the active consultation';
          break;
        case 'waiting-room':
          systemMessage = 'Patient is waiting for practitioner admission';
          break;
        default:
          systemMessage = `User has joined the consultation`;
      }

      if (systemMessage) {
        await this.chatService.createSystemMessage(
          consultationId,
          systemMessage,
        );

        // Emit system message to all participants
        const consultationRoom = `consultation:${consultationId}`;
        this.server.to(consultationRoom).emit('system_message', {
          consultationId,
          content: systemMessage,
          timestamp: new Date().toISOString(),
          type: 'user_joined',
          context: {
            userId,
            userRole,
            joinType,
          },
        });
      }
    } catch (error) {
      this.logger.error('Failed to create system join message:', error);
    }
  }
}
