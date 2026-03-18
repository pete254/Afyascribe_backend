// src/billing/dto/create-billing.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ServiceType, PaymentMode } from '../entities/billing.entity';

export class CreateBillingDto {
  @ApiProperty({ description: 'Visit UUID this bill belongs to' })
  @IsUUID()
  @IsNotEmpty()
  visitId: string;

  @ApiProperty({ enum: ServiceType, example: ServiceType.CONSULTATION })
  @IsEnum(ServiceType)
  serviceType: ServiceType;

  @ApiPropertyOptional({ description: 'Free-text description of the service' })
  @IsOptional()
  @IsString()
  serviceDescription?: string;

  @ApiProperty({ description: 'Total bill amount in KES', example: 500 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({
    enum: PaymentMode,
    default: PaymentMode.CASH,
    description: 'cash | insurance | split',
  })
  @IsOptional()
  @IsEnum(PaymentMode)
  paymentMode?: PaymentMode;

  @ApiPropertyOptional({ description: 'Insurance scheme name e.g. NHIF, AAR' })
  @IsOptional()
  @IsString()
  insuranceSchemeName?: string;
}