// src/facilities/entities/facility.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Patient } from '../../patients/entities/patient.entity';

export enum FacilityStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

/**
 * How the practice is staffed. This drives what the apps offer: a solo
 * practitioner does reception, triage, consultation and billing themselves, so
 * splitting those across roles only gets in their way.
 */
export enum ClinicMode {
  SOLO = 'solo',
  TEAM = 'team',
  MULTI = 'multi',
}

export enum FacilityType {
  HOSPITAL = 'hospital',
  CLINIC = 'clinic',
  HEALTH_CENTRE = 'health_centre',
  DISPENSARY = 'dispensary',
}

@Entity('facilities')
export class Facility {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 10 })
  code: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'enum', enum: FacilityType, default: FacilityType.HOSPITAL })
  type: FacilityType;

  @Column({ type: 'enum', enum: FacilityStatus, default: FacilityStatus.ACTIVE })
  status: FacilityStatus;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  county: string;

  @Column({ name: 'sub_county', nullable: true })  // ✅ fixed
  subCounty: string;

  @Column({ name: 'license_number', nullable: true, length: 100 })  // ✅ fixed
  licenseNumber: string;

  @Column({ name: 'logo_url', nullable: true })
  logoUrl: string;

  @Column({ name: 'logo_public_id', nullable: true })
  logoPublicId: string;

  @Column({ name: 'is_active', default: true })  // ✅ fixed
  isActive: boolean;

  /**
   * Added by migration AddClinicModeAndOwner but never declared here, so
   * TypeORM neither selected nor wrote it — every token carried
   * `clinicMode: null` and the whole solo/team capability system in
   * common/capabilities.ts was dead. Declaring it is the fix.
   */
  @Column({
    name: 'clinic_mode',
    type: 'enum',
    enum: ClinicMode,
    enumName: 'clinic_mode_enum',
    default: ClinicMode.MULTI,
  })
  clinicMode: ClinicMode;

  /**
   * When this facility's subscription is next due. AfyaScribe (super_admin)
   * sets it; the platform console flags facilities that are overdue so the
   * admin can send a reminder or suspend access. Null = not billed / no date set.
   */
  @Column({ name: 'subscription_due_date', type: 'timestamptz', nullable: true })
  subscriptionDueDate: Date | null;

  /**
   * When true, the accountant may approve LPOs (purchase orders) on their own;
   * otherwise an accountant-raised LPO waits for the owner/admin to approve.
   * The owner sets this to delegate purchasing authority.
   */
  @Column({ name: 'accountant_can_approve_lpo', type: 'boolean', default: false })
  accountantCanApproveLpo: boolean;

  // When true, this facility's staff sign in with password only — the daily
  // login OTP is skipped for them (owner opt-out).
  @Column({ name: 'login_otp_disabled', type: 'boolean', default: false })
  loginOtpDisabled: boolean;

  // When true, a patient with an unpaid bill may still be seen by the doctor
  // (consultation on credit). Default false — the bill must be cleared first.
  @Column({ name: 'allow_doctor_with_pending_bill', type: 'boolean', default: false })
  allowDoctorWithPendingBill: boolean;

  // Default markup % that pre-fills new stock items, so a facility can price its
  // whole pharmacy off cost with one number. 0 = no default.
  @Column({ name: 'default_markup_pct', type: 'numeric', precision: 6, scale: 2, default: 0 })
  defaultMarkupPct: string;

  @CreateDateColumn({ name: 'created_at' })  // ✅ fixed
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })  // ✅ fixed
  updatedAt: Date;

  @OneToMany(() => User, (user) => user.facility)
  users: User[];

  @OneToMany(() => Patient, (patient) => patient.facility)
  patients: Patient[];
}