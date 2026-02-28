// src/users/dto/create-staff.dto.ts
// Used by facility_admin to directly create a staff account (no invite code needed)
import { IsEmail, IsEnum, IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../entities/user.entity';

export class CreateStaffDto {
  @ApiProperty({ example: 'jane.nurse@knh.go.ke' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'TempPass123' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Jane' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Wanjiru' })
  @IsString()
  lastName: string;

  @ApiProperty({ enum: [UserRole.DOCTOR, UserRole.NURSE, UserRole.RECEPTIONIST, UserRole.FACILITY_ADMIN] })
  @IsEnum([UserRole.DOCTOR, UserRole.NURSE, UserRole.RECEPTIONIST, UserRole.FACILITY_ADMIN])
  role: UserRole;
}