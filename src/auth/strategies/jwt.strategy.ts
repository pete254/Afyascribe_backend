// src/auth/strategies/jwt.strategy.ts
// UPDATED: isOwner and clinicMode now persisted in the JWT and req.user
// so capabilities survive logout/login cycles.
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { SessionRevocationService } from '../session-revocation.service';
import { maxSessionHours, sessionExpired, sessionStart } from '../session';

export interface JwtPayload {
  sub: string;           // user UUID
  email: string;
  role: string;
  facilityId: string | null;
  facilityCode: string | null;
  isOwner?: boolean;     // true if user created the clinic
  clinicMode?: string | null; // 'solo' | 'team' | 'multi'
  facilityLogoUrl?: string | null;
  /** The sign-in this token belongs to; shared by every refresh of it. */
  sid?: string;
  /** When the person signed in, seconds since the epoch. */
  authTime?: number;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
    private revocations: SessionRevocationService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    // A token must name its user. Without this, findById(undefined) becomes
    // "any user" (TypeORM drops undefined where-values) — which is what tokens
    // refreshed by the old code did, taking on another account's roles.
    if (!payload || typeof payload.sub !== 'string' || !payload.sub) {
      throw new UnauthorizedException('This session is not valid. Please sign in again.');
    }
    if (await this.revocations.isRevoked(payload.sid)) {
      throw new UnauthorizedException('This session was signed out.');
    }
    const max = maxSessionHours();
    if (sessionExpired(sessionStart(payload, payload.iat), Math.floor(Date.now() / 1000), max)) {
      throw new UnauthorizedException(`You have been signed in for ${max} hours. Please sign in again.`);
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive || user.isDeactivated) {
      throw new UnauthorizedException('User is inactive or deactivated');
    }

    // Return object set as req.user throughout the app.
    // isOwner and clinicMode come from the JWT so they survive re-login
    // even if the DB columns aren't queried every request.
    // Roles come fresh from the DB so a role change takes effect on the next
    // request without forcing the user to log in again.
    const dbRoles = (user as any).roles;
    const roles = Array.isArray(dbRoles) && dbRoles.length ? dbRoles : [payload.role];
    // Per-user permission overrides come fresh from the DB too, so a change
    // takes effect on the next request.
    const permissionOverrides = (user as any).permissionOverrides ?? null;

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      roles,
      permissionOverrides,
      practitionerNo: (user as any).practitionerNo ?? null,
      firstName: (user as any).firstName,
      lastName: (user as any).lastName,
      facilityId: payload.facilityId,
      facilityCode: payload.facilityCode,
      isOwner: payload.isOwner ?? false,
      clinicMode: payload.clinicMode ?? null,
      facilityLogoUrl: payload.facilityLogoUrl ?? null,
      // The session, for refresh and sign-out. Refresh re-signs these claims —
      // the token's own — never the object above.
      sessionId: payload.sid ?? null,
      tokenClaims: (({ iat, exp, ...claims }) => (void iat, void exp, claims))(payload),
      tokenIssuedAt: payload.iat,
    };
  }
}