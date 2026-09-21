import { IsIn, IsNotEmpty, IsOptional, IsUUID, IsString, IsISO8601, IsNumber, Min, ValidateIf, IsBoolean } from 'class-validator';

export class CreateRadiologyDto {
  /** An exam from the facility's imaging catalogue (radiology_exams). When set,
   *  the modality, LOINC coding and default price come from the exam. */
  @IsOptional()
  @IsUUID()
  examId?: string;

  /** Modality; required when no examId is given (derived from the exam otherwise). */
  @ValidateIf((o) => !o.examId)
  @IsIn(['X-RAY', 'ULTRASOUND', 'CT', 'MRI', 'MAMMOGRAPHY', 'FLUOROSCOPY', 'NUCLEAR', 'OTHER'])
  @IsNotEmpty()
  type?: string;

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

  /** With examId: also make this price the exam's catalogue price. */
  @IsOptional()
  @IsBoolean()
  saveAsExamPrice?: boolean;

  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
