import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { GoodsReceiptLine } from './goods-receipt-line.entity';

/**
 * A Goods Received Note (GRN): stock arriving from a supplier. Receiving raises
 * inventory and creates the payable — Dr Inventory (per line), Cr Accounts
 * Payable (supplier) — and pushes a receipt movement onto each item's ledger.
 */
@Entity('goods_receipts')
@Index(['facilityId', 'date'])
export class GoodsReceipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'grn_no', type: 'varchar', length: 30 })
  grnNo: string;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId: string;

  /** The LPO this receipt fulfils, if received against one. */
  @Column({ name: 'purchase_order_id', type: 'uuid', nullable: true })
  purchaseOrderId: string | null;

  @Column({ type: 'date' })
  date: string;

  /** Supplier invoice / delivery note reference. */
  @Column({ type: 'varchar', nullable: true })
  reference: string | null;

  @Column({ name: 'total_value', type: 'numeric', precision: 14, scale: 2, default: 0 })
  totalValue: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true })
  journalEntryId: string | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @OneToMany(() => GoodsReceiptLine, (l) => l.goodsReceipt, { cascade: true })
  lines: GoodsReceiptLine[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
