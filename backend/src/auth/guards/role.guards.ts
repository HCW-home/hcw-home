import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt.guards';
import { Role } from 'constant/role.constant';

@Injectable()
export class RolesGuard extends JwtAuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<Role[]>('roles', context.getHandler());
    if (!requiredRoles) {
      return true;
    }

    const user = context.switchToHttp().getRequest().user;
    return requiredRoles.some(role => user.roles?.includes(role));
  }
}