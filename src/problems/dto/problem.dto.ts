import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import {
  PROBLEM_CATEGORIES,
  PROBLEM_SEVERITIES,
  PROBLEM_STATUSES,
  PROBLEM_VERIFICATIONS,
} from '../problem.enums';

export class CreateProblemDto {
  @ApiProperty() @IsUUID() patientId: string;

  @ApiPropertyOptional({ description: 'ICD-11 code (WHO/ICD-11 via KNHTS)' })
  @IsString() @IsOptional() code?: string;

  @ApiProperty({ example: 'Type 2 diabetes mellitus' })
  @IsString() @IsNotEmpty() display: string;

  @ApiPropertyOptional({ enum: PROBLEM_CATEGORIES })
  @IsIn(PROBLEM_CATEGORIES) @IsOptional() category?: string;

  @ApiPropertyOptional({ enum: PROBLEM_STATUSES })
  @IsIn(PROBLEM_STATUSES) @IsOptional() status?: string;

  @ApiPropertyOptional({ enum: PROBLEM_VERIFICATIONS })
  @IsIn(PROBLEM_VERIFICATIONS) @IsOptional() verificationStatus?: string;

  @ApiPropertyOptional({ enum: PROBLEM_SEVERITIES })
  @IsIn(PROBLEM_SEVERITIES) @IsOptional() severity?: string;

  @ApiPropertyOptional() @IsDateString() @IsOptional() onsetDate?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() note?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() sourceNoteId?: string;
}

export class UpdateProblemDto {
  @ApiPropertyOptional({ enum: PROBLEM_STATUSES })
  @IsIn(PROBLEM_STATUSES) @IsOptional() status?: string;

  @ApiPropertyOptional({ description: 'Why the status changed — kept in the problem history' })
  @IsString() @IsOptional() statusReason?: string;

  @ApiPropertyOptional({ enum: PROBLEM_VERIFICATIONS })
  @IsIn(PROBLEM_VERIFICATIONS) @IsOptional() verificationStatus?: string;

  @ApiPropertyOptional({ enum: PROBLEM_SEVERITIES })
  @IsIn(PROBLEM_SEVERITIES) @IsOptional() severity?: string;

  @ApiPropertyOptional({ enum: PROBLEM_CATEGORIES })
  @IsIn(PROBLEM_CATEGORIES) @IsOptional() category?: string;

  @ApiPropertyOptional({ description: 'When it resolved; defaults to today when resolving' })
  @IsDateString() @IsOptional() abatementDate?: string;

  @ApiPropertyOptional() @IsDateString() @IsOptional() onsetDate?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() note?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() display?: string;
}
