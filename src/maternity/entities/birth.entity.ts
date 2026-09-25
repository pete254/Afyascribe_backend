import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BirthOutcome, DischargeStatus } from '../maternity.enums';

/**
 * One baby — the newborn half of MOH 333.
 *
 * Separate from the delivery so twins are both recorded, and so a stillbirth
 * carries its own outcome rather than being inferred from the mother's row.
 */
@Entity('births')
@Index(['facilityId', 'deliveryId'])
@Index(['facilityId', 'bornAt'])
export class Birth {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'delivery_id', type: 'uuid' })
  deliveryId: string;

  @Column({ name: 'pregnancy_id', type: 'uuid' })
  pregnancyId: string;

  /** The mother, so a baby can be found from her record. */
  @Column({ name: 'mother_patient_id', type: 'uuid' })
  motherPatientId: string;

  /** The baby's own patient record, once one is created. */
  @Column({ name: 'baby_patient_id', type: 'uuid', nullable: true })
  babyPatientId: string | null;

  /** First, second… for a multiple birth. */
  @Column({ name: 'birth_order', type: 'int', default: 1 })
  birthOrder: number;

  @Column({ name: 'born_at', type: 'timestamp with time zone', nullable: true })
  bornAt: Date | null;

  @Column({ type: 'varchar', length: 30 })
  outcome: BirthOutcome;

  @Column({ type: 'varchar', length: 20, nullable: true })
  sex: string | null;

  @Column({ name: 'birth_weight_grams', type: 'int', nullable: true })
  birthWeightGrams: number | null;

  /** MOH 333 records the one-minute score; the others are kept where taken. */
  @Column({ name: 'apgar_1', type: 'int', nullable: true })
  apgar1: number | null;

  @Column({ name: 'apgar_5', type: 'int', nullable: true })
  apgar5: number | null;

  @Column({ name: 'apgar_10', type: 'int', nullable: true })
  apgar10: number | null;

  @Column({ name: 'resuscitated', type: 'boolean', default: false })
  resuscitated: boolean;

  /** Skin-to-skin and a feed within the first hour. */
  @Column({ name: 'breastfed_within_hour', type: 'boolean', nullable: true })
  breastfedWithinHour: boolean | null;

  @Column({ name: 'chlorhexidine_cord_care', type: 'boolean', default: false })
  chlorhexidineCordCare: boolean;

  @Column({ name: 'vitamin_k_given', type: 'boolean', default: false })
  vitaminKGiven: boolean;

  @Column({ name: 'eye_prophylaxis_given', type: 'boolean', default: false })
  eyeProphylaxisGiven: boolean;

  @Column({ name: 'congenital_anomaly', type: 'varchar', length: 300, nullable: true })
  congenitalAnomaly: string | null;

  /** Where the baby had got to when the record was closed. */
  @Column({ name: 'discharge_status', type: 'varchar', length: 20, nullable: true })
  dischargeStatus: DischargeStatus | null;

  @Column({ name: 'discharged_at', type: 'timestamp with time zone', nullable: true })
  dischargedAt: Date | null;

  /** Where the baby was sent, which the register is known to lose. */
  @Column({ name: 'referred_to', type: 'varchar', length: 200, nullable: true })
  referredTo: string | null;

  @Column({ name: 'birth_notified', type: 'boolean', default: false })
  birthNotified: boolean;

  @Column({ name: 'birth_notification_no', type: 'varchar', length: 60, nullable: true })
  birthNotificationNo: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
