import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Icd10Service } from './icd10.service';
import { Icd10Controller } from './icd10.controller';
import { Icd10Code } from './entities/icd10-code.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Icd10Code])],
  controllers: [Icd10Controller],
  providers: [Icd10Service],
  exports: [Icd10Service], // Export for use in other modules
})
export class Icd10Module {}