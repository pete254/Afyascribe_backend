// src/soap-notes/soap-notes.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SoapNotesController } from './soap-notes.controller';
import { SoapNotesService } from './soap-notes.service';
import { SoapNote } from './entities/soap-note.entity';
import { PatientsModule } from '../patients/patients.module';
import { PatientVisitsModule } from '../patient-visits/patient-visits.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SoapNote]),
    PatientsModule,
    PatientVisitsModule, // So SoapNotesService can auto-complete visits on save
  ],
  controllers: [SoapNotesController],
  providers: [SoapNotesService],
  exports: [SoapNotesService],
})
export class SoapNotesModule {}