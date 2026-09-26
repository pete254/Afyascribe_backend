import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One measure's value for one period.
 *
 * Calculated values are worked out from the record; captured ones are entered
 * by a person, usually because the measure came from outside and this system
 * cannot compute it. Both are stored, and `calculated` says which is which —
 * a submission that mixed them without saying so would be misleading.
 */
@Entity('measure_values')
@Index(['facilityId', 'measureId', 'periodStart'], { unique: true })
export class MeasureValue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'measure_id', type: 'varchar', length: 120 })
  measureId: string;

  @Column({ name: 'period_start', type: 'date' })
  periodStart: string;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd: string;

  @Column({ type: 'int' })
  numerator: number;

  @Column({ type: 'int', nullable: true })
  denominator: number | null;

  @Column({ type: 'numeric', precision: 5, scale: 1, nullable: true })
  rate: string | null;

  /** True when this system worked it out; false when a person entered it. */
  @Column({ type: 'boolean', default: true })
  calculated: boolean;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  /** When this value was sent to the Ministry, if it has been. */
  @Column({ name: 'submitted_at', type: 'timestamp with time zone', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'submitted_to', type: 'varchar', length: 300, nullable: true })
  submittedTo: string | null;

  @Column({ name: 'submission_status', type: 'varchar', length: 40, nullable: true })
  submissionStatus: string | null;

  @Column({ name: 'recorded_by_name', type: 'varchar', length: 200, nullable: true })
  recordedByName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
