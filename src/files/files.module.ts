import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { Facility } from '../facilities/entities/facility.entity';
import { PatientDocument } from '../patient-documents/entities/patient-document.entity';
import { EmployeeDocument } from '../payroll/entities/employee-document.entity';
import { User } from '../users/entities/user.entity';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PatientDocument,
      EmployeeDocument,
      Facility,
      User,
    ]),
    AuditModule,
  ],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
