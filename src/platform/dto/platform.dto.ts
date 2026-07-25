import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FacilityStatus } from '../../facilities/entities/facility.entity';
import { SupportRequestStatus, SupportRequestType } from '../entities/support-request.entity';

// ── Facility creation codes ───────────────────────────────────────────────────

export class CreateFacilityCodeDto {
  @ApiPropertyOptional({ description: 'Who the code is for — hospital name or contact' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Days until the code expires (omit for no expiry)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expiresInDays?: number;
}

// ── Facility lifecycle / billing ──────────────────────────────────────────────

export class SetFacilityStatusDto {
  @ApiProperty({ enum: FacilityStatus })
  @IsEnum(FacilityStatus)
  status: FacilityStatus;
}

export class SetSubscriptionDto {
  @ApiPropertyOptional({ description: 'ISO date the subscription is next due; null to clear' })
  @IsOptional()
  @IsString()
  dueDate?: string | null;
}

export class SendReminderDto {
  @ApiPropertyOptional({ description: 'Optional custom note to include in the reminder email' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}

// ── Support requests ──────────────────────────────────────────────────────────

export class CreateSupportRequestDto {
  @ApiProperty({ enum: SupportRequestType })
  @IsEnum(SupportRequestType)
  type: SupportRequestType;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  facilityName?: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(4000)
  message: string;
}

export class ResolveSupportRequestDto {
  @ApiProperty({ enum: SupportRequestStatus })
  @IsEnum(SupportRequestStatus)
  status: SupportRequestStatus;

  @ApiPropertyOptional({ description: 'Reply to email back to the sender' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  response?: string;
}
