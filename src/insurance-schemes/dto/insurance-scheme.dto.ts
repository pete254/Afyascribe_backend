import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator';

export class CreateInsuranceSchemeDto {
  @ApiProperty({ example: 'AAR Healthcare' })
  @IsString()
  @Length(2, 200)
  name: string;

  @ApiProperty({ example: 'AAR', description: 'Short code used in reports' })
  @IsString()
  @Length(2, 20)
  code: string;

  @ApiPropertyOptional({ enum: ['insurer', 'corporate'], default: 'insurer' })
  @IsOptional()
  @IsIn(['insurer', 'corporate'])
  payerType?: 'insurer' | 'corporate';

  @ApiPropertyOptional({ example: 'claims@aar.co.ke' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;
}

export class UpdateInsuranceSchemeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 200)
  name?: string;

  @ApiPropertyOptional({ enum: ['insurer', 'corporate'] })
  @IsOptional()
  @IsIn(['insurer', 'corporate'])
  payerType?: 'insurer' | 'corporate';

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}