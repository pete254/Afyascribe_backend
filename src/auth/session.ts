import { randomUUID } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';

/**
 * Session rules, kept apart from the services so they can be tested alone.
 *
 * A session is one sign-in. Every token issued for it — the first, and each
 * refresh — carries the same `sid` (session id) and `authTime` (when the
 * person signed in, in seconds). That lets a session be signed out as a whole,
 * and lets it end at a fixed time however busy it has been.
 *
 * DHA's Technical Specifications template (§3.4) asks for an idle limit of 15
 * minutes and an absolute limit of 8 hours. The idle limit is the token's own
 * lifetime (AUTH_SESSION_MINUTES); the absolute limit is enforced here.
 */

export const DEFAULT_MAX_SESSION_HOURS = 8;

export function maxSessionHours(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.AUTH_MAX_SESSION_HOURS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_SESSION_HOURS;
}

/** The claims a session token carries, as signed. */
export interface SessionClaims {
  sub: string;
  sid?: string;
  /** When the person signed in, seconds since the epoch. */
  authTime?: number;
  [claim: string]: unknown;
}

/** What a fresh sign-in adds to the token. */
export function newSession(nowSeconds: number): { sid: string; authTime: number } {
  return { sid: randomUUID(), authTime: nowSeconds };
}

/**
 * When this session began. Tokens issued before sessions carried `authTime`
 * fall back to their own issue time, which for an un-refreshed token is the
 * sign-in.
 */
export function sessionStart(claims: { authTime?: number }, issuedAt?: number): number | null {
  if (typeof claims.authTime === 'number') return claims.authTime;
  return typeof issuedAt === 'number' ? issuedAt : null;
}

export function sessionExpired(start: number | null, nowSeconds: number, maxHours: number): boolean {
  return start == null || nowSeconds - start >= maxHours * 3600;
}

/**
 * The claims for a refreshed token: exactly the claims of the token being
 * refreshed, with the session's start pinned.
 *
 * Built from the token's own claims, never from the request's user object.
 * Earlier code signed `req.user`, which names the user `id` rather than
 * `sub`; the refreshed token then had no subject, the next request looked up
 * `findById(undefined)` — which TypeORM turns into "any user" — and the
 * session took on another account's roles. Requiring `sub` here makes that
 * impossible to repeat.
 */
export function refreshedClaims(
  claims: SessionClaims | undefined,
  issuedAt: number | undefined,
  nowSeconds: number,
  maxHours: number,
): SessionClaims {
  if (!claims || typeof claims.sub !== 'string' || !claims.sub) {
    throw new UnauthorizedException('This session is not valid. Please sign in again.');
  }
  const start = sessionStart(claims, issuedAt);
  if (sessionExpired(start, nowSeconds, maxHours)) {
    throw new UnauthorizedException(
      `You have been signed in for ${maxHours} hours. Please sign in again.`,
    );
  }
  return { ...claims, sid: claims.sid ?? randomUUID(), authTime: start as number };
}
