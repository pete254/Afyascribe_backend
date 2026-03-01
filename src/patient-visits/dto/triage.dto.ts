// src/patient-visits/dto/triage.dto.ts
import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class TriageDto {
  @ApiPropertyOptional({ description: 'Blood pressure e.g. "120/80"' })
  @IsOptional()
  @IsString()
  bloodPressure?: string;

  @ApiPropertyOptional({ description: 'Temperature e.g. "37.2°C"' })
  @IsOptional()
  @IsString()
  temperature?: string;

  @ApiPropertyOptional({ description: 'Pulse e.g. "72 bpm"' })
  @IsOptional()
  @IsString()
  pulse?: string;

  @ApiPropertyOptional({ description: 'Weight e.g. "70 kg"' })
  @IsOptional()
  @IsString()
  weight?: string;

  @ApiPropertyOptional({ description: 'Height e.g. "170 cm"' })
  @IsOptional()
  @IsString()
  height?: string;

  @ApiPropertyOptional({ description: 'Oxygen saturation e.g. "98%"' })
  @IsOptional()
  @IsString()
  spO2?: string;

  @ApiPropertyOptional({ description: 'Respiratory rate e.g. "16/min"' })
  @IsOptional()
  @IsString()
  respiratoryRate?: string;

  @ApiPropertyOptional({ description: 'Additional triage notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}