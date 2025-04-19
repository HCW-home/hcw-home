import { Controller, Get, Post, Req, Res, UseGuards, Logger, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private frontendUrl: string;

  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {
    this.frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:3000');
  }

  @Get('login')
  @UseGuards(AuthGuard('openidconnect'))
  login() {
    // This route initiates the OpenID Connect login flow
    // The actual logic is handled by Passport
    return { message: 'Initiating OpenID Connect authentication' };
  }

  @Get('callback')
  @UseGuards(AuthGuard('openidconnect'))
  async callback(@Req() req, @Res() res: Response) {
    this.logger.debug('OpenID callback received');
    
    try {
      if (!req.user) {
        throw new UnauthorizedException('Authentication failed');
      }
      
      // Generate JWT token for the authenticated user
      const token = this.authService.generateJwtToken(req.user);
      
      // In a real application, you would redirect to your frontend
      // with the token (e.g., as a query parameter or in a cookie)
      res.redirect(`${this.frontendUrl}/auth/success?token=${token}`);
    } catch (error) {
      this.logger.error(`Authentication error: ${error.message}`);
      res.redirect(`${this.frontendUrl}/auth/error?message=${encodeURIComponent(error.message)}`);
    }
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  getProfile(@Req() req) {
    // This route is protected and requires a valid JWT
    return req.user;
  }

  // You might already have other auth methods in your controller
  // like email/password login, registration, etc.
  // They can coexist with OpenID Connect
}