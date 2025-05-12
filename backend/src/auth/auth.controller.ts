import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service'; // Assuming user service has the necessary method for authentication

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService, // Injecting user service for authentication
  ) {}

  /**
   * API endpoint to log in a user and generate a token.
   *
   * @param credentials The user's login credentials (e.g., username and password)
   * @returns The generated token for the user
   */
  @Post('login')
  async login(@Body() credentials: { phoneNumber: string; password: string }) {
    const user = await this.userService.validateUser(
      credentials.phoneNumber,
      credentials.password,
    );

    if (!user || typeof user !== 'object' || !('id' in user && 'role' in user)) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = this.authService.generateToken(user.id, user.role);
    return { token };
  }

  /**
   * API endpoint to validate the user's token.
   *
   * @param token The token passed from the frontend
   * @returns A success message or throws an UnauthorizedException
   */
  @Post('validate-token')
  validateToken(@Body() body: { token: string }) {
    const { token } = body;
    const decoded = this.authService.validateToken(token);

    if (!decoded) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return { success: true, user: decoded };
  }
}
