import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class RecordDoseDto {
  @ApiProperty() @IsUUID() patientId: string;

  @ApiProperty({ example: 'BCG', description: 'WHO vaccine code from the national schedule' })
  @IsString() @IsNotEmpty() vaccine: string;

  @ApiProperty({ example: 1 }) @IsInt() @Min(1) dose: number;

  @ApiProperty({ example: '2026-01-01' }) @IsDateString() givenDate: string;

  @ApiPropertyOptional({ description: 'False when brought in on a home-based card from elsewhere' })
  @IsBoolean() @IsOptional() givenHere?: boolean;

  @ApiPropertyOptional() @IsString() @IsOptional() batchNo?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() expiryDate?: string;
  @ApiPropertyOptional({ example: 'Left thigh' }) @IsString() @IsOptional() site?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() note?: string;
}
