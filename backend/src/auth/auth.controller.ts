import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  @Post('login')
  async login(@Body() credentials: { phoneNumber: string; password: string }) {
    const user = await this.userService.validateUser(
      credentials.phoneNumber,
      credentials.password,
    );

    if (!user || typeof user !== 'object' || !('id' in user && 'role' in user)) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = this.authService.generateToken(user.id, user.role);
    return { token };
  }

  @Post('validate-token')
  validateToken(@Body() body: { token: string }) {
    const decoded = this.authService.validateToken(body.token);

    if (!decoded) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return { success: true, user: decoded };
  }
}
