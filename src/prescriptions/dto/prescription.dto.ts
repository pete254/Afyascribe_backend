import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** One medication line as written by the doctor. */
export class PrescriptionItemDto {
  @ApiPropertyOptional({ description: 'National HPT generic code for the drug' })
  @IsOptional() @IsString()
  knhtsCode?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  doseForm?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  strength?: string;

  @ApiPropertyOptional({ description: 'Stock item, when the drug prescribed is one the facility stocks' })
  @IsOptional() @IsUUID()
  itemId?: string;

  @IsString()
  medication: string;

  @IsOptional() @IsString()
  dosage?: string;

  @IsOptional() @IsString()
  frequency?: string;

  @IsOptional() @IsString()
  form?: string;

  @IsOptional() @IsString()
  duration?: string;

  @IsOptional() @IsString()
  quantityText?: string;

  @IsOptional() @IsString()
  instructions?: string;
}

export class CreatePrescriptionDto {
  @IsUUID()
  patientId: string;

  @IsOptional() @IsString()
  patientName?: string;

  @IsOptional() @IsString()
  patientNo?: string;

  @IsOptional() @IsUUID()
  visitId?: string;

  @IsOptional() @IsString()
  diagnosis?: string;

  @IsOptional() @IsString()
  notes?: string;

  /** Coded problems this is prescribed for, from the patient's problem list. */
  @IsOptional() @IsArray()
  problems?: { id?: string; code?: string | null; display: string }[];

  /** Lab or imaging orders from this visit that bear on the prescription. */
  @IsOptional() @IsArray()
  diagnosticTests?: { id?: string; kind: 'lab' | 'imaging'; name: string; result?: string | null }[];

  /** What the patient was already taking, as the prescriber saw it. */
  @IsOptional() @IsArray()
  medicationsAtPrescribing?: { name: string; code?: string | null; since?: string | null }[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items: PrescriptionItemDto[];
}

/**
 * A pharmacist's edit of one line: the clinical fields can be corrected, and the
 * pharmacy fields (item link, quantity, price) are added. `id` targets an
 * existing line; omit it to add a new one.
 */
export class PharmacyItemDto {
  @IsOptional() @IsUUID()
  id?: string;

  @IsString()
  medication: string;

  @IsOptional() @IsString()
  dosage?: string;

  @IsOptional() @IsString()
  frequency?: string;

  @IsOptional() @IsString()
  form?: string;

  @IsOptional() @IsString()
  duration?: string;

  @IsOptional() @IsString()
  quantityText?: string;

  @IsOptional() @IsString()
  instructions?: string;

  @IsOptional() @IsUUID()
  itemId?: string | null;

  @IsOptional() @IsNumber()
  dispenseQty?: number | null;

  @IsOptional() @IsNumber()
  unitPrice?: number | null;

  /** Also make unitPrice the linked item's sale price (when it had none). */
  @IsOptional() @IsBoolean()
  saveAsItemPrice?: boolean;

  @IsOptional() @IsString()
  knhtsCode?: string;

  @IsOptional() @IsString()
  doseForm?: string;

  @IsOptional() @IsString()
  strength?: string;
}

export class UpdatePrescriptionItemsDto {
  @IsOptional() @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PharmacyItemDto)
  items: PharmacyItemDto[];
}

export class DispenseDto {
  /** Acknowledge dispensing despite an unpaid balance (warn-but-allow). */
  @IsOptional() @IsBoolean()
  allowUnpaid?: boolean;
}

export class SupplyPreviewDto {
  @ApiPropertyOptional({ description: 'Units being handed over' })
  @IsOptional() @IsNumber()
  quantity?: number;

  @ApiPropertyOptional({ example: '1 tab' })
  @IsOptional() @IsString()
  dosage?: string;

  @ApiPropertyOptional({ example: 'TDS' })
  @IsOptional() @IsString()
  frequency?: string;

  @ApiPropertyOptional({ example: '5/7', description: 'The course as written' })
  @IsOptional() @IsString()
  duration?: string;
}
