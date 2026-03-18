// src/billing/dto/mark-paid.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaymentMethod } from '../entities/billing.entity';

export class CollectPaymentDto {
  @ApiProperty({
    enum: PaymentMethod,
    example: PaymentMethod.MPESA,
    description: 'How the patient paid their cash portion',
  })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiProperty({
    description: 'Amount received from the patient in KES',
    example: 500,
  })
  @IsNumber()
  @Min(0)
  amountReceived: number;

  @ApiPropertyOptional({
    description: 'M-Pesa confirmation reference (optional, no validation)',
    example: 'QHX7Y3Z9AB',
  })
  @IsOptional()
  @IsString()
  mpesaReference?: string;
}

export class WaiveBillingDto {
  @ApiPropertyOptional({ description: 'Reason for waiving the bill' })
  @IsOptional()
  @IsString()
  waiverReason?: string;
}