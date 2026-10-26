// src/patient-documents/patient-documents.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PatientDocument } from './entities/patient-document.entity';
import { PatientDocumentsService } from './patient-documents.service';
import { PatientDocumentsController } from './patient-documents.controller';
import { PatientsModule } from '../patients/patients.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PatientDocument]),
    PatientsModule,
    FilesModule,
  ],
  controllers: [PatientDocumentsController],
  providers: [PatientDocumentsService],
  exports: [PatientDocumentsService],
})
export class PatientDocumentsModule {}