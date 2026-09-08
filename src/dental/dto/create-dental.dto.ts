import { IsIn, IsNotEmpty, IsOptional, IsUUID, IsString, IsNumber, Min } from 'class-validator';
import { DENTAL_PROCEDURES } from '../dental.enums';

export class CreateDentalDto {
  @IsIn(DENTAL_PROCEDURES)
  @IsNotEmpty()
  procedure: string;

  @IsUUID()
  @IsNotEmpty()
  patientId: string;

  @IsOptional()
  @IsUUID()
  visitId?: string;

  @IsOptional()
  @IsString()
  tooth?: string;

  @IsOptional()
  @IsString()
  surfaces?: string;

  @IsOptional()
  @IsString()
  findings?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Price to charge; when > 0 a dental bill is raised. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  /** Start already in progress instead of planned. */
  @IsOptional()
  @IsIn(['PLANNED', 'IN_PROGRESS'])
  status?: string;
}
