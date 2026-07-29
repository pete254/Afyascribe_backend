import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { LedgerService } from './ledger.service';
import { FinancialReportsService } from './financial-reports.service';
import {
  PostJournalDto,
  CreateAccountDto,
  UpdateAccountDto,
} from './dto/accounting.dto';

/** Default a missing date range to the current month. */
function monthRange(from?: string, to?: string): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const todayStr = now.toISOString().slice(0, 10);
  return { from: from || first, to: to || todayStr };
}

/**
 * The back-office ledger surface. Restricted to facility admins/owners and the
 * platform super_admin — the people who run the books. Everything is scoped to
 * the caller's facility.
 */
@ApiTags('accounting')
@ApiBearerAuth('JWT-auth')
@Controller('accounting')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('facility_admin', 'super_admin', 'accountant')
export class AccountingController {
  constructor(
    private readonly ledger: LedgerService,
    private readonly reports: FinancialReportsService,
  ) {}

  private facility(user: CurrentUserType): string {
    if (!user.facilityId) throw new BadRequestException('Your account is not linked to a facility');
    return user.facilityId;
  }

  // ── Chart of accounts ──────────────────────────────────────────────────────

  @Post('chart/seed')
  @ApiOperation({ summary: 'Seed the standard chart of accounts for this facility (idempotent)' })
  seed(@CurrentUser() user: CurrentUserType) {
    return this.ledger.seedChartOfAccounts(this.facility(user));
  }

  @Get('accounts')
  @ApiOperation({ summary: 'List the chart of accounts' })
  listAccounts(
    @CurrentUser() user: CurrentUserType,
    @Query('postableOnly') postableOnly?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.ledger.listAccounts(this.facility(user), {
      postableOnly: postableOnly === 'true',
      activeOnly: activeOnly === 'true',
    });
  }

  @Post('accounts')
  @ApiOperation({ summary: 'Add a custom account to the chart' })
  createAccount(@CurrentUser() user: CurrentUserType, @Body() dto: CreateAccountDto) {
    return this.ledger.createAccount(this.facility(user), dto);
  }

  @Patch('accounts/:code')
  @ApiOperation({ summary: 'Rename, describe, or (de)activate an account' })
  updateAccount(
    @CurrentUser() user: CurrentUserType,
    @Param('code') code: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.ledger.updateAccount(this.facility(user), code, dto);
  }

  @Get('accounts/:code/ledger')
  @ApiOperation({ summary: 'One account’s movements with a running balance' })
  accountLedger(
    @CurrentUser() user: CurrentUserType,
    @Param('code') code: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.ledger.getAccountLedger(this.facility(user), code, { from, to });
  }

  // ── Journals ───────────────────────────────────────────────────────────────

  @Post('journals')
  @ApiOperation({ summary: 'Post a manual, balanced journal entry' })
  postJournal(@CurrentUser() user: CurrentUserType, @Body() dto: PostJournalDto) {
    return this.ledger.postJournal(this.facility(user), dto, user.id);
  }

  @Get('journals')
  @ApiOperation({ summary: 'List journal entries' })
  listJournals(
    @CurrentUser() user: CurrentUserType,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('source') source?: string,
  ) {
    return this.ledger.listJournals(this.facility(user), { from, to, source });
  }

  @Get('journals/:id')
  @ApiOperation({ summary: 'Get one journal entry with its lines' })
  getJournal(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.ledger.getJournal(this.facility(user), id);
  }

  @Patch('journals/:id/void')
  @ApiOperation({ summary: 'Void a journal by posting its reversal' })
  voidJournal(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.ledger.voidJournal(this.facility(user), id, user.id);
  }

  // ── Reports ────────────────────────────────────────────────────────────────

  @Get('trial-balance')
  @ApiOperation({ summary: 'Trial balance as of a date' })
  trialBalance(@CurrentUser() user: CurrentUserType, @Query('asOf') asOf?: string) {
    return this.ledger.getTrialBalance(this.facility(user), asOf);
  }

  // ── Financial statements ────────────────────────────────────────────────────

  @Get('reports/income-statement')
  @ApiOperation({ summary: 'Income statement (P&L) for a period' })
  incomeStatement(
    @CurrentUser() user: CurrentUserType,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const r = monthRange(from, to);
    return this.reports.incomeStatement(this.facility(user), r.from, r.to);
  }

  @Get('reports/balance-sheet')
  @ApiOperation({ summary: 'Balance sheet as of a date' })
  balanceSheet(@CurrentUser() user: CurrentUserType, @Query('asOf') asOf?: string) {
    return this.reports.balanceSheet(this.facility(user), asOf || new Date().toISOString().slice(0, 10));
  }

  @Get('reports/cash-flow')
  @ApiOperation({ summary: 'Cash & bank movement for a period' })
  cashFlow(
    @CurrentUser() user: CurrentUserType,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const r = monthRange(from, to);
    return this.reports.cashFlow(this.facility(user), r.from, r.to);
  }

  @Get('reports/departmental-pnl')
  @ApiOperation({ summary: 'Profit & loss by department / cost centre' })
  departmentalPnl(
    @CurrentUser() user: CurrentUserType,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const r = monthRange(from, to);
    return this.reports.departmentalPnl(this.facility(user), r.from, r.to);
  }
}
