import { SetMetadata } from '@nestjs/common';

export const CAPABILITY_KEY = 'capability';

/**
 * Declare that an endpoint needs a specific capability. Combined with
 * CapabilityGuard, this lets an owner deny or grant the function per user on top
 * of their roles. Use alongside @Roles (roles gate the broad access; the
 * capability adds the per-user override layer).
 */
export const RequireCapability = (capability: string) =>
  SetMetadata(CAPABILITY_KEY, capability);
