import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * A session that has been signed out. Its tokens are refused from then on,
 * even though they have not yet expired.
 *
 * A row is only needed until the session would have ended anyway, so
 * `expires_at` is that moment and rows past it are pruned.
 */
@Entity('revoked_sessions')
export class RevokedSession {
  @PrimaryColumn({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @CreateDateColumn({ name: 'revoked_at', type: 'timestamptz' })
  revokedAt: Date;

  @Index('IDX_revoked_sessions_expires')
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;
}
