// src/patients/entities/patient.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { SoapNote } from '../../soap-notes/entities/soap-note.entity';

@Entity('patients')
export class Patient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  patientId: string; // Auto-generated e.g. "AFY/2026/00042"

  // ── Personal Info ─────────────────────────────────────
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

  // ── Contact ───────────────────────────────────────────
  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  email: string;

  // ── Identity ──────────────────────────────────────────
  @Column({ nullable: true })
  idType: string;

  @Column({ nullable: true })
  idNumber: string;

  // ── Location ──────────────────────────────────────────
  @Column({ nullable: true })
  nationality: string;

  @Column({ nullable: true })
  county: string;

  @Column({ nullable: true })
  subCounty: string;

  @Column({ nullable: true })
  postalCode: string;

  // ── Facility ──────────────────────────────────────────
  @Column({ nullable: true })
  howKnown: string;

  @Column({ nullable: true })
  patientType: string;

  @Column({ nullable: true })
  medicalPlan: string;

  @Column({ nullable: true })
  membershipNo: string;

  // ── Next of Kin ───────────────────────────────────────

    @Column({ type: 'jsonb', nullable: true })
  nextOfKin: {
    firstName: string;
    lastName: string;
    relationship: string;
    phone: string;
  }[];

  // ── Timestamps ────────────────────────────────────────
  @CreateDateColumn()
  registeredAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastVisit: Date;

  @OneToMany(() => SoapNote, (soapNote) => soapNote.patient)
  soapNotes: SoapNote[];
}