import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PassportModule } from '@nestjs/passport';
import { LocalStrategy } from './strategies/local.strategy';
import { AuthGuard } from './guards/auth.guard';
import { SessionSerializer } from './strategies/serialize';
import { AdminStrategy } from './strategies/admin.strategy';
import { PractitionerStrategy } from './strategies/practitionner.stretegy';
import { ConfigModule } from 'src/config/config.module';
import { InviteModule } from './invite/invite.module';
import { InviteController } from './invite/invite.controller';
import { MagicLinkStrategy } from './strategies/magic-link.strategy';
import { EmailModule } from 'src/common/email/email.module';

@Module({
  imports: [ConfigModule, JwtModule, PassportModule.register({ session: true }), InviteModule, EmailModule],
  controllers: [AuthController, InviteController],
  providers: [
    AuthService,
    LocalStrategy,
    AuthGuard,
    SessionSerializer,
    AdminStrategy,
    PractitionerStrategy,
    MagicLinkStrategy
  ],
  exports: [AuthService, AuthGuard, JwtModule],
})
export class AuthModule { }
