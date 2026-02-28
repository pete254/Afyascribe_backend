// src/facilities/dto/create-facility.dto.ts
import { IsString, IsEnum, IsOptional, IsEmail, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FacilityType } from '../entities/facility.entity';

export class CreateFacilityDto {
  @ApiProperty({ example: 'KNH', description: 'Short unique code used in patient IDs (max 10 chars)' })
  @IsString()
  @Length(2, 10)
  code: string;

  @ApiProperty({ example: 'Kenyatta National Hospital' })
  @IsString()
  @Length(2, 200)
  name: string;

  @ApiPropertyOptional({ enum: FacilityType, default: FacilityType.HOSPITAL })
  @IsOptional()
  @IsEnum(FacilityType)
  type?: FacilityType;

  @ApiPropertyOptional({ example: '+254700000000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'admin@knh.go.ke' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Hospital Road, Nairobi' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Nairobi' })
  @IsOptional()
  @IsString()
  county?: string;

  @ApiPropertyOptional({ example: 'Starehe' })
  @IsOptional()
  @IsString()
  subCounty?: string;

  @ApiPropertyOptional({ example: 'MOH/2024/001' })
  @IsOptional()
  @IsString()
  licenseNumber?: string;
}