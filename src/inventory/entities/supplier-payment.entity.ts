import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Money paid to a supplier against their payable. Posts Dr Accounts Payable,
 * Cr the bank/cash account it was paid from, and reduces the supplier balance.
 */
@Entity('supplier_payments')
@Index(['facilityId', 'date'])
export class SupplierPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'payment_no', type: 'varchar', length: 30 })
  paymentNo: string;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: string;

  /** cash | bank | mpesa */
  @Column({ type: 'varchar', length: 20, default: 'bank' })
  method: string;

  /** The COA account the money left from (e.g. 11003 Bank - Current). */
  @Column({ name: 'bank_account_code', type: 'varchar', length: 20, default: '11003' })
  bankAccountCode: string;

  @Column({ type: 'varchar', nullable: true })
  reference: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true })
  journalEntryId: string | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
