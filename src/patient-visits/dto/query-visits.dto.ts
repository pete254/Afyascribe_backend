// src/patient-visits/dto/query-visits.dto.ts
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { VisitStatus } from '../entities/patient-visit.entity';

export class QueryVisitsDto {
  @ApiPropertyOptional({ enum: VisitStatus, description: 'Filter by visit status' })
  @IsOptional()
  @IsEnum(VisitStatus)
  status?: VisitStatus;

  @ApiPropertyOptional({ description: 'Filter by assigned doctor UUID' })
  @IsOptional()
  @IsUUID()
  doctorId?: string;
}