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

  // Hide address in list views for privacy
  @Exclude()
  address?: string;
}