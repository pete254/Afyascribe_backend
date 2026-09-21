import { IsIn, IsNotEmpty, IsOptional, IsUUID, IsString, IsNumber, Min, ValidateIf, IsBoolean } from 'class-validator';
import { DENTAL_PROCEDURES } from '../dental.enums';

export class CreateDentalDto {
  /** A procedure from the service catalogue (ICHI-coded). When set, the kind
   *  is derived from its ICHI code and the price defaults from the catalogue. */
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  /** Procedure kind; required when no serviceId is given. */
  @ValidateIf((o) => !o.serviceId)
  @IsIn(DENTAL_PROCEDURES)
  @IsNotEmpty()
  procedure?: string;

  /** With serviceId: also make the price the catalogue default. */
  @IsOptional()
  @IsBoolean()
  saveAsServicePrice?: boolean;

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
