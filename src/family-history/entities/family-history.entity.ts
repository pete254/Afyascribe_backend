import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { FamilyHistoryStatus } from '../family-history.enums';

/** A condition a relative had, coded to ICD-11 where the clinician picked a code. */
export interface FamilyCondition {
  code: string | null;
  display: string;
  /** Age at which the relative developed it, where known. */
  onsetAge?: number | null;
  /** Whether this is what they died of. */
  contributedToDeath?: boolean;
  note?: string | null;
}

/**
 * One relative's health history. Modelled per relative rather than per
 * condition, matching FHIR FamilyMemberHistory: a mother with diabetes and
 * hypertension is one relative with two conditions, not two relatives.
 */
@Entity('patient_family_history')
@Index(['facilityId', 'patientId'])
export class FamilyHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  /** HL7 v3 RoleCode — MTH, FTH, SIS… */
  @Column({ type: 'varchar', length: 20 })
  relationship: string;

  /** The relative's name, where the patient gives it. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  name: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  gender: string | null;

  @Column({ name: 'born_year', type: 'int', nullable: true })
  bornYear: number | null;

  @Column({ type: 'boolean', default: false })
  deceased: boolean;

  @Column({ name: 'age_at_death', type: 'int', nullable: true })
  ageAtDeath: number | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  conditions: FamilyCondition[];

  /**
   * `health-unknown` is a real and useful answer — "the patient does not know
   * their father's history" is different from "the father was healthy".
   */
  @Column({ type: 'varchar', length: 24, default: 'partial' })
  status: FamilyHistoryStatus;

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
