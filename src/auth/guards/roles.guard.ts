// src/auth/guards/roles.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // No role restriction — allow through
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    // A user can hold several roles; access is granted if ANY of them is allowed.
    const userRoles: string[] =
      Array.isArray(user.roles) && user.roles.length ? user.roles : user.role ? [user.role] : [];
    if (userRoles.some((r) => requiredRoles.includes(r))) return true;

    // The facility owner implicitly holds every facility-level role until they
    // hire dedicated staff, so treat an owner as a facility_admin. This never
    // grants super_admin/platform access — those routes require 'super_admin'
    // explicitly, which an owner is not.
    if (user.isOwner === true && requiredRoles.includes('facility_admin')) {
      return true;
    }

    return false;
  }
}