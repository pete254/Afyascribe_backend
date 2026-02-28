// src/facilities/dto/use-invite-code.dto.ts
import { IsString, Length, IsEmail, IsEnum, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../users/entities/user.entity';

/**
 * Used when a new staff member signs up using an invite code.
 * The invite code automatically links them to the correct facility.
 */
export class UseInviteCodeDto {
  @ApiProperty({ example: 'AB3X9K2M', description: '8-character facility invite code' })
  @IsString()
  @Length(8, 8)
  inviteCode: string;

  @ApiProperty({ example: 'john.doe@knh.go.ke' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  lastName: string;

  @ApiProperty({ enum: [UserRole.DOCTOR, UserRole.NURSE, UserRole.RECEPTIONIST] })
  @IsEnum([UserRole.DOCTOR, UserRole.NURSE, UserRole.RECEPTIONIST])
  role: UserRole;
}