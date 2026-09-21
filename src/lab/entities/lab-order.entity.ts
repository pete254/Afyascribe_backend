import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { LabOrderItem } from './lab-order-item.entity';

/** Lab statuses, shared by an order and its individual test items. */
/**
 * Lab workflow stages, in lab vocabulary and mapped to the FHIR statuses the
 * Kenya Core IG expects:
 *   requested       — awaiting sample      (ServiceRequest active, Task requested)
 *   in_lab          — collected, being run (Specimen available, Task in-progress)
 *   awaiting_review — results entered      (DiagnosticReport preliminary)
 *   released        — authorised, final    (DiagnosticReport final / amended)
 * A rejected sample goes back to `requested` with the rejection kept on the item.
 */
export type LabStatus = 'requested' | 'in_lab' | 'awaiting_review' | 'released' | 'cancelled';

/**
 * A request for one or more lab tests for a patient, usually raised from a
 * consultation. Each test moves through its own stage; the order's status is the
 * least-advanced stage among its active items.
 */
@Entity('lab_orders')
@Index(['facilityId', 'status'])
@Index(['facilityId', 'patientId'])
export class LabOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'order_no', type: 'varchar', length: 30 })
  orderNo: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  @Column({ name: 'patient_name', nullable: true })
  patientName: string | null;

  @Column({ name: 'patient_no', type: 'varchar', nullable: true })
  patientNo: string | null;

  @Column({ name: 'visit_id', type: 'uuid', nullable: true })
  visitId: string | null;

  @Column({ name: 'ordered_by_id', type: 'uuid', nullable: true })
  orderedById: string | null;

  @Column({ name: 'ordered_by_name', nullable: true })
  orderedByName: string | null;

  @Column({ type: 'varchar', length: 20, default: 'routine' })
  priority: string;

  @Column({ name: 'clinical_notes', type: 'text', nullable: true })
  clinicalNotes: string | null;

  @Column({ type: 'varchar', length: 20, default: 'requested' })
  status: LabStatus;

  @OneToMany(() => LabOrderItem, (i) => i.order, { cascade: true, eager: true })
  items: LabOrderItem[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
