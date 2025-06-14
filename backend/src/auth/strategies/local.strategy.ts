import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { NIL } from 'uuid';
import { User } from '@prisma/client';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(LocalStrategy.name);

  constructor(private readonly authService: AuthService) {
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
    const { userId, userEmail } = await this.authService.validateUser(
      { email, password },
      NIL,
      NIL,
    );

    if (!userEmail) {
      this.logger.warn(`Invalid login attempt for email: ${email}`);
      throw new UnauthorizedException('Invalid credentials');
    }
    this.logger.log(`User authenticated: ${email}`);
    const user = { id: userId, email: userEmail };
    return user;
  }
}
