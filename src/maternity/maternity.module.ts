import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pregnancy } from './entities/pregnancy.entity';
import { AncContact } from './entities/anc-contact.entity';
import { PncContact } from './entities/pnc-contact.entity';
import { Delivery } from './entities/delivery.entity';
import { Birth } from './entities/birth.entity';
import { LabourObservation } from './entities/labour-observation.entity';
import { Patient } from '../patients/entities/patient.entity';
import { Immunisation } from '../immunisation/entities/immunisation.entity';
import { MaternityService } from './maternity.service';
import { MaternityController } from './maternity.controller';
import { LabourService } from './labour.service';
import { LabourController } from './labour.controller';

@Module({
  imports: [TypeOrmModule.forFeature([
      Pregnancy,
      AncContact,
      PncContact,
      Delivery,
      Birth,
      LabourObservation,
      Patient,
      Immunisation,
    ])],
  controllers: [MaternityController, LabourController],
  providers: [MaternityService, LabourService],
  exports: [MaternityService, LabourService],
})
export class MaternityModule {}
