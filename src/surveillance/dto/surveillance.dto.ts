import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class RecordNotificationDto {
  @ApiProperty() @IsUUID() patientId: string;

  @ApiProperty({ description: 'An IDSR condition code' })
  @IsString() conditionCode: string;

  @ApiPropertyOptional() @IsUUID() @IsOptional() visitId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() sourceText?: string;

  @ApiPropertyOptional({ enum: ['diagnosis', 'problem', 'manual', 'register'] })
  @IsIn(['diagnosis', 'problem', 'manual', 'register']) @IsOptional()
  detectedFrom?: 'diagnosis' | 'problem' | 'manual' | 'register';

  @ApiPropertyOptional() @IsDateString() @IsOptional() onsetDate?: string;
}

export class DismissNotificationDto {
  @ApiProperty({ description: 'Why nobody needs telling. Kept for the outbreak review.' })
  @IsString() @MinLength(3) reason: string;
}

/** MOH 502, as far as a facility fills it. The national level assigns the EPID number. */
export class NotifyDto {
  @ApiPropertyOptional({ enum: ['suspected', 'probable', 'confirmed'] })
  @IsIn(['suspected', 'probable', 'confirmed']) @IsOptional()
  caseClassification?: 'suspected' | 'probable' | 'confirmed';

  @ApiPropertyOptional({ description: 'C1 — date of onset of illness' })
  @IsDateString() @IsOptional() onsetDate?: string;

  @ApiPropertyOptional({ description: 'C2 — first seen at this facility' })
  @IsDateString() @IsOptional() firstSeenDate?: string;

  @ApiPropertyOptional({ enum: ['clinical', 'lab', 'epi-linkage', 'other'], description: 'C7' })
  @IsIn(['clinical', 'lab', 'epi-linkage', 'other']) @IsOptional()
  meansOfDiagnosis?: 'clinical' | 'lab' | 'epi-linkage' | 'other';

  @ApiPropertyOptional({ enum: ['hospitalised', 'discharged', 'dead'], description: 'C9' })
  @IsIn(['hospitalised', 'discharged', 'dead']) @IsOptional()
  patientStatus?: 'hospitalised' | 'discharged' | 'dead';

  @ApiPropertyOptional({ description: 'G1 — was a specimen collected' })
  @IsBoolean() @IsOptional() specimenCollected?: boolean;

  @ApiPropertyOptional() @IsString() @IsOptional() specimenType?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() specimenSentDate?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() labName?: string;

  @ApiPropertyOptional({ description: 'G2 — have results come back' })
  @IsBoolean() @IsOptional() labResultReceived?: boolean;

  @ApiPropertyOptional({ description: 'Assigned at national level' })
  @IsString() @IsOptional() epidNo?: string;

  @ApiPropertyOptional({ description: 'H1 — who completed the form' })
  @IsString() @IsOptional() reportedByName?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() reportedByDesignation?: string;

  @ApiPropertyOptional({
    description:
      'The rest of the form: tracer details, vaccination history, and the section that applies only to this disease',
  })
  @IsObject() @IsOptional() form?: Record<string, unknown>;

  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
}

// ── The weekly return (MOH 505) ─────────────────────────────────────────────

/**
 * One row's four figures. Counts of people: whole numbers, never negative.
 * The ceiling only stops a typing slip (an extra zero, a pasted phone number)
 * reaching the sub-county as a week's cases.
 */
export const MAX_WEEKLY_COUNT = 100_000;

class WeeklyCountsDto {
  @ApiProperty() @IsInt() @Min(0) @Max(MAX_WEEKLY_COUNT) under5Cases: number;
  @ApiProperty() @IsInt() @Min(0) @Max(MAX_WEEKLY_COUNT) under5Deaths: number;
  @ApiProperty() @IsInt() @Min(0) @Max(MAX_WEEKLY_COUNT) over5Cases: number;
  @ApiProperty() @IsInt() @Min(0) @Max(MAX_WEEKLY_COUNT) over5Deaths: number;
}

export class WeeklyRowDto extends WeeklyCountsDto {
  @ApiProperty({ description: 'The row as MOH 505 prints it' })
  @IsString() @MaxLength(120) label: string;

  @ApiPropertyOptional() @IsString() @IsOptional() conditionCode?: string | null;

  /** Ignored: the server decides whether a row was corrected. */
  @ApiPropertyOptional() @IsBoolean() @IsOptional() computed?: boolean;
}

export class WeeklyOtherDto extends WeeklyCountsDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(120) label: string;
}

export class SaveWeeklyDto {
  @ApiPropertyOptional() @IsInt() @Min(2000) @Max(2100) @IsOptional() year?: number;
  @ApiPropertyOptional() @IsInt() @Min(1) @Max(53) @IsOptional() week?: number;

  @ApiPropertyOptional({ type: [WeeklyRowDto] })
  @IsArray() @ArrayMaxSize(60) @ValidateNested({ each: true }) @Type(() => WeeklyRowDto) @IsOptional()
  rows?: WeeklyRowDto[];

  @ApiPropertyOptional({ description: 'Laboratory surveillance: { test: { field: count } }' })
  @IsObject() @IsOptional()
  labSurveillance?: Record<string, Record<string, number>>;

  @ApiPropertyOptional({ type: [WeeklyOtherDto] })
  @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => WeeklyOtherDto) @IsOptional()
  others?: WeeklyOtherDto[];

  @ApiPropertyOptional() @IsInt() @Min(0) @Max(10_000) @IsOptional() sitesReported?: number;
  @ApiPropertyOptional() @IsInt() @Min(0) @Max(10_000) @IsOptional() sitesExpected?: number;
  @ApiPropertyOptional() @IsString() @MaxLength(120) @IsOptional() reportedByDesignation?: string;
  @ApiPropertyOptional() @IsString() @MaxLength(2000) @IsOptional() notes?: string;
}
