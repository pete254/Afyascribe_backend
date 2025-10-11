// src/soap-notes/dto/create-soap-note.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class CreateSoapNoteDto {
  @ApiProperty({
    description: 'Patient ID (UUID from patients table)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
  })
  @IsUUID()
  @IsNotEmpty()
  patientId: string;

  @ApiProperty({
    description: 'Symptoms & Diagnosis - What the patient reports',
    example: 'CA HYPOPHARYNX PT ON DXT STABLE POST 19#'
  })
  @IsString()
  @IsNotEmpty()
  symptoms: string;

  @ApiProperty({
    description: 'Physical Examination - Clinical findings',
    example: 'FGC'
  })
  @IsString()
  @IsNotEmpty()
  physicalExamination: string;

  @ApiProperty({
    description: 'Diagnosis - Medical diagnosis',
    example: 'CA HYPOPHARYNX'
  })
  @IsString()
  @IsNotEmpty()
  diagnosis: string;

  @ApiProperty({
    description: 'Management - Treatment plan',
    example: 'CT DXT'
  })
  @IsString()
  @IsNotEmpty()
  management: string;
}