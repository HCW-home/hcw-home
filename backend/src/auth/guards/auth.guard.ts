// Chayan Das <01chayandas@gmail.com>

import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { HttpExceptionHelper } from 'src/common/helpers/execption/http-exception.helper';
import { ExtendedRequest } from 'src/types/request';
import { AuthService } from '../auth.service';
import { plainToInstance } from 'class-transformer';
import { UserResponseDto } from 'src/user/dto/user-response.dto';
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ExtendedRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw HttpExceptionHelper.unauthorized(
        'Authorization header missing or malformed',
      );
    }

    const token = authHeader.split(' ')[1];

    try {
      const payload = await this.authService.verifyToken(token);
      // Check if the user exists in the database
      const user = await this.authService.findByEmail(payload.userEmail);
      if (!user) {
        throw HttpExceptionHelper.unauthorized(
          'no user found',
        );
      }
     
      request.user =  plainToInstance(UserResponseDto, user, {
        excludeExtraneousValues: false,
      });
      return true;
    }
     catch (error) {
      throw HttpExceptionHelper.unauthorized(
        'Invalid or expired token',
      );
    }
  }
}
