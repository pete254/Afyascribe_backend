import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { PurchaseRequisitionLine } from './purchase-requisition-line.entity';

export type RequisitionStatus = 'pending_approval' | 'approved' | 'rejected' | 'cancelled';

/**
 * A Purchase Requisition (PR): an internal request from a department for items
 * to be bought. It is the front of the procure-to-pay chain — once approved, a
 * buyer raises one or more LPOs from it. Purely internal, so it touches no
 * ledger; it carries the same approval workflow as an LPO.
 */
@Entity('purchase_requisitions')
@Index(['facilityId', 'status'])
export class PurchaseRequisition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'pr_no', type: 'varchar', length: 30 })
  prNo: string;

  @Column({ type: 'varchar', nullable: true })
  department: string | null;

  @Column({ name: 'requested_by_name', type: 'varchar', nullable: true })
  requestedByName: string | null;

  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'needed_by', type: 'date', nullable: true })
  neededBy: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending_approval' })
  status: RequisitionStatus;

  @Column({ name: 'estimated_total', type: 'numeric', precision: 14, scale: 2, default: 0 })
  estimatedTotal: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @Column({ name: 'approved_by_id', type: 'uuid', nullable: true })
  approvedById: string | null;

  @Column({ name: 'approved_by_name', type: 'varchar', nullable: true })
  approvedByName: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'decision_note', type: 'text', nullable: true })
  decisionNote: string | null;

  @OneToMany(() => PurchaseRequisitionLine, (l) => l.requisition, { cascade: true })
  lines: PurchaseRequisitionLine[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
