import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  Max,
  Min,
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

// ── Vitals ────────────────────────────────────────────────────────────────────
/** Record a set of bedside observations for an admitted patient. */
export class RecordVitalDto {
  @ApiProperty()
  @IsUUID()
  patientId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  admissionId?: string;

  @ApiPropertyOptional({ example: 37.2, description: '°C' })
  @IsOptional()
  @IsNumber()
  @Min(25)
  @Max(45)
  temperature?: number;

  @ApiPropertyOptional({ example: 80, description: 'beats/min' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(300)
  pulse?: number;

  @ApiPropertyOptional({ example: 18, description: 'breaths/min' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  respRate?: number;

  @ApiPropertyOptional({ example: 120 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(320)
  bpSystolic?: number;

  @ApiPropertyOptional({ example: 80 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(220)
  bpDiastolic?: number;

  @ApiPropertyOptional({ example: 98, description: 'SpO₂ %' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  spo2?: number;

  @ApiPropertyOptional({ example: 62.5, description: 'kg' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  weightKg?: number;

  @ApiPropertyOptional({ example: 5.5, description: 'mmol/L (RBS)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(80)
  bloodGlucose?: number;

  @ApiPropertyOptional({ example: 2, description: '0–10 pain score' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  painScore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'When the observations were taken (defaults to now)' })
  @IsOptional()
  @IsDateString()
  recordedAt?: string;
}

// ── Care plan ─────────────────────────────────────────────────────────────────
export const CARE_PLAN_STATUSES = ['active', 'resolved'] as const;

/** Add a nursing care-plan entry (problem → goal → intervention → evaluation). */
export class CreateCarePlanDto {
  @ApiProperty()
  @IsUUID()
  patientId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  admissionId?: string;

  @ApiProperty({ example: 'Risk of falls' })
  @IsString()
  @MaxLength(500)
  problem: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  goal?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  intervention?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  evaluation?: string;
}

/** Update an existing care-plan entry (evaluation / status as care progresses). */
export class UpdateCarePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  problem?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  goal?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  intervention?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  evaluation?: string;

  @ApiPropertyOptional({ enum: CARE_PLAN_STATUSES })
  @IsOptional()
  @IsIn(CARE_PLAN_STATUSES as unknown as string[])
  status?: string;
}

/** Author roles a progress note can be filed under. */
export const PROGRESS_NOTE_ROLES = ['doctor', 'nurse'] as const;

/** File a free-text clinical progress note (doctor ward-round or nurse note). */
export class CreateProgressNoteDto {
  @ApiProperty({ description: 'Patient the note is about' })
  @IsUUID()
  patientId: string;

  @ApiPropertyOptional({ description: 'Admission this note belongs to' })
  @IsOptional()
  @IsUUID()
  admissionId?: string;

  @ApiProperty({ enum: PROGRESS_NOTE_ROLES, description: 'Whose note this is' })
  @IsIn(PROGRESS_NOTE_ROLES as unknown as string[])
  authorRole: 'doctor' | 'nurse';

  @ApiProperty({ description: 'The note text' })
  @IsString()
  @MaxLength(8000)
  body: string;
}
