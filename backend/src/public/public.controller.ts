import { Body, Controller, Post } from '@nestjs/common';
import { ConsultationService } from '../consultation/consultation.service';
import { RecoverConsultationDto } from '../consultation/dto/recover-consultation.dto';

/**
 * Controller for public-facing endpoints that don't require authentication
 */
@Controller()
export class PublicController {
  constructor(private readonly consultationService: ConsultationService) {}

  /**
   * Public endpoint for patients to recover their consultation invitation.
   * This endpoint is accessible without authentication.
   */
  @Post('recover-consultation')
  async recoverConsultation(@Body() recoverData: RecoverConsultationDto) {
    return this.consultationService.recoverConsultation(recoverData);
  }
} 