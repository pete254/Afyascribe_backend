import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PatientProblem } from './entities/patient-problem.entity';
import { Patient } from '../patients/entities/patient.entity';
import { ProblemsService } from './problems.service';
import { ProblemsController } from './problems.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PatientProblem, Patient])],
  controllers: [ProblemsController],
  providers: [ProblemsService],
  exports: [ProblemsService],
})
export class ProblemsModule {}
