import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DatabaseService } from 'src/database/database.service';
import { ConsultationService } from './consultation.service';
import { CreateInvitationDto, MessageServiceDto, InvitationRoleDto } from './dto/create-invitation.dto';

interface SendMessageDto {
  content: string;
  contentType: 'TEXT' | 'IMAGE' | 'FILE';
  fileUrl?: string;
}

interface ReadMessageDto {
  messageId: number;
}

interface TypingStatusDto {
  isTyping: boolean;
}

@WebSocketGateway({ namespace: '/consultation', cors: true })
export class ConsultationGateway
  implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly consultationService: ConsultationService,
  ) { }

  /**
   * When a socket connects, we expect the client to pass
   * ?consultationId=123&userId=456 in the connection URL.
   * We join them to the room and mark them active.
   */
  async handleConnection(client: Socket) {
    const cId = Number(client.handshake.query.consultationId);
    const uId = Number(client.handshake.query.userId);
    if (!cId || !uId) return;

    client.join(`consultation:${cId}`);
    client.data.consultationId = cId;
    client.data.userId = uId;

    const participant = await this.databaseService.participant.upsert({
      where: { consultationId_userId: { consultationId: cId, userId: uId } },
      create: { consultationId: cId, userId: uId, isActive: true, joinedAt: new Date() },
      update: { isActive: true },
      select: { id: true }
    });
    
    client.data.participantId = participant.id;

    // Send all unread messages
    const messages = await this.databaseService.message.findMany({
      where: { consultationId: cId },
      include: {
        sender: {
          include: { 
            user: { 
              select: { 
                id: true, 
                firstName: true, 
                lastName: true,
                role: true
              } 
            } 
          }
        },
        readReceipts: true
      },
      orderBy: { createdAt: 'asc' }
    });
    
    client.emit('message-history', messages);
  }

  /**
   * On disconnect, mark them inactive.
   */
  async handleDisconnect(client: Socket) {
    const { consultationId, userId } = client.data;
    if (!consultationId || !userId) return;

    await this.databaseService.participant.updateMany({
      where: { consultationId, userId },
      data: { isActive: false },
    });

    const activePatients = await this.databaseService.participant.findMany({
      where: {
        consultationId,
        isActive: true,
        user: { role: 'Patient' },
      },
    });

    const consultation = await this.databaseService.consultation.findUnique({
      where: { id: consultationId },
    });    

    if (activePatients.length === 0 && consultation?.status == 'WAITING') {
      await this.databaseService.consultation.update({
        where: { id: consultationId },
        data: { status: 'SCHEDULED' },
      });
    }
  }

  /**
   * Handle sending a new message in the consultation
   */
  @SubscribeMessage('send-message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SendMessageDto
  ) {
    const { consultationId, participantId } = client.data;
    if (!consultationId || !participantId) return;

    // Create the message
    const message = await this.databaseService.message.create({
      data: {
        consultationId,
        senderId: participantId,
        content: data.content,
        contentType: data.contentType,
        fileUrl: data.fileUrl,
      },
      include: {
        sender: {
          include: { 
            user: { 
              select: { 
                id: true, 
                firstName: true, 
                lastName: true, 
                role: true
              } 
            } 
          }
        }
      }
    });

    // Broadcast the message to all clients in this consultation
    this.server.to(`consultation:${consultationId}`).emit('new-message', message);

    return { success: true, messageId: message.id };
  }

  /**
   * Handle marking a message as read
   */
  @SubscribeMessage('mark-message-read')
  async handleMarkMessageRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: ReadMessageDto
  ) {
    const { consultationId, participantId } = client.data;
    if (!consultationId || !participantId || !data.messageId) return;

    // Check if message exists and belongs to this consultation
    const message = await this.databaseService.message.findFirst({
      where: {
        id: data.messageId,
        consultationId
      }
    });

    if (!message) return { success: false, error: 'Message not found' };

    // Create or update read receipt
    const readReceipt = await this.databaseService.readReceipt.upsert({
      where: {
        messageId_participantId: {
          messageId: data.messageId,
          participantId
        }
      },
      create: {
        messageId: data.messageId,
        participantId,
        readAt: new Date()
      },
      update: {
        readAt: new Date()
      }
    });

    // Notify everyone that this message was read
    this.server.to(`consultation:${consultationId}`).emit('message-read', {
      messageId: data.messageId,
      participantId,
      readAt: readReceipt.readAt
    });

    return { success: true };
  }

  /**
   * Handle typing indicator
   */
  @SubscribeMessage('typing-status')
  async handleTypingStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: TypingStatusDto
  ) {
    const { consultationId, participantId } = client.data;
    if (!consultationId || !participantId) return;

    // Notify all participants except sender about typing status
    client.to(`consultation:${consultationId}`).emit('user-typing', {
      participantId,
      isTyping: data.isTyping
    });

    return { success: true };
  }

  /**
   * Handle inviting a new participant during live consultation
   */
  @SubscribeMessage('invite-participant')
  async handleInviteParticipant(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: CreateInvitationDto
  ) {
    const { consultationId } = client.data;
    if (!consultationId) return { success: false, error: 'Invalid consultation' };

    try {
      // Create the invitation using consultation service
      const invitation = await this.consultationService.createInvitation(consultationId, {
        name: data.name,
        contactValue: data.contactValue,
        contactMethod: data.contactMethod,
        role: data.role,
        notes: data.notes
      });

      // Notify all participants about the new invited user
      this.server.to(`consultation:${consultationId}`).emit('participant-invited', {
        name: invitation.name,
        role: invitation.role,
        contactMethod: data.contactMethod
      });

      return { success: true, invitation };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
