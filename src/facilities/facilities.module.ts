// src/facilities/facilities.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Facility } from './entities/facility.entity';
import { FacilityInviteCode } from './entities/facility-invite-code.entity';
import { FacilitiesService } from './facilities.service';
import { FacilitiesController } from './facilities.controller';
import { FacilityLogoController } from './facility-logo.controller';
import { InviteCodesService } from './invite-codes.service';

@Module({
  imports: [TypeOrmModule.forFeature([Facility, FacilityInviteCode]), ConfigModule],
  controllers: [FacilitiesController, FacilityLogoController],
  providers: [FacilitiesService, InviteCodesService],
  exports: [FacilitiesService, InviteCodesService, TypeOrmModule],
})
export class FacilitiesModule {}