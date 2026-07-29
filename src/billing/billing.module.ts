// src/billing/billing.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Billing } from './entities/billing.entity';
import { PatientVisit } from '../patient-visits/entities/patient-visit.entity';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  // AccountingModule provides HmisPostingService so every bill/payment/waiver
  // posts a balanced journal automatically (best-effort).
  imports: [TypeOrmModule.forFeature([Billing, PatientVisit]), AccountingModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}