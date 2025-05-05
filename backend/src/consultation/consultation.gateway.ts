import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DatabaseService } from 'src/database/database.service';

@WebSocketGateway({ namespace: '/consultation', cors: true })
export class ConsultationGateway
  implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(private readonly databaseService: DatabaseService) { }

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

    // Get user information
    const user = await this.databaseService.user.findUnique({
      where: { id: uId },
      select: { firstName: true, lastName: true, role: true }
    });

    if (!user) return;

    // Update the participant record
    await this.databaseService.participant.upsert({
      where: { consultationId_userId: { consultationId: cId, userId: uId } },
      create: { consultationId: cId, userId: uId, isActive: true, joinedAt: new Date() },
      update: { isActive: true, joinedAt: new Date() },
    });

    // If this is a patient joining, emit event to the practitioner
    if (user.role === 'Patient') {
      // Get consultation to find the owner/practitioner
      const consultation = await this.databaseService.consultation.findUnique({
        where: { id: cId },
        select: { owner: true }
      });

      if (consultation && consultation.owner) {
        // Get all practitioner sockets
        const sockets = await this.server.fetchSockets();
        
        // Emit patient-joined event to the practitioner's socket
        for (const socket of sockets) {
          if (socket.data.userId === consultation.owner) {
            // Emit to specific practitioner socket
            this.server.to(socket.id).emit('patient-joined', {
              consultationId: cId,
              patientName: user.firstName || 'Anonymous',
              joinTime: new Date(),
              patientId: uId
            });
            break;
          }
        }
        
        // Update consultation status to WAITING if it was SCHEDULED
        await this.databaseService.consultation.updateMany({
          where: { 
            id: cId,
            status: 'SCHEDULED'
          },
          data: { status: 'WAITING' }
        });
      }
    }
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
}
