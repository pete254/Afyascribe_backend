import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PettyCashVoucher } from './entities/petty-cash-voucher.entity';
import { RecordExpenseDto, RecordTopUpDto } from './dto/petty-cash.dto';
import { LedgerService } from '../accounting/ledger.service';

const PETTY_CASH = '11002';
const DEFAULT_SOURCE = '11001'; // Cash on Hand
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

/** One line on the petty-cash ledger, with a running float balance. */
export interface PettyCashLedgerEntry {
  id: string;
  voucherNo: string;
  type: 'topup' | 'expense';
  date: string;
  description: string;
  payee: string | null;
  account: string | null;
  recordedByName: string | null;
  cashIn: number;
  cashOut: number;
  /** Running petty-cash float balance after this voucher. */
  balance: number;
}

export interface PettyCashLedger {
  summary: { balance: number; toppedUp: number; spent: number; count: number };
  entries: PettyCashLedgerEntry[];
}

@Injectable()
export class PettyCashService {
  constructor(
    @InjectRepository(PettyCashVoucher)
    private readonly repo: Repository<PettyCashVoucher>,
    private readonly ledger: LedgerService,
  ) {}

  private async nextVoucherNo(facilityId: string): Promise<string> {
    const count = await this.repo.count({ where: { facilityId } });
    return `PV-${String(count + 1).padStart(4, '0')}`;
  }

  /** Pay a small expense out of the tin: Dr expense account, Cr Petty Cash. */
  async recordExpense(
    facilityId: string,
    dto: RecordExpenseDto,
    user: { id?: string; name?: string },
  ): Promise<PettyCashVoucher> {
    const amount = r2(dto.amount);
    if (!(amount > 0)) throw new BadRequestException('Amount must be greater than zero');
    if (dto.expenseAccountCode.trim() === PETTY_CASH) {
      throw new BadRequestException('Choose an expense account, not petty cash itself');
    }

    const date = dto.date ?? today();
    const description = dto.description.trim();

    // Post the GL journal first — if the chart isn't seeded or the account is
    // invalid, nothing is recorded and the caller gets a clear error.
    const journal = await this.ledger.post({
      facilityId,
      date,
      memo: `Petty cash — ${description}${dto.payee ? ` (${dto.payee})` : ''}`,
      source: 'petty_cash',
      sourceType: 'petty_cash_expense',
      postedById: user.id ?? null,
      lines: [
        { accountCode: dto.expenseAccountCode.trim(), debit: amount, description, costCenter: 'petty_cash' },
        { accountCode: PETTY_CASH, credit: amount, description },
      ],
    });

    const voucher = this.repo.create({
      facilityId,
      voucherNo: await this.nextVoucherNo(facilityId),
      type: 'expense',
      date,
      description,
      payee: dto.payee?.trim() || null,
      expenseAccountCode: dto.expenseAccountCode.trim(),
      sourceAccountCode: null,
      amount: amount.toFixed(2),
      journalId: journal.id,
      recordedById: user.id ?? null,
      recordedByName: user.name ?? null,
    });
    return this.repo.save(voucher);
  }

  /** Replenish the float: Dr Petty Cash, Cr source (cash/bank/mobile money). */
  async recordTopUp(
    facilityId: string,
    dto: RecordTopUpDto,
    user: { id?: string; name?: string },
  ): Promise<PettyCashVoucher> {
    const amount = r2(dto.amount);
    if (!(amount > 0)) throw new BadRequestException('Amount must be greater than zero');

    const source = (dto.sourceAccountCode ?? DEFAULT_SOURCE).trim();
    if (source === PETTY_CASH) throw new BadRequestException('The top-up source cannot be petty cash itself');

    const date = dto.date ?? today();
    const description = dto.description?.trim() || 'Float replenishment';

    const journal = await this.ledger.post({
      facilityId,
      date,
      memo: `Petty cash — ${description}`,
      source: 'petty_cash',
      sourceType: 'petty_cash_topup',
      postedById: user.id ?? null,
      lines: [
        { accountCode: PETTY_CASH, debit: amount, description },
        { accountCode: source, credit: amount, description },
      ],
    });

    const voucher = this.repo.create({
      facilityId,
      voucherNo: await this.nextVoucherNo(facilityId),
      type: 'topup',
      date,
      description,
      payee: null,
      expenseAccountCode: null,
      sourceAccountCode: source,
      amount: amount.toFixed(2),
      journalId: journal.id,
      recordedById: user.id ?? null,
      recordedByName: user.name ?? null,
    });
    return this.repo.save(voucher);
  }

  /**
   * The petty-cash book: every voucher in date order with a running float
   * balance. `to` caps the balance; `from` only trims which vouchers are listed
   * (earlier ones still sit in the opening balance each row carries).
   */
  async ledgerView(facilityId: string, from?: string, to?: string): Promise<PettyCashLedger> {
    const vouchers = await this.repo.find({
      where: { facilityId },
      order: { date: 'ASC', createdAt: 'ASC' },
    });

    let running = 0;
    let toppedUp = 0;
    let spent = 0;
    let count = 0;
    const entries: PettyCashLedgerEntry[] = [];

    for (const v of vouchers) {
      if (to && v.date > to) continue; // hard cut-off for balances
      const amount = Number(v.amount) || 0;
      const cashIn = v.type === 'topup' ? amount : 0;
      const cashOut = v.type === 'expense' ? amount : 0;
      running += cashIn - cashOut;

      if (!from || v.date >= from) {
        toppedUp += cashIn;
        spent += cashOut;
        count += 1;
        entries.push({
          id: v.id,
          voucherNo: v.voucherNo,
          type: v.type,
          date: v.date,
          description: v.description,
          payee: v.payee,
          account: v.type === 'expense' ? v.expenseAccountCode : v.sourceAccountCode,
          recordedByName: v.recordedByName,
          cashIn: r2(cashIn),
          cashOut: r2(cashOut),
          balance: r2(running),
        });
      }
    }

    // Newest first for display; balances were computed oldest-first above.
    entries.reverse();

    return {
      summary: { balance: r2(running), toppedUp: r2(toppedUp), spent: r2(spent), count },
      entries,
    };
  }

  /** Reverse a voucher: void its GL journal and remove the voucher. */
  async remove(facilityId: string, id: string, userId?: string): Promise<void> {
    const voucher = await this.repo.findOne({ where: { id, facilityId } });
    if (!voucher) throw new NotFoundException('Voucher not found');
    if (voucher.journalId) {
      try {
        await this.ledger.voidJournal(facilityId, voucher.journalId, userId);
      } catch {
        // Journal already voided or missing — proceed with removing the voucher.
      }
    }
    await this.repo.remove(voucher);
  }
}
