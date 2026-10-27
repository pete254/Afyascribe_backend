// src/auth/decorators/public.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * A route anyone may call without signing in — sign-in itself, password
 * reset, self-registration, signed file links. Every other route requires a
 * signed-in user (guards/access.guard.ts), so a route is public only when it
 * says so here, never by forgetting a guard.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
