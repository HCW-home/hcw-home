import { NotFoundException } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Namespace, Server, Socket } from 'socket.io';
import { DatabaseService } from 'src/database/database.service';

@WebSocketGateway({ namespace: 'consultation', cors: true })
export class ConsultationGateway
  implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Namespace;

  constructor(private readonly databaseService: DatabaseService) { }

  /**
   * When a socket connects, we expect the client to pass
   * ?consultationId=123&userId=456 in the connection URL.
   * We join them to the room and mark them active.
   */
   async notifyPractitioner(
    practitionerId: number,
    payload: { consultationId: number; patientName: string; joinedAt: string },
  ) {
    this.server.to(`practitioner:${practitionerId}`)
      .emit('patient-joined', payload);
  }

  async handleConnection(client: Socket) {
    const cId = Number(client.handshake.query.consultationId);
    const uId = Number(client.handshake.query.userId);
    if (!cId || !uId) return;
    client.join(`consultation:${cId}`);
    client.data.consultationId = cId;
    client.data.userId = uId;

     const user_data =  await this.databaseService.user.findFirst({
      where: {
           id: uId
      }
    })
    const participant_data = await this.databaseService.participant.findFirst({
      where: {
          consultationId: cId,
          userId: uId
      },
      select: {
         isActive: true,
         joinedAt: true
      }
    })
    if(user_data?.role==='Patient' && participant_data?.isActive===true){
        const consultation = await this.databaseService.consultation.findUnique({
          where: { id: cId },
          select: {
             owner: true, 
            startedAt: true
            },    
        });

        if (!consultation) {
          throw new NotFoundException('Consultation not found');
        }
        if (consultation.owner == null) {
          throw new NotFoundException('Consultation owner not set');
        }
        const ownerId: number = consultation.owner;
        const payload = {
          consultationId: cId,
          patientName: user_data.firstName ?? 'Patient',
          joinedAt: (consultation.startedAt ?? new Date()).toISOString(),
        };
        await this.notifyPractitioner(ownerId, payload);
    }

    await this.databaseService.participant.upsert({
      where: { consultationId_userId: { consultationId: cId, userId: uId } },
      create: { consultationId: cId, userId: uId, isActive: true, joinedAt: new Date() },
      update: { isActive: true },
    });
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
