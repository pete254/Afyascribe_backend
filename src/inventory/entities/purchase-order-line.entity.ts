import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PurchaseOrder } from './purchase-order.entity';

/**
 * One ordered line. `itemId` is optional so an LPO can order things that aren't
 * tracked stock items (services, one-off supplies); `description` always holds
 * a human label for the document.
 */
@Entity('purchase_order_lines')
export class PurchaseOrderLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'purchase_order_id', type: 'uuid' })
  purchaseOrderId: string;

  @ManyToOne(() => PurchaseOrder, (p) => p.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'purchase_order_id' })
  purchaseOrder: PurchaseOrder;

  @Column({ name: 'item_id', type: 'uuid', nullable: true })
  itemId: string | null;

  @Column()
  description: string;

  /** Stock category (drug, reagent…) — used to auto-create the item on receipt. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  category: string | null;

  /** Unit of issue (unit, box, ml…) — carried onto the item created on receipt. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  unit: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 3 })
  quantity: string;

  /** How much of this line has been received so far (partial receipts accumulate). */
  @Column({ name: 'received_qty', type: 'numeric', precision: 14, scale: 3, default: 0 })
  receivedQty: string;

  @Column({ name: 'unit_price', type: 'numeric', precision: 14, scale: 2 })
  unitPrice: string;

  @Column({ name: 'line_total', type: 'numeric', precision: 14, scale: 2 })
  lineTotal: string;
}
