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
          entities: [User, SoapNote, Patient, Facility, FacilityInviteCode, PatientVisit, Billing, InsuranceScheme, PatientDocument, ServiceCatalogItem],
          autoLoadEntities: true,
          synchronize: !isProduction,
          logging: !isProduction,
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
  ],
  controllers: [AppController],
  providers: [AppService, KeepAliveService],
})
export class AppModule {}