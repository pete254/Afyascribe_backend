import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A one-time code, issued by AfyaScribe (super_admin), that a hospital must
 * present to create its facility. This is the ONLY way a new clinic is stood
 * up — the public "Start your clinic" flow is otherwise closed. Each code is
 * single-use: it is consumed the moment a facility is created with it.
 */
export enum CreationCodeStatus {
  UNUSED = 'unused',
  USED = 'used',
  REVOKED = 'revoked',
}

@Entity('facility_creation_codes')
export class FacilityCreationCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ length: 20 })
  code: string;

  @Column({
    type: 'enum',
    enum: CreationCodeStatus,
    enumName: 'creation_code_status_enum',
    default: CreationCodeStatus.UNUSED,
  })
  status: CreationCodeStatus;

  /** Who this was issued to — the hospital name or contact, for the admin's records. */
  @Column({ nullable: true })
  label: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /** Set once the code is redeemed. */
  @Column({ name: 'facility_id', type: 'uuid', nullable: true })
  facilityId: string | null;

  /** The super_admin who generated it. */
  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  /** Optional expiry — past this the code will not redeem. */
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
