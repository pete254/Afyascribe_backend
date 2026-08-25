import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type PettyCashType = 'topup' | 'expense';

/**
 * One petty-cash voucher — a single movement in the imprest tin. A `topup` is
 * cash brought in to replenish the float (Dr Petty Cash, Cr source); an
 * `expense` is a small payment out (Dr expense account, Cr Petty Cash). Every
 * voucher posts a balanced journal to the GL, so the petty-cash book always
 * reconciles to account 11002 and the trial balance.
 */
@Entity('petty_cash_vouchers')
@Index('IDX_petty_cash_facility_date', ['facilityId', 'date'])
export class PettyCashVoucher {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'voucher_no', type: 'varchar', length: 30 })
  voucherNo: string;

  @Column({ name: 'type', type: 'varchar', length: 10 })
  type: PettyCashType;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'text' })
  description: string;

  /** Who the money was paid to (expense vouchers). */
  @Column({ name: 'payee', type: 'varchar', length: 200, nullable: true })
  payee: string | null;

  /** GL expense account debited (expense) — from the chart of accounts. */
  @Column({ name: 'expense_account_code', type: 'varchar', length: 20, nullable: true })
  expenseAccountCode: string | null;

  /** GL account the top-up cash came from (topup) — cash/bank/mobile money. */
  @Column({ name: 'source_account_code', type: 'varchar', length: 20, nullable: true })
  sourceAccountCode: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: string;

  /** The balanced journal this voucher posted. */
  @Column({ name: 'journal_id', type: 'uuid', nullable: true })
  journalId: string | null;

  @Column({ name: 'recorded_by_id', type: 'uuid', nullable: true })
  recordedById: string | null;

  @Column({ name: 'recorded_by_name', type: 'varchar', length: 200, nullable: true })
  recordedByName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
