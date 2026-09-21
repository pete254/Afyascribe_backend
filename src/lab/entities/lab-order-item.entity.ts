import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { LabOrder, LabStatus } from './lab-order.entity';
import { LabResultValue } from './lab-result-value.entity';

/**
 * One test within an order, carrying its own stage through the workflow:
 * ordered → collected (phlebotomy) → in_progress → resulted → verified (posted).
 * Test name / specimen / price are snapshotted so history is stable even if the
 * catalog changes later.
 */
@Entity('lab_order_items')
export class LabOrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @ManyToOne(() => LabOrder, (o) => o.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: LabOrder;

  @Column({ name: 'lab_test_id', type: 'uuid' })
  labTestId: string;

  @Column({ name: 'test_name' })
  testName: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  specimen: string | null;

  @Column({ name: 'department', type: 'varchar', length: 40, nullable: true })
  department: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  price: string;

  /** The bill this test raised, when ordered against a visit. */
  @Column({ name: 'billing_id', type: 'uuid', nullable: true })
  billingId: string | null;

  @Column({ type: 'varchar', length: 20, default: 'requested' })
  status: LabStatus;

  // ── Sample collection (phlebotomy) ──────────────────────────────────────────
  @Column({ name: 'collected_by_id', type: 'uuid', nullable: true })
  collectedById: string | null;

  @Column({ name: 'collected_by_name', nullable: true })
  collectedByName: string | null;

  @Column({ name: 'collected_at', type: 'timestamptz', nullable: true })
  collectedAt: Date | null;

  @Column({ name: 'specimen_note', type: 'text', nullable: true })
  specimenNote: string | null;

  // ── Testing ─────────────────────────────────────────────────────────────────
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  // ── Result ──────────────────────────────────────────────────────────────────
  @Column({ name: 'result_note', type: 'text', nullable: true })
  resultNote: string | null;

  @Column({ name: 'resulted_by_id', type: 'uuid', nullable: true })
  resultedById: string | null;

  @Column({ name: 'resulted_by_name', nullable: true })
  resultedByName: string | null;

  @Column({ name: 'resulted_at', type: 'timestamptz', nullable: true })
  resultedAt: Date | null;

  @Column({ name: 'verified_by_id', type: 'uuid', nullable: true })
  verifiedById: string | null;

  @Column({ name: 'verified_by_name', nullable: true })
  verifiedByName: string | null;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  // ── Exceptions, kept for the record ──────────────────────────────────────────

  /** Every sample rejection (pre-analytical): the item goes back to `requested`. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  rejections: LabRejection[];

  /** Every amendment after release: the superseded result set and the reason. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  amendments: LabAmendment[];

  @Column({ name: 'amended_by_id', type: 'uuid', nullable: true })
  amendedById: string | null;

  @Column({ name: 'amended_by_name', nullable: true })
  amendedByName: string | null;

  @Column({ name: 'amended_at', type: 'timestamptz', nullable: true })
  amendedAt: Date | null;

  @OneToMany(() => LabResultValue, (v) => v.orderItem, { cascade: true, eager: true })
  results: LabResultValue[];
}

export interface LabRejection {
  at: string;
  byId: string | null;
  byName: string | null;
  reason: string;
  /** The collection being rejected. */
  collectedAt: string | null;
  collectedByName: string | null;
  specimenNote: string | null;
}

export interface LabAmendment {
  at: string;
  byId: string | null;
  byName: string | null;
  reason: string;
  /** The result set this amendment replaced. */
  previous: {
    resultNote: string | null;
    resultedAt: string | null;
    resultedByName: string | null;
    values: {
      analyteName: string;
      value: string | null;
      unit: string | null;
      flag: string | null;
      refLow: string | null;
      refHigh: string | null;
      refText: string | null;
    }[];
  };
}
