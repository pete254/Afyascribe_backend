// src/service-catalog/service-catalog.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TerminologyModule } from '../terminology/terminology.module';
import { ServiceCatalogItem } from './entities/service-catalog.entity';
import { ServiceCatalogService } from './service-catalog.service';
import { ServiceCatalogController } from './service-catalog.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceCatalogItem]), TerminologyModule],
  controllers: [ServiceCatalogController],
  providers: [ServiceCatalogService],
  exports: [ServiceCatalogService],
})
export class ServiceCatalogModule {}