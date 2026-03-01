// src/patient-visits/dto/reassign.dto.ts
import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReassignDto {
  @ApiProperty({ description: 'UUID of the new doctor to assign the visit to' })
  @IsUUID()
  assignedDoctorId: string;
}