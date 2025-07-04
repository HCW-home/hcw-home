import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { NIL } from 'uuid';
import { User } from '@prisma/client';
import { Role } from '../enums/role.enum';
import { HttpExceptionHelper } from 'src/common/helpers/execption/http-exception.helper';
import { CustomLoggerService } from 'src/logger/logger.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {

  constructor(
    private readonly authService: AuthService,
    private readonly logger:CustomLoggerService ) {
    super({
      usernameField: 'email',
      passwordField: 'password',
    });
  }

  async validate(
    email: string,
    password: string,
  ): Promise<{ id: number; email: string }> {
    this.logger.log(`Validating user with email: ${email}`);
    const { userId, userEmail,userRole } = await this.authService.validateUser(
      { email, password },
    );
    const user = { id: userId, email: userEmail,role:userRole };
    const isLoginLocalAllowed = await this.authService.canLoginLocal(user);
    if (!isLoginLocalAllowed) {
      this.logger.warn('Password login is disabled.');
      throw HttpExceptionHelper.badRequest("Password login is disabled.")

    }
    if (!userEmail) {
      this.logger.warn(`Invalid login attempt for email: ${email}`);
      throw new UnauthorizedException('Invalid credentials');
    }
    this.logger.log(`User authenticated: ${email}`);
    return user;
  }
}
