import { IsString, IsOptional, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** One diagnosis code on a note. A note may carry several of these. */
export class Icd10CodeDto {
  @ApiProperty({ example: 'E11.9', description: 'ICD-10 code (A00 or A00.0 or A00.00)' })
  @IsString()
  @Matches(/^[A-Z][0-9]{2}(\.[0-9]{1,4})?$/, {
    message: 'ICD-10 code must be in format: A00 or A00.0 or A00.00',
  })
  @MaxLength(10)
  code: string;

  @ApiProperty({ example: 'Type 2 diabetes mellitus without complications' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  description?: string;
}
