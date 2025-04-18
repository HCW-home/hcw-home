import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DatabaseService } from 'src/database/database.service';
import { ConsultationService } from './consultation.service';
import { Injectable } from '@nestjs/common';

@Injectable()
@WebSocketGateway({ namespace: '/consultation', cors: true })
export class ConsultationGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  @WebSocketServer() server: Server;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly consultationService: ConsultationService,
  ) {}

  afterInit() {
    console.log('Consultation WebSocket Gateway initialized');
  }

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

    // Get user role
    const user = await this.databaseService.user.findUnique({
      where: { id: uId },
      select: { role: true, firstName: true, lastName: true },
    });

    if (!user) return;
    client.data.userRole = user.role;
    client.data.userName = `${user.firstName} ${user.lastName}`;

    // Mark participant as active
    await this.databaseService.participant.upsert({
      where: { consultationId_userId: { consultationId: cId, userId: uId } },
      create: { consultationId: cId, userId: uId, isActive: true, joinedAt: new Date() },
      update: { isActive: true },
    });

    // Get all active participants
    const participants = await this.databaseService.participant.findMany({
      where: {
        consultationId: cId,
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
    });

    // If practitioner just joined, mark consultation as ACTIVE and notify others
    if (user.role === 'Practitioner') {
      await this.consultationService.joinAsPractitioner(cId, uId);
      
      // Notify room that practitioner has joined
      this.server.to(`consultation:${cId}`).emit('practitioner-joined', {
        consultationId: cId,
        practitioner: {
          id: uId,
          name: client.data.userName,
        },
      });
    }

    // Send active participants list to the newly connected client
    client.emit('participants-list', participants);
    
    // Notify everyone else that a new participant joined
    client.to(`consultation:${cId}`).emit('participant-joined', {
      userId: uId,
      name: client.data.userName,
      role: user.role,
    });
  }

  /**
   * On disconnect, mark them inactive.
   */
  async handleDisconnect(client: Socket) {
    const { consultationId, userId, userName, userRole } = client.data;
    if (!consultationId || !userId) return;

    await this.databaseService.participant.updateMany({
      where: { consultationId, userId },
      data: { isActive: false },
    });

    // Notify others that participant left
    client.to(`consultation:${consultationId}`).emit('participant-left', {
      userId,
      name: userName,
      role: userRole,
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

  // Handle real-time messaging
  @SubscribeMessage('send-message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { text: string },
  ) {
    const { consultationId, userId, userName, userRole } = client.data;
    if (!consultationId || !userId) return;

    // Temporary solution until Prisma schema is regenerated
    // Instead of saving to database, just broadcast message with temporary ID
    const message = {
      id: Date.now().toString(),
      senderId: userId,
      senderName: userName,
      senderRole: userRole,
      text: data.text,
      timestamp: new Date(),
    };

    // Broadcast message to all participants
    this.server.to(`consultation:${consultationId}`).emit('new-message', message);
  }

  // WebRTC signaling for media connections
  @SubscribeMessage('media-signal')
  handleMediaSignal(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { 
      type: string, 
      target: number, // target user ID
      payload: any 
    },
  ) {
    const { consultationId, userId } = client.data;
    if (!consultationId || !userId) return;

    // Find socket of target user using server.sockets.adapter
    const roomName = `consultation:${consultationId}`;
    const sockets = this.server.sockets.adapter.rooms.get(roomName);
    
    if (sockets) {
      // Get the socket instances from the room
      const targetSockets = Array.from(sockets)
        .map(socketId => this.server.sockets.sockets.get(socketId))
        .filter((socket): socket is Socket => socket !== undefined && socket.data.userId === data.target);

      // Forward signal to target
      if (targetSockets.length > 0) {
        targetSockets.forEach(socket => {
          socket.emit('media-signal', {
            type: data.type,
            sourceId: userId,
            payload: data.payload,
          });
        });
      }
    }
  }
}
