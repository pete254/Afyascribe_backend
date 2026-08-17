import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MedicationAdministration } from './entities/medication-administration.entity';
import { Prescription } from '../prescriptions/entities/prescription.entity';
import { Admission } from '../inpatient/entities/admission.entity';
import { Patient } from '../patients/entities/patient.entity';
import { KardexService } from './kardex.service';
import { KardexController } from './kardex.controller';

/** Nursing kardex / Medication Administration Record (MAR). */
@Module({
  imports: [
    TypeOrmModule.forFeature([MedicationAdministration, Prescription, Admission, Patient]),
  ],
  controllers: [KardexController],
  providers: [KardexService],
  exports: [KardexService],
})
export class KardexModule {}
