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

export class PurchaseOrderLineDto {
  @ApiPropertyOptional({ description: 'Stock item, if this line is a tracked item' })
  @IsUUID()
  @IsOptional()
  itemId?: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  unitPrice: number;
}

export class CreatePurchaseOrderDto {
  @ApiProperty()
  @IsUUID()
  supplierId: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  expectedDate?: string;

  @ApiPropertyOptional({ description: 'VAT %, e.g. 16', example: 16 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  taxRate?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  deliveryAddress?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  terms?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ type: [PurchaseOrderLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  lines: PurchaseOrderLineDto[];
}

export class DecisionDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  note?: string;
}
