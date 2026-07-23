// src/self-registration/dto/self-registration.dto.ts
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const GENDERS = ['male', 'female', 'other', 'unknown'] as const;

export class NextOfKinDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() relationship?: string;
  @IsOptional() @IsString() phone?: string;
}

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

  // ── Mirrors the mobile Onboard Patient screen ─────────────────────────────
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() maritalStatus?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() occupation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() idType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nationality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() county?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subCounty?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() postalCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() howKnown?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() patientType?: string;

  @ApiPropertyOptional({ type: [NextOfKinDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NextOfKinDto)
  nextOfKin?: NextOfKinDto[];
}

/**
 * What the front desk sends when they correct a submission before approving.
 * Every field is optional: an empty body means "approve exactly as submitted".
 */
export class ApproveSelfRegistrationDto extends CreateSelfRegistrationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare facilityCode: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare firstName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare lastName: string;
}
