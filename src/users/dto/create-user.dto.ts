import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, IsEnum, IsOptional } from 'class-validator';

export class CreateUserDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  password: string;

  @ApiProperty()
  @IsString()
  firstName: string;

  @ApiProperty()
  @IsString()
  lastName: string;

  @ApiPropertyOptional({ enum: ['doctor', 'nurse', 'admin'] })
  @IsOptional()
  @IsEnum(['doctor', 'nurse', 'admin'])
  role?: string;
}
