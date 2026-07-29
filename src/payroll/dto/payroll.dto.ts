import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
  IsDateString,
  IsBoolean,
  IsUUID,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEmployeeDto {
  @ApiProperty() @IsString() firstName: string;
  @ApiProperty() @IsString() lastName: string;
  @ApiProperty({ example: 50000 }) @IsNumber() @Min(0) basicSalary: number;

  @ApiPropertyOptional() @IsString() @IsOptional() employeeNo?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() nationalId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() kraPin?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() nssfNo?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() shifNo?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() jobTitle?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() department?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() bankName?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() bankAccount?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() phone?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() email?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() employmentType?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() hireDate?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() userId?: string;
}

export class UpdateEmployeeDto {
  @ApiPropertyOptional() @IsString() @IsOptional() firstName?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() lastName?: string;
  @ApiPropertyOptional() @IsNumber() @Min(0) @IsOptional() basicSalary?: number;
  @ApiPropertyOptional() @IsString() @IsOptional() nationalId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() kraPin?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() nssfNo?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() shifNo?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() jobTitle?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() department?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() bankName?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() bankAccount?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() phone?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() email?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() employmentType?: string;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isActive?: boolean;
}

export class PayComponentDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsNumber() @Min(0) amount: number;
}

export class PayrollEntryDto {
  @ApiProperty() @IsUUID() employeeId: string;

  @ApiPropertyOptional({ type: [PayComponentDto] })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PayComponentDto)
  allowances?: PayComponentDto[];

  @ApiPropertyOptional({ type: [PayComponentDto] })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PayComponentDto)
  otherDeductions?: PayComponentDto[];
}

export class CreatePayrollRunDto {
  @ApiProperty({ example: '2026-07', description: 'Pay period YYYY-MM' })
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'periodMonth must be YYYY-MM' })
  periodMonth: string;

  @ApiPropertyOptional() @IsDateString() @IsOptional() payDate?: string;

  @ApiPropertyOptional({ description: 'The COA bank account net pay is disbursed from', example: '11003' })
  @IsString()
  @IsOptional()
  bankAccountCode?: string;

  @ApiPropertyOptional({
    type: [PayrollEntryDto],
    description: 'Specific employees + allowances/deductions; omit to include all active employees on basic',
  })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PayrollEntryDto)
  entries?: PayrollEntryDto[];
}
