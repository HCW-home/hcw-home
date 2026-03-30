import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { InviteService } from './invite.service';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';

@ApiTags('public-invites')
@Controller('public/invites')
export class PublicInviteController {
  constructor(private readonly inviteService: InviteService) { }

  @Get('acknowledge/:token')
  @ApiOperation({ summary: 'Acknowledge a consultation invitation (public endpoint)' })
  @ApiResponse({ status: 200, description: 'Invitation acknowledged successfully' })
  async acknowledgeInvite(@Param('token') token: string) {
    return this.inviteService.acknowledgeInvite(token);
  }

  @Post('complete-device-test/:token')
  @ApiOperation({ summary: 'Complete device testing and accept invitation' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        cameraTest: { type: 'boolean', description: 'Camera test result' },
        microphoneTest: { type: 'boolean', description: 'Microphone test result' },
        speakerTest: { type: 'boolean', description: 'Speaker test result' }
      },
      required: ['cameraTest', 'microphoneTest', 'speakerTest']
    }
  })
  @ApiResponse({ status: 200, description: 'Device testing completed and invitation accepted' })
  async completeDeviceTestAndAcceptInvite(
    @Param('token') token: string,
    @Body() deviceTestResults: {
      cameraTest: boolean;
      microphoneTest: boolean;
      speakerTest: boolean;
    }
  ) {
    return this.inviteService.completeDeviceTestAndAcceptInvite(token, deviceTestResults);
  }

  @Get('details/:token')
  @ApiOperation({ summary: 'Get invitation details (public endpoint)' })
  @ApiResponse({ status: 200, description: 'Invitation details retrieved successfully' })
  async getInviteDetails(@Param('token') token: string) {
    return this.inviteService.getInviteDetails(token);
  }

  @Post('send-pre-consultation-email/:invitationId')
  @ApiOperation({ summary: 'Send pre-consultation email (for testing purposes)' })
  @ApiResponse({ status: 200, description: 'Pre-consultation email sent successfully' })
  async sendPreConsultationEmail(@Param('invitationId') invitationId: string) {
    return this.inviteService.sendPreConsultationEmail(invitationId);
  }

  @Post('join-consultation/:token')
  @ApiOperation({ summary: 'Join consultation via reminder email link and mark invitation as accepted' })
  @ApiResponse({ status: 200, description: 'Consultation joined successfully and invitation marked as accepted' })
  async joinConsultationViaReminder(@Param('token') token: string) {
    return this.inviteService.joinConsultationViaReminder(token);
  }
}
