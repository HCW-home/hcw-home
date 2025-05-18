import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ConsultationService } from './consultation.service';
import { ConsultationGateway } from './consultation.gateway';
import { DatabaseService } from '../database/database.service';

@Controller('consultation')
export class ConsultationController {
  constructor(
    private readonly consultationService: ConsultationService,
    private readonly consultationGateway: ConsultationGateway, // Inject gateway
    private readonly databaseService: DatabaseService, // Optional: used to fetch user info
  ) {}

  @Post(':id/join/patient')
  async joinPatient(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { userId: number },
  ) {
    const res = await this.consultationService.joinAsPatient(id, body.userId);

    // Fetch user details for name
    const user = await this.databaseService.findUserById(body.userId);
    const joinedAt = res.participant?.joinedAt?.toISOString() ?? new Date().toISOString();

    // Notify via WebSocket if needed
    if (user?.role === 'Patient') {
      this.consultationGateway.notifyPractitioner({
        consultationId: id,
        patientName: user.firstName || 'Patient',
        joinedAt,
      });
    }

    return { message: 'Patient joined consultation.', ...res };
  }

  @Post(':id/join/practitioner')
  async joinPractitioner(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { userId: number },
  ) {
    const res = await this.consultationService.joinAsPractitioner(id, body.userId);
    return { message: 'Practitioner joined consultation.', ...res };
  }

  @Get('/waiting-room/:userId')
  async getWaitingRoom(@Param('userId', ParseIntPipe) userId: number) {
    const consultations = await this.consultationService.getWaitingRoomConsultations(userId);
    return { success: true, consultations };
  }
}
