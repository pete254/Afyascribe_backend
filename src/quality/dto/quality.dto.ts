import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CaptureMeasureDto {
  @ApiProperty({ description: 'The imported measure this value is for' })
  @IsString() measureId: string;

  @ApiProperty() @IsDateString() periodStart: string;
  @ApiProperty() @IsDateString() periodEnd: string;

  @ApiProperty() @IsInt() @Min(0) numerator: number;

  @ApiPropertyOptional({ description: 'Leave out for a measure that is a count' })
  @IsInt() @Min(0) @IsOptional() denominator?: number;

  @ApiPropertyOptional() @IsString() @IsOptional() note?: string;
}
