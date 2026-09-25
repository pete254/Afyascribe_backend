import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One column of the labour chart — everything observed at a single time.
 *
 * Stored once and rendered two ways: the WHO Labour Care Guide, which is what
 * the system alerts on, and the classic partograph for staff who want the
 * familiar chart. The observations are the same either way; only the drawing
 * and the decision rule differ.
 */
@Entity('labour_observations')
@Index(['facilityId', 'deliveryId'])
export class LabourObservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'delivery_id', type: 'uuid' })
  deliveryId: string;

  @Column({ name: 'observed_at', type: 'timestamp with time zone' })
  observedAt: Date;

  // Supportive care — the guide asks after these at every column.
  @Column({ type: 'varchar', length: 4, nullable: true })
  companion: string | null;

  @Column({ name: 'pain_relief', type: 'varchar', length: 4, nullable: true })
  painRelief: string | null;

  @Column({ name: 'oral_fluid', type: 'varchar', length: 4, nullable: true })
  oralFluid: string | null;

  @Column({ type: 'varchar', length: 4, nullable: true })
  posture: string | null;

  // The baby.
  @Column({ name: 'baseline_fhr', type: 'int', nullable: true })
  baselineFhr: number | null;

  @Column({ name: 'fhr_deceleration', type: 'varchar', length: 4, nullable: true })
  fhrDeceleration: string | null;

  @Column({ name: 'amniotic_fluid', type: 'varchar', length: 6, nullable: true })
  amnioticFluid: string | null;

  @Column({ name: 'fetal_position', type: 'varchar', length: 4, nullable: true })
  fetalPosition: string | null;

  @Column({ type: 'varchar', length: 4, nullable: true })
  caput: string | null;

  @Column({ type: 'varchar', length: 4, nullable: true })
  moulding: string | null;

  // The woman.
  @Column({ type: 'int', nullable: true })
  pulse: number | null;

  @Column({ type: 'int', nullable: true })
  systolic: number | null;

  @Column({ type: 'int', nullable: true })
  diastolic: number | null;

  @Column({ type: 'numeric', precision: 4, scale: 1, nullable: true })
  temperature: string | null;

  @Column({ type: 'varchar', length: 6, nullable: true })
  urine: string | null;

  // Labour progress.
  @Column({ name: 'contractions_per_10', type: 'int', nullable: true })
  contractionsPer10: number | null;

  @Column({ name: 'contraction_duration', type: 'int', nullable: true })
  contractionDuration: number | null;

  /** Cervical dilatation in centimetres. */
  @Column({ type: 'numeric', precision: 3, scale: 1, nullable: true })
  cervix: string | null;

  /** Descent in fifths palpable above the brim. */
  @Column({ type: 'int', nullable: true })
  descent: number | null;

  // Medication.
  @Column({ type: 'varchar', length: 100, nullable: true })
  oxytocin: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  medicine: string | null;

  @Column({ name: 'iv_fluids', type: 'varchar', length: 200, nullable: true })
  ivFluids: string | null;

  // Shared decision-making — the guide's own two rows.
  @Column({ type: 'text', nullable: true })
  assessment: string | null;

  @Column({ type: 'text', nullable: true })
  plan: string | null;

  /**
   * Which rows met an alert criterion when this was recorded, kept as written
   * so the chart still shows what was flagged at the time even if the
   * thresholds are ever revised.
   */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  alerts: string[];

  @Column({ name: 'recorded_by_id', type: 'uuid', nullable: true })
  recordedById: string | null;

  @Column({ name: 'recorded_by_name', type: 'varchar', length: 200, nullable: true })
  recordedByName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
