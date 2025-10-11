// src/soap-notes/dto/update-soap-note.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class UpdateSoapNoteDto {
  @ApiPropertyOptional({
    description: 'Symptoms & Diagnosis',
    example: 'Updated symptoms description'
  })
  @IsString()
  @IsOptional()
  symptoms?: string;

  @ApiPropertyOptional({
    description: 'Physical Examination',
    example: 'Updated physical examination findings'
  })
  @IsString()
  @IsOptional()
  physicalExamination?: string;

  @ApiPropertyOptional({
    description: 'Diagnosis',
    example: 'Updated diagnosis'
  })
  @IsString()
  @IsOptional()
  diagnosis?: string;

  @ApiPropertyOptional({
    description: 'Management',
    example: 'Updated treatment plan'
  })
  @IsString()
  @IsOptional()
  management?: string;

  @ApiPropertyOptional({
    description: 'Mark if the note was manually edited',
    example: true
  })
  @IsBoolean()
  @IsOptional()
  wasEdited?: boolean;
}