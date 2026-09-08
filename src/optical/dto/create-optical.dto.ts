import { IsIn, IsNotEmpty, IsOptional, IsUUID, IsString, IsNumber, Min } from 'class-validator';
import { OPTICAL_RX_TYPES } from '../optical.enums';

export class CreateOpticalDto {
  @IsUUID()
  @IsNotEmpty()
  patientId: string;

  @IsOptional()
  @IsUUID()
  visitId?: string;

  @IsOptional()
  @IsIn(OPTICAL_RX_TYPES)
  rxType?: string;

  // Refraction — all optional free text ("+1.25", "-0.50", "PL", "175", "6/6").
  @IsOptional() @IsString() sphereR?: string;
  @IsOptional() @IsString() cylinderR?: string;
  @IsOptional() @IsString() axisR?: string;
  @IsOptional() @IsString() addR?: string;
  @IsOptional() @IsString() vaR?: string;
  @IsOptional() @IsString() sphereL?: string;
  @IsOptional() @IsString() cylinderL?: string;
  @IsOptional() @IsString() axisL?: string;
  @IsOptional() @IsString() addL?: string;
  @IsOptional() @IsString() vaL?: string;

  @IsOptional() @IsString() pd?: string;
  @IsOptional() @IsString() iop?: string;
  @IsOptional() @IsString() complaint?: string;
  @IsOptional() @IsString() findings?: string;
  @IsOptional() @IsString() advice?: string;

  @IsOptional() @IsString() frame?: string;
  @IsOptional() @IsString() lensType?: string;

  /** Dispensing price; when > 0 an optical bill is raised. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;
}
