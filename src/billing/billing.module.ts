// src/billing/billing.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Billing } from './entities/billing.entity';
import { PatientVisit } from '../patient-visits/entities/patient-visit.entity';
import { SoapNote } from '../soap-notes/entities/soap-note.entity';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { AccountingModule } from '../accounting/accounting.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  // AccountingModule provides HmisPostingService (auto-journals); InventoryModule
  // provides StockService so dispensing a stock item depletes it and books COGS.
  // SoapNote lets the patient ledger surface the diagnoses behind the charges.
  imports: [TypeOrmModule.forFeature([Billing, PatientVisit, SoapNote]), AccountingModule, InventoryModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}