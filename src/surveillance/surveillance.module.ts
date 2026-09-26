import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiseaseNotification } from './entities/disease-notification.entity';
import { SoapNote } from '../soap-notes/entities/soap-note.entity';
import { PatientProblem } from '../problems/entities/patient-problem.entity';
import { Patient } from '../patients/entities/patient.entity';
import { Facility } from '../facilities/entities/facility.entity';
import { SurveillanceService } from './surveillance.service';
import { WeeklyReturnService } from './weekly.service';
import { WeeklyReturn } from './entities/weekly-return.entity';
import { PublicHealthSignal } from './entities/public-health-signal.entity';
import { Delivery } from '../maternity/entities/delivery.entity';
import { Birth } from '../maternity/entities/birth.entity';
import { SurveillanceController } from './surveillance.controller';

/** Disease surveillance against Kenya's IDSR priority conditions. */
@Module({
  imports: [TypeOrmModule.forFeature([
      DiseaseNotification,
      WeeklyReturn,
      PublicHealthSignal,
      SoapNote,
      PatientProblem,
      Patient,
      Facility,
      Delivery,
      Birth,
    ])],
  controllers: [SurveillanceController],
  providers: [SurveillanceService, WeeklyReturnService],
  exports: [SurveillanceService, WeeklyReturnService],
})
export class SurveillanceModule {}
