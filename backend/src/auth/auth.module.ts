import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserModule } from 'src/user/user.module';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PassportAuthController } from './passport-auth.controller';
import { LocalStrategy } from './strategies/local.strategy';

@Module({
  controllers: [AuthController,PassportAuthController],
  providers: [AuthService,LocalStrategy],
  imports:[
    UserModule,
    JwtModule.register({
      global:true,
      secret: "Jwt_secret",
      signOptions:{expiresIn:'1d'}

    }),
    PassportModule
  ]
})
export class AuthModule {}
