import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Moh505Counts } from '../data/moh505';

export interface WeeklyReturnRow extends Moh505Counts {
  label: string;
  conditionCode: string | null;
  /** True where this system worked the number out rather than a person typing it. */
  computed: boolean;
}

/**
 * One week's MOH 505.
 *
 * The figures are computed from the record and then shown to the focal person,
 * who can correct any of them before submitting. A corrected number keeps a
 * note that it was corrected: the sub-county reconciling a return needs to
 * know which figures came from the register and which from a person.
 */
@Entity('idsr_weekly_returns')
@Index(['facilityId', 'year', 'week'], { unique: true })
export class WeeklyReturn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  /** The epidemiological year, which is not always the calendar year. */
  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'int' })
  week: number;

  /** Monday. */
  @Column({ name: 'week_start', type: 'date' })
  weekStart: string;

  /** Sunday. */
  @Column({ name: 'week_end', type: 'date' })
  weekEnd: string;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: 'draft' | 'submitted';

  /** One entry per row of the form, in the form's order. */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  rows: WeeklyReturnRow[];

  /** The laboratory block, entered rather than computed. */
  @Column({ name: 'lab_surveillance', type: 'jsonb', default: () => "'{}'::jsonb" })
  labSurveillance: Record<string, Record<string, number>>;

  /** Conditions the form has no row for, written in under "Others". */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  others: { label: string; under5Cases: number; under5Deaths: number; over5Cases: number; over5Deaths: number }[];

  @Column({ name: 'sites_reported', type: 'int', nullable: true })
  sitesReported: number | null;

  @Column({ name: 'sites_expected', type: 'int', nullable: true })
  sitesExpected: number | null;

  @Column({ name: 'reported_by_name', type: 'varchar', length: 200, nullable: true })
  reportedByName: string | null;

  @Column({ name: 'reported_by_designation', type: 'varchar', length: 120, nullable: true })
  reportedByDesignation: string | null;

  @Column({ name: 'submitted_at', type: 'timestamp with time zone', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'submitted_to', type: 'varchar', length: 300, nullable: true })
  submittedTo: string | null;

  @Column({ name: 'submission_status', type: 'varchar', length: 40, nullable: true })
  submissionStatus: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
