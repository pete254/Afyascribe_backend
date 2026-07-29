import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type AccountType =
  | 'asset'
  | 'liability'
  | 'equity'
  | 'revenue'
  | 'cost_of_sales'
  | 'operating_expense'
  | 'other_income'
  | 'other_expense';

export type NormalBalance = 'debit' | 'credit';

/**
 * One line in a facility's Chart of Accounts. Header accounts (code ending in
 * 000) roll up their children and are not postable; leaf accounts are where
 * journal lines actually land. Each facility owns its own copy of the chart, so
 * accounts are scoped by facilityId and unique on (facilityId, code).
 */
@Entity('ledger_accounts')
@Index(['facilityId', 'code'], { unique: true })
export class LedgerAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ length: 20 })
  code: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', length: 30 })
  type: AccountType;

  @Column({ name: 'normal_balance', type: 'varchar', length: 6 })
  normalBalance: NormalBalance;

  /** Parent account code for the rollup tree (null for the top-level roots). */
  @Column({ name: 'parent_code', type: 'varchar', length: 20, nullable: true })
  parentCode: string | null;

  /** Leaf accounts are postable; header/rollup accounts are not. */
  @Column({ name: 'is_postable', type: 'boolean', default: true })
  isPostable: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /** Marks the standard seeded accounts, so custom ones can be told apart. */
  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem: boolean;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
