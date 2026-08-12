import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CAPABILITY_KEY } from '../decorators/require-capability.decorator';
import { hasCapability } from '../../common/capabilities';

/**
 * Enforces per-user permission overrides. On an endpoint tagged with
 * @RequireCapability('x'), the user must hold capability x — a per-user deny
 * blocks it even if their role would normally allow it (and a per-user grant
 * allows it). Endpoints without the decorator are unaffected. Runs after the
 * JWT/roles guards, so req.user is populated.
 */
@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const capability = this.reflector.getAllAndOverride<string>(CAPABILITY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!capability) return true; // not capability-gated

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;
    if (hasCapability(user, capability)) return true;

    throw new ForbiddenException(
      `You do not have permission to perform this action (${capability}).`,
    );
  }
}
