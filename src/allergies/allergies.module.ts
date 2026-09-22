import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PatientAllergy } from './entities/patient-allergy.entity';
import { Patient } from '../patients/entities/patient.entity';
import { Prescription } from '../prescriptions/entities/prescription.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { AllergiesService } from './allergies.service';
import { AllergiesController } from './allergies.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PatientAllergy, Patient, Prescription, InventoryItem])],
  controllers: [AllergiesController],
  providers: [AllergiesService],
  exports: [AllergiesService],
})
export class AllergiesModule {}
