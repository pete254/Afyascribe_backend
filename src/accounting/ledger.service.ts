import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { LedgerAccount } from './entities/ledger-account.entity';
import { JournalEntry } from './entities/journal-entry.entity';
import { JournalLine } from './entities/journal-line.entity';
import {
  PostJournalDto,
  JournalLineDto,
  CreateAccountDto,
  UpdateAccountDto,
} from './dto/accounting.dto';
import {
  STANDARD_COA,
  accountTypeForCode,
  normalBalanceForCode,
} from './data/standard-coa';

/** Rounds to cents and guards against float drift. */
const money = (v: number | string | undefined | null) =>
  Math.round((Number(v ?? 0) + Number.EPSILON) * 100) / 100;

export interface PostJournalInput {
  facilityId: string;
  date?: string;
  memo?: string;
  source?: string;
  sourceType?: string;
  sourceId?: string;
  postedById?: string | null;
  lines: JournalLineDto[];
}

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(
    @InjectRepository(LedgerAccount)
    private readonly accounts: Repository<LedgerAccount>,
    @InjectRepository(JournalEntry)
    private readonly journals: Repository<JournalEntry>,
    @InjectRepository(JournalLine)
    private readonly lines: Repository<JournalLine>,
    private readonly dataSource: DataSource,
  ) {}

  // ── Chart of accounts ──────────────────────────────────────────────────────

  /**
   * Seed the standard chart for a facility. Idempotent: only inserts codes that
   * are missing, so it is safe to run again after the chart is extended.
   */
  async seedChartOfAccounts(facilityId: string): Promise<{ created: number; total: number }> {
    const existing = await this.accounts.find({
      where: { facilityId },
      select: ['code'],
    });
    const have = new Set(existing.map((a) => a.code));

    const toCreate = STANDARD_COA.filter((r) => !have.has(r.code)).map((r) =>
      this.accounts.create({
        facilityId,
        code: r.code,
        name: r.name,
        type: r.type,
        normalBalance: r.normalBalance,
        parentCode: r.parent,
        isPostable: r.isPostable,
        isActive: true,
        isSystem: true,
      }),
    );

    if (toCreate.length) await this.accounts.save(toCreate);
    const total = have.size + toCreate.length;
    this.logger.log(
      `COA seed for facility ${facilityId}: +${toCreate.length} accounts (total ${total})`,
    );
    return { created: toCreate.length, total };
  }

  async listAccounts(
    facilityId: string,
    opts: { postableOnly?: boolean; activeOnly?: boolean } = {},
  ): Promise<LedgerAccount[]> {
    const qb = this.accounts
      .createQueryBuilder('a')
      .where('a.facilityId = :facilityId', { facilityId });
    if (opts.postableOnly) qb.andWhere('a.isPostable = true');
    if (opts.activeOnly) qb.andWhere('a.isActive = true');
    return qb.orderBy('a.code', 'ASC').getMany();
  }

  async getAccount(facilityId: string, code: string): Promise<LedgerAccount> {
    const acc = await this.accounts.findOne({ where: { facilityId, code } });
    if (!acc) throw new NotFoundException(`Account ${code} not found`);
    return acc;
  }

  async createAccount(facilityId: string, dto: CreateAccountDto): Promise<LedgerAccount> {
    const code = dto.code.trim();
    const dup = await this.accounts.findOne({ where: { facilityId, code } });
    if (dup) throw new BadRequestException(`Account ${code} already exists`);

    const account = this.accounts.create({
      facilityId,
      code,
      name: dto.name.trim(),
      type: (dto.type as LedgerAccount['type']) ?? accountTypeForCode(code),
      normalBalance:
        (dto.normalBalance as LedgerAccount['normalBalance']) ?? normalBalanceForCode(code),
      parentCode: dto.parentCode ?? null,
      isPostable: dto.isPostable ?? true,
      isActive: true,
      isSystem: false,
      description: dto.description ?? null,
    });
    return this.accounts.save(account);
  }

  async updateAccount(
    facilityId: string,
    code: string,
    dto: UpdateAccountDto,
  ): Promise<LedgerAccount> {
    const acc = await this.getAccount(facilityId, code);
    if (dto.name !== undefined) acc.name = dto.name.trim();
    if (dto.isActive !== undefined) acc.isActive = dto.isActive;
    if (dto.description !== undefined) acc.description = dto.description;
    return this.accounts.save(acc);
  }

  // ── Journals ───────────────────────────────────────────────────────────────

  /** The public API other modules call to post an automatic journal. */
  async post(input: PostJournalInput): Promise<JournalEntry> {
    const { facilityId } = input;
    const rawLines = input.lines ?? [];

    if (rawLines.length < 2) {
      throw new BadRequestException('A journal needs at least two lines');
    }

    // Normalise + validate each line has exactly one side.
    const norm = rawLines.map((l, i) => {
      const debit = money(l.debit);
      const credit = money(l.credit);
      if (debit < 0 || credit < 0) {
        throw new BadRequestException(`Line ${i + 1}: amounts cannot be negative`);
      }
      if (debit > 0 && credit > 0) {
        throw new BadRequestException(`Line ${i + 1}: a line is either a debit or a credit, not both`);
      }
      if (debit === 0 && credit === 0) {
        throw new BadRequestException(`Line ${i + 1}: enter a debit or a credit amount`);
      }
      return {
        accountCode: l.accountCode.trim(),
        debit,
        credit,
        description: l.description ?? null,
        costCenter: l.costCenter ?? null,
        lineNo: i + 1,
      };
    });

    const totalDebit = money(norm.reduce((s, l) => s + l.debit, 0));
    const totalCredit = money(norm.reduce((s, l) => s + l.credit, 0));
    if (totalDebit !== totalCredit) {
      throw new BadRequestException(
        `Journal is not balanced: debits ${totalDebit} ≠ credits ${totalCredit}`,
      );
    }
    if (totalDebit === 0) {
      throw new BadRequestException('Journal total cannot be zero');
    }

    // Every account must exist for this facility, be active and postable.
    const codes = Array.from(new Set(norm.map((l) => l.accountCode)));
    const found = await this.accounts.find({
      where: codes.map((code) => ({ facilityId, code })),
    });
    const byCode = new Map(found.map((a) => [a.code, a]));
    for (const code of codes) {
      const acc = byCode.get(code);
      if (!acc) throw new BadRequestException(`Unknown account ${code}. Seed the chart of accounts first.`);
      if (!acc.isActive) throw new BadRequestException(`Account ${code} (${acc.name}) is inactive`);
      if (!acc.isPostable)
        throw new BadRequestException(`Account ${code} (${acc.name}) is a header — post to a sub-account`);
    }

    // Persist header + lines atomically, allocating the entry number inside the
    // transaction so concurrent posts don't collide.
    return this.dataSource.transaction(async (mgr) => {
      const count = await mgr
        .getRepository(JournalEntry)
        .count({ where: { facilityId } });
      const entryNo = `JE-${String(count + 1).padStart(6, '0')}`;

      const entry = mgr.getRepository(JournalEntry).create({
        facilityId,
        entryNo,
        date: input.date ?? new Date().toISOString().slice(0, 10),
        memo: input.memo ?? null,
        source: input.source ?? 'manual',
        sourceType: input.sourceType ?? null,
        sourceId: input.sourceId ?? null,
        status: 'posted',
        postedById: input.postedById ?? null,
        lines: norm.map((l) =>
          mgr.getRepository(JournalLine).create({
            facilityId,
            accountCode: l.accountCode,
            debit: l.debit.toFixed(2),
            credit: l.credit.toFixed(2),
            description: l.description,
            costCenter: l.costCenter,
            lineNo: l.lineNo,
          }),
        ),
      });

      return mgr.getRepository(JournalEntry).save(entry);
    });
  }

  postJournal(facilityId: string, dto: PostJournalDto, userId?: string): Promise<JournalEntry> {
    return this.post({ facilityId, ...dto, postedById: userId ?? null });
  }

  async listJournals(
    facilityId: string,
    opts: { from?: string; to?: string; source?: string; limit?: number } = {},
  ): Promise<JournalEntry[]> {
    const qb = this.journals
      .createQueryBuilder('j')
      .leftJoinAndSelect('j.lines', 'l')
      .where('j.facilityId = :facilityId', { facilityId });
    if (opts.from) qb.andWhere('j.date >= :from', { from: opts.from });
    if (opts.to) qb.andWhere('j.date <= :to', { to: opts.to });
    if (opts.source) qb.andWhere('j.source = :source', { source: opts.source });
    return qb
      .orderBy('j.date', 'DESC')
      .addOrderBy('j.createdAt', 'DESC')
      .addOrderBy('l.lineNo', 'ASC')
      .limit(opts.limit ?? 100)
      .getMany();
  }

  async getJournal(facilityId: string, id: string): Promise<JournalEntry> {
    const entry = await this.journals.findOne({
      where: { id, facilityId },
      relations: ['lines'],
    });
    if (!entry) throw new NotFoundException('Journal entry not found');
    return entry;
  }

  /** Void a journal by posting its mirror image, so history is never erased. */
  async voidJournal(facilityId: string, id: string, userId?: string): Promise<JournalEntry> {
    const original = await this.getJournal(facilityId, id);
    if (original.status === 'void') {
      throw new BadRequestException('Journal is already voided');
    }

    const reversal = await this.post({
      facilityId,
      date: new Date().toISOString().slice(0, 10),
      memo: `Reversal of ${original.entryNo}${original.memo ? ` — ${original.memo}` : ''}`,
      source: original.source,
      sourceType: original.sourceType ?? undefined,
      sourceId: original.sourceId ?? undefined,
      postedById: userId ?? null,
      // Swap debits and credits.
      lines: (original.lines ?? []).map((l) => ({
        accountCode: l.accountCode,
        debit: Number(l.credit),
        credit: Number(l.debit),
        description: l.description ?? undefined,
        costCenter: l.costCenter ?? undefined,
      })),
    });

    await this.journals.update({ id: original.id }, { status: 'void', reversalOfId: reversal.id });
    await this.journals.update({ id: reversal.id }, { reversalOfId: original.id });
    return this.getJournal(facilityId, reversal.id);
  }

  // ── Balances & reports ─────────────────────────────────────────────────────

  /**
   * Trial balance: every account's net movement, split into a debit or credit
   * column by its resulting balance. `asOf` caps by date (inclusive). Voided
   * journals are excluded via their reversal, which nets them to zero.
   */
  async getTrialBalance(
    facilityId: string,
    asOf?: string,
  ): Promise<{
    asOf: string;
    rows: {
      code: string;
      name: string;
      type: string;
      debit: number;
      credit: number;
    }[];
    totalDebit: number;
    totalCredit: number;
  }> {
    const qb = this.lines
      .createQueryBuilder('l')
      .innerJoin(JournalEntry, 'j', 'j.id = l.journal_entry_id')
      .select('l.account_code', 'code')
      .addSelect('SUM(l.debit)', 'debit')
      .addSelect('SUM(l.credit)', 'credit')
      .where('l.facility_id = :facilityId', { facilityId });
    if (asOf) qb.andWhere('j.date <= :asOf', { asOf });
    qb.groupBy('l.account_code');

    const raw = await qb.getRawMany<{ code: string; debit: string; credit: string }>();
    const accounts = await this.listAccounts(facilityId);
    const byCode = new Map(accounts.map((a) => [a.code, a]));

    const rows = raw
      .map((r) => {
        const acc = byCode.get(r.code);
        const net = money(Number(r.debit) - Number(r.credit));
        return {
          code: r.code,
          name: acc?.name ?? r.code,
          type: acc?.type ?? accountTypeForCode(r.code),
          debit: net > 0 ? net : 0,
          credit: net < 0 ? money(-net) : 0,
        };
      })
      .filter((r) => r.debit !== 0 || r.credit !== 0)
      .sort((a, b) => a.code.localeCompare(b.code));

    return {
      asOf: asOf ?? new Date().toISOString().slice(0, 10),
      rows,
      totalDebit: money(rows.reduce((s, r) => s + r.debit, 0)),
      totalCredit: money(rows.reduce((s, r) => s + r.credit, 0)),
    };
  }

  /** All movements on one account for a period, with a running balance. */
  async getAccountLedger(
    facilityId: string,
    code: string,
    opts: { from?: string; to?: string } = {},
  ): Promise<{
    account: LedgerAccount;
    opening: number;
    entries: {
      date: string;
      entryNo: string;
      memo: string | null;
      debit: number;
      credit: number;
      balance: number;
    }[];
    closing: number;
  }> {
    const account = await this.getAccount(facilityId, code);
    const sign = account.normalBalance === 'debit' ? 1 : -1;

    // Opening balance = net movement strictly before `from`.
    let opening = 0;
    if (opts.from) {
      const pre = await this.lines
        .createQueryBuilder('l')
        .innerJoin(JournalEntry, 'j', 'j.id = l.journal_entry_id')
        .select('COALESCE(SUM(l.debit),0)', 'debit')
        .addSelect('COALESCE(SUM(l.credit),0)', 'credit')
        .where('l.facility_id = :facilityId', { facilityId })
        .andWhere('l.account_code = :code', { code })
        .andWhere('j.date < :from', { from: opts.from })
        .getRawOne<{ debit: string; credit: string }>();
      opening = money(sign * (Number(pre?.debit) - Number(pre?.credit)));
    }

    const qb = this.lines
      .createQueryBuilder('l')
      .innerJoin(JournalEntry, 'j', 'j.id = l.journal_entry_id')
      .select(['j.date AS date', 'j.entry_no AS "entryNo"', 'j.memo AS memo'])
      .addSelect('l.debit', 'debit')
      .addSelect('l.credit', 'credit')
      .where('l.facility_id = :facilityId', { facilityId })
      .andWhere('l.account_code = :code', { code });
    if (opts.from) qb.andWhere('j.date >= :from', { from: opts.from });
    if (opts.to) qb.andWhere('j.date <= :to', { to: opts.to });
    qb.orderBy('j.date', 'ASC').addOrderBy('j.created_at', 'ASC');

    const raw = await qb.getRawMany<{
      date: string;
      entryNo: string;
      memo: string | null;
      debit: string;
      credit: string;
    }>();

    let balance = opening;
    const entries = raw.map((r) => {
      const debit = money(r.debit);
      const credit = money(r.credit);
      balance = money(balance + sign * (debit - credit));
      return { date: r.date, entryNo: r.entryNo, memo: r.memo, debit, credit, balance };
    });

    return { account, opening, entries, closing: balance };
  }
}
