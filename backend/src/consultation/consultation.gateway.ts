import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DatabaseService } from '../database/database.service';
import { AuthService } from '../auth/auth.service';

interface ClientData {
  consultationId?: number;
  userId?: number;
}

@WebSocketGateway({ namespace: '/consultation', cors: true })
export class ConsultationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server | undefined;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly authService: AuthService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.query.token;

    if (typeof token !== 'string') {
      client.disconnect();
      return;
    }

    const decoded = this.authService.validateToken(token);
    if (!decoded) {
      client.disconnect();
      return;
    }

    const cId = Number(client.handshake.query.consultationId);
    const uId = decoded.userId;

    const clientData = client.data as ClientData;
    clientData.consultationId = cId;
    clientData.userId = uId;

    await client.join(`consultation:${cId}`);

    await this.databaseService.upsertParticipant(cId, uId, true);
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const { consultationId, userId } = client.data as ClientData;
    if (!consultationId || !userId) return;

    await this.databaseService.upsertParticipant(consultationId, userId, false);

    const activePatients =
      await this.databaseService.findActivePatients(consultationId);

    const consultation = await this.databaseService.findConsultationById(consultationId).catch(() => null);

    if (activePatients.length === 0 && consultation?.status === 'WAITING') {
      await this.databaseService.updateConsultationStatus(
        consultationId,
        'SCHEDULED',
      );
    }
  }
}
