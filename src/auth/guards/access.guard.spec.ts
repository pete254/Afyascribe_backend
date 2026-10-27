import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { facilityScopeViolation } from '../facility-scope';
import { AccessGuard } from './access.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RestrictedPatientGuard } from './restricted-patient.guard';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const nurse = { id: 'u1', role: 'nurse', facilityId: A };

describe('facilityScopeViolation', () => {
  it('allows a request that names no facility, or its own', () => {
    expect(
      facilityScopeViolation(nurse, { params: {}, query: {}, body: {} }),
    ).toBeNull();
    expect(
      facilityScopeViolation(nurse, { params: { facilityId: A } }),
    ).toBeNull();
    expect(
      facilityScopeViolation(nurse, { body: { facilityId: A } }),
    ).toBeNull();
  });

  it('refuses another facility named in the path, query or body', () => {
    expect(
      facilityScopeViolation(nurse, { params: { facilityId: B } }),
    ).toMatch(/path/);
    expect(facilityScopeViolation(nurse, { query: { facilityId: B } })).toMatch(
      /query/,
    );
    expect(facilityScopeViolation(nurse, { body: { facilityId: B } })).toMatch(
      /body/,
    );
  });

  it('refuses any facility for a user who has none', () => {
    expect(
      facilityScopeViolation(
        { role: 'nurse', facilityId: null },
        { query: { facilityId: A } },
      ),
    ).not.toBeNull();
  });

  it('lets the platform super administrator name any facility', () => {
    expect(
      facilityScopeViolation(
        { role: 'super_admin' },
        { query: { facilityId: B } },
      ),
    ).toBeNull();
  });

  it('ignores non-object bodies', () => {
    expect(facilityScopeViolation(nurse, { body: 'text' })).toBeNull();
  });
});

describe('AccessGuard', () => {
  // The passport check itself is replaced: it either signs the user in or
  // refuses, which is all this guard needs from it.
  const passport = jest.spyOn(
    Object.getPrototypeOf(JwtAuthGuard.prototype) as InstanceType<
      ReturnType<typeof AuthGuard>
    >,
    'canActivate',
  );

  function context(req: Record<string, unknown>, isPublic = false) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(isPublic),
    } as unknown as Reflector;
    const restricted = {
      canActivate: jest.fn(async () => true),
    } as unknown as RestrictedPatientGuard;
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => null,
      getClass: () => null,
    } as unknown as ExecutionContext;
    return { guard: new AccessGuard(reflector, restricted), restricted, ctx };
  }

  afterEach(() => passport.mockReset());

  it('lets a public route through without signing in', async () => {
    const { guard, ctx, restricted } = context({}, true);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(passport).not.toHaveBeenCalled();
    expect(restricted.canActivate).not.toHaveBeenCalled();
  });

  it('requires sign-in on every other route', async () => {
    passport.mockResolvedValue(false as never);
    const { guard, ctx, restricted } = context({});
    await expect(guard.canActivate(ctx)).resolves.toBe(false);
    expect(restricted.canActivate).not.toHaveBeenCalled();
  });

  it('runs the restricted-record lock after sign-in, with the user present', async () => {
    const req: Record<string, unknown> = { params: {}, query: {}, body: {} };
    passport.mockImplementation(async () => {
      req.user = nurse;
      return true;
    });
    const { guard, ctx, restricted } = context(req);
    (restricted.canActivate as jest.Mock).mockImplementation(
      async (c: ExecutionContext) => {
        // The lock was useless while it ran before sign-in: it must see the user.
        expect(c.switchToHttp().getRequest().user).toBe(nurse);
        return true;
      },
    );
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(restricted.canActivate).toHaveBeenCalled();
  });

  it('refuses a request naming another facility', async () => {
    const req: Record<string, unknown> = {
      params: {},
      query: { facilityId: B },
      body: {},
    };
    passport.mockImplementation(async () => {
      req.user = nurse;
      return true;
    });
    const { guard, ctx } = context(req);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('JwtAuthGuard', () => {
  it('does not sign in twice when the global guard already has', async () => {
    const passport = jest.spyOn(
      Object.getPrototypeOf(JwtAuthGuard.prototype) as InstanceType<
        ReturnType<typeof AuthGuard>
      >,
      'canActivate',
    );
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user: nurse }) }),
    } as unknown as ExecutionContext;
    await expect(new JwtAuthGuard().canActivate(ctx)).toBe(true);
    expect(passport).not.toHaveBeenCalled();
    passport.mockRestore();
  });
});
