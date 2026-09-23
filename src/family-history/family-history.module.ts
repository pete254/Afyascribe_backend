import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FamilyHistory } from './entities/family-history.entity';
import { Patient } from '../patients/entities/patient.entity';
import { FamilyHistoryService } from './family-history.service';
import { FamilyHistoryController } from './family-history.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FamilyHistory, Patient])],
  controllers: [FamilyHistoryController],
  providers: [FamilyHistoryService],
  exports: [FamilyHistoryService],
})
export class FamilyHistoryModule {}
