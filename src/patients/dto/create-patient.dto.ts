// src/patients/dto/create-patient.dto.ts
import { IDENTIFIER_TYPE_CODES } from '../data/identifier-types';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsEmail, IsArray, ValidateNested, IsIn, IsBoolean } from 'class-validator';

export class PatientIdentifierDto {
  @ApiProperty({ enum: IDENTIFIER_TYPE_CODES, example: 'nationalID' })
  @IsIn(IDENTIFIER_TYPE_CODES)
  type: string;

  @ApiProperty({ example: '12345678' })
  @IsString()
  @IsNotEmpty()
  value: string;

  @ApiPropertyOptional({ description: 'The one used to identify the patient by default' })
  @IsBoolean() @IsOptional() isPrimary?: boolean;
}

export class CreatePatientDto {
  @ApiProperty({ example: 'Wanjiru' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Kamau' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  middleName?: string;

  @ApiProperty({ required: false, example: 'Mrs' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ example: 'female' })
  @IsString()
  @IsNotEmpty()
  gender: string;

  @ApiProperty({ required: false, example: '1990-01-15' })
  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @ApiProperty({ example: '0712345678' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  maritalStatus?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  occupation?: string;

  @ApiProperty({ required: false, example: 'National ID' })
  @IsOptional()
  @IsString()
  idType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  idNumber?: string;

  @ApiProperty({ required: false, description: 'SHA beneficiary / UHID number' })
  @IsOptional()
  @IsString()
  shaNumber?: string;

  @ApiProperty({ required: false, example: 'Kenyan' })
  @IsOptional()
  @IsString()
  nationality?: string;

  @ApiProperty({ required: false, example: 'Nairobi' })
  @IsOptional()
  @IsString()
  county?: string;

  @ApiProperty({ required: false, example: 'Westlands' })
  @IsOptional()
  @IsString()
  subCounty?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  howKnown?: string;

  @ApiProperty({ required: false, example: 'Cash' })
  @IsOptional()
  @IsString()
  patientType?: string;

  @ApiProperty({ required: false, example: 'insurance', description: 'cash | insurance | copay' })
  @IsOptional()
  @IsString()
  payerType?: string;

  @ApiProperty({ required: false, description: 'Insurer company e.g. AAR, Jubilee, SHA' })
  @IsOptional()
  @IsString()
  insurerName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  medicalPlan?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  membershipNo?: string;

  @ApiProperty({ required: false, description: 'Cover valid until (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  insuranceValidUntil?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  nextOfKin?: {
    firstName: string;
    lastName: string;
    relationship: string;
    phone: string;
  }[];

  @ApiPropertyOptional({
    description: 'All identifiers the patient holds; type is a Kenya Patient Identifiers code where one exists',
    example: [{ type: 'nationalID', value: '12345678', isPrimary: true }],
  })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PatientIdentifierDto)
  identifiers?: PatientIdentifierDto[];

  @ApiPropertyOptional({ description: 'Ward of residence' })
  @IsString() @IsOptional() ward?: string;

  @ApiPropertyOptional({ description: 'Village or estate' })
  @IsString() @IsOptional() village?: string;

  @ApiPropertyOptional({ description: 'Nearest landmark or plot number' })
  @IsString() @IsOptional() physicalAddress?: string;
}