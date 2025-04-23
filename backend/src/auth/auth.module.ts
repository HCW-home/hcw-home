import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { UserModule } from 'src/user/user.module';
import { JwtStrategy } from './lib/role.strategy';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1h' }, 
    }),
    UserModule, 
  ], 
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy]
})
export class AuthModule {}
