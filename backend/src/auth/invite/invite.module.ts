import { Module } from '@nestjs/common';
import { InviteService } from './invite.service';
import { InviteController } from './invite.controller';
import { PublicInviteController } from './public-invite.controller';
import { DatabaseModule } from '../../database/database.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '../../config/config.module';
import { AuthService } from '../auth.service';
import { AuthGuard } from '../guards/auth.guard';
import { CoreModule } from '../../core/core.module';

@Module({
  imports: [DatabaseModule, JwtModule, ConfigModule, CoreModule],
  controllers: [InviteController, PublicInviteController],
  providers: [InviteService, AuthService, AuthGuard],
  exports: [InviteService]
})
export class InviteModule { }
