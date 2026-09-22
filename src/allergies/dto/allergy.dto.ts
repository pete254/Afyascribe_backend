import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ALLERGEN_TYPES,
  ALLERGY_CRITICALITIES,
  ALLERGY_KINDS,
  ALLERGY_SEVERITIES,
  ALLERGY_STATUSES,
  ALLERGY_VERIFICATIONS,
} from '../allergy.enums';

export class ManifestationDto {
  @ApiPropertyOptional({ description: 'KNHTS Allergy Reaction Manifestation code' })
  @IsString() @IsOptional() code?: string;

  @ApiProperty() @IsString() @IsNotEmpty() display: string;
}

export class CreateAllergyDto {
  @ApiProperty() @IsUUID() patientId: string;

  @ApiProperty({ enum: ALLERGEN_TYPES }) @IsIn(ALLERGEN_TYPES) allergenType: string;

  @ApiProperty({ example: 'Penicillin' })
  @IsString() @IsNotEmpty() allergenName: string;

  @ApiPropertyOptional({ description: 'National allergen code (MOH-KENYA Allergy Intolerance Code)' })
  @IsString() @IsOptional() knhtsCode?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() knhtsSystem?: string;

  @ApiPropertyOptional({ description: 'HPT active-component code for a drug allergy' })
  @IsString() @IsOptional() hptCode?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() hptName?: string;

  @ApiPropertyOptional({ enum: ALLERGY_KINDS }) @IsIn(ALLERGY_KINDS) @IsOptional() kind?: string;

  @ApiPropertyOptional({ type: [ManifestationDto] })
  @IsArray() @IsOptional() @ValidateNested({ each: true }) @Type(() => ManifestationDto)
  manifestations?: ManifestationDto[];

  @ApiPropertyOptional({ enum: ALLERGY_SEVERITIES }) @IsIn(ALLERGY_SEVERITIES) @IsOptional() severity?: string;

  @ApiPropertyOptional({ enum: ALLERGY_CRITICALITIES }) @IsIn(ALLERGY_CRITICALITIES) @IsOptional() criticality?: string;

  @ApiPropertyOptional({ enum: ALLERGY_VERIFICATIONS })
  @IsIn(ALLERGY_VERIFICATIONS) @IsOptional() verificationStatus?: string;

  @ApiPropertyOptional() @IsDateString() @IsOptional() onsetDate?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() lastOccurrence?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() note?: string;
}

export class UpdateAllergyDto {
  @ApiPropertyOptional({ enum: ALLERGY_STATUSES }) @IsIn(ALLERGY_STATUSES) @IsOptional() status?: string;
  @ApiPropertyOptional({ description: 'Why the status changed — kept in the allergy history' })
  @IsString() @IsOptional() statusReason?: string;

  @ApiPropertyOptional({ enum: ALLERGY_SEVERITIES }) @IsIn(ALLERGY_SEVERITIES) @IsOptional() severity?: string;
  @ApiPropertyOptional({ enum: ALLERGY_CRITICALITIES }) @IsIn(ALLERGY_CRITICALITIES) @IsOptional() criticality?: string;
  @ApiPropertyOptional({ enum: ALLERGY_VERIFICATIONS })
  @IsIn(ALLERGY_VERIFICATIONS) @IsOptional() verificationStatus?: string;

  @ApiPropertyOptional({ type: [ManifestationDto] })
  @IsArray() @IsOptional() @ValidateNested({ each: true }) @Type(() => ManifestationDto)
  manifestations?: ManifestationDto[];

  @ApiPropertyOptional() @IsDateString() @IsOptional() lastOccurrence?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() note?: string;
}

export class AllergyQueryDto {
  @ApiPropertyOptional({ description: 'true = the active allergy list only; false/omitted = the full history' })
  @IsBoolean() @IsOptional() activeOnly?: boolean;
}
