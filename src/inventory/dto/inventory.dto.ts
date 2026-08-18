import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  Min,
  IsDateString,
  IsBoolean,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateItemDto {
  @ApiProperty({ example: 'Amoxicillin 500mg' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  sku?: string;

  @ApiPropertyOptional({ example: 'drug' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ example: 'unit' })
  @IsString()
  @IsOptional()
  unit?: string;

  @ApiPropertyOptional({ example: 50 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  salePrice?: number;

  @ApiPropertyOptional({ example: 30, description: 'Buying/cost price' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  costPrice?: number;

  @ApiPropertyOptional({ example: 40, description: 'Markup %; when set, sale price auto-derives from cost' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  markupPct?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @Min(0)
  @IsOptional()
  reorderLevel?: number;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  trackStock?: boolean;

  @ApiPropertyOptional({ example: '13001' })
  @IsString()
  @IsOptional()
  inventoryAccountCode?: string;

  @ApiPropertyOptional({ example: '51001' })
  @IsString()
  @IsOptional()
  cogsAccountCode?: string;

  @ApiPropertyOptional({ example: '42001' })
  @IsString()
  @IsOptional()
  revenueAccountCode?: string;
}

export class UpdateItemDto {
  @ApiPropertyOptional() @IsString() @IsOptional() name?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() sku?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() category?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() unit?: string;
  @ApiPropertyOptional() @IsNumber() @Min(0) @IsOptional() salePrice?: number;
  @ApiPropertyOptional() @IsNumber() @Min(0) @IsOptional() costPrice?: number;
  @ApiPropertyOptional() @IsNumber() @Min(0) @IsOptional() markupPct?: number;
  @ApiPropertyOptional() @IsNumber() @Min(0) @IsOptional() reorderLevel?: number;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isActive?: boolean;
  @ApiPropertyOptional() @IsString() @IsOptional() inventoryAccountCode?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() cogsAccountCode?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() revenueAccountCode?: string;
}

export class AdjustStockDto {
  @ApiProperty({ description: 'Signed change in units: positive adds, negative removes' })
  @IsNumber()
  quantity: number;

  @ApiPropertyOptional({ description: 'Unit cost for a positive adjustment; ignored for removals' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  unitCost?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({ description: 'Batch / lot number (positive adjustments)' })
  @IsString()
  @IsOptional()
  batchNo?: string;

  @ApiPropertyOptional({ description: 'Expiry date for the added stock (YYYY-MM-DD)' })
  @IsDateString()
  @IsOptional()
  expiryDate?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  date?: string;
}

export class StockCountLineDto {
  @ApiProperty() @IsUUID() itemId: string;
  @ApiProperty({ description: 'Physically counted quantity' }) @IsNumber() @Min(0) countedQty: number;
  @ApiPropertyOptional() @IsString() @IsOptional() reason?: string;
}

export class StockCountDto {
  @ApiProperty({ type: [StockCountLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockCountLineDto)
  lines: StockCountLineDto[];

  @ApiPropertyOptional({ description: 'Effective date of the count (YYYY-MM-DD)' })
  @IsDateString()
  @IsOptional()
  date?: string;
}

export class CreateSupplierDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsString() @IsOptional() contactPerson?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() email?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() phone?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() taxPin?: string;
  @ApiPropertyOptional({ example: '21001' }) @IsString() @IsOptional() payableAccountCode?: string;
}

export class UpdateSupplierDto {
  @ApiPropertyOptional() @IsString() @IsOptional() name?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() contactPerson?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() email?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() phone?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() taxPin?: string;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isActive?: boolean;
}

export class GoodsReceiptLineDto {
  @ApiPropertyOptional({ description: 'Existing stock item. Omit to have it created from name/category/unit.' })
  @IsUUID() @IsOptional() itemId?: string;

  @ApiPropertyOptional({ description: 'LPO line being received against (tracks partial receipts)' })
  @IsUUID() @IsOptional() purchaseOrderLineId?: string;

  @ApiPropertyOptional({ description: 'New item name, when itemId is omitted (procurement-only facilities)' })
  @IsString() @IsOptional() name?: string;

  @ApiPropertyOptional({ description: 'Category for a newly-created item (drug, reagent…)' })
  @IsString() @IsOptional() category?: string;

  @ApiPropertyOptional({ description: 'Unit of issue for a newly-created item' })
  @IsString() @IsOptional() unit?: string;

  @ApiProperty() @IsNumber() @Min(0) quantity: number;
  @ApiProperty() @IsNumber() @Min(0) unitCost: number;
  @ApiPropertyOptional({ description: 'Batch / lot number' })
  @IsString() @IsOptional() batchNo?: string;
  @ApiPropertyOptional({ description: 'Expiry date (YYYY-MM-DD)' })
  @IsDateString() @IsOptional() expiryDate?: string;
}

export class CreateGoodsReceiptDto {
  @ApiProperty() @IsUUID() supplierId: string;

  @ApiPropertyOptional({ description: 'LPO being received against' })
  @IsUUID()
  @IsOptional()
  purchaseOrderId?: string;

  @ApiPropertyOptional() @IsDateString() @IsOptional() date?: string;

  @ApiPropertyOptional({ description: 'Supplier invoice / delivery note number' })
  @IsString()
  @IsOptional()
  reference?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;

  @ApiProperty({ type: [GoodsReceiptLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptLineDto)
  lines: GoodsReceiptLineDto[];
}

export class CreateSupplierPaymentDto {
  @ApiProperty() @IsUUID() supplierId: string;
  @ApiProperty() @IsNumber() @Min(0) amount: number;

  @ApiPropertyOptional({ description: 'Invoice this payment settles' })
  @IsUUID()
  @IsOptional()
  supplierInvoiceId?: string;

  @ApiPropertyOptional({ example: 'bank' }) @IsString() @IsOptional() method?: string;

  @ApiPropertyOptional({ example: '11003', description: 'COA account the money left from' })
  @IsString()
  @IsOptional()
  bankAccountCode?: string;

  @ApiPropertyOptional() @IsDateString() @IsOptional() date?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() reference?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
}
