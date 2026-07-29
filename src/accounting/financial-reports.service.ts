import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LedgerAccount } from './entities/ledger-account.entity';
import { JournalEntry } from './entities/journal-entry.entity';
import { JournalLine } from './entities/journal-line.entity';

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

interface Net {
  debit: number;
  credit: number;
}
export interface StatementLine {
  code: string;
  name: string;
  amount: number;
}
export interface StatementGroup {
  code: string;
  name: string;
  total: number;
  lines: StatementLine[];
}
export interface StatementSection {
  total: number;
  groups: StatementGroup[];
}

/**
 * Derives the financial statements (income statement, balance sheet, cash flow)
 * and departmental P&L directly from the general ledger, so they are always in
 * step with what has been posted — nothing is stored separately.
 */
@Injectable()
export class FinancialReportsService {
  constructor(
    @InjectRepository(LedgerAccount)
    private readonly accounts: Repository<LedgerAccount>,
    @InjectRepository(JournalLine)
    private readonly lines: Repository<JournalLine>,
  ) {}

  /** Net debit/credit per account over an optional date window. */
  private async netByAccount(
    facilityId: string,
    opts: { from?: string; to?: string } = {},
  ): Promise<Map<string, Net>> {
    const qb = this.lines
      .createQueryBuilder('l')
      .innerJoin(JournalEntry, 'j', 'j.id = l.journal_entry_id')
      .select('l.account_code', 'code')
      .addSelect('SUM(l.debit)', 'debit')
      .addSelect('SUM(l.credit)', 'credit')
      .where('l.facility_id = :facilityId', { facilityId });
    if (opts.from) qb.andWhere('j.date >= :from', { from: opts.from });
    if (opts.to) qb.andWhere('j.date <= :to', { to: opts.to });
    qb.groupBy('l.account_code');
    const raw = await qb.getRawMany<{ code: string; debit: string; credit: string }>();
    return new Map(raw.map((r) => [r.code, { debit: Number(r.debit), credit: Number(r.credit) }]));
  }

  /** Build presentation groups (by parent header) from postable-account lines. */
  private group(
    lines: StatementLine[],
    accountsByCode: Map<string, LedgerAccount>,
  ): StatementGroup[] {
    const groups = new Map<string, StatementGroup>();
    for (const line of lines) {
      const acc = accountsByCode.get(line.code);
      const parent = acc?.parentCode ?? '00000';
      const header = accountsByCode.get(parent);
      if (!groups.has(parent)) {
        groups.set(parent, { code: parent, name: header?.name ?? 'Other', total: 0, lines: [] });
      }
      const g = groups.get(parent)!;
      g.lines.push(line);
      g.total = r2(g.total + line.amount);
    }
    return Array.from(groups.values()).sort((a, b) => a.code.localeCompare(b.code));
  }

  /** Signed amount in the account's natural direction for a statement. */
  private amountFor(type: string, net: Net): number {
    // Credit-normal families read as credit − debit; debit-normal the reverse.
    const creditNormal = ['revenue', 'other_income', 'liability', 'equity'];
    return creditNormal.includes(type)
      ? r2(net.credit - net.debit)
      : r2(net.debit - net.credit);
  }

  private section(
    accounts: LedgerAccount[],
    net: Map<string, Net>,
    types: string[],
    accountsByCode: Map<string, LedgerAccount>,
  ): StatementSection {
    const lines: StatementLine[] = [];
    for (const acc of accounts) {
      if (!acc.isPostable || !types.includes(acc.type)) continue;
      const n = net.get(acc.code);
      if (!n) continue;
      const amount = this.amountFor(acc.type, n);
      if (amount === 0) continue;
      lines.push({ code: acc.code, name: acc.name, amount });
    }
    const groups = this.group(lines, accountsByCode);
    const total = r2(groups.reduce((s, g) => s + g.total, 0));
    return { total, groups };
  }

  private async accountMeta(facilityId: string) {
    const accounts = await this.accounts.find({ where: { facilityId }, order: { code: 'ASC' } });
    return { accounts, byCode: new Map(accounts.map((a) => [a.code, a])) };
  }

  // ── Income statement (P&L) ────────────────────────────────────────────────

  async incomeStatement(facilityId: string, from: string, to: string) {
    const { accounts, byCode } = await this.accountMeta(facilityId);
    const net = await this.netByAccount(facilityId, { from, to });

    const revenue = this.section(accounts, net, ['revenue'], byCode);
    const costOfSales = this.section(accounts, net, ['cost_of_sales'], byCode);
    const operatingExpenses = this.section(accounts, net, ['operating_expense'], byCode);
    const otherIncome = this.section(accounts, net, ['other_income'], byCode);
    const otherExpenses = this.section(accounts, net, ['other_expense'], byCode);

    const grossProfit = r2(revenue.total - costOfSales.total);
    const operatingProfit = r2(grossProfit - operatingExpenses.total);
    const netProfit = r2(operatingProfit + otherIncome.total - otherExpenses.total);

    return {
      from,
      to,
      revenue,
      costOfSales,
      grossProfit,
      operatingExpenses,
      operatingProfit,
      otherIncome,
      otherExpenses,
      netProfit,
    };
  }

  // ── Balance sheet ──────────────────────────────────────────────────────────

  async balanceSheet(facilityId: string, asOf: string) {
    const { accounts, byCode } = await this.accountMeta(facilityId);
    const net = await this.netByAccount(facilityId, { to: asOf });

    const assets = this.section(accounts, net, ['asset'], byCode);
    const liabilities = this.section(accounts, net, ['liability'], byCode);
    const equityAccounts = this.section(accounts, net, ['equity'], byCode);

    // Net earnings to date fold into equity so the sheet balances.
    let income = 0;
    for (const acc of accounts) {
      if (!acc.isPostable) continue;
      const n = net.get(acc.code);
      if (!n) continue;
      if (['revenue', 'other_income'].includes(acc.type)) income += this.amountFor(acc.type, n);
      if (['cost_of_sales', 'operating_expense', 'other_expense'].includes(acc.type))
        income -= this.amountFor(acc.type, n);
    }
    const currentEarnings = r2(income);

    const equityTotal = r2(equityAccounts.total + currentEarnings);
    const totalLiabilitiesAndEquity = r2(liabilities.total + equityTotal);

    return {
      asOf,
      assets,
      liabilities,
      equity: {
        total: equityTotal,
        groups: equityAccounts.groups,
        currentEarnings,
      },
      totalAssets: assets.total,
      totalLiabilitiesAndEquity,
      balanced: Math.abs(assets.total - totalLiabilitiesAndEquity) < 0.01,
    };
  }

  // ── Cash flow (cash & bank movement) ──────────────────────────────────────

  async cashFlow(facilityId: string, from: string, to: string) {
    const { accounts } = await this.accountMeta(facilityId);
    const cashCodes = accounts
      .filter((a) => a.isPostable && a.type === 'asset' && a.code.startsWith('11'))
      .map((a) => a.code);

    const opening = await this.netByAccount(facilityId, { to: prevDay(from) });
    const period = await this.netByAccount(facilityId, { from, to });

    const rows = cashCodes.map((code) => {
      const acc = accounts.find((a) => a.code === code)!;
      const o = opening.get(code);
      const p = period.get(code);
      const openingBal = r2((o?.debit ?? 0) - (o?.credit ?? 0));
      const inflow = r2(p?.debit ?? 0);
      const outflow = r2(p?.credit ?? 0);
      return {
        code,
        name: acc.name,
        opening: openingBal,
        inflow,
        outflow,
        closing: r2(openingBal + inflow - outflow),
      };
    });

    return {
      from,
      to,
      accounts: rows.filter((r) => r.opening || r.inflow || r.outflow),
      openingCash: r2(rows.reduce((s, r) => s + r.opening, 0)),
      totalInflow: r2(rows.reduce((s, r) => s + r.inflow, 0)),
      totalOutflow: r2(rows.reduce((s, r) => s + r.outflow, 0)),
      closingCash: r2(rows.reduce((s, r) => s + r.closing, 0)),
    };
  }

  // ── Departmental P&L (by cost centre) ─────────────────────────────────────

  async departmentalPnl(facilityId: string, from: string, to: string) {
    const { byCode } = await this.accountMeta(facilityId);

    const qb = this.lines
      .createQueryBuilder('l')
      .innerJoin(JournalEntry, 'j', 'j.id = l.journal_entry_id')
      .select('l.cost_center', 'costCenter')
      .addSelect('l.account_code', 'code')
      .addSelect('SUM(l.debit)', 'debit')
      .addSelect('SUM(l.credit)', 'credit')
      .where('l.facility_id = :facilityId', { facilityId })
      .andWhere('l.cost_center IS NOT NULL')
      .andWhere('j.date >= :from', { from })
      .andWhere('j.date <= :to', { to })
      .groupBy('l.cost_center')
      .addGroupBy('l.account_code');

    const raw = await qb.getRawMany<{
      costCenter: string;
      code: string;
      debit: string;
      credit: string;
    }>();

    const depts = new Map<string, { department: string; revenue: number; costOfSales: number; expenses: number }>();
    for (const r of raw) {
      const acc = byCode.get(r.code);
      if (!acc) continue;
      const dept = depts.get(r.costCenter) ?? {
        department: r.costCenter,
        revenue: 0,
        costOfSales: 0,
        expenses: 0,
      };
      const net = this.amountFor(acc.type, { debit: Number(r.debit), credit: Number(r.credit) });
      if (acc.type === 'revenue') dept.revenue = r2(dept.revenue + net);
      else if (acc.type === 'cost_of_sales') dept.costOfSales = r2(dept.costOfSales + net);
      else if (acc.type === 'operating_expense') dept.expenses = r2(dept.expenses + net);
      depts.set(r.costCenter, dept);
    }

    return {
      from,
      to,
      departments: Array.from(depts.values())
        .map((d) => ({ ...d, profit: r2(d.revenue - d.costOfSales - d.expenses) }))
        .sort((a, b) => b.profit - a.profit),
    };
  }
}

/** The day before an ISO date, for opening-balance windows. */
function prevDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
