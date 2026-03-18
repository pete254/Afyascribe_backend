import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Billing } from '../billing/entities/billing.entity';
import { PatientVisit } from '../patient-visits/entities/patient-visit.entity';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Billing, PatientVisit])],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}