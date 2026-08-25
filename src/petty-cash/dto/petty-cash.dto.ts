import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, IsString, Length, IsDateString } from 'class-validator';

export class RecordExpenseDto {
  @ApiProperty({ example: 250, description: 'Amount paid out of petty cash' })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ example: 'Matatu fare — bank errand' })
  @IsString()
  @Length(2, 500)
  description: string;

  @ApiProperty({ example: '62009', description: 'GL expense account to charge' })
  @IsString()
  @Length(3, 20)
  expenseAccountCode: string;

  @ApiPropertyOptional({ example: 'John Mwangi' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  payee?: string;

  @ApiPropertyOptional({ example: '2026-08-25' })
  @IsOptional()
  @IsDateString()
  date?: string;
}

export class RecordTopUpDto {
  @ApiProperty({ example: 5000, description: 'Cash brought in to replenish the float' })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ example: 'Float replenishment' })
  @IsOptional()
  @IsString()
  @Length(2, 500)
  description?: string;

  @ApiPropertyOptional({ example: '11001', description: 'GL account the cash came from (default Cash on Hand)' })
  @IsOptional()
  @IsString()
  @Length(3, 20)
  sourceAccountCode?: string;

  @ApiPropertyOptional({ example: '2026-08-25' })
  @IsOptional()
  @IsDateString()
  date?: string;
}
