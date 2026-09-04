import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RadiologyService } from './radiology.service';
import { RadiologyController } from './radiology.controller';
import { Radiology } from './entities/radiology.entity';
import { Patient } from '../patients/entities/patient.entity';
import { Facility } from '../facilities/entities/facility.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Radiology, Patient, Facility])],
  controllers: [RadiologyController],
  providers: [RadiologyService],
  exports: [RadiologyService],
})
export class RadiologyModule {}
