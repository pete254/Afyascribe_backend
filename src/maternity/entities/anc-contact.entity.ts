import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DipstickResult, Presentation } from '../maternity.enums';

/**
 * One antenatal contact — a row of the ANC register.
 *
 * Gestation is stored as measured on the day rather than recomputed later: a
 * dating scan can revise the EDD afterwards, and the note should still say what
 * the clinician was working from at the time.
 */
@Entity('anc_contacts')
@Index(['facilityId', 'pregnancyId'])
@Index(['facilityId', 'contactDate'])
export class AncContact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'pregnancy_id', type: 'uuid' })
  pregnancyId: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  /** The visit this was recorded in, where it came off a clinic encounter. */
  @Column({ name: 'visit_id', type: 'uuid', nullable: true })
  visitId: string | null;

  /** Which of the eight contacts this is. */
  @Column({ name: 'contact_number', type: 'int' })
  contactNumber: number;

  @Column({ name: 'contact_date', type: 'date' })
  contactDate: string;

  @Column({ name: 'gestation_days', type: 'int', nullable: true })
  gestationDays: number | null;

  // --- maternal observations ---------------------------------------------

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  weight: string | null;

  @Column({ name: 'bp_systolic', type: 'int', nullable: true })
  bpSystolic: number | null;

  @Column({ name: 'bp_diastolic', type: 'int', nullable: true })
  bpDiastolic: number | null;

  @Column({ type: 'int', nullable: true })
  pulse: number | null;

  @Column({ type: 'numeric', precision: 4, scale: 1, nullable: true })
  temperature: string | null;

  /** Mid-upper arm circumference, the nutrition screen in pregnancy. */
  @Column({ type: 'numeric', precision: 4, scale: 1, nullable: true })
  muac: string | null;

  @Column({ type: 'numeric', precision: 4, scale: 1, nullable: true })
  hb: string | null;

  @Column({ name: 'urine_protein', type: 'varchar', length: 10, nullable: true })
  urineProtein: DipstickResult | null;

  @Column({ name: 'urine_sugar', type: 'varchar', length: 10, nullable: true })
  urineSugar: DipstickResult | null;

  // --- fetal observations -------------------------------------------------

  /** Symphysis–fundal height in centimetres. */
  @Column({ name: 'fundal_height', type: 'int', nullable: true })
  fundalHeight: number | null;

  @Column({ name: 'fetal_heart_rate', type: 'int', nullable: true })
  fetalHeartRate: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  presentation: Presentation | null;

  @Column({ name: 'fetal_movement', type: 'boolean', nullable: true })
  fetalMovement: boolean | null;

  // --- interventions given at this contact --------------------------------

  /** Iron and folic acid supplementation. */
  @Column({ name: 'ifas_given', type: 'boolean', default: false })
  ifasGiven: boolean;

  /** Intermittent preventive treatment for malaria in pregnancy; the dose number. */
  @Column({ name: 'iptp_dose', type: 'int', nullable: true })
  iptpDose: number | null;

  @Column({ name: 'deworming_given', type: 'boolean', default: false })
  dewormingGiven: boolean;

  /** A long-lasting insecticide-treated net. */
  @Column({ name: 'llin_given', type: 'boolean', default: false })
  llinGiven: boolean;

  /** Tetanus-diphtheria; the dose number, which also writes an immunisation row. */
  @Column({ name: 'td_dose', type: 'int', nullable: true })
  tdDose: number | null;

  /** Low-dose aspirin for pre-eclampsia prophylaxis. */
  @Column({ name: 'aspirin_given', type: 'boolean', default: false })
  aspirinGiven: boolean;

  @Column({ name: 'calcium_given', type: 'boolean', default: false })
  calciumGiven: boolean;

  // --- findings -----------------------------------------------------------

  @Column({ name: 'danger_signs', type: 'jsonb', default: () => "'[]'::jsonb" })
  dangerSigns: string[];

  @Column({ type: 'boolean', default: false })
  referred: boolean;

  @Column({ name: 'referred_to', type: 'varchar', length: 200, nullable: true })
  referredTo: string | null;

  @Column({ type: 'text', nullable: true })
  findings: string | null;

  @Column({ name: 'next_contact_date', type: 'date', nullable: true })
  nextContactDate: string | null;

  @Column({ name: 'recorded_by_id', type: 'uuid', nullable: true })
  recordedById: string | null;

  @Column({ name: 'recorded_by_name', type: 'varchar', length: 200, nullable: true })
  recordedByName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
