import { IsString, IsOptional, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** One diagnosis code on a note. A note may carry several of these. */
export class Icd11CodeDto {
  @ApiProperty({ example: '5A11', description: 'ICD-11 MMS code (e.g. 1A00, BA00, RA01.0, XA0060)' })
  @IsString()
  // Permissive across all MMS code shapes: stem codes (1A00), dotted leaves
  // (RA01.0, ME84.2Z, 1C61.30) and extension codes (XA0060).
  @Matches(/^[0-9A-Z]{2,}(\.[0-9A-Z]+)?$/i, {
    message: 'ICD-11 code must be a valid MMS code, e.g. 1A00, RA01.0 or XA0060',
  })
  @MaxLength(10)
  code: string;

  @ApiProperty({ example: 'Type 2 diabetes mellitus' })
  @IsString()
  @IsOptional()
  @MaxLength(300)
  description?: string;
}
