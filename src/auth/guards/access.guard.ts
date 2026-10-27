// src/auth/guards/access.guard.ts
import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { facilityScopeViolation } from '../facility-scope';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RestrictedPatientGuard } from './restricted-patient.guard';

/**
 * The one global guard, run before any controller's own, in a fixed order:
 *
 *  1. A route marked @Public() goes through.
 *  2. Everything else needs a signed-in user — the default, so a new
 *     controller is protected without anyone remembering to protect it.
 *  3. Facility isolation (facility-scope.ts).
 *  4. The restricted-record lock (RestrictedPatientGuard).
 *
 * The order is the point. Global guards run before controller guards, so a
 * global check that needs the user cannot rely on a controller's JwtAuthGuard
 * having run: until this guard existed, the restricted-record lock was
 * registered globally on its own and always saw no user, and so never
 * locked anything.
 */
@Injectable()
export class AccessGuard extends JwtAuthGuard {
  constructor(
    private readonly reflector: Reflector,
    private readonly restricted: RestrictedPatientGuard,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    if (!(await super.canActivate(context))) return false;

    const req = context.switchToHttp().getRequest<
      Parameters<typeof facilityScopeViolation>[1] & {
        user?: Parameters<typeof facilityScopeViolation>[0];
      }
    >();
    const violation = facilityScopeViolation(req.user, req);
    if (violation)
      throw new ForbiddenException(
        "You do not have access to this facility's data",
      );

    return this.restricted.canActivate(context);
  }
}
