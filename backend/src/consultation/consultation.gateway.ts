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
import { DatabaseService } from '../database/database.service';
import { AuthService } from '../auth/auth.service';
import { Injectable } from '@nestjs/common';

interface ClientData {
  consultationId?: number;
  userId?: number;
}

@Injectable()
@WebSocketGateway({ namespace: '/consultation', cors: true })
export class ConsultationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server | undefined;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly authService: AuthService,
  ) {}

  // 🔌 When a client connects
  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.query.token;
    const consultationId = Number(client.handshake.query.consultationId);

    if (typeof token !== 'string' || isNaN(consultationId)) {
      client.disconnect();
      return;
    }

    const decoded = this.authService.validateToken(token);
    if (!decoded) {
      client.disconnect();
      return;
    }

    const userId = decoded.userId;
    const clientData = client.data as ClientData;
    clientData.consultationId = consultationId;
    clientData.userId = userId;

    await client.join(`consultation:${consultationId}`);
    const participant = await this.databaseService.upsertParticipant(consultationId, userId, true);
    const user = await this.databaseService.findUserById(userId) as { role?: string; firstName?: string } | null;

    // 🔊 Notify practitioner if a patient joins
    if (user?.role === 'Patient') {
      this.notifyPractitioner({
        consultationId,
        patientName: user.firstName || 'Patient',
        joinedAt: participant?.joinedAt?.toISOString() || new Date().toISOString(),
      });
    }

    // 🟢 System message
    this.server?.to(`consultation:${consultationId}`).emit('system-message', {
      type: 'JOINED',
      userId,
      timestamp: new Date().toISOString(),
    });
  }

  // 🔌 When a client disconnects
  async handleDisconnect(client: Socket): Promise<void> {
    const { consultationId, userId } = client.data as ClientData;
    if (!consultationId || !userId) return;

    await this.databaseService.upsertParticipant(consultationId, userId, false);
    const activePatients = await this.databaseService.findActivePatients(consultationId);
    const consultation = await this.databaseService.findConsultationById(consultationId).catch(() => null);

    if (activePatients.length === 0 && consultation?.status === 'WAITING') {
      await this.databaseService.updateConsultationStatus(consultationId, 'SCHEDULED');
    }

    this.server?.to(`consultation:${consultationId}`).emit('system-message', {
      type: 'LEFT',
      userId,
      timestamp: new Date().toISOString(),
    });
  }

  // 💬 Chat message handler
  @SubscribeMessage('chat-message')
  async handleChatMessage(
    @MessageBody()
    message: {
      consultationId: number;
      userId: number;
      content?: string;
      mediaUrl?: string;
      type: 'TEXT' | 'IMAGE' | 'FILE';
    },
    @ConnectedSocket() client: Socket,
  ) {
    const savedMessage = await this.databaseService.saveMessage({
      consultationId: message.consultationId,
      userId: message.userId,
      content: message.content,
      mediaUrl: message.mediaUrl,
      type: message.type,
    });

    this.server
      ?.to(`consultation:${message.consultationId}`)
      .emit('chat-message', savedMessage);
  }

  // ✅ Read receipt handler
  @SubscribeMessage('message-read')
  async handleReadReceipt(
    @MessageBody() data: { consultationId: number; userId: number; messageId: number },
  ) {
    await this.databaseService.markMessageAsRead(data.messageId, data.userId);

    this.server
      ?.to(`consultation:${data.consultationId}`)
      .emit('message-read', data);
  }

  // 📢 Notify practitioner when a patient joins
  public notifyPractitioner(data: {
    consultationId: number;
    patientName: string;
    joinedAt: string;
  }) {
    this.server?.to(`consultation:${data.consultationId}`).emit('patient-joined', {
      consultationId: data.consultationId,
      patientName: data.patientName,
      joinedAt: data.joinedAt,
    });
  }
}
