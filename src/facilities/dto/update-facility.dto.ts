// src/facilities/dto/update-facility.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateFacilityDto } from './create-facility.dto';
import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FacilityStatus } from '../entities/facility.entity';

export class UpdateFacilityDto extends PartialType(CreateFacilityDto) {
  @ApiPropertyOptional({ enum: FacilityStatus })
  @IsOptional()
  @IsEnum(FacilityStatus)
  status?: FacilityStatus;
}