import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsInt,
  IsBoolean,
  IsIn,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

export const WARD_TYPES = ['general', 'maternity', 'paediatric', 'surgical', 'private', 'icu', 'other'];
export const BED_STATUSES = ['available', 'occupied', 'blocked'];
export const OUTCOMES = ['discharged', 'referred', 'deceased', 'absconded'];
/** normal → auto-accrue the daily bed fee; special → bed charges entered by hand. */
export const BED_CHARGE_MODES = ['normal', 'special'];

export class CreateWardDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsIn(WARD_TYPES)
  wardType?: string;

  @IsOptional()
  @IsIn(BED_CHARGE_MODES)
  bedChargeMode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  bedDailyCharge?: number;

  /** Optionally seed this many beds (labelled 1..n) with the ward. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(500)
  bedCount?: number;
}

export class UpdateWardDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(WARD_TYPES)
  wardType?: string;

  @IsOptional()
  @IsIn(BED_CHARGE_MODES)
  bedChargeMode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  bedDailyCharge?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateBedsDto {
  @IsUUID()
  wardId: string;

  /** Add a single named bed… */
  @IsOptional()
  @IsString()
  label?: string;

  /** …or bulk-add this many (auto-labelled continuing the ward's numbering). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  count?: number;
}

export class UpdateBedDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsIn(BED_STATUSES)
  status?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateAdmissionDto {
  @IsUUID()
  patientId: string;

  @IsUUID()
  wardId: string;

  @IsOptional()
  @IsUUID()
  bedId?: string;

  @IsOptional()
  @IsString()
  admittedAt?: string;

  @IsOptional()
  @IsString()
  admissionDiagnosis?: string;

  @IsOptional()
  @IsUUID()
  visitId?: string;

  /** Deposit collected at admission — seeds the running-bill credit. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  depositAmount?: number;

  @IsOptional()
  @IsString()
  depositMethod?: string;
}

export class DischargeAdmissionDto {
  @IsIn(OUTCOMES)
  outcome: string;

  @IsOptional()
  @IsString()
  dischargedAt?: string;

  @IsOptional()
  @IsString()
  dischargeNotes?: string;

  /** Override the unpaid-balance block (documented admin decision). */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

// ── Running bill ─────────────────────────────────────────────────────────────
export class CollectDepositDto {
  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  method?: string;
}

export class AddChargeDto {
  @IsOptional()
  @IsString()
  serviceType?: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumber()
  @Min(0)
  amount: number;

  /** When set, the charge also depletes pharmacy stock and books COGS. */
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;
}

export class TransferAdmissionDto {
  @IsUUID()
  wardId: string;

  @IsOptional()
  @IsUUID()
  bedId?: string;
}
