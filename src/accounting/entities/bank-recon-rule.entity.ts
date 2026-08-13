import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * A learned categorisation rule for bank reconciliation: when a statement line's
 * description matches `pattern`, suggest posting it to `accountCode`. Rules are
 * per-facility and editable; higher `priority` wins. Applied client-side when the
 * accountant books an unmatched statement line.
 */
@Entity('bank_recon_rules')
@Index(['facilityId'])
export class BankReconRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  /** Text to look for in the statement description. */
  @Column({ type: 'varchar', length: 200 })
  pattern: string;

  /** When true, `pattern` is treated as a regular expression rather than a substring. */
  @Column({ name: 'is_regex', type: 'boolean', default: false })
  isRegex: boolean;

  @Column({ name: 'account_code', length: 20 })
  accountCode: string;

  @Column({ name: 'account_name', length: 120, nullable: true })
  accountName: string | null;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
