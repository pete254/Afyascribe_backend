// src/common/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUserType {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  facilityId: string | null;
  facilityCode: string | null;
}

/**
 * Extracts the authenticated user from the JWT token on every request.
 *
 * Usage in any controller method:
 *   async myMethod(@CurrentUser() user: CurrentUserType) {
 *     console.log(user.facilityId);
 *   }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserType => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);