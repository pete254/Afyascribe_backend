import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

/** Guard body for the destructive "reset-from-knhts" endpoints. */
export class ConfirmResetDto {
  @ApiProperty({ example: 'RESET', description: 'Must be exactly "RESET" to proceed' })
  @IsIn(['RESET'])
  confirm: string;
}

/** Inventory reset: additionally choose whether to import the national HPT list. */
export class ConfirmInventoryResetDto extends ConfirmResetDto {
  @ApiPropertyOptional({ enum: ['none', 'all'], default: 'none', description: '"all" imports the ~18k national HPT products in the background' })
  @IsOptional()
  @IsIn(['none', 'all'])
  import?: 'none' | 'all';
}
