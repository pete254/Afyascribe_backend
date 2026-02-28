// src/common/guards/facility.guard.ts
// This guard ensures that non-super_admin users can only access data
// belonging to their own facility. It checks that the facilityId in the
// request param/body matches the facilityId in their JWT token.
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

@Injectable()
export class FacilityGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) return false;

    // super_admin bypasses all facility checks
    if (user.role === 'super_admin') return true;

    // If the route has a facilityId param, enforce it matches the user's facility
    const paramFacilityId =
      request.params?.facilityId || request.body?.facilityId;

    if (paramFacilityId && paramFacilityId !== user.facilityId) {
      throw new ForbiddenException(
        'You do not have access to this facility\'s data',
      );
    }

    return true;
  }
}