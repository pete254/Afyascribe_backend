import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PncWindow } from '../data/schedules';
import { FeedingMethod, LochiaAmount, ScreenResult } from '../maternity.enums';

/**
 * One postnatal contact, covering the mother and the baby together.
 *
 * Kenya's guideline treats them as one visit — the mother is examined, the baby
 * is examined, both are asked after — so they are one row, with the baby's
 * fields left null where the contact was for the mother alone.
 */
@Entity('pnc_contacts')
@Index(['facilityId', 'pregnancyId'])
@Index(['facilityId', 'contactDate'])
export class PncContact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'pregnancy_id', type: 'uuid' })
  pregnancyId: string;

  /** The mother. */
  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  /** The baby, where the newborn has been registered as a patient. */
  @Column({ name: 'baby_patient_id', type: 'uuid', nullable: true })
  babyPatientId: string | null;

  @Column({ name: 'visit_id', type: 'uuid', nullable: true })
  visitId: string | null;

  /** Which of the four windows this contact falls in. */
  @Column({ name: 'pnc_window', type: 'varchar', length: 20 })
  window: PncWindow;

  @Column({ name: 'contact_date', type: 'date' })
  contactDate: string;

  @Column({ name: 'days_postpartum', type: 'int', nullable: true })
  daysPostpartum: number | null;

  // --- the mother ---------------------------------------------------------

  @Column({ name: 'bp_systolic', type: 'int', nullable: true })
  bpSystolic: number | null;

  @Column({ name: 'bp_diastolic', type: 'int', nullable: true })
  bpDiastolic: number | null;

  @Column({ type: 'int', nullable: true })
  pulse: number | null;

  @Column({ type: 'numeric', precision: 4, scale: 1, nullable: true })
  temperature: string | null;

  @Column({ type: 'numeric', precision: 4, scale: 1, nullable: true })
  hb: string | null;

  /** How far the uterus has contracted back, in centimetres below the umbilicus. */
  @Column({ name: 'uterine_involution', type: 'varchar', length: 100, nullable: true })
  uterineInvolution: string | null;

  @Column({ name: 'lochia_amount', type: 'varchar', length: 20, nullable: true })
  lochiaAmount: LochiaAmount | null;

  @Column({ name: 'lochia_offensive', type: 'boolean', nullable: true })
  lochiaOffensive: boolean | null;

  @Column({ name: 'breast_findings', type: 'varchar', length: 200, nullable: true })
  breastFindings: string | null;

  /** The perineum, or the caesarean incision, as found. */
  @Column({ name: 'perineum_findings', type: 'varchar', length: 200, nullable: true })
  perineumFindings: string | null;

  @Column({ name: 'maternal_danger_signs', type: 'jsonb', default: () => "'[]'::jsonb" })
  maternalDangerSigns: string[];

  // --- screens the guideline asks for at every contact --------------------

  /**
   * The two-question depression screen: low mood, and loss of interest. A yes
   * to either is a referral for full assessment, which is why both are kept.
   */
  @Column({ name: 'depression_q1', type: 'boolean', nullable: true })
  depressionQ1: boolean | null;

  @Column({ name: 'depression_q2', type: 'boolean', nullable: true })
  depressionQ2: boolean | null;

  @Column({ name: 'ipv_screen', type: 'varchar', length: 20, default: 'not-asked' })
  ipvScreen: ScreenResult;

  // --- counselling and offers ---------------------------------------------

  @Column({ name: 'fp_counselled', type: 'boolean', default: false })
  fpCounselled: boolean;

  /** The method she left with, where she took one. */
  @Column({ name: 'fp_method', type: 'varchar', length: 100, nullable: true })
  fpMethod: string | null;

  @Column({ name: 'cervical_screening_offered', type: 'boolean', default: false })
  cervicalScreeningOffered: boolean;

  @Column({ name: 'vitamin_a_given', type: 'boolean', default: false })
  vitaminAGiven: boolean;

  // --- the baby -----------------------------------------------------------

  @Column({ name: 'baby_weight', type: 'numeric', precision: 5, scale: 3, nullable: true })
  babyWeight: string | null;

  @Column({ name: 'baby_temperature', type: 'numeric', precision: 4, scale: 1, nullable: true })
  babyTemperature: string | null;

  @Column({ name: 'cord_condition', type: 'varchar', length: 100, nullable: true })
  cordCondition: string | null;

  @Column({ name: 'feeding_method', type: 'varchar', length: 30, nullable: true })
  feedingMethod: FeedingMethod | null;

  @Column({ name: 'baby_danger_signs', type: 'jsonb', default: () => "'[]'::jsonb" })
  babyDangerSigns: string[];

  @Column({ name: 'immunisation_up_to_date', type: 'boolean', nullable: true })
  immunisationUpToDate: boolean | null;

  @Column({ name: 'birth_notified', type: 'boolean', default: false })
  birthNotified: boolean;

  // --- disposal -----------------------------------------------------------

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
