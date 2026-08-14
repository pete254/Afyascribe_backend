import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ward } from './entities/ward.entity';
import { Bed } from './entities/bed.entity';
import { Admission } from './entities/admission.entity';
import { Patient } from '../patients/entities/patient.entity';
import { InpatientService } from './inpatient.service';
import { InpatientController } from './inpatient.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Ward, Bed, Admission, Patient])],
  controllers: [InpatientController],
  providers: [InpatientService],
})
export class InpatientModule {}
