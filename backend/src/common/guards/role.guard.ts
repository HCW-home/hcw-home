import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { Request } from 'express';

// Extend the Express Request type to include user
declare module 'express' {
  interface Request {
    user?: {
      id: number;
      role: Role;
      [key: string]: any;
    };
  }
}

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    
    // In a real application, you would extract the user from a JWT token or session
    // For now, we'll assume the user is attached to the request by an auth middleware
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('User not authenticated');
    }

    return requiredRoles.includes(user.role);
  }
} 