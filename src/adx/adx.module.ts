import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Facility } from '../facilities/entities/facility.entity';
import { ReportsModule } from '../reports/reports.module';
import { SurveillanceModule } from '../surveillance/surveillance.module';
import { AdxService } from './adx.service';
import { AdxController } from './adx.controller';

/**
 * ADX — the MOH returns as SDMX. Reads the figures the reporting and
 * surveillance modules already compute rather than recomputing them, so an
 * ADX message and the on-screen return can never disagree.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Facility]), ReportsModule, SurveillanceModule],
  controllers: [AdxController],
  providers: [AdxService],
  exports: [AdxService],
})
export class AdxModule {}
