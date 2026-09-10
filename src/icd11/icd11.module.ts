import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Icd11Service } from './icd11.service';
import { Icd11Controller } from './icd11.controller';
import { Icd11Code } from './entities/icd11-code.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Icd11Code])],
  controllers: [Icd11Controller],
  providers: [Icd11Service],
  exports: [Icd11Service], // Export for use in other modules
})
export class Icd11Module {}