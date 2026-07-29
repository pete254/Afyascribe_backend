import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { JournalEntry } from './journal-entry.entity';

/**
 * A single debit or credit against one account. Exactly one of debit/credit is
 * non-zero on a well-formed line. `facilityId` and `accountCode` are
 * denormalised onto the line so trial balances and account ledgers are a single
 * indexed scan, no join to the header required.
 */
@Entity('journal_lines')
@Index(['facilityId', 'accountCode'])
export class JournalLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'journal_entry_id', type: 'uuid' })
  journalEntryId: string;

  @ManyToOne(() => JournalEntry, (entry) => entry.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'journal_entry_id' })
  journalEntry: JournalEntry;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'account_code', length: 20 })
  accountCode: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  debit: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  credit: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Department / clinic / ward / doctor tag, for departmental P&L. */
  @Column({ name: 'cost_center', type: 'varchar', length: 60, nullable: true })
  costCenter: string | null;

  @Column({ name: 'line_no', type: 'int', default: 0 })
  lineNo: number;
}
