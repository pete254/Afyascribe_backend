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