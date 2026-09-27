import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.get<string[]>(PERMISSION_KEY, context.getHandler());

    // If no permissions are required, allow access
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User context not found');
    }

    // Extract all permission keys from user object or userRoles
    const userPermKeys: string[] = [];

    if (Array.isArray(user.permissions)) {
      user.permissions.forEach((p: any) => {
        if (typeof p === 'string') userPermKeys.push(p);
        else if (p?.key) userPermKeys.push(p.key);
      });
    }

    if (Array.isArray(user.userRoles)) {
      user.userRoles.forEach((ur: any) => {
        if (Array.isArray(ur.role?.permissions)) {
          ur.role.permissions.forEach((p: any) => {
            if (typeof p === 'string') userPermKeys.push(p);
            else if (p?.key) userPermKeys.push(p.key);
          });
        }
      });
    }

    // Check if user has at least one required permission
    const hasPermission = requiredPermissions.some((permission) =>
      userPermKeys.includes(permission),
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Missing required permissions: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}
