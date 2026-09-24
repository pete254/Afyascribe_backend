import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pregnancy } from './entities/pregnancy.entity';
import { AncContact } from './entities/anc-contact.entity';
import { PncContact } from './entities/pnc-contact.entity';
import { Patient } from '../patients/entities/patient.entity';
import { Immunisation } from '../immunisation/entities/immunisation.entity';
import { MaternityService } from './maternity.service';
import { MaternityController } from './maternity.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Pregnancy, AncContact, PncContact, Patient, Immunisation])],
  controllers: [MaternityController],
  providers: [MaternityService],
  exports: [MaternityService],
})
export class MaternityModule {}
