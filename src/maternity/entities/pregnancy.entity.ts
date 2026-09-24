import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BloodGroup, ReactiveResult } from '../data/profile';
import { DeliveryMode, PregnancyOutcome, PregnancyStatus } from '../maternity.enums';

/**
 * One pregnancy, from booking to outcome.
 *
 * This is the spine of maternity care: antenatal contacts and postnatal
 * contacts both hang off it, so a woman's second pregnancy does not inherit the
 * first one's dates, results or missed visits.
 */
@Entity('pregnancies')
@Index(['facilityId', 'patientId'])
@Index(['facilityId', 'status'])
export class Pregnancy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  /** The ANC clinic number, YYYY-MM-NNNN, assigned at the first contact. */
  @Column({ name: 'anc_number', type: 'varchar', length: 30, nullable: true })
  ancNumber: string | null;

  // --- dating -------------------------------------------------------------

  @Column({ type: 'date', nullable: true })
  lmp: string | null;

  /** Where an EDD was given directly rather than derived from a period. */
  @Column({ name: 'edd_entered', type: 'date', nullable: true })
  eddEntered: string | null;

  @Column({ name: 'ultrasound_date', type: 'date', nullable: true })
  ultrasoundDate: string | null;

  /** The gestation the scan showed, in days, on the day it was done. */
  @Column({ name: 'ultrasound_ga_days', type: 'int', nullable: true })
  ultrasoundGaDays: number | null;

  // --- obstetric history --------------------------------------------------

  /** Pregnancies including this one. */
  @Column({ type: 'int', nullable: true })
  gravida: number | null;

  /** Births after 28 weeks. */
  @Column({ type: 'int', nullable: true })
  para: number | null;

  @Column({ name: 'living_children', type: 'int', nullable: true })
  livingChildren: number | null;

  /** Risk factors elicited at booking, by code from the danger-sign list. */
  @Column({ name: 'risk_factors', type: 'jsonb', default: () => "'[]'::jsonb" })
  riskFactors: string[];

  // --- the antenatal profile, one result per test per pregnancy -----------

  @Column({ name: 'profile_hb', type: 'numeric', precision: 4, scale: 1, nullable: true })
  profileHb: string | null;

  @Column({ name: 'profile_blood_group', type: 'varchar', length: 4, nullable: true })
  profileBloodGroup: BloodGroup | null;

  @Column({ name: 'profile_urinalysis', type: 'varchar', length: 200, nullable: true })
  profileUrinalysis: string | null;

  @Column({ name: 'profile_rbs', type: 'numeric', precision: 5, scale: 1, nullable: true })
  profileRbs: string | null;

  @Column({ name: 'profile_syphilis', type: 'varchar', length: 20, nullable: true })
  profileSyphilis: ReactiveResult | null;

  @Column({ name: 'profile_hep_b', type: 'varchar', length: 20, nullable: true })
  profileHepB: ReactiveResult | null;

  @Column({ name: 'profile_hiv', type: 'varchar', length: 20, nullable: true })
  profileHiv: ReactiveResult | null;

  @Column({ name: 'profile_tb', type: 'varchar', length: 20, nullable: true })
  profileTb: ReactiveResult | null;

  @Column({ name: 'profile_date', type: 'date', nullable: true })
  profileDate: string | null;

  // --- outcome ------------------------------------------------------------

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: PregnancyStatus;

  @Column({ type: 'varchar', length: 30, nullable: true })
  outcome: PregnancyOutcome | null;

  /** The date the pregnancy ended, however it ended. */
  @Column({ name: 'outcome_date', type: 'date', nullable: true })
  outcomeDate: string | null;

  @Column({ name: 'delivery_mode', type: 'varchar', length: 20, nullable: true })
  deliveryMode: DeliveryMode | null;

  @Column({ name: 'place_of_birth', type: 'varchar', length: 200, nullable: true })
  placeOfBirth: string | null;

  /** How many babies were born, so twins are not lost. */
  @Column({ name: 'babies_born', type: 'int', nullable: true })
  babiesBorn: number | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'recorded_by_id', type: 'uuid', nullable: true })
  recordedById: string | null;

  @Column({ name: 'recorded_by_name', type: 'varchar', length: 200, nullable: true })
  recordedByName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
