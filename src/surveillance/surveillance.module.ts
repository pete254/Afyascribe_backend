import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiseaseNotification } from './entities/disease-notification.entity';
import { SoapNote } from '../soap-notes/entities/soap-note.entity';
import { PatientProblem } from '../problems/entities/patient-problem.entity';
import { SurveillanceService } from './surveillance.service';
import { SurveillanceController } from './surveillance.controller';

/** Disease surveillance against Kenya's IDSR priority conditions. */
@Module({
  imports: [TypeOrmModule.forFeature([DiseaseNotification, SoapNote, PatientProblem])],
  controllers: [SurveillanceController],
  providers: [SurveillanceService],
  exports: [SurveillanceService],
})
export class SurveillanceModule {}
