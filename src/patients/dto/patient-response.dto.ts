// src/patients/dto/patient-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

export class PatientResponseDto {
  @ApiProperty({ description: 'Patient UUID' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'Hospital Patient ID', example: 'P-2024-001' })
  @Expose()
  patientId: string;

  @ApiProperty({ description: 'First name' })
  @Expose()
  firstName: string;

  @ApiProperty({ description: 'Last name' })
  @Expose()
  lastName: string;

  @ApiProperty({ description: 'Full name' })
  @Expose()
  fullName: string;

  @ApiProperty({ description: 'Middle name', required: false })
  @Expose()
  middleName?: string;

  @ApiProperty({ description: 'Title', required: false })
  @Expose()
  title?: string;

  @ApiProperty({ description: 'Marital status', required: false })
  @Expose()
  maritalStatus?: string;

  @ApiProperty({ description: 'Occupation', required: false })
  @Expose()
  occupation?: string;

  @ApiProperty({ description: 'ID type', required: false })
  @Expose()
  idType?: string;

  @ApiProperty({ description: 'ID number', required: false })
  @Expose()
  idNumber?: string;

  @ApiProperty({ description: 'Nationality', required: false })
  @Expose()
  nationality?: string;

  @ApiProperty({ description: 'County', required: false })
  @Expose()
  county?: string;

  @ApiProperty({ description: 'Sub-county', required: false })
  @Expose()
  subCounty?: string;

  @ApiProperty({ description: 'Postal code', required: false })
  @Expose()
  postalCode?: string;

  @ApiProperty({ description: 'How the patient was referred/known', required: false })
  @Expose()
  howKnown?: string;

  @ApiProperty({ description: 'Patient type', required: false })
  @Expose()
  patientType?: string;

  @ApiProperty({ description: 'Medical plan', required: false })
  @Expose()
  medicalPlan?: string;

  @ApiProperty({ description: 'Medical plan membership number', required: false })
  @Expose()
  membershipNo?: string;

  @ApiProperty({ description: 'Date of birth' })
  @Expose()
  dateOfBirth: Date;

  @ApiProperty({ description: 'Gender', example: 'male' })
  @Expose()
  gender: string;

  @ApiProperty({ description: 'Age calculated from date of birth' })
  @Expose()
  age: number;

  @ApiProperty({ description: 'Phone number', required: false })
  @Expose()
  phoneNumber?: string;

  @ApiProperty({ description: 'Email address', required: false })
  @Expose()
  email?: string;

  @ApiProperty({ description: 'Registered date' })
  @Expose()
  registeredAt: Date;

  @ApiProperty({ description: 'Last visit date', required: false })
  @Expose()
  lastVisit?: Date;


  @ApiProperty({ description: 'Next of kin list', required: false })
  @Expose()
  nextOfKin?: {
    firstName: string;
    lastName: string;
    relationship: string;
    phone: string;
  }[];

  // Hide address in list views for privacy
  @Exclude()
  address?: string;
}