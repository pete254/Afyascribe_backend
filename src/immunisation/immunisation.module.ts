import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Immunisation } from './entities/immunisation.entity';
import { Patient } from '../patients/entities/patient.entity';
import { ImmunisationService } from './immunisation.service';
import { ImmunisationController } from './immunisation.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Immunisation, Patient])],
  controllers: [ImmunisationController],
  providers: [ImmunisationService],
  exports: [ImmunisationService],
})
export class ImmunisationModule {}
