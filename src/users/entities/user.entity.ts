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

  // ── Timestamps ─────────────────────────────────────────────────────────────
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ── Relations ──────────────────────────────────────────────────────────────
  @OneToMany(() => SoapNote, (soapNote: SoapNote) => soapNote.createdBy)
  soapNotes: SoapNote[];
}