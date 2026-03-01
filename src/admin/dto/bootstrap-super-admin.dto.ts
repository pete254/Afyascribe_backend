// src/admin/dto/bootstrap-super-admin.dto.ts
import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BootstrapSuperAdminDto {
  @ApiProperty({ example: 'admin@afyascribe.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SuperSecurePassword123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Admin' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'User' })
  @IsString()
  lastName: string;
}