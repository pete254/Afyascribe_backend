import { IsIn, IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { OPTICAL_RX_TYPES, OPTICAL_STATUSES } from '../optical.enums';

export class UpdateOpticalDto {
  @IsOptional() @IsIn(OPTICAL_RX_TYPES) rxType?: string;
  @IsOptional() @IsIn(OPTICAL_STATUSES) status?: string;

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

  /** Dispensing charges (KES). Billed together when status becomes DISPENSED. */
  @IsOptional() @IsNumber() @Min(0) framePrice?: number;
  @IsOptional() @IsNumber() @Min(0) lensPrice?: number;
}
