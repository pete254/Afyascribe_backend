import { IsEnum, IsNotEmpty, IsOptional, IsUUID, IsString, IsISO8601 } from 'class-validator';
import { RadiologyType } from '../radiology-type.enum';

export class CreateRadiologyDto {
  @IsEnum(RadiologyType)
  type: RadiologyType;

  @IsUUID()
  @IsNotEmpty()
  patientId: string;

  @IsUUID()
  @IsNotEmpty()
  facilityId: string;

  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
