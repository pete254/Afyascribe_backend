import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  Min,
  IsUUID,
  IsBoolean,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ── Catalog ───────────────────────────────────────────────────────────────────

export class LabAnalyteDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsString() @IsOptional() unit?: string;
  @ApiPropertyOptional({ description: 'Lower normal bound (numeric range)' })
  @IsNumber() @IsOptional() refLow?: number;
  @ApiPropertyOptional({ description: 'Upper normal bound (numeric range)' })
  @IsNumber() @IsOptional() refHigh?: number;
  @ApiPropertyOptional({ description: 'Expected qualitative result, e.g. "Negative"' })
  @IsString() @IsOptional() refText?: string;
}

export class CreateLabTestDto {
  @ApiPropertyOptional() @IsString() @IsOptional() code?: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional({ example: 'blood' }) @IsString() @IsOptional() specimen?: string;
  @ApiPropertyOptional({ example: 'haematology' }) @IsString() @IsOptional() department?: string;
  @ApiPropertyOptional() @IsNumber() @Min(0) @IsOptional() price?: number;
  @ApiPropertyOptional() @IsNumber() @Min(0) @IsOptional() turnaroundHours?: number;

  @ApiProperty({ type: [LabAnalyteDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LabAnalyteDto)
  analytes: LabAnalyteDto[];
}

export class UpdateLabTestDto {
  @ApiPropertyOptional() @IsString() @IsOptional() code?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() name?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() specimen?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() department?: string;
  @ApiPropertyOptional() @IsNumber() @Min(0) @IsOptional() price?: number;
  @ApiPropertyOptional() @IsNumber() @Min(0) @IsOptional() turnaroundHours?: number;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isActive?: boolean;

  @ApiPropertyOptional({ type: [LabAnalyteDto], description: 'When present, replaces the analyte set' })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => LabAnalyteDto)
  analytes?: LabAnalyteDto[];
}

// ── Orders ────────────────────────────────────────────────────────────────────

export class CreateLabOrderDto {
  @ApiProperty() @IsUUID() patientId: string;
  @ApiPropertyOptional() @IsString() @IsOptional() patientName?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() patientNo?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() visitId?: string;
  @ApiPropertyOptional({ example: 'routine' }) @IsIn(['routine', 'urgent']) @IsOptional() priority?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() clinicalNotes?: string;

  @ApiProperty({ type: [String], description: 'Catalog test IDs to order' })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  testIds: string[];
}

export class CollectSampleDto {
  @ApiPropertyOptional({ description: 'Specimen / container / site note' })
  @IsString() @IsOptional() specimenNote?: string;
}

export class ResultValueDto {
  @ApiPropertyOptional() @IsUUID() @IsOptional() analyteId?: string;
  @ApiProperty() @IsString() analyteName: string;
  @ApiPropertyOptional() @IsString() @IsOptional() unit?: string;
  @ApiPropertyOptional() @IsNumber() @IsOptional() refLow?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() refHigh?: number;
  @ApiPropertyOptional() @IsString() @IsOptional() refText?: string;
  @ApiPropertyOptional({ description: 'Entered result (numeric or text)' })
  @IsString() @IsOptional() value?: string;
}

export class SubmitResultDto {
  @ApiPropertyOptional() @IsString() @IsOptional() resultNote?: string;

  @ApiProperty({ type: [ResultValueDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResultValueDto)
  values: ResultValueDto[];

  @ApiPropertyOptional({ description: 'true = post/verify to the record; false = save as draft' })
  @IsBoolean() @IsOptional() post?: boolean;
}
