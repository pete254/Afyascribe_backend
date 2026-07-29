import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type SupplierInvoiceStatus = 'unpaid' | 'partpaid' | 'paid';

/**
 * A supplier's invoice, recorded for verification (3-way match against the LPO
 * and the goods receipt) before payment. It does not post to the ledger — the
 * goods receipt already raised the payable — it tracks the bill and how much of
 * it has been paid.
 */
@Entity('supplier_invoices')
@Index(['facilityId', 'supplierId'])
export class SupplierInvoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'invoice_no', type: 'varchar', length: 30 })
  invoiceNo: string;

  /** The number printed on the supplier's own invoice. */
  @Column({ name: 'supplier_invoice_no', type: 'varchar', nullable: true })
  supplierInvoiceNo: string | null;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId: string;

  @Column({ name: 'purchase_order_id', type: 'uuid', nullable: true })
  purchaseOrderId: string | null;

  @Column({ name: 'goods_receipt_id', type: 'uuid', nullable: true })
  goodsReceiptId: string | null;

  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  total: string;

  @Column({ name: 'amount_paid', type: 'numeric', precision: 14, scale: 2, default: 0 })
  amountPaid: string;

  @Column({ type: 'varchar', length: 10, default: 'unpaid' })
  status: SupplierInvoiceStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
