// src/patients/dto/create-patient.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsEmail } from 'class-validator';

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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  medicalPlan?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  membershipNo?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  nextOfKin?: {
    firstName: string;
    lastName: string;
    relationship: string;
    phone: string;
  }[];
}