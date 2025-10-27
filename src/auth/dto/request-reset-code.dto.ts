// src/auth/dto/request-reset-code.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class RequestResetCodeDto {
  @ApiProperty({
    description: 'User email address',
    example: 'doctor@example.com'
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;
}