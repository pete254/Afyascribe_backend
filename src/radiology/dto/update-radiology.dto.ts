import { IsEnum, IsOptional, IsISO8601, IsString } from 'class-validator';
import { RadiologyStatus } from '../radiology-status.enum';
import { RadiologyType } from '../radiology-type.enum';

export class UpdateRadiologyDto {
  @IsOptional()
  @IsEnum(RadiologyType)
  type?: RadiologyType;

  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  @IsOptional()
  @IsEnum(RadiologyStatus)
  status?: RadiologyStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  report?: string;
}
