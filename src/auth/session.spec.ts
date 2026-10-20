import { UnauthorizedException } from '@nestjs/common';
import { maxSessionHours, newSession, refreshedClaims, sessionExpired, sessionStart } from './session';

const HOUR = 3600;

describe('session rules', () => {
  const now = 1_800_000_000;

  it('keeps the subject, the session id and the sign-in time on refresh', () => {
    const claims = { sub: 'user-1', role: 'nurse', facilityId: 'f-1', sid: 's-1', authTime: now - HOUR };
    const out = refreshedClaims(claims, now - 600, now, 8);
    expect(out.sub).toBe('user-1');
    expect(out.sid).toBe('s-1');
    expect(out.authTime).toBe(now - HOUR);
    expect(out.role).toBe('nurse');
    expect(out.facilityId).toBe('f-1');
  });

  it('refuses to refresh claims without a subject — the bug this replaces', () => {
    // What the old code signed: the request's user object, keyed `id`.
    const reqUser = { id: 'user-1', role: 'nurse' } as never;
    expect(() => refreshedClaims(reqUser, now, now, 8)).toThrow(UnauthorizedException);
    expect(() => refreshedClaims(undefined, now, now, 8)).toThrow(UnauthorizedException);
  });

  it('ends the session 8 hours after sign-in, however active it has been', () => {
    const claims = { sub: 'u', sid: 's', authTime: now - 8 * HOUR };
    expect(() => refreshedClaims(claims, now - 60, now, 8)).toThrow(/signed in for 8 hours/);
    expect(() => refreshedClaims({ ...claims, authTime: now - 8 * HOUR + 60 }, now, now, 8)).not.toThrow();
  });

  it('dates an older token without authTime from its issue time', () => {
    expect(sessionStart({}, now - 100)).toBe(now - 100);
    const out = refreshedClaims({ sub: 'u' }, now - 100, now, 8);
    expect(out.authTime).toBe(now - 100);
    expect(typeof out.sid).toBe('string');
  });

  it('treats a session with no known start as expired', () => {
    expect(sessionExpired(null, now, 8)).toBe(true);
  });

  it('starts a new session with a fresh id', () => {
    const a = newSession(now);
    const b = newSession(now);
    expect(a.authTime).toBe(now);
    expect(a.sid).not.toBe(b.sid);
  });

  it('reads the limit from AUTH_MAX_SESSION_HOURS, defaulting to 8', () => {
    expect(maxSessionHours({})).toBe(8);
    expect(maxSessionHours({ AUTH_MAX_SESSION_HOURS: '4' })).toBe(4);
    expect(maxSessionHours({ AUTH_MAX_SESSION_HOURS: 'nonsense' })).toBe(8);
  });
});
