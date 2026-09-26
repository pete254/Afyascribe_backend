import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pregnancy } from '../maternity/entities/pregnancy.entity';
import { AncContact } from '../maternity/entities/anc-contact.entity';
import { PncContact } from '../maternity/entities/pnc-contact.entity';
import { Delivery } from '../maternity/entities/delivery.entity';
import { Birth } from '../maternity/entities/birth.entity';
import { Facility } from '../facilities/entities/facility.entity';
import { QualityMeasure } from './entities/quality-measure.entity';
import { MeasureValue } from './entities/measure-value.entity';
import { QualityService } from './quality.service';
import { QualityController } from './quality.controller';

/** Clinical quality measures, and the reports made from them. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Pregnancy,
      AncContact,
      PncContact,
      Delivery,
      Birth,
      Facility,
      QualityMeasure,
      MeasureValue,
    ]),
  ],
  controllers: [QualityController],
  providers: [QualityService],
  exports: [QualityService],
})
export class QualityModule {}
