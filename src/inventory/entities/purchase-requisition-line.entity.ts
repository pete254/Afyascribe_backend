import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PurchaseRequisition } from './purchase-requisition.entity';

@Entity('purchase_requisition_lines')
export class PurchaseRequisitionLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'requisition_id', type: 'uuid' })
  requisitionId: string;

  @ManyToOne(() => PurchaseRequisition, (p) => p.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requisition_id' })
  requisition: PurchaseRequisition;

  @Column({ name: 'item_id', type: 'uuid', nullable: true })
  itemId: string | null;

  @Column()
  description: string;

  /** Stock category (drug, reagent…) — carried to auto-create the item on receipt. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  category: string | null;

  /** Unit of issue (unit, box, ml…) — carried onto the item created on receipt. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  unit: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 3 })
  quantity: string;

  @Column({ name: 'estimated_unit_price', type: 'numeric', precision: 14, scale: 2, default: 0 })
  estimatedUnitPrice: string;

  @Column({ type: 'varchar', nullable: true })
  purpose: string | null;
}
