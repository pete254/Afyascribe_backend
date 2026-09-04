import { IsIn, IsOptional, IsISO8601, IsString } from 'class-validator';
import { RadiologyStatus } from '../radiology-status.enum';

export class UpdateRadiologyDto {
  @IsOptional()
  @IsIn(['MRI', 'CT', 'ULTRASOUND', 'MAMMOGRAPHY', 'FLUOROSCOPY'])
  type?: string;

  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  @IsOptional()
  @IsIn(['REQUESTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  report?: string;
}
