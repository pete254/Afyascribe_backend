import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import {
  ProblemCategory,
  ProblemSeverity,
  ProblemStatus,
  ProblemVerification,
} from '../problem.enums';

/** An append-only note of what changed, so the problem history is auditable. */
export interface ProblemRevision {
  at: string;
  byId: string | null;
  byName: string | null;
  from: ProblemStatus;
  to: ProblemStatus;
  reason: string | null;
}

/**
 * One condition on a patient's problem list, coded to ICD-11 via KNHTS.
 *
 * Problems are updated rather than replaced: resolving one keeps it on the
 * record with the date it resolved and who resolved it, because a condition
 * that is no longer active is still part of the patient's history.
 */
@Entity('patient_problems')
@Index(['facilityId', 'patientId', 'status'])
export class PatientProblem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  /** ICD-11 code (WHO/ICD-11 via KNHTS). */
  @Column({ type: 'varchar', length: 32, nullable: true })
  code: string | null;

  @Column({ type: 'varchar', length: 40, default: 'ICD-11' })
  system: string;

  /** The condition as it reads on the chart. */
  @Column({ type: 'varchar', length: 300 })
  display: string;

  @Column({ type: 'varchar', length: 24, default: 'active' })
  status: ProblemStatus;

  @Column({ name: 'verification_status', type: 'varchar', length: 24, default: 'confirmed' })
  verificationStatus: ProblemVerification;

  @Column({ type: 'varchar', length: 24, default: 'problem-list-item' })
  category: ProblemCategory;

  @Column({ type: 'varchar', length: 16, nullable: true })
  severity: ProblemSeverity | null;

  @Column({ name: 'onset_date', type: 'date', nullable: true })
  onsetDate: string | null;

  /** When it resolved — FHIR abatement. */
  @Column({ name: 'abatement_date', type: 'date', nullable: true })
  abatementDate: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  /** The consultation this first came from, where it came from one. */
  @Column({ name: 'source_note_id', type: 'uuid', nullable: true })
  sourceNoteId: string | null;

  @Column({ name: 'recorded_by_id', type: 'uuid', nullable: true })
  recordedById: string | null;

  @Column({ name: 'recorded_by_name', type: 'varchar', length: 200, nullable: true })
  recordedByName: string | null;

  /** Status changes, kept as the problem's history. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  revisions: ProblemRevision[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
