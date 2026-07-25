import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { FacilityCreationCode } from './entities/facility-creation-code.entity';
import { SupportRequest } from './entities/support-request.entity';
import { Facility } from '../facilities/entities/facility.entity';
import { User } from '../users/entities/user.entity';

import { FacilityCodesService } from './facility-codes.service';
import { PlatformFacilitiesService } from './platform-facilities.service';
import { SupportRequestsService } from './support-requests.service';

import { FacilityCodesController } from './facility-codes.controller';
import { PlatformFacilitiesController } from './platform-facilities.controller';
import { SupportRequestsController } from './support-requests.controller';

/**
 * The AfyaScribe platform (super_admin) surface: issuing facility-creation
 * codes, managing facility lifecycle and billing, and the public support /
 * code-request inbox. EmailService is provided globally by EmailModule.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([FacilityCreationCode, SupportRequest, Facility, User]),
    // Guards read the JWT; mirror the secret/config the rest of the app uses.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', '7d') },
      }),
    }),
  ],
  controllers: [
    FacilityCodesController,
    PlatformFacilitiesController,
    SupportRequestsController,
  ],
  providers: [FacilityCodesService, PlatformFacilitiesService, SupportRequestsService],
  // Exported so AuthModule can consume a code when a clinic is created.
  exports: [FacilityCodesService],
})
export class PlatformModule {}
