// src/users/dto/deactivate-account.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty, MaxLength } from 'class-validator';

export class DeactivateAccountDto {
  @ApiPropertyOptional({
    description: 'Optional reason for deactivation',
    example: 'No longer working at this hospital'
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;

  @ApiProperty({
    description: 'Confirmation password',
    example: 'CurrentPassword123'
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}