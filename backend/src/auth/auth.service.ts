import { Injectable } from '@nestjs/common';
import { UserService } from 'src/user/user.service';
import { errorResponse,successResponse } from 'src/common/helpers/response-helper';

@Injectable()
export class AuthService {
    constructor(private readonly userService:UserService){}

    private loggedInUser: any = null;

    async login(username: string, password: string) {
        const userResponse = await this.userService.findOneByEmail(username);
      
        // If response contains 'error', it's a failed response
        if ('error' in userResponse) {
          return errorResponse("User not found", 404);
        }
      
        const user = userResponse.data;
      
        // In real-world use a hashed password check
        if (user.password !== password) {
          return errorResponse("Invalid credentials", 401);
        }
      
        return successResponse(
          { userId: user.id, email: user.email },
          "Login successful",
          200
        );
      }
      
}

