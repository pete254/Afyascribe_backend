import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const ADMINISTRATION_STATUSES = [
  'given',
  'held',
  'refused',
  'omitted',
  'not_available',
] as const;

/** Record a single medication administration on a patient's kardex. */
export class RecordAdministrationDto {
  @ApiProperty({ description: 'Patient the drug was given to' })
  @IsUUID()
  patientId: string;

  @ApiPropertyOptional({ description: 'Admission (inpatient) this round belongs to' })
  @IsOptional()
  @IsUUID()
  admissionId?: string;

  @ApiPropertyOptional({ description: 'Prescription the drug came from' })
  @IsOptional()
  @IsUUID()
  prescriptionId?: string;

  @ApiPropertyOptional({ description: 'Prescription line this dose fulfils' })
  @IsOptional()
  @IsUUID()
  prescriptionItemId?: string;

  @ApiProperty({ example: 'Amoxicillin 500mg' })
  @IsString()
  @MaxLength(200)
  medication: string;

  @ApiPropertyOptional({ example: '1 tab' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  dose?: string;

  @ApiPropertyOptional({ example: 'PO' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  route?: string;

  @ApiPropertyOptional({ example: 'TDS' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  frequency?: string;

  @ApiPropertyOptional({ description: 'When the dose was due' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ description: 'When it was actually given (defaults to now)' })
  @IsOptional()
  @IsDateString()
  administeredAt?: string;

  @ApiProperty({ enum: ADMINISTRATION_STATUSES, default: 'given' })
  @IsIn(ADMINISTRATION_STATUSES as unknown as string[])
  status: (typeof ADMINISTRATION_STATUSES)[number];

  @ApiPropertyOptional({ description: 'Reason held/refused, injection site, response, etc.' })
  @IsOptional()
  @IsString()
  notes?: string;
}
