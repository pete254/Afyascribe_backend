import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { JournalLine } from './journal-line.entity';

export type JournalStatus = 'posted' | 'void';

/**
 * A balanced double-entry transaction: the sum of its lines' debits equals the
 * sum of their credits. Journals are the only way money moves in the ledger —
 * operations (billing, pharmacy, payroll, banking) create them, either
 * automatically via posting rules or by hand from the back office.
 */
@Entity('journal_entries')
@Index(['facilityId', 'date'])
@Index(['facilityId', 'source', 'sourceId'])
export class JournalEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  /** Human-facing sequential number, unique per facility (e.g. JE-000123). */
  @Column({ name: 'entry_no', length: 30 })
  entryNo: string;

  /** Effective accounting date (may differ from createdAt). */
  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'text', nullable: true })
  memo: string | null;

  /** The module that produced the entry — 'manual', 'billing', 'pharmacy', … */
  @Column({ length: 40, default: 'manual' })
  source: string;

  /** Originating record type/id, so a journal can be traced back to its cause. */
  @Column({ name: 'source_type', type: 'varchar', length: 60, nullable: true })
  sourceType: string | null;

  @Column({ name: 'source_id', type: 'uuid', nullable: true })
  sourceId: string | null;

  @Column({ type: 'varchar', length: 10, default: 'posted' })
  status: JournalStatus;

  @Column({ name: 'posted_by_id', type: 'uuid', nullable: true })
  postedById: string | null;

  /** When voided, the journal that reverses this one (and vice versa). */
  @Column({ name: 'reversal_of_id', type: 'uuid', nullable: true })
  reversalOfId: string | null;

  @OneToMany(() => JournalLine, (line) => line.journalEntry, { cascade: true })
  lines: JournalLine[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
