import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString } from 'class-validator';

export class RecordAuditReviewDto {
  @ApiProperty({ description: 'First day of the period reviewed' })
  @IsDateString() periodFrom: string;

  @ApiProperty({ description: 'Last day of the period reviewed' })
  @IsDateString() periodTo: string;

  @ApiPropertyOptional({ description: 'Whether anything worth acting on was seen' })
  @IsBoolean() @IsOptional() concernsFound?: boolean;

  @ApiPropertyOptional() @IsString() @IsOptional() findings?: string;
}
