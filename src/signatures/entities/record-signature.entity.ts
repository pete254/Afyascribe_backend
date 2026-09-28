import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A practitioner's signature over a clinical record.
 *
 * Holds the checksum of what was signed, so verification can say which of two
 * things went wrong: the record was altered since (the hash no longer matches)
 * or the signature is not the one it claims (the key does not verify it).
 * Those are different failures and a reviewer needs to tell them apart.
 */
@Entity('record_signatures')
@Index(['entityName', 'entityId'])
@Index(['facilityId', 'signedAt'])
export class RecordSignature {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid', nullable: true })
  facilityId: string | null;

  @Column({ name: 'entity_name', type: 'varchar', length: 80 })
  entityName: string;

  @Column({ name: 'entity_id', type: 'varchar', length: 100 })
  entityId: string;

  /** What the practitioner was attesting: authored, reviewed, released. */
  @Column({ type: 'varchar', length: 30, default: 'authored' })
  purpose: string;

  /** SHA-256 of the canonical record at the moment of signing. */
  @Column({ name: 'payload_hash', type: 'char', length: 64 })
  payloadHash: string;

  @Column({ type: 'text' })
  signature: string;

  @Column({ name: 'key_id', type: 'uuid' })
  keyId: string;

  /** Kept beside the signature so verification needs no join to a live key. */
  @Column({ name: 'public_key', type: 'text' })
  publicKey: string;

  @Column({ type: 'varchar', length: 32 })
  fingerprint: string;

  @Column({ name: 'signed_by_id', type: 'uuid' })
  signedById: string;

  @Column({ name: 'signed_by_name', type: 'varchar', length: 200, nullable: true })
  signedByName: string | null;

  @Column({ name: 'practitioner_no', type: 'varchar', length: 60, nullable: true })
  practitionerNo: string | null;

  @Column({ name: 'signed_at', type: 'timestamp with time zone', default: () => 'now()' })
  signedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
