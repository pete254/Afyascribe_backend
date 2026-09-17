import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Patient } from '../patients/entities/patient.entity';
import { SoapNote } from '../soap-notes/entities/soap-note.entity';
import { Prescription } from '../prescriptions/entities/prescription.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { LabOrder } from '../lab/entities/lab-order.entity';
import { LabTest } from '../lab/entities/lab-test.entity';
import { Billing } from '../billing/entities/billing.entity';
import { ServiceCatalogItem } from '../service-catalog/entities/service-catalog.entity';
import { FhirService } from './fhir.service';
import { FhirController } from './fhir.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Patient,
      SoapNote,
      Prescription,
      InventoryItem,
      LabOrder,
      LabTest,
      Billing,
      ServiceCatalogItem,
    ]),
  ],
  controllers: [FhirController],
  providers: [FhirService],
  exports: [FhirService],
})
export class FhirModule {}
