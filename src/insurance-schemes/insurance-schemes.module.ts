import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InsuranceScheme } from './entities/insurance-scheme.entity';
import { InsuranceSchemesService } from './insurance-schemes.service';
import { InsuranceSchemesController } from './insurance-schemes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([InsuranceScheme])],
  controllers: [InsuranceSchemesController],
  providers: [InsuranceSchemesService],
  exports: [InsuranceSchemesService],
})
export class InsuranceSchemesModule {}