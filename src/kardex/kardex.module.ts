import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MedicationAdministration } from './entities/medication-administration.entity';
import { NursingVital } from './entities/nursing-vital.entity';
import { CarePlanEntry } from './entities/care-plan-entry.entity';
import { ProgressNote } from './entities/progress-note.entity';
import { Prescription } from '../prescriptions/entities/prescription.entity';
import { Admission } from '../inpatient/entities/admission.entity';
import { Patient } from '../patients/entities/patient.entity';
import { KardexService } from './kardex.service';
import { KardexController } from './kardex.controller';

/** Nursing kardex — care plan, vitals and the Medication Administration Record. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      MedicationAdministration,
      NursingVital,
      CarePlanEntry,
      ProgressNote,
      Prescription,
      Admission,
      Patient,
    ]),
  ],
  controllers: [KardexController],
  providers: [KardexService],
  exports: [KardexService],
})
export class KardexModule {}
