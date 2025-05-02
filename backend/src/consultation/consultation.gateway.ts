import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
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

    // Get user info
    const user = await this.databaseService.user.findUnique({
      where: { id: uId },
      select: { firstName: true, lastName: true, role: true }
    });

    // Update participant status
    const participant = await this.databaseService.participant.upsert({
      where: { consultationId_userId: { consultationId: cId, userId: uId } },
      create: { consultationId: cId, userId: uId, isActive: true, joinedAt: new Date() },
      update: { isActive: true },
      include: { user: { select: { firstName: true, lastName: true } } }
    });

    // Emit a participant joined event to all clients in the room
    this.server.to(`consultation:${cId}`).emit('participant_joined', {
      participantId: participant.id,
      userId: participant.userId,
      role: participant.role,
      name: `${user.firstName} ${user.lastName}`,
      joinedAt: participant.joinedAt,
      timestamp: new Date()
    });
  }

  /**
   * On disconnect, mark them inactive and notify others.
   */
  async handleDisconnect(client: Socket) {
    const { consultationId, userId } = client.data;
    if (!consultationId || !userId) return;

    // Get participant and user info before updating
    const participant = await this.databaseService.participant.findUnique({
      where: { consultationId_userId: { consultationId, userId } },
      include: { user: { select: { firstName: true, lastName: true } } }
    });

    if (participant) {
      // Update participant status
      await this.databaseService.participant.updateMany({
        where: { consultationId, userId },
        data: { isActive: false },
      });

      // Emit a participant left event to all clients in the room
      this.server.to(`consultation:${consultationId}`).emit('participant_left', {
        participantId: participant.id,
        userId: participant.userId,
        role: participant.role,
        name: `${participant.user.firstName} ${participant.user.lastName}`,
        timestamp: new Date()
      });
    }

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
   * Allows practitioners to add participants during a live consultation
   */
  @SubscribeMessage('add_participant')
  async handleAddParticipant(client: Socket, payload: { 
    userId: number, 
    role: string, 
    notes?: string 
  }) {
    const { consultationId } = client.data;
    if (!consultationId) return { success: false, error: 'No consultation ID' };

    try {
      // Verify the current user is allowed to add participants (should be practitioner)
      const practitionerCheck = await this.databaseService.consultation.findFirst({
        where: {
          id: consultationId,
          owner: client.data.userId
        }
      });

      if (!practitionerCheck) {
        return { success: false, error: 'Only the practitioner can add participants' };
      }

      // Create the participant
      const magicLink = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/join/${consultationId}/${Buffer.from(`${payload.userId}-${Date.now()}`).toString('base64')}`;
      
      const participant = await this.databaseService.participant.upsert({
        where: { consultationId_userId: { consultationId, userId: payload.userId } },
        create: { 
          consultationId, 
          userId: payload.userId, 
          role: payload.role, 
          notes: payload.notes,
          magicLink, 
          isActive: false 
        },
        update: { 
          role: payload.role, 
          notes: payload.notes,
          magicLink 
        },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phoneNumber: true
            }
          }
        }
      });

      // Notify all clients in this consultation about the new participant
      this.server.to(`consultation:${consultationId}`).emit('participant_invited', {
        participantId: participant.id,
        userId: participant.userId,
        role: participant.role,
        name: `${participant.user.firstName} ${participant.user.lastName}`,
        timestamp: new Date()
      });

      return {
        success: true,
        participant: {
          id: participant.id,
          user: participant.user,
          role: participant.role,
          magicLink
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Allows practitioners to invite external participants during a live consultation
   */
  @SubscribeMessage('invite_external_participant')
  async handleInviteExternalParticipant(client: Socket, payload: { 
    firstName: string,
    lastName: string,
    contactInfo: string,
    role: string, 
    notes?: string 
  }) {
    const { consultationId } = client.data;
    if (!consultationId) return { success: false, error: 'No consultation ID' };

    try {
      // Verify the current user is allowed to add participants (should be practitioner)
      const practitionerCheck = await this.databaseService.consultation.findFirst({
        where: {
          id: consultationId,
          owner: client.data.userId
        }
      });

      if (!practitionerCheck) {
        return { success: false, error: 'Only the practitioner can add participants' };
      }

      // Generate a random password for temporary accounts
      const tempPassword = Math.random().toString(36).slice(-8);
      
      // Check if user already exists with this contact info
      let user = await this.databaseService.user.findFirst({
        where: { phoneNumber: payload.contactInfo }
      });
      
      // If user doesn't exist, create a temporary account
      if (!user) {
        user = await this.databaseService.user.create({
          data: {
            firstName: payload.firstName,
            lastName: payload.lastName,
            phoneNumber: payload.contactInfo, // Using phoneNumber as the unique identifier
            password: tempPassword, // In a real system, this should be hashed
            temporaryAccount: true,
            country: 'Unknown', // Default values
            language: 'en',
            sex: 'other',
            role: 'Patient', // Default role
          }
        });
      }
      
      // Create the participant
      const magicLink = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/join/${consultationId}/${Buffer.from(`${user.id}-${Date.now()}`).toString('base64')}`;
      
      const participant = await this.databaseService.participant.upsert({
        where: { consultationId_userId: { consultationId, userId: user.id } },
        create: { 
          consultationId, 
          userId: user.id, 
          role: payload.role, 
          notes: payload.notes,
          magicLink, 
          isActive: false 
        },
        update: { 
          role: payload.role, 
          notes: payload.notes,
          magicLink 
        },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              phoneNumber: true
            }
          }
        }
      });

      // Notify all clients in this consultation about the new participant
      this.server.to(`consultation:${consultationId}`).emit('participant_invited', {
        participantId: participant.id,
        userId: participant.userId,
        role: participant.role,
        name: `${participant.user.firstName} ${participant.user.lastName}`,
        contactInfo: participant.user.phoneNumber,
        timestamp: new Date(),
        isNewUser: !user
      });

      return {
        success: true,
        participant: {
          id: participant.id,
          user: participant.user,
          role: participant.role,
          magicLink
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
