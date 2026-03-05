// src/patients/dto/update-patient.dto.ts
import { IsString, IsOptional, IsInt, IsEnum, IsEmail, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePatientDto {
  // ── Personal Info ──────────────────────────────────────────────────────────

  @ApiPropertyOptional({ example: 'Mrs' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'First name' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ description: 'Middle name' })
  @IsOptional()
  @IsString()
  middleName?: string;

  @ApiPropertyOptional({ description: 'Last name' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ description: 'Gender', enum: ['male', 'female', 'other'] })
  @IsOptional()
  @IsEnum(['male', 'female', 'other'])
  gender?: string;

  @ApiPropertyOptional({ description: 'Date of birth', example: '1990-01-15' })
  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ description: 'Age', example: 35 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(150)
  age?: number;

  @ApiPropertyOptional({ description: 'Marital status' })
  @IsOptional()
  @IsString()
  maritalStatus?: string;

  @ApiPropertyOptional({ description: 'Occupation', example: 'Teacher' })
  @IsOptional()
  @IsString()
  occupation?: string;

  // ── Contact ────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Phone number', example: '+254712345678' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ description: 'Email address' })
  @IsOptional()
  @IsEmail()
  email?: string;

  // ── Identity ──────────────────────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Identity type', example: 'National ID' })
  @IsOptional()
  @IsString()
  idType?: string;

  @ApiPropertyOptional({ description: 'Identity number' })
  @IsOptional()
  @IsString()
  idNumber?: string;

  // ── Location ──────────────────────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Nationality', example: 'Kenyan' })
  @IsOptional()
  @IsString()
  nationality?: string;

  @ApiPropertyOptional({ description: 'County', example: 'Nairobi' })
  @IsOptional()
  @IsString()
  county?: string;

  @ApiPropertyOptional({ description: 'Sub-county', example: 'Westlands' })
  @IsOptional()
  @IsString()
  subCounty?: string;

  @ApiPropertyOptional({ description: 'Postal code', example: '00100' })
  @IsOptional()
  @IsString()
  postalCode?: string;

  // ── Facility Info ──────────────────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'How patient knew about facility' })
  @IsOptional()
  @IsString()
  howKnown?: string;

  @ApiPropertyOptional({ description: 'Patient type', example: 'Cash' })
  @IsOptional()
  @IsString()
  patientType?: string;

  @ApiPropertyOptional({ description: 'Medical plan / insurance' })
  @IsOptional()
  @IsString()
  medicalPlan?: string;

  @ApiPropertyOptional({ description: 'Membership / insurance number' })
  @IsOptional()
  @IsString()
  membershipNo?: string;

  // ── Next of Kin ───────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Next of kin list',
    type: 'array',
  })
  @IsOptional()
  nextOfKin?: {
    firstName: string;
    lastName: string;
    relationship: string;
    phone: string;
  }[];
}