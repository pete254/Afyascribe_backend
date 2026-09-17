// src/service-catalog/dto/service-catalog.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString, IsEnum, IsNumber, IsOptional,
  IsBoolean, Length, Min,
} from 'class-validator';
import { ServiceCategory } from '../entities/service-catalog.entity';

export class CreateServiceCatalogDto {
  @ApiProperty({ example: 'General Consultation' })
  @IsString()
  @Length(2, 200)
  name: string;

  @ApiPropertyOptional({ example: 'Standard outpatient consultation' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'KNHTS/ICHI intervention code' })
  @IsOptional()
  @IsString()
  knhtsCode?: string;

  @ApiPropertyOptional({ description: 'KNHTS/ICHI concept display name' })
  @IsOptional()
  @IsString()
  knhtsName?: string;

  @ApiPropertyOptional({ description: 'SHA benefit package code' })
  @IsOptional()
  @IsString()
  shaBenefitCode?: string;

  @ApiPropertyOptional({ description: 'SHA benefit package name' })
  @IsOptional()
  @IsString()
  shaBenefitName?: string;

  @ApiProperty({ enum: ServiceCategory, example: ServiceCategory.CONSULTATION })
  @IsEnum(ServiceCategory)
  category: ServiceCategory;

  @ApiProperty({ example: 500, description: 'Default price in KES' })
  @IsNumber()
  @Min(0)
  defaultPrice: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class UpdateServiceCatalogDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  knhtsCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  knhtsName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shaBenefitCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shaBenefitName?: string;

  @ApiPropertyOptional({ enum: ServiceCategory })
  @IsOptional()
  @IsEnum(ServiceCategory)
  category?: ServiceCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}