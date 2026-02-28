// src/auth/strategies/jwt.strategy.ts
// UPDATED: facilityId and facilityCode now included in JWT payload
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

export interface JwtPayload {
  sub: string;         // user UUID
  email: string;
  role: string;
  facilityId: string | null;
  facilityCode: string | null; // e.g. "KNH" — for patient ID generation
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

    // Return object that is set as req.user throughout the app
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      facilityId: payload.facilityId,
      facilityCode: payload.facilityCode,
    };
  }
}