import { IsNumber, IsOptional, IsString, Min, MaxLength } from 'class-validator';

export const ASSET_TYPES = ['equipment', 'furniture', 'vehicle', 'medical', 'it', 'building', 'other'];
export const ASSET_STATUSES = ['in_use', 'in_repair', 'idle', 'retired', 'disposed'];
export const ASSET_EVENT_TYPES = [
  'acquired', 'assigned', 'transferred', 'repair', 'maintenance', 'revaluation', 'depreciation', 'disposed', 'note',
];

export class CreateAssetDto {
  @IsString() @MaxLength(200)
  name: string;

  @IsOptional() @IsString() @MaxLength(40)
  assetTag?: string;

  @IsOptional() @IsString() @MaxLength(40)
  assetType?: string;

  @IsOptional() @IsString()
  serialNumber?: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsString()
  purchaseDate?: string;

  @IsOptional() @IsNumber() @Min(0)
  purchaseCost?: number;

  @IsOptional() @IsNumber() @Min(0)
  salvageValue?: number;

  @IsOptional() @IsString()
  depreciationMethod?: string;

  @IsOptional() @IsNumber() @Min(0)
  usefulLifeYears?: number;

  @IsOptional() @IsString()
  status?: string;

  @IsOptional() @IsString()
  custodian?: string;

  @IsOptional() @IsString()
  location?: string;

  @IsOptional() @IsString()
  supplier?: string;

  @IsOptional() @IsString()
  notes?: string;
}

export class UpdateAssetDto extends CreateAssetDto {
  @IsOptional() @IsString() @MaxLength(200)
  declare name: string;
}

export class AddAssetEventDto {
  @IsString()
  type: string;

  @IsOptional() @IsString()
  date?: string;

  @IsOptional() @IsNumber() @Min(0)
  amount?: number;

  @IsOptional() @IsString()
  toCustodian?: string;

  @IsOptional() @IsString()
  note?: string;
}
