import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  Min,
  IsDateString,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RequisitionLineDto {
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  itemId?: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiPropertyOptional({ description: 'Stock category (drug, reagent…) for auto-creating the item on receipt' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ description: 'Unit of issue (unit, box, ml…)' })
  @IsString()
  @IsOptional()
  unit?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiPropertyOptional({ description: 'Estimated unit price, for budgeting' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  estimatedUnitPrice?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  purpose?: string;
}

export class CreateRequisitionDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  department?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  neededBy?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ type: [RequisitionLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RequisitionLineDto)
  lines: RequisitionLineDto[];
}
