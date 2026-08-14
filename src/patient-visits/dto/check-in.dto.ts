// src/patient-visits/dto/check-in.dto.ts
import { IsUUID, IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const VISIT_TYPES = [
  'first_visit',
  'appointment',
  'follow_up',
  'referral',
  'emergency',
  'other',
] as const;

export class CheckInDto {
  @ApiProperty({ description: 'Patient UUID' })
  @IsUUID()
  patientId: string;

  @ApiProperty({ description: 'Reason for visit' })
  @IsString()
  @IsNotEmpty()
  reasonForVisit: string;

  @ApiPropertyOptional({ description: 'Structured attendance type', enum: VISIT_TYPES })
  @IsOptional()
  @IsIn(VISIT_TYPES as unknown as string[])
  visitType?: string;

  @ApiPropertyOptional({ description: 'Appointment this visit fulfils, if any' })
  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @ApiProperty({ description: 'Doctor UUID to assign this visit to' })
  @IsUUID()
  assignedDoctorId: string;
}