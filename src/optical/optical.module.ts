import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpticalService } from './optical.service';
import { OpticalController } from './optical.controller';
import { OpticalRx } from './entities/optical-rx.entity';
import { Patient } from '../patients/entities/patient.entity';
import { Facility } from '../facilities/entities/facility.entity';
import { User } from '../users/entities/user.entity';
import { PatientVisit } from '../patient-visits/entities/patient-visit.entity';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OpticalRx, Patient, Facility, User, PatientVisit]),
    BillingModule,
  ],
  controllers: [OpticalController],
  providers: [OpticalService],
  exports: [OpticalService],
})
export class OpticalModule {}
