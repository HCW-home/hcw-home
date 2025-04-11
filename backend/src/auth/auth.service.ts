import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from 'src/user/user.service';
import { errorResponse, successResponse } from 'src/common/helpers/response-helper';

interface UserPayload {
  id: number;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService
  ) {}

  // Step 1: Validate user using full user object
  async validateUser({ email, password }: { email: string; password: string }) {
    const userResponse = await this.userService.findOneByEmail(email);

    if ('error' in userResponse) {
      return null;
    }

    const user = userResponse.data;

    // Replace with hashed password comparison in production
    if (user.password !== password) {
      return null;
    }

    return user;
  }

  // Step 2: Generate JWT for the user object
  async authenticateUser(user: UserPayload) {
    const payload = { sub: user.id, username: user.email };
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      username: user.email,
      userId: user.id,
    };
  }

  // Step 3: Full login flow with user object
  async login(credentials: { email: string; password: string }) {
    const user = await this.validateUser(credentials);

    if (!user) {
      return errorResponse("Invalid credentials", HttpStatus.UNAUTHORIZED);
    }

    const tokenData = await this.authenticateUser({ id: user.id, email: user.email });

    return successResponse(tokenData, "Login successful", HttpStatus.OK);
  }
}
