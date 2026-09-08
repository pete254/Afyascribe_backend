import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DentalService } from './dental.service';
import { DentalController } from './dental.controller';
import { DentalTreatment } from './entities/dental-treatment.entity';
import { Patient } from '../patients/entities/patient.entity';
import { Facility } from '../facilities/entities/facility.entity';
import { User } from '../users/entities/user.entity';
import { PatientVisit } from '../patient-visits/entities/patient-visit.entity';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DentalTreatment, Patient, Facility, User, PatientVisit]),
    BillingModule,
  ],
  controllers: [DentalController],
  providers: [DentalService],
  exports: [DentalService],
})
export class DentalModule {}
