// src/billing/dto/mark-paid.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class MarkPaidDto {
  // intentionally empty — paidAt and collectedById come from the JWT user
  // optional note can be added later
}

// src/billing/dto/waive-billing.dto.ts
export class WaiveBillingDto {
  @ApiPropertyOptional({ description: 'Reason for waiving the bill' })
  @IsOptional()
  @IsString()
  waiverReason?: string;
}