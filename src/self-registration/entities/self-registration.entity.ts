// src/self-registration/entities/self-registration.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Facility } from '../../facilities/entities/facility.entity';

export enum SelfRegStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

/**
 * A patient's own submission from the self-registration QR, held for front-desk
 * review. This is deliberately NOT a Patient: nothing enters the register until
 * a staff member approves it, so an unattended kiosk cannot pollute the patient
 * index. On approval a Patient is created (or an existing one linked) and
 * `patientId` below points at it.
 */
@Entity('self_registrations')
export class SelfRegistration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Short code the patient shows at reception. Unambiguous alphabet, 6 chars. */
  @Index({ unique: true })
  @Column({ length: 12 })
  code: string;

  // ── Facility scoping ──────────────────────────────────────────────────────
  @Index()
  @Column({ type: 'uuid' })
  facilityId: string;

  @ManyToOne(() => Facility, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'facilityId' })
  facility: Facility;

  // ── What the patient told us ──────────────────────────────────────────────
  @Column()
  firstName: string;

  @Column({ nullable: true })
  middleName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  gender: string;

  @Column({ nullable: true })
  dateOfBirth: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  email: string;

  /** National ID / passport number, used to spot an existing patient. */
  @Column({ nullable: true })
  idNumber: string;

  /** SHA / insurance membership number. */
  @Column({ nullable: true })
  membershipNo: string;

  @Column({ nullable: true })
  medicalPlan: string;

  // Mirrors the mobile Onboard Patient screen so a self-registration carries
  // everything the front desk would otherwise have to re-ask for.
  @Column({ nullable: true })
  title: string;

  @Column({ nullable: true })
  maritalStatus: string;

  @Column({ nullable: true })
  occupation: string;

  @Column({ nullable: true })
  idType: string;

  @Column({ nullable: true })
  nationality: string;

  @Column({ nullable: true })
  county: string;

  @Column({ nullable: true })
  subCounty: string;

  @Column({ nullable: true })
  postalCode: string;

  @Column({ nullable: true })
  howKnown: string;

  @Column({ nullable: true })
  patientType: string;

  @Column({ type: 'jsonb', nullable: true })
  nextOfKin: {
    firstName: string;
    lastName: string;
    relationship: string;
    phone: string;
  }[];

  // ── Review state ──────────────────────────────────────────────────────────
  @Index()
  @Column({ type: 'varchar', length: 20, default: SelfRegStatus.PENDING })
  status: SelfRegStatus;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  /** Set once approved — the Patient this submission became (or was merged into). */
  @Column({ type: 'uuid', nullable: true })
  patientId: string | null;

  /** True when approval matched an existing patient rather than creating one. */
  @Column({ default: false })
  merged: boolean;

  @Column({ type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
