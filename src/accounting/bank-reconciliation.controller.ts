import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsArray, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { BankReconciliationService } from './bank-reconciliation.service';

class CreateReconDto {
  @IsString() accountCode: string;
  @IsString() statementDate: string;
  @IsNumber() statementBalance: number;
  @IsArray() @IsString({ each: true }) clearedLineIds: string[];
  @IsOptional() @IsString() note?: string;
}

class CreateTxnDto {
  @IsString() bankAccountCode: string;
  @IsString() counterAccountCode: string;
  @IsNumber() amount: number;
  @IsIn(['in', 'out']) direction: 'in' | 'out';
  @IsString() date: string;
  @IsOptional() @IsString() description?: string;
}

/** Bank reconciliation — match the GL cash/bank accounts to bank statements. */
@ApiTags('bank-reconciliation')
@ApiBearerAuth('JWT-auth')
@Controller('accounting/bank-recon')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('facility_admin', 'super_admin', 'accountant')
export class BankReconciliationController {
  constructor(private readonly service: BankReconciliationService) {}

  private facility(user: CurrentUserType): string {
    if (!user.facilityId) throw new BadRequestException('Your account is not linked to a facility');
    return user.facilityId;
  }

  @Get('accounts')
  @ApiOperation({ summary: 'Cash/bank accounts available to reconcile, with GL balances' })
  accounts(@CurrentUser() user: CurrentUserType) {
    return this.service.bankAccounts(this.facility(user));
  }

  @Get('unreconciled')
  @ApiOperation({ summary: 'Uncleared GL lines on a bank account up to a date' })
  unreconciled(
    @CurrentUser() user: CurrentUserType,
    @Query('accountCode') accountCode: string,
    @Query('asOf') asOf: string,
  ) {
    if (!accountCode) throw new BadRequestException('accountCode is required');
    const asOfDate = asOf || new Date().toISOString().slice(0, 10);
    return this.service.unreconciled(this.facility(user), accountCode, asOfDate);
  }

  @Get()
  @ApiOperation({ summary: 'Reconciliation history' })
  list(@CurrentUser() user: CurrentUserType, @Query('accountCode') accountCode?: string) {
    return this.service.list(this.facility(user), accountCode);
  }

  @Get(':id')
  @ApiOperation({ summary: 'A reconciliation with its cleared lines' })
  get(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.get(this.facility(user), id);
  }

  @Post()
  @ApiOperation({ summary: 'Record a reconciliation (marks the ticked lines cleared)' })
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreateReconDto) {
    return this.service.create(this.facility(user), dto, user.id);
  }

  @Post('transaction')
  @ApiOperation({ summary: 'Book a bank-only transaction (charge/interest) and return its new bank line' })
  createTransaction(@CurrentUser() user: CurrentUserType, @Body() dto: CreateTxnDto) {
    return this.service.createTransaction(this.facility(user), dto, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Reopen a reconciliation — release its lines and delete it' })
  reopen(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.reopen(this.facility(user), id);
  }
}
