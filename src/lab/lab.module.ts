import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LabTest } from './entities/lab-test.entity';
import { LabAnalyte } from './entities/lab-analyte.entity';
import { LabOrder } from './entities/lab-order.entity';
import { LabOrderItem } from './entities/lab-order-item.entity';
import { LabResultValue } from './entities/lab-result-value.entity';
import { LabService } from './lab.service';
import { LabController } from './lab.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([LabTest, LabAnalyte, LabOrder, LabOrderItem, LabResultValue]),
  ],
  controllers: [LabController],
  providers: [LabService],
  exports: [LabService],
})
export class LabModule {}
