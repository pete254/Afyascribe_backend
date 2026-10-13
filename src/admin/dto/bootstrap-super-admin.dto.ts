// src/admin/dto/bootstrap-super-admin.dto.ts
import { IsEmail, IsString } from 'class-validator';
import { IsAcceptablePassword } from '../../auth/password.policy';
import { ApiProperty } from '@nestjs/swagger';

export class BootstrapSuperAdminDto {
  @ApiProperty({ example: 'afyascribe@gmail.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Afyascribe@2026' })
  @IsString()
  @IsAcceptablePassword()
  password: string;

  @ApiProperty({ example: 'Admin' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'User' })
  @IsString()
  lastName: string;
}