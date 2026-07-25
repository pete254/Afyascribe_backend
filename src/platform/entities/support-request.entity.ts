import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * An inbound message from a prospective or existing hospital: a request for a
 * creation code, a support question, or a general contact. Submitted from the
 * public site (no auth) and worked through by super_admin in the console.
 */
export enum SupportRequestType {
  CODE_REQUEST = 'code_request',
  SUPPORT = 'support',
  CONTACT = 'contact',
}

export enum SupportRequestStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  CLOSED = 'closed',
}

@Entity('support_requests')
export class SupportRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: SupportRequestType,
    enumName: 'support_request_type_enum',
    default: SupportRequestType.SUPPORT,
  })
  type: SupportRequestType;

  @Column()
  name: string;

  @Column()
  email: string;

  @Column({ nullable: true })
  phone: string | null;

  /** The hospital this is about, when the sender names one. */
  @Column({ name: 'facility_name', nullable: true })
  facilityName: string | null;

  @Column({ type: 'text' })
  message: string;

  @Column({
    type: 'enum',
    enum: SupportRequestStatus,
    enumName: 'support_request_status_enum',
    default: SupportRequestStatus.OPEN,
  })
  status: SupportRequestStatus;

  /** The reply the admin sent back, if any (also emailed to the sender). */
  @Column({ type: 'text', nullable: true })
  response: string | null;

  @Column({ name: 'handled_by', type: 'uuid', nullable: true })
  handledBy: string | null;

  @Column({ name: 'handled_at', type: 'timestamptz', nullable: true })
  handledAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
