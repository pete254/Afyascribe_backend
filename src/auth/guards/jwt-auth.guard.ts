// src/auth/guards/jwt-auth.guard.ts
import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    // Already signed in by the global AccessGuard, which runs first: the
    // controller-level guards that remain on most controllers then cost
    // nothing, instead of checking the token and session a second time.
    if (context.switchToHttp().getRequest<{ user?: unknown }>().user)
      return true;
    return super.canActivate(context);
  }
}
