import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DatabaseService } from '../../src/database/database.service';

@WebSocketGateway({ namespace: '/consultation', cors: true })
export class ConsultationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server | undefined;

  constructor(private readonly databaseService: DatabaseService) {}

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

    await this.databaseService.participant.upsert({
      where: { consultationId_userId: { consultationId: cId, userId: uId } },
      create: {
        consultationId: cId,
        userId: uId,
        isActive: true,
        joinedAt: new Date(),
      },
      update: { isActive: true },
    });

    this.emitPatientJoined(cId, uId);
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
   * Emit event when a patient joins the waiting room
   */
  emitPatientJoined(consultationId: number, patientId: number) {
    if (!this.server) return;
    this.server.to(`consultation:${consultationId}`).emit('patient:joined', {
      consultationId,
      patientId,
      timestamp: new Date(),
    });
  }
}
