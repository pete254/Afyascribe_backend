import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** One field that changed, with what it was and what it became. */
export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

/**
 * A version of a record — what changed, who changed it, and when.
 *
 * The audit ledger says that a record was written to. This says what the
 * writing did. Both are needed: "someone updated this prescription at 14:02"
 * answers a different question from "the dose went from 500 mg to 5 g".
 *
 * Rows are never updated or deleted, for the same reason the ledger is not.
 */
@Entity('record_versions')
@Index(['entityName', 'entityId', 'version'])
@Index(['facilityId', 'createdAt'])
export class RecordVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid', nullable: true })
  facilityId: string | null;

  /** The table, as the entity names it. */
  @Column({ name: 'entity_name', type: 'varchar', length: 80 })
  entityName: string;

  @Column({ name: 'entity_id', type: 'varchar', length: 100 })
  entityId: string;

  /** 1 for the first recorded state, rising with each change. */
  @Column({ type: 'int' })
  version: number;

  /** created | updated | deleted */
  @Column({ type: 'varchar', length: 20 })
  operation: 'created' | 'updated' | 'deleted';

  /**
   * The fields that actually moved. An update that changed nothing produces no
   * version: a history full of "nothing happened" is a history nobody reads.
   */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  changes: FieldChange[];

  /** The patient the record belongs to, where it belongs to one. */
  @Column({ name: 'patient_id', type: 'uuid', nullable: true })
  patientId: string | null;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ name: 'actor_name', type: 'varchar', length: 200, nullable: true })
  actorName: string | null;

  @Column({ name: 'actor_role', type: 'varchar', length: 60, nullable: true })
  actorRole: string | null;

  /**
   * Why. An amendment to a clinical record should carry one, and the screens
   * that amend ask for it; a routine edit will not have one.
   */
  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
