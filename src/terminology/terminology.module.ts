import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TerminologyConcept } from './entities/terminology-concept.entity';
import { TerminologyService } from './terminology.service';
import { TerminologySyncService } from './terminology-sync.service';
import { OclClient } from './ocl.client';
import { SnomedImportService } from './snomed-import.service';
import { TerminologyController } from './terminology.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TerminologyConcept])],
  controllers: [TerminologyController],
  providers: [OclClient, TerminologyService, TerminologySyncService, SnomedImportService],
  exports: [TerminologyService, TerminologySyncService, OclClient, SnomedImportService],
})
export class TerminologyModule {}
