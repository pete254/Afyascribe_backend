// src/soap-notes/dto/update-soap-note.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
  Matches,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Icd11CodeDto } from './icd11-code.dto';

export class UpdateSoapNoteDto {
  @ApiPropertyOptional({
    description: 'Symptoms & Diagnosis',
    example: 'Updated symptoms description'
  })
  @IsString()
  @IsOptional()
  symptoms?: string;

  @ApiPropertyOptional({
    description: 'Physical Examination',
    example: 'Updated physical examination findings'
  })
  @IsString()
  @IsOptional()
  physicalExamination?: string;

  @ApiPropertyOptional({
    description: 'Diagnosis',
    example: 'Updated diagnosis'
  })
  @IsString()
  @IsOptional()
  diagnosis?: string;

  @ApiPropertyOptional({
    description: 'Management',
    example: 'Updated treatment plan'
  })
  @IsString()
  @IsOptional()
  management?: string;

  @ApiPropertyOptional({
    description: 'Laboratory investigation results and interpretations',
    example: 'CBC: WBC 12,000, Hb 13.5'
  })
  @IsString()
  @IsOptional()
  labInvestigations?: string;

  @ApiPropertyOptional({
    description: 'Imaging studies and findings',
    example: 'Chest X-ray: No infiltrates'
  })
  @IsString()
  @IsOptional()
  imaging?: string;

  @ApiPropertyOptional({
    description: 'ICD-11 diagnosis code (3-7 alphanumeric characters)',
    example: 'E11.9'
  })
  @IsString()
  @IsOptional()
  @Matches(/^[A-Z][0-9]{2}(\.[0-9]{1,4})?$/, { 
    message: 'ICD-11 code must be in format: A00 or A00.0 or A00.00' 
  })
  @MaxLength(10)
  icd11Code?: string;

  @ApiPropertyOptional({
    description: 'ICD-11 code description',
    example: 'Type 2 diabetes mellitus without complications'
  })
  @IsString()
  @IsOptional()
  @MaxLength(300)
  icd11Description?: string;

  @ApiPropertyOptional({
    type: [Icd11CodeDto],
    description: 'Full set of ICD-11 diagnosis codes on the note',
  })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => Icd11CodeDto)
  icd11Codes?: Icd11CodeDto[];

  @ApiPropertyOptional({
    description: 'Mark if the note was manually edited',
    example: true
  })
  @IsBoolean()
  @IsOptional()
  wasEdited?: boolean;
}