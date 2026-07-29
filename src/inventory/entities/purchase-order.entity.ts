import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { PurchaseOrderLine } from './purchase-order-line.entity';

export type PurchaseOrderStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'received'
  | 'cancelled';

/**
 * A Local Purchase Order (LPO): a formal order raised to a supplier. It carries
 * an approval workflow — an LPO raised by someone without purchasing authority
 * waits at `pending_approval` until an owner/admin (or an accountant the owner
 * has authorised) approves it. Approving does not touch the ledger; receiving
 * against it (a goods receipt) does.
 */
@Entity('purchase_orders')
@Index(['facilityId', 'status'])
export class PurchaseOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'lpo_no', type: 'varchar', length: 30 })
  lpoNo: string;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'expected_date', type: 'date', nullable: true })
  expectedDate: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending_approval' })
  status: PurchaseOrderStatus;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  subtotal: string;

  @Column({ name: 'tax_rate', type: 'numeric', precision: 5, scale: 2, default: 0 })
  taxRate: string;

  @Column({ name: 'tax_amount', type: 'numeric', precision: 14, scale: 2, default: 0 })
  taxAmount: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  total: string;

  @Column({ name: 'delivery_address', type: 'text', nullable: true })
  deliveryAddress: string | null;

  @Column({ type: 'text', nullable: true })
  terms: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @Column({ name: 'created_by_name', type: 'varchar', nullable: true })
  createdByName: string | null;

  @Column({ name: 'approved_by_id', type: 'uuid', nullable: true })
  approvedById: string | null;

  @Column({ name: 'approved_by_name', type: 'varchar', nullable: true })
  approvedByName: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'decision_note', type: 'text', nullable: true })
  decisionNote: string | null;

  /** The requisition this LPO was raised from, if any (procure-to-pay trace). */
  @Column({ name: 'purchase_requisition_id', type: 'uuid', nullable: true })
  purchaseRequisitionId: string | null;

  /** Set once goods have been received against this LPO. */
  @Column({ name: 'goods_receipt_id', type: 'uuid', nullable: true })
  goodsReceiptId: string | null;

  @OneToMany(() => PurchaseOrderLine, (l) => l.purchaseOrder, { cascade: true })
  lines: PurchaseOrderLine[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
