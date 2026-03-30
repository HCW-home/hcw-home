import { Controller, Get, Post, Body, Query, UseGuards, Req, Param, Logger } from '@nestjs/common';
import { InviteService } from './invite.service';
import { AuthGuard } from '../guards/auth.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('invites')
@Controller('invites')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class InviteController {
  private readonly logger = new Logger(InviteController.name);

  constructor(private readonly inviteService: InviteService) { }

  @Get()
  @ApiOperation({ summary: 'Get consultation invitations created by the current practitioner' })
  @ApiResponse({ status: 200, description: 'Invitations retrieved successfully' })
  async getInvites(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Req() req: any
  ) {
    const practitionerId = req.user.id;
    this.logger.log('GET /invites called by user', {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      page,
      limit
    });
    const result = await this.inviteService.getInvitesByPractitioner(practitionerId, page, limit);
    this.logger.log('Returning result', { success: result.success, totalInvites: result.data?.total });
    return result;
  }

  @Post(':id/accept')
  @ApiOperation({ summary: 'Accept a consultation invitation' })
  @ApiResponse({ status: 200, description: 'Invitation accepted successfully' })
  async acceptInvite(@Param('id') inviteId: string, @Req() req: any) {
    const userId = req.user.id;
    return this.inviteService.acceptInvite(inviteId, userId);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a consultation invitation' })
  @ApiResponse({ status: 200, description: 'Invitation rejected successfully' })
  async rejectInvite(@Param('id') inviteId: string, @Req() req: any) {
    const userId = req.user.id;
    return this.inviteService.rejectInvite(inviteId, userId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new consultation invitation' })
  @ApiResponse({ status: 201, description: 'Invitation created successfully' })
  async createInvite(@Body() createInviteDto: any, @Req() req: any) {
    const practitionerId = req.user.id;
    return this.inviteService.createInvite({ ...createInviteDto, practitionerId });
  }

  @Post('check-upcoming-consultations')
  @ApiOperation({ summary: 'Check and send emails for upcoming consultations' })
  @ApiResponse({ status: 200, description: 'Upcoming consultation emails processed' })
  async checkUpcomingConsultations(@Req() req: any) {
    // This endpoint can be called manually or by a cron job
    return this.inviteService.checkAndSendUpcomingConsultationEmails();
  }


}
