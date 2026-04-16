// src/auth/strategies/jwt.strategy.ts
// UPDATED: isOwner and clinicMode now persisted in the JWT and req.user
// so capabilities survive logout/login cycles.
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

export interface JwtPayload {
  sub: string;           // user UUID
  email: string;
  role: string;
  facilityId: string | null;
  facilityCode: string | null;
  isOwner?: boolean;     // true if user created the clinic
  clinicMode?: string | null; // 'solo' | 'team' | 'multi'
  facilityLogoUrl?: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive || user.isDeactivated) {
      throw new UnauthorizedException('User is inactive or deactivated');
    }

    // Return object set as req.user throughout the app.
    // isOwner and clinicMode come from the JWT so they survive re-login
    // even if the DB columns aren't queried every request.
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      firstName: (user as any).firstName,
      lastName: (user as any).lastName,
      facilityId: payload.facilityId,
      facilityCode: payload.facilityCode,
      isOwner: payload.isOwner ?? false,
      clinicMode: payload.clinicMode ?? null,
      facilityLogoUrl: payload.facilityLogoUrl ?? null,
    };
  }
}