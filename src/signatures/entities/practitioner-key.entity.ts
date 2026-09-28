import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One practitioner's signing key.
 *
 * The private half is stored encrypted under a PIN only they know, so this row
 * is useless to anyone who takes the database. Rotating a key revokes the old
 * one rather than replacing it: signatures already made must stay verifiable,
 * and that needs the public half they were made with.
 */
@Entity('practitioner_keys')
@Index(['userId', 'revokedAt'])
export class PractitionerKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'facility_id', type: 'uuid', nullable: true })
  facilityId: string | null;

  /** SPKI DER, base64. Public by design — it is how anyone verifies. */
  @Column({ name: 'public_key', type: 'text' })
  publicKey: string;

  @Column({ name: 'encrypted_private_key', type: 'text' })
  encryptedPrivateKey: string;

  @Column({ type: 'varchar', length: 64 })
  salt: string;

  @Column({ type: 'varchar', length: 64 })
  iv: string;

  @Column({ name: 'auth_tag', type: 'varchar', length: 64 })
  authTag: string;

  /** A short name for the key, shown beside a signature. */
  @Column({ type: 'varchar', length: 32 })
  fingerprint: string;

  @Column({ type: 'varchar', length: 20, default: 'Ed25519' })
  algorithm: string;

  /** The practitioner's registration number when the key was made. */
  @Column({ name: 'practitioner_no', type: 'varchar', length: 60, nullable: true })
  practitionerNo: string | null;

  @Column({ name: 'regulatory_body', type: 'varchar', length: 40, nullable: true })
  regulatoryBody: string | null;

  @Column({ name: 'revoked_at', type: 'timestamp with time zone', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'revoked_reason', type: 'varchar', length: 300, nullable: true })
  revokedReason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
