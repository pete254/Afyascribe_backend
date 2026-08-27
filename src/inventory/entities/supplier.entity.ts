import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * A goods/services supplier. `balance` is the running accounts-payable owed to
 * them, increased by goods receipts and reduced by payments — mirrored in the
 * ledger's payable account (default 21001 Trade Creditors).
 */
@Entity('suppliers')
@Index(['facilityId', 'name'])
export class Supplier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column()
  name: string;

  @Column({ name: 'contact_person', type: 'varchar', nullable: true })
  contactPerson: string | null;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ name: 'tax_pin', type: 'varchar', length: 40, nullable: true })
  taxPin: string | null;

  // ── Address ────────────────────────────────────────────────────────────────
  @Column({ name: 'physical_address', type: 'varchar', nullable: true })
  physicalAddress: string | null;

  @Column({ name: 'postal_address', type: 'varchar', nullable: true })
  postalAddress: string | null;

  // ── Bank details (for remittances) ──────────────────────────────────────────
  @Column({ name: 'bank_name', type: 'varchar', nullable: true })
  bankName: string | null;

  @Column({ name: 'bank_account', type: 'varchar', nullable: true })
  bankAccount: string | null;

  @Column({ name: 'bank_branch', type: 'varchar', nullable: true })
  bankBranch: string | null;

  @Column({ name: 'payable_account_code', type: 'varchar', length: 20, default: '21001' })
  payableAccountCode: string;

  /** Outstanding accounts-payable balance owed to this supplier. */
  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  balance: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
