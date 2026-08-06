// src/patient-visits/patient-visits.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PatientVisit } from './entities/patient-visit.entity';
import { Billing } from '../billing/entities/billing.entity';
import { Facility } from '../facilities/entities/facility.entity';
import { PatientVisitsService } from './patient-visits.service';
import { PatientVisitsController } from './patient-visits.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PatientVisit, Billing, Facility])],
  controllers: [PatientVisitsController],
  providers: [PatientVisitsService],
  exports: [PatientVisitsService], // Export so SoapNotesModule can use it
})
export class PatientVisitsModule {}