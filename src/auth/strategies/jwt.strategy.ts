// src/auth/strategies/jwt.strategy.ts
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service'; // ✅ ADD THIS

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService, // ✅ ADD THIS
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not defined in environment variables');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: any) {
    if (!payload) {
      throw new UnauthorizedException('Invalid token payload');
    }

    // ✅ ADD THIS: Check if user is deactivated
    try {
      const user = await this.usersService.findById(payload.sub);
      
      // findById will throw if user is deactivated
      return { 
        userId: payload.sub, 
        email: payload.email,
        role: payload.role,
        firstName: payload.firstName,
        lastName: payload.lastName
      };
    } catch (error) {
      throw new UnauthorizedException('Account is not accessible');
    }
  }
}