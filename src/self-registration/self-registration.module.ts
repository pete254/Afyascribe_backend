// src/self-registration/self-registration.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SelfRegistration } from './entities/self-registration.entity';
import { Facility } from '../facilities/entities/facility.entity';
import { Patient } from '../patients/entities/patient.entity';
import { PatientsModule } from '../patients/patients.module';
import { SelfRegistrationController } from './self-registration.controller';
import { SelfRegistrationService } from './self-registration.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SelfRegistration, Facility, Patient]),
    PatientsModule, // for PatientsService.createPatient (patientId generation)
  ],
  controllers: [SelfRegistrationController],
  providers: [SelfRegistrationService],
  exports: [SelfRegistrationService],
})
export class SelfRegistrationModule {}
