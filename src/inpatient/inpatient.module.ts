import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ward } from './entities/ward.entity';
import { Bed } from './entities/bed.entity';
import { Admission } from './entities/admission.entity';
import { Patient } from '../patients/entities/patient.entity';
import { Billing } from '../billing/entities/billing.entity';
import { PatientVisit } from '../patient-visits/entities/patient-visit.entity';
import { InpatientService } from './inpatient.service';
import { InpatientBillingService } from './inpatient-billing.service';
import { InpatientController } from './inpatient.controller';
import { BillingModule } from '../billing/billing.module';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  // BillingModule provides BillingService (charges + stock depletion + GL);
  // AccountingModule provides HmisPostingService (deposit journals).
  imports: [
    TypeOrmModule.forFeature([Ward, Bed, Admission, Patient, Billing, PatientVisit]),
    BillingModule,
    AccountingModule,
  ],
  controllers: [InpatientController],
  providers: [InpatientService, InpatientBillingService],
})
export class InpatientModule {}
