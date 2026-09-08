import { IsIn, IsNotEmpty, IsOptional, IsUUID, IsString, IsISO8601, IsNumber, Min } from 'class-validator';

export class CreateRadiologyDto {
  @IsIn(['X-RAY', 'ULTRASOUND', 'CT', 'MRI', 'MAMMOGRAPHY', 'FLUOROSCOPY'])
  @IsNotEmpty()
  type: string;

  @IsUUID()
  @IsNotEmpty()
  patientId: string;

  @IsOptional()
  @IsString()
  bodyPart?: string;

  @IsOptional()
  @IsIn(['ROUTINE', 'URGENT', 'STAT'])
  priority?: string;

  /** Optional visit to bill against; if omitted, the patient's active visit is
   *  used (or a lightweight one is opened) when a price is given. */
  @IsOptional()
  @IsUUID()
  visitId?: string;

  /** Price to charge for the study, in KES. When > 0 an imaging bill is raised. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
