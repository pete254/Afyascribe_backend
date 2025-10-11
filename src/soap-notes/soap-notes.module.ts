// src/soap-notes/soap-notes.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SoapNotesController } from './soap-notes.controller';
import { SoapNotesService } from './soap-notes.service';
import { SoapNote } from './entities/soap-note.entity';
import { PatientsModule } from '../patients/patients.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SoapNote]),
    PatientsModule, // Import PatientsModule to use PatientsService
  ],
  controllers: [SoapNotesController],
  providers: [SoapNotesService],
  exports: [SoapNotesService],
})
export class SoapNotesModule {}