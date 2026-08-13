import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
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

class CreateRuleDto {
  @IsString() pattern: string;
  @IsString() accountCode: string;
  @IsOptional() @IsString() accountName?: string;
  @IsOptional() @IsBoolean() isRegex?: boolean;
  @IsOptional() @IsNumber() priority?: number;
}

class UpdateRuleDto {
  @IsOptional() @IsString() pattern?: string;
  @IsOptional() @IsString() accountCode?: string;
  @IsOptional() @IsString() accountName?: string;
  @IsOptional() @IsBoolean() isRegex?: boolean;
  @IsOptional() @IsNumber() priority?: number;
  @IsOptional() @IsBoolean() active?: boolean;
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

  // ── Categorisation rules (declared before :id so /rules isn't read as an id) ──

  @Get('rules')
  @ApiOperation({ summary: 'Editable description→account rules for this facility' })
  listRules(@CurrentUser() user: CurrentUserType) {
    return this.service.listRules(this.facility(user));
  }

  @Post('rules')
  @ApiOperation({ summary: 'Create a categorisation rule' })
  createRule(@CurrentUser() user: CurrentUserType, @Body() dto: CreateRuleDto) {
    return this.service.createRule(this.facility(user), dto, user.id);
  }

  @Post('rules/seed')
  @ApiOperation({ summary: 'Seed the starter rules (once per facility)' })
  seedRules(@CurrentUser() user: CurrentUserType) {
    return this.service.seedRules(this.facility(user), user.id);
  }

  @Patch('rules/:id')
  @ApiOperation({ summary: 'Update a categorisation rule' })
  updateRule(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: UpdateRuleDto) {
    return this.service.updateRule(this.facility(user), id, dto);
  }

  @Delete('rules/:id')
  @ApiOperation({ summary: 'Delete a categorisation rule' })
  deleteRule(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.deleteRule(this.facility(user), id);
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
