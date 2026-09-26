import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SignalLevel } from '../thresholds';

/**
 * A threshold crossed, or a pattern worth looking at.
 *
 * Signals are derived from the week's counts, but they are stored rather than
 * recomputed on every screen, because the useful question is not "is this
 * still true" but "did anyone do anything about it". An acknowledged signal
 * carries who looked and what they found.
 */
@Entity('public_health_signals')
@Index(['facilityId', 'status'])
@Index(['facilityId', 'year', 'week'])
export class PublicHealthSignal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'int' })
  week: number;

  @Column({ name: 'condition_code', type: 'varchar', length: 40 })
  conditionCode: string;

  @Column({ name: 'condition_name', type: 'varchar', length: 200 })
  conditionName: string;

  /** alert — look into it. action — respond. */
  @Column({ type: 'varchar', length: 20 })
  level: SignalLevel;

  /** Which rule fired, so it can be looked up in the guidelines. */
  @Column({ type: 'varchar', length: 40 })
  rule: string;

  @Column({ type: 'text' })
  detail: string;

  @Column({ type: 'int' })
  count: number;

  /** The published figure, where the guidelines give one. */
  @Column({ type: 'int', nullable: true })
  threshold: number | null;

  /**
   * False where the rule is this system prompting someone to look rather than
   * a number the Ministry has published. The distinction is shown on screen:
   * a prompt presented as a threshold would be a claim nobody could check.
   */
  @Column({ type: 'boolean', default: true })
  published: boolean;

  @Column({ type: 'varchar', length: 20, default: 'open' })
  status: 'open' | 'acknowledged' | 'closed';

  @Column({ name: 'acknowledged_at', type: 'timestamp with time zone', nullable: true })
  acknowledgedAt: Date | null;

  @Column({ name: 'acknowledged_by_name', type: 'varchar', length: 200, nullable: true })
  acknowledgedByName: string | null;

  /** What was found, and what was done. */
  @Column({ type: 'text', nullable: true })
  response: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
