// src/auth/dto/reset-password.dto.ts
import { IsEmail, IsString, MinLength, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsAcceptablePassword, PASSWORD_MIN_LENGTH } from '../password.policy';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'User email address',
    example: 'doctor@example.com'
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: '6-digit reset code',
    example: '123456',
    minLength: 6,
    maxLength: 6
  })
  @IsString()
  @Length(6, 6, { message: 'Reset code must be exactly 6 digits' })
  @Matches(/^\d{6}$/, { message: 'Reset code must contain only digits' })
  code: string;

  @ApiProperty({
    description: 'New password (min 12 characters)',
    example: 'NewSecurePassword123!',
    minLength: PASSWORD_MIN_LENGTH
  })
  @IsString()
  @IsAcceptablePassword()
  newPassword: string;
}