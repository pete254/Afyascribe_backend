import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { QuotationLine } from './quotation-line.entity';

export type QuotationStatus = 'received' | 'selected' | 'rejected';

/**
 * A supplier's quotation in response to a request. Several may be recorded
 * against one requisition and compared; the chosen one is marked `selected`,
 * and an LPO is raised from it. Purely commercial — it touches no ledger.
 */
@Entity('quotations')
@Index(['facilityId', 'purchaseRequisitionId'])
export class Quotation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'quote_no', type: 'varchar', length: 30 })
  quoteNo: string;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId: string;

  @Column({ name: 'purchase_requisition_id', type: 'uuid', nullable: true })
  purchaseRequisitionId: string | null;

  /** The supplier's own quote reference, if they gave one. */
  @Column({ name: 'supplier_ref', type: 'varchar', nullable: true })
  supplierRef: string | null;

  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'valid_until', type: 'date', nullable: true })
  validUntil: string | null;

  @Column({ type: 'varchar', length: 12, default: 'received' })
  status: QuotationStatus;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  subtotal: string;

  @Column({ name: 'tax_rate', type: 'numeric', precision: 5, scale: 2, default: 0 })
  taxRate: string;

  @Column({ name: 'tax_amount', type: 'numeric', precision: 14, scale: 2, default: 0 })
  taxAmount: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  total: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @OneToMany(() => QuotationLine, (l) => l.quotation, { cascade: true })
  lines: QuotationLine[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
