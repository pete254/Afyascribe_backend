// src/billing/dto/create-billing.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ServiceType } from '../entities/billing.entity';

export class CreateBillingDto {
  @ApiProperty({ description: 'Visit UUID this bill belongs to' })
  @IsUUID()
  @IsNotEmpty()
  visitId: string;

  @ApiProperty({ enum: ServiceType, example: ServiceType.CONSULTATION })
  @IsEnum(ServiceType)
  serviceType: ServiceType;

  @ApiPropertyOptional({ description: 'Free-text description of the service', example: 'Initial consultation' })
  @IsOptional()
  @IsString()
  serviceDescription?: string;

  @ApiProperty({ description: 'Amount in KES', example: 500 })
  @IsNumber()
  @Min(0)
  amount: number;
}