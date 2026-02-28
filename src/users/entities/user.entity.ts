// src/users/entities/user.entity.ts
// UPDATED: Added facilityId, facility relation, and new roles
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
  SUPER_ADMIN = 'super_admin',       // Can manage all facilities
  FACILITY_ADMIN = 'facility_admin', // Manages one facility's users
  DOCTOR = 'doctor',                 // Creates SOAP notes
  NURSE = 'nurse',                   // Assists, views SOAP notes
  RECEPTIONIST = 'receptionist',     // Registers patients only
}

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

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.DOCTOR,
  })
  role: UserRole;

  // ── Facility Link ──────────────────────────────────────────────────────────
  // nullable: true during migration — will be NOT NULL after backfill
  @Column({ nullable: true, type: 'uuid' })
  facilityId: string | null;

  @ManyToOne(() => Facility, (facility) => facility.users, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'facilityId' })
  facility: Facility;

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

  // ── Timestamps ─────────────────────────────────────────────────────────────
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ── Relations ──────────────────────────────────────────────────────────────
  @OneToMany(() => SoapNote, (soapNote: SoapNote) => soapNote.createdBy)
  soapNotes: SoapNote[];
}