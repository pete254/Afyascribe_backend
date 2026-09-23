import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ServiceDiscipline, ServiceOrderPriority, ServiceOrderStatus } from '../service-order.enums';

/** One recorded session of care against an order — therapies run in courses. */
export interface ServiceSession {
  at: string;
  byId: string | null;
  byName: string | null;
  notes: string;
  /** Charge raised for this session, where one was. */
  billingId?: string | null;
}

/**
 * A clinical service ordered for a patient — physiotherapy, occupational
 * therapy, nutrition, social work, counselling — and the work done against it.
 *
 * Unlike a lab test, these run as a course: one order, several sessions, each
 * recorded and each potentially billed.
 */
@Entity('clinical_service_orders')
@Index(['facilityId', 'discipline', 'status'])
@Index(['facilityId', 'patientId'])
export class ClinicalServiceOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  @Column({ name: 'patient_name', type: 'varchar', length: 200, nullable: true })
  patientName: string | null;

  @Column({ name: 'visit_id', type: 'uuid', nullable: true })
  visitId: string | null;

  @Column({ type: 'varchar', length: 40 })
  discipline: ServiceDiscipline;

  /** The catalogue service this was ordered as, where one was picked. */
  @Column({ name: 'service_id', type: 'uuid', nullable: true })
  serviceId: string | null;

  @Column({ name: 'service_name', type: 'varchar', length: 200, nullable: true })
  serviceName: string | null;

  /** WHO ICHI code via KNHTS, carried from the catalogue item. */
  @Column({ name: 'knhts_code', type: 'varchar', length: 64, nullable: true })
  knhtsCode: string | null;

  /** Why it was ordered — the clinical indication. */
  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', length: 20, default: 'routine' })
  priority: ServiceOrderPriority;

  @Column({ type: 'varchar', length: 20, default: 'requested' })
  status: ServiceOrderStatus;

  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt: Date | null;

  /** How many sessions the order is for, where the clinician said. */
  @Column({ name: 'sessions_planned', type: 'int', nullable: true })
  sessionsPlanned: number | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  sessions: ServiceSession[];

  /** The department's conclusion when the course is finished. */
  @Column({ type: 'text', nullable: true })
  outcome: string | null;

  @Column({ name: 'ordered_by_id', type: 'uuid', nullable: true })
  orderedById: string | null;

  @Column({ name: 'ordered_by_name', type: 'varchar', length: 200, nullable: true })
  orderedByName: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  /** Charge for the order itself; per-session charges live on the session. */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  price: string | null;

  @Column({ name: 'billing_id', type: 'uuid', nullable: true })
  billingId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
