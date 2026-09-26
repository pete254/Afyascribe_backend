import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Patient } from '../patients/entities/patient.entity';
import { PatientIdentifier } from '../patients/entities/patient-identifier.entity';
import { SoapNote } from '../soap-notes/entities/soap-note.entity';
import { Prescription } from '../prescriptions/entities/prescription.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { LabOrder } from '../lab/entities/lab-order.entity';
import { LabTest } from '../lab/entities/lab-test.entity';
import { LabAnalyte } from '../lab/entities/lab-analyte.entity';
import { Billing } from '../billing/entities/billing.entity';
import { ServiceCatalogItem } from '../service-catalog/entities/service-catalog.entity';
import { Facility } from '../facilities/entities/facility.entity';
import { User } from '../users/entities/user.entity';
import { PatientVisit } from '../patient-visits/entities/patient-visit.entity';
import { Radiology } from '../radiology/entities/radiology.entity';
import { PatientAllergy } from '../allergies/entities/patient-allergy.entity';
import { PatientProblem } from '../problems/entities/patient-problem.entity';
import { Appointment } from '../appointments/entities/appointment.entity';
import { FamilyHistory } from '../family-history/entities/family-history.entity';
import { Immunisation } from '../immunisation/entities/immunisation.entity';
import { Pregnancy } from '../maternity/entities/pregnancy.entity';
import { AncContact } from '../maternity/entities/anc-contact.entity';
import { PncContact } from '../maternity/entities/pnc-contact.entity';
import { Delivery } from '../maternity/entities/delivery.entity';
import { Birth } from '../maternity/entities/birth.entity';
import { AllergiesModule } from '../allergies/allergies.module';
import { FhirService } from './fhir.service';
import { FhirController } from './fhir.controller';
import { HieFhirClient } from './hie-fhir.client';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Patient,
      PatientIdentifier,
      SoapNote,
      Prescription,
      InventoryItem,
      LabOrder,
      LabTest,
      LabAnalyte,
      Billing,
      ServiceCatalogItem,
      Facility,
      User,
      PatientVisit,
      Radiology,
      PatientAllergy,
      PatientProblem,
      Appointment,
      FamilyHistory,
      Immunisation,
      Pregnancy,
      AncContact,
      PncContact,
      Delivery,
      Birth,
    ]),
    AllergiesModule,
  ],
  controllers: [FhirController],
  providers: [FhirService, HieFhirClient],
  exports: [FhirService],
})
export class FhirModule {}
