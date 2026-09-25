import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A record that someone actually read the audit log.
 *
 * Kenya's Digital Health (Health Information Management Procedures)
 * Regulations, 2025 require health data controllers to "review audit logs on a
 * quarterly basis to identify potential security incidents or suspicious
 * activity patterns". A log nobody reads satisfies the letter of a retention
 * rule and none of its purpose, so the review itself is recorded — including
 * the integrity check that was run at the time, and what the reviewer found.
 */
@Entity('audit_reviews')
@Index(['facilityId', 'periodTo'])
export class AuditReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'period_from', type: 'date' })
  periodFrom: string;

  @Column({ name: 'period_to', type: 'date' })
  periodTo: string;

  @Column({ name: 'reviewed_by_id', type: 'uuid', nullable: true })
  reviewedById: string | null;

  @Column({ name: 'reviewed_by_name', type: 'varchar', length: 200, nullable: true })
  reviewedByName: string | null;

  /** How many lines the period covered. */
  @Column({ name: 'lines_reviewed', type: 'int', nullable: true })
  linesReviewed: number | null;

  /** Whether the chain verified when the review was recorded. */
  @Column({ name: 'chain_ok', type: 'boolean', nullable: true })
  chainOk: boolean | null;

  /** The verification verdict as it stood, kept so a later re-run can be compared. */
  @Column({ name: 'chain_verdict', type: 'jsonb', nullable: true })
  chainVerdict: unknown;

  /** Whether the reviewer saw anything worth acting on. */
  @Column({ name: 'concerns_found', type: 'boolean', default: false })
  concernsFound: boolean;

  @Column({ type: 'text', nullable: true })
  findings: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
