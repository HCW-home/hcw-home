import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CustomLoggerService } from 'src/logger/logger.service';

@Injectable()
export class MagicLinkGuard extends AuthGuard('magic-link') {
  constructor(private readonly logger: CustomLoggerService) {
    super();
    this.logger.log('MagicLinkGuard initialized');
  }

  // You need to override canActivate to access `this.logger` safely
  async canActivate(context: ExecutionContext) {
    this.logger.log('MagicLinkGuard activated');

    const request = context.switchToHttp().getRequest();
    const token =
      request.body?.token || request.query?.token || request.headers?.['x-magic-token'];

    this.logger.debug(`Token received: ${token ? '[REDACTED]' : 'None'}`);
    this.logger.debug(token)
    return super.canActivate(context) as Promise<boolean>;
  }

  handleRequest(err: any, user: any, info: any, context: any) {
    if (err) {
      this.logger.error('AuthGuard error', err);
      throw err;
    }

    if (!user) {
      this.logger.warn('No user authenticated', info);
      throw new Error('Unauthorized');
    }

    this.logger.log(`User authenticated: ${user.id}`);
    return user;
  }
}
