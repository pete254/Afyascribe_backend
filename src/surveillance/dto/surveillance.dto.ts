import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class RecordNotificationDto {
  @ApiProperty() @IsUUID() patientId: string;

  @ApiProperty({ description: 'An IDSR condition code' })
  @IsString() conditionCode: string;

  @ApiPropertyOptional() @IsUUID() @IsOptional() visitId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() sourceText?: string;

  @ApiPropertyOptional({ enum: ['diagnosis', 'problem', 'manual', 'register'] })
  @IsIn(['diagnosis', 'problem', 'manual', 'register']) @IsOptional()
  detectedFrom?: 'diagnosis' | 'problem' | 'manual' | 'register';

  @ApiPropertyOptional() @IsDateString() @IsOptional() onsetDate?: string;
}

export class DismissNotificationDto {
  @ApiProperty({ description: 'Why nobody needs telling. Kept for the outbreak review.' })
  @IsString() @MinLength(3) reason: string;
}
