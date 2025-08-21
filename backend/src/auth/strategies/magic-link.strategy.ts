import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { CustomLoggerService } from '../../logger/logger.service';
import { AuthService } from '../auth.service';

@Injectable()
export class MagicLinkStrategy extends PassportStrategy(Strategy, 'magic-link') {
  constructor(
    private readonly logger: CustomLoggerService,
    private readonly authService: AuthService
  ) {
    super(); // ✅ no options needed
  }

  async validate(req: Request): Promise<any> {
    try {
      const token = req.body?.token || req.query?.token || req.headers['x-magic-token'];
      this.logger.log(`Token received: ${token ? '[REDACTED]' : 'None'}`);

      if (!token) {
        this.logger.warn('Token is missing from request');
        throw new UnauthorizedException('Magic token is required');
      }

      const { userId } = await this.authService.validateMagicToken(token);
      return { id: userId }; 
    } catch (err) {
      this.logger.error('Error in MagicLinkStrategy.validate()', err?.message || err);
      throw err;
    }
  }
}
