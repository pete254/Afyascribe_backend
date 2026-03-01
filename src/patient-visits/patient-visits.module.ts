// src/patient-visits/patient-visits.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PatientVisit } from './entities/patient-visit.entity';
import { PatientVisitsService } from './patient-visits.service';
import { PatientVisitsController } from './patient-visits.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PatientVisit])],
  controllers: [PatientVisitsController],
  providers: [PatientVisitsService],
  exports: [PatientVisitsService],
})
export class PatientVisitsModule {}