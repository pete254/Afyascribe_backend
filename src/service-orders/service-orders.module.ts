import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClinicalServiceOrder } from './entities/clinical-service-order.entity';
import { Patient } from '../patients/entities/patient.entity';
import { PatientVisit } from '../patient-visits/entities/patient-visit.entity';
import { BillingModule } from '../billing/billing.module';
import { ServiceCatalogModule } from '../service-catalog/service-catalog.module';
import { ServiceOrdersService } from './service-orders.service';
import { ServiceOrdersController } from './service-orders.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ClinicalServiceOrder, Patient, PatientVisit]),
    BillingModule,
    ServiceCatalogModule,
  ],
  controllers: [ServiceOrdersController],
  providers: [ServiceOrdersService],
  exports: [ServiceOrdersService],
})
export class ServiceOrdersModule {}
