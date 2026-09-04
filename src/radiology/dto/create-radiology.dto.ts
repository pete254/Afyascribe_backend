import { IsEnum, IsNotEmpty, IsOptional, IsUUID, IsString, IsISO8601 } from 'class-validator';

export class CreateRadiologyDto {
  @IsEnum(['MRI', 'CT', 'ULTRASOUND', 'MAMMOGRAPHY', 'FLUOROSCOPY'])
  @IsNotEmpty()
  type: string;

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
