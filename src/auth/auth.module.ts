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
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    EmailModule,
    FacilitiesModule,
    PlatformModule,
    AuditModule,
    TypeOrmModule.forFeature([EmergencyAccess, Patient]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        // Automatic logoff. A session lapses after this long without the
        // client refreshing it, so an unattended terminal does not stay open.
        // Configurable, because a ward and a back office are not the same risk.
        signOptions: {
          // In seconds, so the value is a plain number rather than a duration
          // string the type system has opinions about.
          expiresIn: Math.max(5, Number(configService.get<string>('AUTH_SESSION_MINUTES') ?? 60)) * 60,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    AuthService,
    JwtStrategy,
    EmergencyAccessService,
    { provide: APP_GUARD, useClass: RestrictedPatientGuard },
  ],
  controllers: [AuthController, EmergencyAccessController],
  exports: [AuthService, EmergencyAccessService],
})
export class AuthModule {}