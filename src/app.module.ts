// src/app.module.ts — UPDATED: Added BillingModule
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SoapNotesModule } from './soap-notes/soap-notes.module';
import { PatientsModule } from './patients/patients.module';
import { TranscriptionModule } from './transcription/transcription.module';
import { Icd10Module } from './icd10/icd10.module';
import { FacilitiesModule } from './facilities/facilities.module';
import { PatientVisitsModule } from './patient-visits/patient-visits.module';
import { AdminModule } from './admin/admin.module';
import { BillingModule } from './billing/billing.module';
import { PatientDocumentsModule } from './patient-documents/patient-documents.module';

import { User } from './users/entities/user.entity';
import { SoapNote } from './soap-notes/entities/soap-note.entity';
import { Patient } from './patients/entities/patient.entity';
import { Facility } from './facilities/entities/facility.entity';
import { FacilityInviteCode } from './facilities/entities/facility-invite-code.entity';
import { PatientVisit } from './patient-visits/entities/patient-visit.entity';
import { Billing } from './billing/entities/billing.entity';
import { PatientDocument } from './patient-documents/entities/patient-document.entity';

import { KeepAliveService } from './services/keepAlive';
import { InsuranceSchemesModule } from './insurance-schemes/insurance-schemes.module';
import { InsuranceScheme } from './insurance-schemes/entities/insurance-scheme.entity';
import { ReportsModule } from './reports/reports.module';
import { ServiceCatalogModule } from './service-catalog/service-catalog.module';
import { ServiceCatalogItem } from './service-catalog/entities/service-catalog.entity'
import { AppointmentsModule } from './appointments/appointments.module';
import { SelfRegistrationModule } from './self-registration/self-registration.module';
import { PlatformModule } from './platform/platform.module';
import { FacilityCreationCode } from './platform/entities/facility-creation-code.entity';
import { SupportRequest } from './platform/entities/support-request.entity';
import { SelfRegistration } from './self-registration/entities/self-registration.entity';
import { AccountingModule } from './accounting/accounting.module';
import { LedgerAccount } from './accounting/entities/ledger-account.entity';
import { JournalEntry } from './accounting/entities/journal-entry.entity';
import { JournalLine } from './accounting/entities/journal-line.entity';
import { InventoryModule } from './inventory/inventory.module';
import { InventoryItem } from './inventory/entities/inventory-item.entity';
import { Supplier } from './inventory/entities/supplier.entity';
import { StockMovement } from './inventory/entities/stock-movement.entity';
import { GoodsReceipt } from './inventory/entities/goods-receipt.entity';
import { GoodsReceiptLine } from './inventory/entities/goods-receipt-line.entity';
import { SupplierPayment } from './inventory/entities/supplier-payment.entity';
import { PurchaseOrder } from './inventory/entities/purchase-order.entity';
import { PurchaseOrderLine } from './inventory/entities/purchase-order-line.entity';
import { PurchaseRequisition } from './inventory/entities/purchase-requisition.entity';
import { PurchaseRequisitionLine } from './inventory/entities/purchase-requisition-line.entity';
import { Quotation } from './inventory/entities/quotation.entity';
import { QuotationLine } from './inventory/entities/quotation-line.entity';
import { SupplierInvoice } from './inventory/entities/supplier-invoice.entity';
import { PayrollModule } from './payroll/payroll.module';
import { Employee } from './payroll/entities/employee.entity';
import { PayrollRun } from './payroll/entities/payroll-run.entity';
import { Payslip } from './payroll/entities/payslip.entity';
import { LabModule } from './lab/lab.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    HttpModule,

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get('NODE_ENV') === 'production';
        const config: any = {
          type: 'postgres',
          host: configService.get('DB_HOST'),
          port: Number(configService.get('DB_PORT')),
          username: configService.get('DB_USERNAME'),
          password: configService.get('DB_PASSWORD'),
          database: configService.get('DB_DATABASE'),
          entities: [User, SoapNote, Patient, Facility, FacilityInviteCode, PatientVisit, Billing, InsuranceScheme, PatientDocument, ServiceCatalogItem, SelfRegistration, FacilityCreationCode, SupportRequest, LedgerAccount, JournalEntry, JournalLine, InventoryItem, Supplier, StockMovement, GoodsReceipt, GoodsReceiptLine, SupplierPayment, PurchaseOrder, PurchaseOrderLine, PurchaseRequisition, PurchaseRequisitionLine, Quotation, QuotationLine, SupplierInvoice, Employee, PayrollRun, Payslip],
          autoLoadEntities: true,
          synchronize: !isProduction,
          logging: !isProduction,
          migrations: ['dist/migrations/*.js'],
          migrationsRun: true,
        };
        if (isProduction) {
          config.ssl = { rejectUnauthorized: false };
          config.extra = { sslmode: 'require' };
        }
        return config;
      },
    }),

    UsersModule,
    AuthModule,
    SoapNotesModule,
    PatientsModule,
    TranscriptionModule,
    Icd10Module,
    FacilitiesModule,
    PatientVisitsModule,
    AdminModule,
    BillingModule,
    InsuranceSchemesModule,
    ReportsModule,
    PatientDocumentsModule,
    ServiceCatalogModule,
    AppointmentsModule,
    SelfRegistrationModule,
    PlatformModule,
    AccountingModule,
    InventoryModule,
    PayrollModule,
    LabModule,
    PrescriptionsModule,
  ],
  controllers: [AppController],
  providers: [AppService, KeepAliveService],
})
export class AppModule {}