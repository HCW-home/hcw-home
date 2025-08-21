import { Module } from '@nestjs/common';
import { InviteService } from './invite.service';

@Module({
  providers: [InviteService]
})
export class InviteModule {}
