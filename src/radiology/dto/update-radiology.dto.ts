import { IsEnum, IsOptional, IsISO8601, IsString } from 'class-validator';
import { RadiologyStatus } from '../radiology-status.enum';

export class UpdateRadiologyDto {
  @IsOptional()
  @IsEnum(['MRI', 'CT', 'ULTRASOUND', 'MAMMOGRAPHY', 'FLUOROSCOPY'])
  type?: string;

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
