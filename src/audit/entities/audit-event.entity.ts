import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * One line of the system audit ledger — a single write action performed by a
 * user, captured at the HTTP layer by the AuditInterceptor. Request bodies are
 * never stored, so no passwords or clinical detail leak into the log; only who
 * did what (method + route), to which record, and when.
 */
@Entity('audit_events')
@Index('IDX_audit_facility_created', ['facilityId', 'createdAt'])
export class AuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid', nullable: true })
  facilityId: string | null;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ name: 'actor_name', type: 'varchar', length: 200, nullable: true })
  actorName: string | null;

  @Column({ name: 'actor_role', type: 'varchar', length: 60, nullable: true })
  actorRole: string | null;

  @Column({ name: 'method', type: 'varchar', length: 10 })
  method: string;

  @Column({ name: 'path', type: 'text' })
  path: string;

  /** Human-readable label, e.g. "Created billing", "Reopen visit". */
  @Column({ name: 'action', type: 'varchar', length: 140 })
  action: string;

  /** The resource acted on, e.g. "billing", "wards", "assets". */
  @Column({ name: 'entity_type', type: 'varchar', length: 60, nullable: true })
  entityType: string | null;

  /** The record id from the route, when present. */
  @Column({ name: 'entity_id', type: 'varchar', length: 100, nullable: true })
  entityId: string | null;

  @Column({ name: 'status_code', type: 'int', nullable: true })
  statusCode: number | null;

  @Column({ name: 'ip', type: 'varchar', length: 60, nullable: true })
  ip: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
