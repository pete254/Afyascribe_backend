import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type BankReconStatus = 'completed' | 'review';

/**
 * One bank-reconciliation session: reconciles a cash/bank GL account against a
 * bank statement as of a date. The individual GL lines that "cleared" the bank
 * are stamped with this reconciliation's id (see journal_lines.reconciliation_id),
 * so each line is reconciled at most once and future sessions only ever see the
 * still-uncleared items (deposits in transit / outstanding payments).
 */
@Entity('bank_reconciliations')
@Index(['facilityId', 'accountCode'])
export class BankReconciliation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  /** The GL account being reconciled (e.g. 11003 Bank - Current Account). */
  @Column({ name: 'account_code', length: 20 })
  accountCode: string;

  @Column({ name: 'account_name', length: 120, nullable: true })
  accountName: string | null;

  /** Closing date of the bank statement being reconciled to. */
  @Column({ name: 'statement_date', type: 'date' })
  statementDate: string;

  /** Closing balance shown on the bank statement. */
  @Column({ name: 'statement_balance', type: 'numeric', precision: 16, scale: 2, default: 0 })
  statementBalance: string;

  /** Net of everything reconciled in prior sessions (the opening cleared balance). */
  @Column({ name: 'opening_balance', type: 'numeric', precision: 16, scale: 2, default: 0 })
  openingBalance: string;

  /** opening + this session's cleared lines. Should equal statementBalance. */
  @Column({ name: 'reconciled_balance', type: 'numeric', precision: 16, scale: 2, default: 0 })
  reconciledBalance: string;

  /** statementBalance − reconciledBalance. Zero when fully reconciled. */
  @Column({ name: 'difference', type: 'numeric', precision: 16, scale: 2, default: 0 })
  difference: string;

  /** Full GL balance of the account at statementDate (cleared + uncleared). */
  @Column({ name: 'gl_balance', type: 'numeric', precision: 16, scale: 2, default: 0 })
  glBalance: string;

  @Column({ name: 'cleared_count', type: 'int', default: 0 })
  clearedCount: number;

  /**
   * Snapshot of the timing differences at completion — the uncleared ledger
   * lines (deposits in transit as positive, outstanding payments as negative) —
   * so a historical reconciliation report can be reprinted in full even after
   * later sessions clear those lines.
   */
  @Column({ name: 'adjustments', type: 'jsonb', default: [] })
  adjustments: { date: string; description: string; amount: number }[];

  @Column({ type: 'varchar', length: 12, default: 'review' })
  status: BankReconStatus;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
