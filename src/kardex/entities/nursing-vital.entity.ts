import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * A single set of bedside observations (vitals) taken for an admitted patient.
 * Part of the nursing kardex — charted round by round alongside the medication
 * record. Every reading is optional so a nurse can record just what they took.
 */
@Entity('nursing_vitals')
@Index(['facilityId', 'admissionId'])
@Index(['facilityId', 'patientId'])
export class NursingVital {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  @Column({ name: 'admission_id', type: 'uuid', nullable: true })
  admissionId: string | null;

  /** °C */
  @Column({ type: 'numeric', precision: 4, scale: 1, nullable: true })
  temperature: string | null;

  /** beats / min */
  @Column({ type: 'int', nullable: true })
  pulse: number | null;

  /** breaths / min */
  @Column({ name: 'resp_rate', type: 'int', nullable: true })
  respRate: number | null;

  @Column({ name: 'bp_systolic', type: 'int', nullable: true })
  bpSystolic: number | null;

  @Column({ name: 'bp_diastolic', type: 'int', nullable: true })
  bpDiastolic: number | null;

  /** SpO₂ % */
  @Column({ type: 'int', nullable: true })
  spo2: number | null;

  /** kg */
  @Column({ name: 'weight_kg', type: 'numeric', precision: 5, scale: 1, nullable: true })
  weightKg: string | null;

  /** mmol/L (RBS) */
  @Column({ name: 'blood_glucose', type: 'numeric', precision: 5, scale: 1, nullable: true })
  bloodGlucose: string | null;

  /** 0–10 pain score */
  @Column({ name: 'pain_score', type: 'int', nullable: true })
  painScore: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'recorded_at', type: 'timestamptz' })
  recordedAt: Date;

  @Column({ name: 'recorded_by_id', type: 'uuid', nullable: true })
  recordedById: string | null;

  @Column({ name: 'recorded_by_name', nullable: true })
  recordedByName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
