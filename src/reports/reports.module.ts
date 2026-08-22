import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Billing } from '../billing/entities/billing.entity';
import { PatientVisit } from '../patient-visits/entities/patient-visit.entity';
import { SoapNote } from '../soap-notes/entities/soap-note.entity';
import { LabOrder } from '../lab/entities/lab-order.entity';
import { Admission } from '../inpatient/entities/admission.entity';
import { Bed } from '../inpatient/entities/bed.entity';
import { Ward } from '../inpatient/entities/ward.entity';
import { User } from '../users/entities/user.entity';
import { Patient } from '../patients/entities/patient.entity';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Billing, PatientVisit, SoapNote, LabOrder, Admission, Bed, Ward, User, Patient]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}