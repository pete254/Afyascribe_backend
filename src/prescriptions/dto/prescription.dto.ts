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
  @IsString()
  medication: string;

  @IsOptional() @IsString()
  dosage?: string;

  @IsOptional() @IsString()
  frequency?: string;

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
