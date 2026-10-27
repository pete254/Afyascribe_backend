// src/users/entities/user.entity.ts
// UPDATED: Added isOwner field — true for clinic founders
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SoapNote } from '../../soap-notes/entities/soap-note.entity';
import { Facility } from '../../facilities/entities/facility.entity';

export enum UserRole {
  SUPER_ADMIN     = 'super_admin',
  FACILITY_ADMIN  = 'facility_admin',
  DOCTOR          = 'doctor',
  NURSE           = 'nurse',
  RECEPTIONIST    = 'receptionist',
  LAB_TECHNICIAN  = 'lab_technician',           // Runs the lab: collect, test, post results
  RADIOGRAPHER    = 'radiographer',             // Runs radiology/imaging: request, schedule, report
  DENTIST         = 'dentist',                  // Runs the dental clinic: chart, treat, bill
  OPTOMETRIST     = 'optometrist',              // Runs the optical clinic: exam, prescribe, dispense
  PHARMACIST      = 'pharmacist',               // Pharmacy queue: price, bill and dispense drugs
  // ── Back-office roles ─────────────────────────────────────────────────────
  ACCOUNTANT          = 'accountant',           // Ledger, banking, financial statements
  CASHIER             = 'cashier',              // Sales / invoice payments desk
  PROCUREMENT_OFFICER = 'procurement_officer',  // Purchases, bills, suppliers
  STOREKEEPER         = 'storekeeper',          // Stock, items, receiving, adjustments
  HR_MANAGER          = 'hr_manager',           // Payroll and employees
}

/** Back-office (non-clinical) roles. */
export const BACK_OFFICE_ROLES: UserRole[] = [
  UserRole.ACCOUNTANT,
  UserRole.CASHIER,
  UserRole.PROCUREMENT_OFFICER,
  UserRole.STOREKEEPER,
  UserRole.HR_MANAGER,
];

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  // Primary role — kept for display and as the default. The full set a user
  // holds is `roles` below; `role` is always roles[0].
  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.DOCTOR,
  })
  role: UserRole;

  /**
   * All roles this user holds. A person can wear several hats (e.g. receptionist
   * + cashier). Access is granted if ANY of these roles allows it. Null/empty is
   * treated as [role] for backward compatibility.
   */
  @Column({ name: 'roles', type: 'jsonb', nullable: true })
  roles: string[] | null;

  /**
   * Per-user permission overrides on top of the roles. A map of capability key →
   * allow(true)/deny(false). An entry wins over what the roles would grant, so an
   * owner can, say, deny one cashier the ability to collect payment, or grant a
   * specific extra function. Absent keys fall back to the role default.
   */
  @Column({ name: 'permission_overrides', type: 'jsonb', nullable: true })
  permissionOverrides: Record<string, boolean> | null;

  /**
   * Practitioner registration number for prescribing/dispensing staff (doctors
   * and pharmacists), e.g. "P#A0000". Printed on prescriptions in place of a
   * signature. Auto-assigned when someone becomes a doctor or pharmacist.
   */
  @Column({ name: 'practitioner_no', type: 'varchar', length: 30, nullable: true })
  practitionerNo: string | null;

  /**
   * The regulatory body that licenses this practitioner, e.g. KMPDC, NCK, COC,
   * PPB, KMLTTB — the identifier type for their registration number, needed for
   * FHIR Practitioner identifiers and SHA claims.
   */
  @Column({ name: 'regulatory_body', type: 'varchar', length: 40, nullable: true })
  regulatoryBody: string | null;

  /** The practitioner's official registration/licence number from that body. */
  @Column({ name: 'regulatory_number', type: 'varchar', length: 60, nullable: true })
  regulatoryNumber: string | null;

  // ── Facility Link ──────────────────────────────────────────────────────────
  @Column({ nullable: true, type: 'uuid' })
  facilityId: string | null;

  @ManyToOne(() => Facility, (facility) => facility.users, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'facilityId' })
  facility: Facility;

  // ── Owner flag ─────────────────────────────────────────────────────────────
  // true = this doctor created the clinic (solo / team mode owner)
  // Persisted in the JWT so capabilities survive re-login without a DB query.
  @Column({ name: 'is_owner', default: false })
  isOwner: boolean;

  // ── Status ─────────────────────────────────────────────────────────────────
  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isDeactivated: boolean;

  @Column({ type: 'timestamp', nullable: true })
  deactivatedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  deactivationReason: string | null;

  // ── Password Reset (6-digit code) ──────────────────────────────────────────
  @Column({ nullable: true, type: 'varchar', length: 255 })
  resetPasswordToken: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resetPasswordExpires: Date | null;

  @Column({ nullable: true, type: 'varchar', length: 6 })
  resetCode: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resetCodeExpiresAt: Date | null;

  @Column({ type: 'int', default: 0 })
  resetCodeAttempts: number;

  // ── Daily sign-in code (2FA) ────────────────────────────────────────────────
  // A 6-digit code emailed after a correct password; valid until midnight, so
  // one code serves every sign-in that day.
  @Column({ nullable: true, type: 'varchar', length: 6 })
  loginCode: string | null;

  @Column({ type: 'timestamp', nullable: true })
  loginCodeExpiresAt: Date | null;

  @Column({ type: 'int', default: 0 })
  loginCodeAttempts: number;

  // ── Authenticator app (TOTP) ───────────────────────────────────────────────
  // See auth/totp.service.ts. Secrets are stored sealed (AES-256-GCM), never
  // in the clear; backup codes only as hashes.
  @Column({ name: 'totp_secret', type: 'text', nullable: true })
  totpSecret: string | null;

  /** A secret being set up, not yet confirmed with a code. */
  @Column({ name: 'totp_pending_secret', type: 'text', nullable: true })
  totpPendingSecret: string | null;

  @Column({ name: 'totp_enabled_at', type: 'timestamptz', nullable: true })
  totpEnabledAt: Date | null;

  /** The last time step accepted, so no code is accepted twice. */
  @Column({ name: 'totp_last_step', type: 'int', nullable: true })
  totpLastStep: number | null;

  @Column({ name: 'totp_backup_codes', type: 'jsonb', nullable: true })
  totpBackupCodes: string[] | null;

  @Column({ name: 'totp_failed_attempts', type: 'int', default: 0 })
  totpFailedAttempts: number;

  @Column({ name: 'totp_locked_until', type: 'timestamptz', nullable: true })
  totpLockedUntil: Date | null;

  // ── Timestamps ─────────────────────────────────────────────────────────────
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ── Relations ──────────────────────────────────────────────────────────────
  @OneToMany(() => SoapNote, (soapNote: SoapNote) => soapNote.createdBy)
  soapNotes: SoapNote[];

  /**
   * What a user looks like in any response. Users are loaded as relations all
   * over the API — a document's uploader, a note's author — and returned as
   * part of other records; without this, every such response carried the
   * user's password hash, today's emailed sign-in code and any pending
   * password-reset code, the last of which is enough to take the account
   * over. Removing them here covers every route at once, including ones not
   * yet written.
   */
  toJSON(): Record<string, unknown> {
    const out = { ...this } as Record<string, unknown>;
    for (const k of USER_SECRET_FIELDS) delete out[k];
    return out;
  }
}

/** Never sent to a client (User.toJSON). */
export const USER_SECRET_FIELDS = [
  'password',
  'resetPasswordToken',
  'resetPasswordExpires',
  'resetCode',
  'resetCodeExpiresAt',
  'resetCodeAttempts',
  'loginCode',
  'loginCodeExpiresAt',
  'loginCodeAttempts',
  'totpSecret',
  'totpPendingSecret',
  'totpLastStep',
  'totpBackupCodes',
  'totpFailedAttempts',
  'totpLockedUntil',
] as const;