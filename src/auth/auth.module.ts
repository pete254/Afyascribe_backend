import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { EmergencyAccess } from './entities/emergency-access.entity';
import { EmergencyAccessService } from './emergency-access.service';
import { EmergencyAccessController } from './emergency-access.controller';
import { Patient } from '../patients/entities/patient.entity';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersModule } from '../users/users.module';
import { EmailModule } from '../common/services/email.module'; 
import { FacilitiesModule } from '../facilities/facilities.module';
import { PlatformModule } from '../platform/platform.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { RestrictedPatientGuard } from './guards/restricted-patient.guard';
import { AccessGuard } from './guards/access.guard';
import { AuditModule } from '../audit/audit.module';
import { RevokedSession } from './entities/revoked-session.entity';
import { SessionRevocationService } from './session-revocation.service';
import { jwtModuleOptions } from './jwt-keys';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    EmailModule,
    FacilitiesModule,
    PlatformModule,
    AuditModule,
    TypeOrmModule.forFeature([EmergencyAccess, Patient, RevokedSession]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      // Signing keys and algorithm: jwt-keys.ts (ES256 when keys are set).
      useFactory: (configService: ConfigService) =>
        jwtModuleOptions(
          configService,
          // Automatic logoff. A session lapses after this long without the
          // client refreshing it, so an unattended terminal does not stay
          // open. Configurable, because a ward and a back office are not the
          // same risk. In seconds, a plain number.
          Math.max(5, Number(configService.get<string>('AUTH_SESSION_MINUTES') ?? 60)) * 60,
        ),
      inject: [ConfigService],
    }),
  ],
  providers: [
    AuthService,
    JwtStrategy,
    EmergencyAccessService,
    SessionRevocationService,
    // One global guard: sign-in by default, facility isolation, and the
    // restricted-record lock, in that order (guards/access.guard.ts).
    RestrictedPatientGuard,
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
  controllers: [AuthController, EmergencyAccessController],
  exports: [AuthService, EmergencyAccessService],
})
export class AuthModule {}