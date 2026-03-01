// src/patient-visits/dto/check-in.dto.ts
import { IsUUID, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CheckInDto {
  @ApiProperty({ description: 'Patient UUID' })
  @IsUUID()
  patientId: string;

  @ApiProperty({ description: 'Reason for visit' })
  @IsString()
  @IsNotEmpty()
  reasonForVisit: string;

  @ApiProperty({ description: 'Doctor UUID to assign this visit to' })
  @IsUUID()
  assignedDoctorId: string;
}