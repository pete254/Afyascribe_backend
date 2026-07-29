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

  @Column({ type: 'numeric', precision: 14, scale: 3 })
  quantity: string;

  @Column({ name: 'estimated_unit_price', type: 'numeric', precision: 14, scale: 2, default: 0 })
  estimatedUnitPrice: string;

  @Column({ type: 'varchar', nullable: true })
  purpose: string | null;
}
