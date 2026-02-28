// src/facilities/facilities.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Facility } from './entities/facility.entity';
import { FacilityInviteCode } from './entities/facility-invite-code.entity';
import { FacilitiesService } from './facilities.service';
import { FacilitiesController } from './facilities.controller';
import { InviteCodesService } from './invite-codes.service';

@Module({
  imports: [TypeOrmModule.forFeature([Facility, FacilityInviteCode])],
  controllers: [FacilitiesController],
  providers: [FacilitiesService, InviteCodesService],
  exports: [FacilitiesService, InviteCodesService, TypeOrmModule],
})
export class FacilitiesModule {}