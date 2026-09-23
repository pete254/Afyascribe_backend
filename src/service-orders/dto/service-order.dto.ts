import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import {
  SERVICE_DISCIPLINES,
  SERVICE_ORDER_PRIORITIES,
  SERVICE_ORDER_STATUSES,
} from '../service-order.enums';

export class CreateServiceOrderDto {
  @ApiProperty() @IsUUID() patientId: string;

  @ApiProperty({ enum: SERVICE_DISCIPLINES })
  @IsIn(SERVICE_DISCIPLINES)
  discipline: string;

  @ApiPropertyOptional({ description: 'Catalogue service; supplies the ICHI code and default price' })
  @IsUUID() @IsOptional() serviceId?: string;

  @ApiPropertyOptional() @IsUUID() @IsOptional() visitId?: string;

  @ApiPropertyOptional({ description: 'Clinical indication — why it is being ordered' })
  @IsString() @IsOptional() reason?: string;

  @ApiPropertyOptional({ enum: SERVICE_ORDER_PRIORITIES })
  @IsIn(SERVICE_ORDER_PRIORITIES) @IsOptional() priority?: string;

  @ApiPropertyOptional() @IsISO8601() @IsOptional() scheduledAt?: string;

  @ApiPropertyOptional({ description: 'How many sessions the course is for' })
  @IsInt() @Min(1) @IsOptional() sessionsPlanned?: number;

  @ApiPropertyOptional({ description: 'Charge in KES; when > 0 a bill is raised' })
  @IsNumber() @Min(0) @IsOptional() price?: number;

  @ApiPropertyOptional({ description: 'Also make this the catalogue price for the service' })
  @IsOptional() saveAsServicePrice?: boolean;
}

export class UpdateServiceOrderDto {
  @ApiPropertyOptional({ enum: SERVICE_ORDER_STATUSES })
  @IsIn(SERVICE_ORDER_STATUSES) @IsOptional() status?: string;

  @ApiPropertyOptional() @IsISO8601() @IsOptional() scheduledAt?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() reason?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() outcome?: string;
  @ApiPropertyOptional() @IsInt() @Min(1) @IsOptional() sessionsPlanned?: number;
}

export class RecordSessionDto {
  @ApiProperty({ description: 'What was done in this session' })
  @IsString() @IsNotEmpty() notes: string;

  @ApiPropertyOptional({ description: 'Charge for this session in KES; when > 0 a bill is raised' })
  @IsNumber() @Min(0) @IsOptional() price?: number;
}
