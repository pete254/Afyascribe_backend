// src/appointments/dto/appointment.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsUUID, Matches } from 'class-validator';
import { AppointmentReason, AppointmentStatus } from '../entities/appointment.entity';

export class CreateAppointmentDto {
  @ApiProperty({ description: 'Patient UUID' })
  @IsUUID()
  patientId: string;

  @ApiProperty({ description: 'Date of appointment (YYYY-MM-DD)', example: '2026-04-20' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must be YYYY-MM-DD' })
  appointmentDate: string;

  @ApiProperty({ description: 'Time of appointment (HH:MM)', example: '09:30' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Time must be HH:MM' })
  appointmentTime: string;

  @ApiProperty({ enum: AppointmentReason })
  @IsEnum(AppointmentReason)
  reason: AppointmentReason;

  @ApiPropertyOptional({ description: 'Custom reason when reason is OTHER' })
  @IsOptional()
  @IsString()
  customReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'UUID of the SOAP note this appointment follows from' })
  @IsOptional()
  @IsUUID()
  soapNoteId?: string;
}

export class UpdateAppointmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  appointmentDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  appointmentTime?: string;

  @ApiPropertyOptional({ enum: AppointmentReason })
  @IsOptional()
  @IsEnum(AppointmentReason)
  reason?: AppointmentReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ enum: AppointmentStatus })
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;
}