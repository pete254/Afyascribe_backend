import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Break-glass access to a restricted patient's record.
 *
 * Some records are restricted — a member of staff, a public figure, a
 * colleague's family — and normal clinical access is withheld. In an emergency
 * that withholding can itself be dangerous, so the lock opens to anyone who
 * says why, and the saying-why is the control: time-boxed, recorded, and put
 * in front of a reviewer afterwards.
 *
 * Never deleted. "Who looked at this record, and what did they say their
 * reason was" is the question this table exists to answer.
 */
@Entity('emergency_access')
@Index(['facilityId', 'patientId', 'expiresAt'])
@Index(['facilityId', 'reviewed'])
export class EmergencyAccess {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'user_name', type: 'varchar', length: 200, nullable: true })
  userName: string | null;

  @Column({ name: 'user_role', type: 'varchar', length: 60, nullable: true })
  userRole: string | null;

  /** Why the record was opened. Required, and kept verbatim. */
  @Column({ type: 'text' })
  reason: string;

  @Column({ name: 'granted_at', type: 'timestamp with time zone', default: () => 'now()' })
  grantedAt: Date;

  /** Access lapses on its own; nobody has to remember to close it. */
  @Column({ name: 'expires_at', type: 'timestamp with time zone' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamp with time zone', nullable: true })
  revokedAt: Date | null;

  /** Whether an administrator has since looked at this. */
  @Column({ type: 'boolean', default: false })
  reviewed: boolean;

  @Column({ name: 'review_note', type: 'text', nullable: true })
  reviewNote: string | null;

  @Column({ name: 'reviewed_by_name', type: 'varchar', length: 200, nullable: true })
  reviewedByName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
