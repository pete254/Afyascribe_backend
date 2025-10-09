// src/auth/dto/register.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, IsOptional, IsEnum, MinLength, Matches } from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    description: 'User email address',
    example: 'doctor@example.com'
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({
    description: 'User password (minimum 8 characters, must contain at least one uppercase letter, one lowercase letter, one number)',
    example: 'SecurePass123',
    minLength: 8
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/,
    { message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number' }
  )
  password: string;

  @ApiProperty({
    description: 'User first name',
    example: 'John'
  })
  @IsString()
  @MinLength(2, { message: 'First name must be at least 2 characters long' })
  firstName: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe'
  })
  @IsString()
  @MinLength(2, { message: 'Last name must be at least 2 characters long' })
  lastName: string;

  @ApiPropertyOptional({ 
    enum: ['doctor', 'nurse', 'admin'],
    description: 'User role in the system',
    example: 'doctor',
    default: 'doctor'
  })
  @IsOptional()
  @IsEnum(['doctor', 'nurse', 'admin'], { 
    message: 'Role must be one of: doctor, nurse, admin' 
  })
  role?: string;
}