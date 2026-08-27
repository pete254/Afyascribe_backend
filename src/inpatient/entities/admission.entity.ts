import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * An inpatient admission — from admission to discharge. Feeds the daily bed
 * return (MOH 328) and the inpatient section of the workload report (MOH 717).
 */
@Entity('admissions')
@Index(['facilityId', 'status'])
@Index(['facilityId', 'patientId'])
export class Admission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'admission_no', type: 'varchar', length: 30, nullable: true })
  admissionNo: string | null;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  @Column({ name: 'ward_id', type: 'uuid' })
  wardId: string;

  @Column({ name: 'bed_id', type: 'uuid', nullable: true })
  bedId: string | null;

  @Column({ name: 'visit_id', type: 'uuid', nullable: true })
  visitId: string | null;

  @Column({ name: 'admitted_at', type: 'timestamptz' })
  admittedAt: Date;

  @Column({ name: 'admitted_by_id', type: 'uuid', nullable: true })
  admittedById: string | null;

  @Column({ name: 'admission_diagnosis', type: 'text', nullable: true })
  admissionDiagnosis: string | null;

  // ── Running bill / deposit ─────────────────────────────────────────────────
  /** Total deposit money collected up front for this admission. */
  @Column({ name: 'deposit_paid', type: 'numeric', precision: 14, scale: 2, default: 0 })
  depositPaid: string;

  /**
   * Remaining prepaid deposit credit. Charges (bed, meds, services) draw this
   * down as they land; once it hits zero, further charges are unpaid and must be
   * settled before the patient is discharged.
   */
  @Column({ name: 'deposit_balance', type: 'numeric', precision: 14, scale: 2, default: 0 })
  depositBalance: string;

  /**
   * The last night (date) for which the daily bed fee has been accrued. Bed
   * charges are materialised lazily up to today, so this marks how far we've got.
   */
  @Column({ name: 'bed_charged_through', type: 'date', nullable: true })
  bedChargedThrough: string | null;

  // admitted | discharged
  @Column({ type: 'varchar', length: 20, default: 'admitted' })
  status: string;

  @Column({ name: 'discharged_at', type: 'timestamptz', nullable: true })
  dischargedAt: Date | null;

  // discharged | referred | deceased | absconded
  @Column({ type: 'varchar', length: 20, nullable: true })
  outcome: string | null;

  @Column({ name: 'discharge_notes', type: 'text', nullable: true })
  dischargeNotes: string | null;

  // ── Discharge summary (structured) ─────────────────────────────────────────
  /** Final/discharge diagnosis. */
  @Column({ name: 'discharge_diagnosis', type: 'text', nullable: true })
  dischargeDiagnosis: string | null;

  /** Narrative of the patient's course/progress during the stay. */
  @Column({ name: 'course_in_hospital', type: 'text', nullable: true })
  courseInHospital: string | null;

  /** Condition at discharge (e.g. stable, improved). */
  @Column({ name: 'condition_at_discharge', type: 'varchar', length: 120, nullable: true })
  conditionAtDischarge: string | null;

  /** Take-home / discharge medications, free text. */
  @Column({ name: 'discharge_medications', type: 'text', nullable: true })
  dischargeMedications: string | null;

  /** Follow-up instructions and plan. */
  @Column({ name: 'follow_up_plan', type: 'text', nullable: true })
  followUpPlan: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
