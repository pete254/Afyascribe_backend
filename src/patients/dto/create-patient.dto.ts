import { IsString, IsOptional, IsNumber, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePatientDto {
  @ApiProperty({ example: 'P-2026-001', description: 'Hospital-assigned patient ID' })
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: 34 })
  @IsNumber()
  @IsOptional()
  age?: number;

  @ApiProperty({ example: 'male' })
  @IsString()
  @IsOptional()
  gender?: string;

  @ApiProperty({ example: 'Mwangi' })
  @IsString()
  @IsOptional()
  middleName?: string;

  @ApiProperty({ example: 'Mr.' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty({ example: 'Married' })
  @IsString()
  @IsOptional()
  maritalStatus?: string;

  @ApiProperty({ example: 'Teacher' })
  @IsString()
  @IsOptional()
  occupation?: string;

  @ApiProperty({ example: 'ID' })
  @IsString()
  @IsOptional()
  idType?: string;

  @ApiProperty({ example: '12345678' })
  @IsString()
  @IsOptional()
  idNumber?: string;

  @ApiProperty({ example: 'Kenyan' })
  @IsString()
  @IsOptional()
  nationality?: string;

  @ApiProperty({ example: 'Nairobi' })
  @IsString()
  @IsOptional()
  county?: string;

  @ApiProperty({ example: 'Westlands' })
  @IsString()
  @IsOptional()
  subCounty?: string;

  @ApiProperty({ example: '00100' })
  @IsString()
  @IsOptional()
  postalCode?: string;

  @ApiProperty({ example: 'Referral' })
  @IsString()
  @IsOptional()
  howKnown?: string;

  @ApiProperty({ example: 'Outpatient' })
  @IsString()
  @IsOptional()
  patientType?: string;

  @ApiProperty({ example: 'NHIF' })
  @IsString()
  @IsOptional()
  medicalPlan?: string;

  @ApiProperty({ example: 'M-12345' })
  @IsString()
  @IsOptional()
  membershipNo?: string;

  @ApiProperty({ example: '+254712345678' })
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @ApiProperty({ example: 'john.doe@example.com' })
  @IsString()
  @IsOptional()
  email?: string;
}
