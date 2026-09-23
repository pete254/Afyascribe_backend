import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FAMILY_HISTORY_STATUSES, RELATIONSHIP_CODES } from '../family-history.enums';

export class FamilyConditionDto {
  @ApiPropertyOptional({ description: 'ICD-11 code via KNHTS' })
  @IsString() @IsOptional() code?: string;

  @ApiProperty({ example: 'Type 2 diabetes mellitus' })
  @IsString() @IsNotEmpty() display: string;

  @ApiPropertyOptional({ description: 'Age at which the relative developed it' })
  @IsInt() @Min(0) @Max(130) @IsOptional() onsetAge?: number;

  @ApiPropertyOptional() @IsBoolean() @IsOptional() contributedToDeath?: boolean;
  @ApiPropertyOptional() @IsString() @IsOptional() note?: string;
}

export class CreateFamilyHistoryDto {
  @ApiProperty() @IsUUID() patientId: string;

  @ApiProperty({ enum: RELATIONSHIP_CODES, example: 'MTH' })
  @IsIn(RELATIONSHIP_CODES) relationship: string;

  @ApiPropertyOptional() @IsString() @IsOptional() name?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() gender?: string;
  @ApiPropertyOptional() @IsInt() @Min(1900) @IsOptional() bornYear?: number;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() deceased?: boolean;
  @ApiPropertyOptional() @IsInt() @Min(0) @Max(130) @IsOptional() ageAtDeath?: number;

  @ApiPropertyOptional({ type: [FamilyConditionDto] })
  @IsArray() @IsOptional() @ValidateNested({ each: true }) @Type(() => FamilyConditionDto)
  conditions?: FamilyConditionDto[];

  @ApiPropertyOptional({ enum: FAMILY_HISTORY_STATUSES })
  @IsIn(FAMILY_HISTORY_STATUSES) @IsOptional() status?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() note?: string;
}

export class UpdateFamilyHistoryDto {
  @ApiPropertyOptional({ enum: RELATIONSHIP_CODES })
  @IsIn(RELATIONSHIP_CODES) @IsOptional() relationship?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() name?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() gender?: string;
  @ApiPropertyOptional() @IsInt() @Min(1900) @IsOptional() bornYear?: number;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() deceased?: boolean;
  @ApiPropertyOptional() @IsInt() @Min(0) @Max(130) @IsOptional() ageAtDeath?: number;

  @ApiPropertyOptional({ type: [FamilyConditionDto] })
  @IsArray() @IsOptional() @ValidateNested({ each: true }) @Type(() => FamilyConditionDto)
  conditions?: FamilyConditionDto[];

  @ApiPropertyOptional({ enum: FAMILY_HISTORY_STATUSES })
  @IsIn(FAMILY_HISTORY_STATUSES) @IsOptional() status?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() note?: string;
}
