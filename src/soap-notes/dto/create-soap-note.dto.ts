import {
  IsString,
  IsOptional,
  IsUUID,
  IsArray,
  ValidateNested,
  Matches,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { Icd10CodeDto } from './icd10-code.dto';

export class CreateSoapNoteDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  patientId: string;

  @ApiProperty({ example: 'Patient complains of fever and cough for 3 days...' })
  @IsString()
  @IsOptional()
  symptoms?: string;

  @ApiProperty({ example: 'BP: 120/80, Temp: 38.5°C, chest clear...' })
  @IsString()
  @IsOptional()
  physicalExamination?: string;

  // NEW FIELDS
  @ApiProperty({ 
    example: 'CBC: WBC 12,000, Hb 13.5. Blood glucose: 110 mg/dL (fasting)',
    description: 'Laboratory investigation results and interpretations' 
  })
  @IsString()
  @IsOptional()
  labInvestigations?: string;

  @ApiProperty({ 
    example: 'Chest X-ray: No infiltrates, normal cardiac silhouette',
    description: 'Imaging studies and findings' 
  })
  @IsString()
  @IsOptional()
  imaging?: string;

  @ApiProperty({ example: 'Type 2 diabetes mellitus, uncontrolled' })
  @IsString()
  @IsOptional()
  diagnosis?: string;

  @ApiProperty({ 
    example: 'E11.9',
    description: 'ICD-10 diagnosis code (3-7 alphanumeric characters)' 
  })
  @IsString()
  @IsOptional()
  @Matches(/^[A-Z][0-9]{2}(\.[0-9]{1,4})?$/, { 
    message: 'ICD-10 code must be in format: A00 or A00.0 or A00.00' 
  })
  @MaxLength(10)
  icd10Code?: string;

  @ApiProperty({ 
    example: 'Type 2 diabetes mellitus without complications',
    description: 'ICD-10 code description' 
  })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  icd10Description?: string;

  @ApiProperty({
    type: [Icd10CodeDto],
    required: false,
    description: 'Full set of ICD-10 diagnosis codes on the note',
  })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => Icd10CodeDto)
  icd10Codes?: Icd10CodeDto[];

  @ApiProperty({ example: 'Metformin 500mg twice daily...' })
  @IsString()
  @IsOptional()
  management?: string;
}