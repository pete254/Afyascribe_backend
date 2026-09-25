import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DeliveryMode, DischargeStatus, LabourOnset, PerineumState } from '../maternity.enums';

/**
 * One labour and delivery — the mother's half of MOH 333.
 *
 * Babies live in their own table: one labour can produce two, and a register
 * that assumes one would lose the second twin.
 */
@Entity('deliveries')
@Index(['facilityId', 'pregnancyId'])
@Index(['facilityId', 'deliveredAt'])
export class Delivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'pregnancy_id', type: 'uuid' })
  pregnancyId: string;

  /** The mother. */
  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  @Column({ name: 'visit_id', type: 'uuid', nullable: true })
  visitId: string | null;

  // ── Admission and labour ──────────────────────────────────────────────────

  @Column({ name: 'admitted_at', type: 'timestamp with time zone', nullable: true })
  admittedAt: Date | null;

  /** Whether she came in already referred, which MOH 333 asks for. */
  @Column({ name: 'referred_in', type: 'boolean', default: false })
  referredIn: boolean;

  @Column({ name: 'referred_from', type: 'varchar', length: 200, nullable: true })
  referredFrom: string | null;

  @Column({ name: 'labour_onset', type: 'varchar', length: 20, nullable: true })
  labourOnset: LabourOnset | null;

  @Column({ name: 'labour_onset_at', type: 'timestamp with time zone', nullable: true })
  labourOnsetAt: Date | null;

  /** When the active first stage was diagnosed — the guide's clock starts here. */
  @Column({ name: 'active_labour_at', type: 'timestamp with time zone', nullable: true })
  activeLabourAt: Date | null;

  @Column({ name: 'membranes_ruptured_at', type: 'timestamp with time zone', nullable: true })
  membranesRupturedAt: Date | null;

  /** Risk factors noted at admission, free text as the guide's header is. */
  @Column({ name: 'risk_factors', type: 'text', nullable: true })
  riskFactors: string | null;

  // ── The birth ─────────────────────────────────────────────────────────────

  @Column({ name: 'delivered_at', type: 'timestamp with time zone', nullable: true })
  deliveredAt: Date | null;

  @Column({ name: 'delivery_mode', type: 'varchar', length: 20, nullable: true })
  deliveryMode: DeliveryMode | null;

  /** Gestation at delivery, in completed weeks. */
  @Column({ name: 'gestation_weeks', type: 'int', nullable: true })
  gestationWeeks: number | null;

  @Column({ name: 'perineum', type: 'varchar', length: 20, nullable: true })
  perineum: PerineumState | null;

  @Column({ name: 'perineum_repaired', type: 'boolean', nullable: true })
  perineumRepaired: boolean | null;

  /** Oxytocin, cord traction and uterine massage — preventing haemorrhage. */
  @Column({ name: 'amtsl_given', type: 'boolean', default: false })
  amtslGiven: boolean;

  @Column({ name: 'blood_loss_ml', type: 'int', nullable: true })
  bloodLossMl: number | null;

  @Column({ name: 'placenta_complete', type: 'boolean', nullable: true })
  placentaComplete: boolean | null;

  /** Complications of labour or the third stage, by code. */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  complications: string[];

  @Column({ name: 'conducted_by_name', type: 'varchar', length: 200, nullable: true })
  conductedByName: string | null;

  // ── The mother afterwards ─────────────────────────────────────────────────

  @Column({ name: 'maternal_outcome', type: 'varchar', length: 20, nullable: true })
  maternalOutcome: DischargeStatus | null;

  @Column({ name: 'maternal_discharged_at', type: 'timestamp with time zone', nullable: true })
  maternalDischargedAt: Date | null;

  @Column({ name: 'maternal_death_cause', type: 'varchar', length: 300, nullable: true })
  maternalDeathCause: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'recorded_by_id', type: 'uuid', nullable: true })
  recordedById: string | null;

  @Column({ name: 'recorded_by_name', type: 'varchar', length: 200, nullable: true })
  recordedByName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
