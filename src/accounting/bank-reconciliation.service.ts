import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { BankReconciliation } from './entities/bank-reconciliation.entity';
import { BankReconRule } from './entities/bank-recon-rule.entity';
import { JournalLine } from './entities/journal-line.entity';
import { JournalEntry } from './entities/journal-entry.entity';
import { LedgerAccount } from './entities/ledger-account.entity';
import { LedgerService } from './ledger.service';
import { DEFAULT_RECON_RULES } from './data/bank-recon-rule-defaults';

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** Candidate cash/bank accounts to reconcile — the liquid current assets. */
const BANK_ACCOUNT_CODES = ['11001', '11002', '11003', '11004', '11005', '11006'];

export interface CreateReconInput {
  accountCode: string;
  statementDate: string;
  statementBalance: number;
  clearedLineIds: string[];
  note?: string;
}

@Injectable()
export class BankReconciliationService {
  constructor(
    @InjectRepository(BankReconciliation)
    private readonly recons: Repository<BankReconciliation>,
    @InjectRepository(JournalLine)
    private readonly lines: Repository<JournalLine>,
    @InjectRepository(LedgerAccount)
    private readonly accounts: Repository<LedgerAccount>,
    @InjectRepository(BankReconRule)
    private readonly rules: Repository<BankReconRule>,
    private readonly ledger: LedgerService,
  ) {}

  // ── Categorisation rules ─────────────────────────────────────────────────────

  listRules(facilityId: string): Promise<BankReconRule[]> {
    return this.rules.find({
      where: { facilityId },
      order: { priority: 'DESC', createdAt: 'ASC' },
    });
  }

  async createRule(
    facilityId: string,
    dto: { pattern: string; accountCode: string; accountName?: string; isRegex?: boolean; priority?: number },
    userId?: string,
  ): Promise<BankReconRule> {
    if (!dto.pattern?.trim()) throw new BadRequestException('Pattern is required');
    const account = await this.accounts.findOne({ where: { facilityId, code: dto.accountCode } });
    if (!account) throw new BadRequestException('Account not found');
    return this.rules.save(
      this.rules.create({
        facilityId,
        pattern: dto.pattern.trim(),
        isRegex: !!dto.isRegex,
        accountCode: dto.accountCode,
        accountName: dto.accountName ?? account.name,
        priority: dto.priority ?? 0,
        active: true,
        createdById: userId ?? null,
      }),
    );
  }

  async updateRule(
    facilityId: string,
    id: string,
    dto: Partial<{ pattern: string; accountCode: string; accountName: string; isRegex: boolean; priority: number; active: boolean }>,
  ): Promise<BankReconRule> {
    const rule = await this.rules.findOne({ where: { id, facilityId } });
    if (!rule) throw new NotFoundException('Rule not found');
    if (dto.accountCode && dto.accountCode !== rule.accountCode) {
      const account = await this.accounts.findOne({ where: { facilityId, code: dto.accountCode } });
      if (!account) throw new BadRequestException('Account not found');
      rule.accountName = dto.accountName ?? account.name;
    }
    Object.assign(rule, {
      pattern: dto.pattern?.trim() ?? rule.pattern,
      accountCode: dto.accountCode ?? rule.accountCode,
      isRegex: dto.isRegex ?? rule.isRegex,
      priority: dto.priority ?? rule.priority,
      active: dto.active ?? rule.active,
    });
    if (dto.accountName !== undefined) rule.accountName = dto.accountName;
    return this.rules.save(rule);
  }

  async deleteRule(facilityId: string, id: string): Promise<{ deleted: boolean }> {
    const res = await this.rules.delete({ id, facilityId });
    return { deleted: (res.affected ?? 0) > 0 };
  }

  /** Seed the starter rules (only those whose account exists), once per facility. */
  async seedRules(facilityId: string, userId?: string): Promise<{ created: number }> {
    const existing = await this.rules.count({ where: { facilityId } });
    if (existing > 0) return { created: 0 };
    const codes = new Set(
      (await this.accounts.find({ where: { facilityId } })).map((a) => a.code),
    );
    const rows = DEFAULT_RECON_RULES.filter((r) => codes.has(r.accountCode)).map((r) =>
      this.rules.create({
        facilityId,
        pattern: r.pattern,
        isRegex: false,
        accountCode: r.accountCode,
        accountName: r.accountName,
        priority: r.priority,
        active: true,
        createdById: userId ?? null,
      }),
    );
    if (rows.length) await this.rules.save(rows);
    return { created: rows.length };
  }

  /**
   * Book a bank-only transaction found on the statement but missing from the
   * books (a bank charge, interest, direct debit, standing order…) as a balanced
   * two-line journal, and return the new GL line on the bank account so the
   * caller can immediately mark it cleared/matched.
   *   direction 'in'  → money into the bank:  Dr bank, Cr counter
   *   direction 'out' → money out of the bank: Dr counter, Cr bank
   */
  async createTransaction(
    facilityId: string,
    input: {
      bankAccountCode: string;
      counterAccountCode: string;
      amount: number;
      direction: 'in' | 'out';
      date: string;
      description?: string;
    },
    userId?: string,
  ): Promise<{ lineId: string; entryId: string; entryNo: string }> {
    if (!(input.amount > 0)) throw new BadRequestException('Amount must be greater than 0');
    const bank = { accountCode: input.bankAccountCode, description: input.description ?? null };
    const other = { accountCode: input.counterAccountCode, description: input.description ?? null };
    const amt = r2(input.amount);
    const lines =
      input.direction === 'in'
        ? [{ ...bank, debit: amt, credit: 0 }, { ...other, debit: 0, credit: amt }]
        : [{ ...other, debit: amt, credit: 0 }, { ...bank, debit: 0, credit: amt }];

    const entry = await this.ledger.post({
      facilityId,
      date: input.date,
      source: 'bank_recon',
      sourceType: 'bank_transaction',
      memo: input.description ?? 'Bank reconciliation adjustment',
      postedById: userId ?? null,
      lines,
    });

    const bankLine = (entry.lines ?? []).find((l) => l.accountCode === input.bankAccountCode);
    if (!bankLine) throw new BadRequestException('Failed to locate the new bank line');
    return { lineId: bankLine.id, entryId: entry.id, entryNo: entry.entryNo };
  }

  /** Cash/bank accounts that exist for this facility, each with its GL balance. */
  async bankAccounts(facilityId: string) {
    const accounts = await this.accounts.find({
      where: { facilityId, code: In(BANK_ACCOUNT_CODES) },
      order: { code: 'ASC' },
    });
    const out: { code: string; name: string; balance: number }[] = [];
    for (const a of accounts) {
      out.push({ code: a.code, name: a.name, balance: await this.accountBalance(facilityId, a.code) });
    }
    return out;
  }

  /** Signed GL balance of a (debit-normal) bank account up to and including `asOf`. */
  private async accountBalance(facilityId: string, accountCode: string, asOf?: string): Promise<number> {
    const qb = this.lines
      .createQueryBuilder('l')
      .innerJoin(JournalEntry, 'j', 'j.id = l.journal_entry_id')
      .select('COALESCE(SUM(l.debit),0)', 'debit')
      .addSelect('COALESCE(SUM(l.credit),0)', 'credit')
      .where('l.facility_id = :facilityId', { facilityId })
      .andWhere('l.account_code = :accountCode', { accountCode })
      .andWhere("j.status = 'posted'");
    if (asOf) qb.andWhere('j.date <= :asOf', { asOf });
    const row = await qb.getRawOne<{ debit: string; credit: string }>();
    return r2(Number(row?.debit || 0) - Number(row?.credit || 0));
  }

  /**
   * Everything needed to reconcile: the opening (already-reconciled) balance,
   * the full GL balance at the date, and every still-uncleared line up to the
   * statement date for the user to tick off against their bank statement.
   */
  async unreconciled(facilityId: string, accountCode: string, asOf: string) {
    const account = await this.accounts.findOne({ where: { facilityId, code: accountCode } });
    if (!account) throw new NotFoundException('Account not found');

    // Opening balance = net of all lines already reconciled in prior sessions.
    const openingRow = await this.lines
      .createQueryBuilder('l')
      .innerJoin(JournalEntry, 'j', 'j.id = l.journal_entry_id')
      .select('COALESCE(SUM(l.debit),0)', 'debit')
      .addSelect('COALESCE(SUM(l.credit),0)', 'credit')
      .where('l.facility_id = :facilityId', { facilityId })
      .andWhere('l.account_code = :accountCode', { accountCode })
      .andWhere("j.status = 'posted'")
      .andWhere('l.reconciliation_id IS NOT NULL')
      .getRawOne<{ debit: string; credit: string }>();
    const openingBalance = r2(Number(openingRow?.debit || 0) - Number(openingRow?.credit || 0));

    const glBalance = await this.accountBalance(facilityId, accountCode, asOf);

    const rows = await this.lines
      .createQueryBuilder('l')
      .innerJoin(JournalEntry, 'j', 'j.id = l.journal_entry_id')
      .select([
        'l.id AS id',
        'j.date AS date',
        'j.entry_no AS "entryNo"',
        'j.memo AS memo',
        'l.description AS description',
        'l.debit AS debit',
        'l.credit AS credit',
      ])
      .where('l.facility_id = :facilityId', { facilityId })
      .andWhere('l.account_code = :accountCode', { accountCode })
      .andWhere("j.status = 'posted'")
      .andWhere('l.reconciliation_id IS NULL')
      .andWhere('j.date <= :asOf', { asOf })
      .orderBy('j.date', 'ASC')
      .addOrderBy('j.created_at', 'ASC')
      .getRawMany<{
        id: string; date: string; entryNo: string; memo: string | null;
        description: string | null; debit: string; credit: string;
      }>();

    const openLines = rows.map((r) => ({
      id: r.id,
      date: r.date,
      entryNo: r.entryNo,
      memo: r.description || r.memo,
      debit: Number(r.debit),
      credit: Number(r.credit),
      amount: r2(Number(r.debit) - Number(r.credit)),
    }));

    return {
      account: { code: account.code, name: account.name },
      asOf,
      openingBalance,
      glBalance,
      lines: openLines,
    };
  }

  /**
   * Record a reconciliation: stamp the ticked lines as cleared under a new
   * session, and store the computed reconciliation. Reconciled when the cleared
   * book balance equals the bank statement balance (difference ≈ 0).
   */
  async create(facilityId: string, input: CreateReconInput, userId?: string): Promise<BankReconciliation> {
    const account = await this.accounts.findOne({ where: { facilityId, code: input.accountCode } });
    if (!account) throw new NotFoundException('Account not found');

    const clearedIds = [...new Set(input.clearedLineIds || [])];
    const cleared = clearedIds.length
      ? await this.lines.find({
          where: { id: In(clearedIds), facilityId, accountCode: input.accountCode, reconciliationId: IsNull() },
        })
      : [];
    if (cleared.length !== clearedIds.length) {
      throw new BadRequestException('Some selected lines are missing or already reconciled');
    }

    const unrec = await this.unreconciled(facilityId, input.accountCode, input.statementDate);
    const openingBalance = unrec.openingBalance;
    const clearedNet = r2(cleared.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0));
    const reconciledBalance = r2(openingBalance + clearedNet);
    const difference = r2(Number(input.statementBalance) - reconciledBalance);
    const glBalance = await this.accountBalance(facilityId, input.accountCode, input.statementDate);

    // Snapshot the timing differences (uncleared lines left after this session) so
    // the historical report keeps its deposits-in-transit / outstanding detail.
    const clearedSet = new Set(clearedIds);
    const adjustments = unrec.lines
      .filter((l) => !clearedSet.has(l.id))
      .map((l) => ({ date: l.date, description: l.memo || '', amount: l.amount }));

    const recon = await this.recons.save(
      this.recons.create({
        facilityId,
        accountCode: input.accountCode,
        accountName: account.name,
        statementDate: input.statementDate,
        statementBalance: Number(input.statementBalance).toFixed(2),
        openingBalance: openingBalance.toFixed(2),
        reconciledBalance: reconciledBalance.toFixed(2),
        difference: difference.toFixed(2),
        glBalance: glBalance.toFixed(2),
        clearedCount: cleared.length,
        adjustments,
        status: Math.abs(difference) < 0.01 ? 'completed' : 'review',
        note: input.note ?? null,
        createdById: userId ?? null,
      }),
    );

    if (cleared.length) {
      await this.lines.update(
        { id: In(cleared.map((l) => l.id)) },
        { reconciliationId: recon.id, clearedAt: new Date() },
      );
    }

    return recon;
  }

  list(facilityId: string, accountCode?: string): Promise<BankReconciliation[]> {
    return this.recons.find({
      where: accountCode ? { facilityId, accountCode } : { facilityId },
      order: { statementDate: 'DESC', createdAt: 'DESC' },
      take: 100,
    });
  }

  async get(facilityId: string, id: string) {
    const recon = await this.recons.findOne({ where: { id, facilityId } });
    if (!recon) throw new NotFoundException('Reconciliation not found');
    const rows = await this.lines
      .createQueryBuilder('l')
      .innerJoin(JournalEntry, 'j', 'j.id = l.journal_entry_id')
      .select([
        'l.id AS id', 'j.date AS date', 'j.entry_no AS "entryNo"',
        'j.memo AS memo', 'l.description AS description', 'l.debit AS debit', 'l.credit AS credit',
      ])
      .where('l.reconciliation_id = :id', { id })
      .orderBy('j.date', 'ASC')
      .getRawMany<{ id: string; date: string; entryNo: string; memo: string | null; description: string | null; debit: string; credit: string }>();
    return {
      ...recon,
      lines: rows.map((r) => ({
        id: r.id, date: r.date, entryNo: r.entryNo, memo: r.description || r.memo,
        debit: Number(r.debit), credit: Number(r.credit), amount: r2(Number(r.debit) - Number(r.credit)),
      })),
    };
  }

  /** Undo a reconciliation — release its lines back to uncleared and delete it. */
  async reopen(facilityId: string, id: string): Promise<{ released: number }> {
    const recon = await this.recons.findOne({ where: { id, facilityId } });
    if (!recon) throw new NotFoundException('Reconciliation not found');
    const res = await this.lines.update(
      { reconciliationId: id },
      { reconciliationId: null, clearedAt: null },
    );
    await this.recons.delete({ id, facilityId });
    return { released: res.affected ?? 0 };
  }
}
