// src/admin/dto/bootstrap-super-admin.dto.ts
import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BootstrapSuperAdminDto {
  @ApiProperty({ example: 'afyascribe@gmail.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Afyascribe@2026' })
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