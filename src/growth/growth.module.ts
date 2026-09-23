import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Patient } from '../patients/entities/patient.entity';
import { PatientVisit } from '../patient-visits/entities/patient-visit.entity';
import { GrowthService } from './growth.service';
import { GrowthController } from './growth.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Patient, PatientVisit])],
  controllers: [GrowthController],
  providers: [GrowthService],
  exports: [GrowthService],
})
export class GrowthModule {}
