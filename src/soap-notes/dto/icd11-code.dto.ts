import { IsString, IsOptional, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** One diagnosis code on a note. A note may carry several of these. */
export class Icd11CodeDto {
  @ApiProperty({ example: '5A11', description: 'ICD-11 MMS stem code (e.g. 1A00, BA00, RA01.0)' })
  @IsString()
  @Matches(/^[0-9A-Z][A-Z][0-9A-Z]{2}(\.[0-9A-Z]{1,3})?$/i, {
    message: 'ICD-11 code must be a valid MMS stem code, e.g. 1A00, BA00 or RA01.0',
  })
  @MaxLength(10)
  code: string;

  @ApiProperty({ example: 'Type 2 diabetes mellitus' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  description?: string;
}
