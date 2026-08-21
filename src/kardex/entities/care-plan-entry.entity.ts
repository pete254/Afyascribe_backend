import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * One line of a patient's nursing care plan: an identified problem/need, the
 * goal, the planned nursing intervention and an evaluation. Charted at the top
 * of the kardex so the ward round works problem → plan → drugs → vitals.
 */
@Entity('care_plan_entries')
@Index(['facilityId', 'admissionId'])
@Index(['facilityId', 'patientId'])
export class CarePlanEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  @Column({ name: 'admission_id', type: 'uuid', nullable: true })
  admissionId: string | null;

  /** The nursing problem / diagnosis / need. */
  @Column({ type: 'text' })
  problem: string;

  /** The goal / expected outcome. */
  @Column({ type: 'text', nullable: true })
  goal: string | null;

  /** The planned nursing intervention. */
  @Column({ type: 'text', nullable: true })
  intervention: string | null;

  /** Evaluation of the outcome, filled as care progresses. */
  @Column({ type: 'text', nullable: true })
  evaluation: string | null;

  // active | resolved
  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: string;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @Column({ name: 'created_by_name', nullable: true })
  createdByName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
