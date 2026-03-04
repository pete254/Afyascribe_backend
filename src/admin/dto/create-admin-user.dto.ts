// src/admin/dto/create-admin-user.dto.ts
import { IsEmail, IsString, MinLength, IsEnum, IsUUID, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../users/entities/user.entity';

// super_admin can create any role
export class CreateAdminUserDto {
  @ApiProperty({ example: 'jane.admin@knh.go.ke' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePassword123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Jane' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  lastName: string;

  @ApiProperty({
    enum: UserRole,
    example: UserRole.FACILITY_ADMIN,
    description: 'Role to assign. super_admin can create any role.',
  })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiPropertyOptional({
    description: 'Facility UUID to link the user to. Required for all roles except super_admin.',
    example: '00000000-0000-0000-0000-000000000001',
  })
  @IsOptional()
  @IsString()
  facilityId?: string;
}