// src/soap-notes/dto/create-soap-note.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsArray, IsBoolean, Min, Max } from 'class-validator';

export class CreateSoapNoteDto {
  @ApiProperty({ 
    description: 'Patient full name',
    example: 'John Smith'
  })
  @IsString()
  patientName: string;

  @ApiPropertyOptional({ 
    description: 'Patient age in years',
    example: 45,
    minimum: 0,
    maximum: 150
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(150)
  patientAge?: number;

  @ApiPropertyOptional({ 
    description: 'Patient gender',
    example: 'Male',
    enum: ['Male', 'Female', 'Other', 'Prefer not to say']
  })
  @IsOptional()
  @IsString()
  patientGender?: string;

  @ApiProperty({ 
    description: 'Original transcription text from audio/dictation',
    example: 'Patient presents with severe headache and nausea...'
  })
  @IsString()
  originalTranscription: string;

  @ApiProperty({ 
    description: 'Formatted SOAP notes (Subjective, Objective, Assessment, Plan)',
    example: 'S: Patient complains of severe headache...\nO: BP 140/90...'
  })
  @IsString()
  formattedSoapNotes: string;

  @ApiPropertyOptional({ 
    description: 'Array of medical terms identified in the transcription',
    example: ['hypertension', 'migraine', 'acetaminophen'],
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  medicalTermsFound?: string[];

  @ApiPropertyOptional({ 
    description: 'Method used for transcription',
    example: 'audio',
    enum: ['audio', 'manual', 'dictation']
  })
  @IsOptional()
  @IsString()
  transcriptionMethod?: string;

  @ApiPropertyOptional({ 
    description: 'Confidence score of the transcription (0-1)',
    example: 0.95,
    minimum: 0,
    maximum: 1
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @ApiPropertyOptional({ 
    description: 'Processing time in milliseconds',
    example: 2500,
    minimum: 0
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  processingTime?: number;

  @ApiPropertyOptional({ 
    description: 'Whether the note was manually edited after generation',
    example: false
  })
  @IsOptional()
  @IsBoolean()
  wasEdited?: boolean;
}