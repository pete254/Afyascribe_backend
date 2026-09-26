import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
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
