import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Prescription } from './entities/prescription.entity';
import { PrescriptionItem } from './entities/prescription-item.entity';
import { PrescriptionsService } from './prescriptions.service';
import { PrescriptionsController } from './prescriptions.controller';
import { BillingModule } from '../billing/billing.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PatientVisit } from '../patient-visits/entities/patient-visit.entity';
import { Patient } from '../patients/entities/patient.entity';

@Module({
  // BillingModule raises the pharmacy charges; InventoryModule's StockService
  // depletes stock (FEFO) and books COGS when a prescription is dispensed.
  // PatientVisit + Patient are read-only here — to surface vitals/age to the
  // pharmacist for dosage calculations.
  imports: [
    TypeOrmModule.forFeature([Prescription, PrescriptionItem, PatientVisit, Patient]),
    BillingModule,
    InventoryModule,
  ],
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService],
  exports: [PrescriptionsService],
})
export class PrescriptionsModule {}
