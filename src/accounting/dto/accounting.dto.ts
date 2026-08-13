import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  IsDateString,
  IsBoolean,
  Min,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class JournalLineDto {
  @ApiProperty({ example: '11001', description: 'Postable account code' })
  @IsString()
  @MaxLength(20)
  accountCode: string;

  @ApiPropertyOptional({ example: 1500, description: 'Debit amount (0 if a credit line)' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  debit?: number;

  @ApiPropertyOptional({ example: 0, description: 'Credit amount (0 if a debit line)' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  credit?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Department / clinic / ward / doctor tag' })
  @IsString()
  @IsOptional()
  @MaxLength(60)
  costCenter?: string;
}

export class PostJournalDto {
  @ApiPropertyOptional({ example: '2026-07-27', description: 'Effective date; defaults to today' })
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  memo?: string;

  @ApiPropertyOptional({ example: 'manual' })
  @IsString()
  @IsOptional()
  @MaxLength(40)
  source?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  sourceType?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  sourceId?: string;

  @ApiProperty({ type: [JournalLineDto], description: 'At least two lines; debits must equal credits' })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines: JournalLineDto[];
}

export class CreateAccountDto {
  @ApiProperty({ example: '11009' })
  @IsString()
  @MaxLength(20)
  code: string;

  @ApiProperty({ example: 'SACCO Account' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'asset' })
  @IsString()
  type: string;

  @ApiPropertyOptional({ example: 'debit' })
  @IsString()
  @IsOptional()
  normalBalance?: string;

  @ApiPropertyOptional({ example: '11000' })
  @IsString()
  @IsOptional()
  parentCode?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isPostable?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateAccountDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Only editable while the account has no transactions' })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({ description: 'Only editable while the account has no transactions' })
  @IsString()
  @IsOptional()
  normalBalance?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  parentCode?: string;

  @ApiPropertyOptional({ description: 'Only editable while the account has no transactions' })
  @IsBoolean()
  @IsOptional()
  isPostable?: boolean;
}
