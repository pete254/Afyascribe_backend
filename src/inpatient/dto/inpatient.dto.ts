import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsInt,
  IsBoolean,
  IsIn,
  Min,
  Max,
} from 'class-validator';

export const WARD_TYPES = ['general', 'maternity', 'paediatric', 'surgical', 'private', 'icu', 'other'];
export const BED_STATUSES = ['available', 'occupied', 'blocked'];
export const OUTCOMES = ['discharged', 'referred', 'deceased', 'absconded'];

export class CreateWardDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsIn(WARD_TYPES)
  wardType?: string;

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
}

export class TransferAdmissionDto {
  @IsUUID()
  wardId: string;

  @IsOptional()
  @IsUUID()
  bedId?: string;
}
