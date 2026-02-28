// src/patients/entities/patient.entity.ts
// UPDATED: Added facilityId and facility relation
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SoapNote } from '../../soap-notes/entities/soap-note.entity';
import { Facility } from '../../facilities/entities/facility.entity';

@Entity('patients')
export class Patient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  patientId: string; // Auto-generated e.g. "KNH/2026/00042" (now uses facility code)

  // ── Facility Link ──────────────────────────────────────────────────────────
  // nullable: true during migration — will be NOT NULL after backfill
  @Column({ nullable: true, type: 'uuid' })
  facilityId: string | null;

  @ManyToOne(() => Facility, (facility) => facility.patients, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'facilityId' })
  facility: Facility;

  // ── Personal Info ──────────────────────────────────────────────────────────
  @Column({ nullable: true })
  title: string;

  @Column()
  firstName: string;

  @Column({ nullable: true })
  middleName: string;

  @Column()
  lastName: string;

  @Column()
  gender: string;

  @Column({ nullable: true })
  dateOfBirth: string;

  @Column({ nullable: true })
  age: number;

  @Column({ nullable: true })
  maritalStatus: string;

  @Column({ nullable: true })
  occupation: string;

  // ── Contact ───────────────────────────────────────────────────────────────
  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  email: string;

  // ── Identity ─────────────────────────────────────────────────────────────
  @Column({ nullable: true })
  idType: string;

  @Column({ nullable: true })
  idNumber: string;

  // ── Location ─────────────────────────────────────────────────────────────
  @Column({ nullable: true })
  nationality: string;

  @Column({ nullable: true })
  county: string;

  @Column({ nullable: true })
  subCounty: string;

  @Column({ nullable: true })
  postalCode: string;

  // ── Facility/Admin ────────────────────────────────────────────────────────
  @Column({ nullable: true })
  howKnown: string;

  @Column({ nullable: true })
  patientType: string;

  @Column({ nullable: true })
  medicalPlan: string;

  @Column({ nullable: true })
  membershipNo: string;

  // ── Next of Kin ───────────────────────────────────────────────────────────
  @Column({ type: 'jsonb', nullable: true })
  nextOfKin: {
    firstName: string;
    lastName: string;
    relationship: string;
    phone: string;
  }[];

  // ── Timestamps ────────────────────────────────────────────────────────────
  @CreateDateColumn()
  registeredAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastVisit: Date;

  // ── Relations ─────────────────────────────────────────────────────────────
  @OneToMany(() => SoapNote, (soapNote) => soapNote.patient)
  soapNotes: SoapNote[];
}