import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import {
  AllergenType,
  AllergyCriticality,
  AllergyKind,
  AllergySeverity,
  AllergyStatus,
  AllergyVerification,
} from '../allergy.enums';

/** One recorded reaction — what actually happened to the patient. */
export interface AllergyManifestation {
  /** KNHTS Allergy Reaction Manifestation code (e.g. `rash`). */
  code: string | null;
  display: string;
}

/** An append-only note of what changed, so the allergy history is auditable. */
export interface AllergyRevision {
  at: string;
  byId: string | null;
  byName: string | null;
  from: AllergyStatus;
  to: AllergyStatus;
  reason: string | null;
}

/**
 * A patient's allergy or intolerance. Active entries are the allergy list the
 * prescriber must see; inactive, resolved and refuted entries are the allergy
 * history, which is kept rather than deleted.
 *
 * Drug allergies carry the HPT active-component code so the allergen means the
 * same thing nationally as it does here.
 */
@Entity('patient_allergies')
@Index(['facilityId', 'patientId', 'status'])
export class PatientAllergy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  @Column({ name: 'allergen_type', type: 'varchar', length: 20, default: 'medication' })
  allergenType: AllergenType;

  /** What the patient reacts to, as written on the record. */
  @Column({ name: 'allergen_name', type: 'varchar', length: 200 })
  allergenName: string;

  /** National allergen code (MOH-KENYA Allergy Intolerance Code). */
  @Column({ name: 'knhts_code', type: 'varchar', length: 64, nullable: true })
  knhtsCode: string | null;

  @Column({ name: 'knhts_system', type: 'varchar', length: 40, nullable: true })
  knhtsSystem: string | null;

  /** HPT active-component code for a drug allergy (`AC…`). */
  @Column({ name: 'hpt_code', type: 'varchar', length: 64, nullable: true })
  hptCode: string | null;

  @Column({ name: 'hpt_name', type: 'varchar', length: 200, nullable: true })
  hptName: string | null;

  @Column({ type: 'varchar', length: 20, default: 'allergy' })
  kind: AllergyKind;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  manifestations: AllergyManifestation[];

  @Column({ type: 'varchar', length: 20, nullable: true })
  severity: AllergySeverity | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  criticality: AllergyCriticality | null;

  @Column({ type: 'varchar', length: 24, default: 'active' })
  status: AllergyStatus;

  @Column({ name: 'verification_status', type: 'varchar', length: 20, default: 'unconfirmed' })
  verificationStatus: AllergyVerification;

  @Column({ name: 'onset_date', type: 'date', nullable: true })
  onsetDate: string | null;

  @Column({ name: 'last_occurrence', type: 'date', nullable: true })
  lastOccurrence: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'recorded_by_id', type: 'uuid', nullable: true })
  recordedById: string | null;

  @Column({ name: 'recorded_by_name', type: 'varchar', length: 200, nullable: true })
  recordedByName: string | null;

  /** Status changes, kept for the allergy history. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  revisions: AllergyRevision[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
