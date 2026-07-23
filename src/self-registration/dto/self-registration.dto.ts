// src/self-registration/dto/self-registration.dto.ts
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const GENDERS = ['male', 'female', 'other', 'unknown'] as const;

export class CreateSelfRegistrationDto {
  /** Facility code from the QR poster, e.g. "KNH". Public — no session yet. */
  @ApiProperty({ example: 'KNH' })
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  facilityCode: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  firstName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  middleName?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  lastName: string;

  @ApiPropertyOptional({ enum: GENDERS })
  @IsOptional()
  @IsIn(GENDERS as unknown as string[])
  gender?: string;

  @ApiPropertyOptional({ example: '1990-04-17' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idNumber?: string;

  @ApiPropertyOptional({ description: 'SHA / insurance membership number' })
  @IsOptional()
  @IsString()
  membershipNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  medicalPlan?: string;
}
