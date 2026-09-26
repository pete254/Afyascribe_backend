import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Patient } from '../patients/entities/patient.entity';
import { PatientProblem } from '../problems/entities/patient-problem.entity';
import { PatientAllergy } from '../allergies/entities/patient-allergy.entity';
import { PatientVisit } from '../patient-visits/entities/patient-visit.entity';
import { LabOrder } from '../lab/entities/lab-order.entity';
import { LabAnalyte } from '../lab/entities/lab-analyte.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { Pregnancy } from '../maternity/entities/pregnancy.entity';
import { AncContact } from '../maternity/entities/anc-contact.entity';
import { CdsService } from './cds.service';
import { CdsController } from './cds.controller';

/**
 * Clinical decision support. Reads the problem list, the allergy list, the HPT
 * coding on stock, demographics, lab results and vital signs, and returns
 * advice that cites where it came from.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Patient,
      PatientProblem,
      PatientAllergy,
      PatientVisit,
      LabOrder,
      LabAnalyte,
      InventoryItem,
      Pregnancy,
      AncContact,
    ]),
  ],
  controllers: [CdsController],
  providers: [CdsService],
  exports: [CdsService],
})
export class CdsModule {}
