import { IsIn, IsOptional, IsString } from 'class-validator';
import { DENTAL_PROCEDURES, DENTAL_STATUSES } from '../dental.enums';

export class UpdateDentalDto {
  @IsOptional()
  @IsIn(DENTAL_PROCEDURES)
  procedure?: string;

  @IsOptional()
  @IsString()
  tooth?: string;

  @IsOptional()
  @IsString()
  surfaces?: string;

  @IsOptional()
  @IsIn(DENTAL_STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  findings?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
