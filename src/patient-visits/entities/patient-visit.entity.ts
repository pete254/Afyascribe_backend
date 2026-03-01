// src/patient-visits/entities/patient-visit.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Patient } from '../../patients/entities/patient.entity';
import { User } from '../../users/entities/user.entity';
import { Facility } from '../../facilities/entities/facility.entity';

export enum VisitStatus {
  CHECKED_IN = 'checked_in',           // Receptionist checked patient in
  TRIAGE = 'triage',                   // Being triaged
  WAITING_FOR_DOCTOR = 'waiting_for_doctor', // Assigned, waiting
  WITH_DOCTOR = 'with_doctor',         // Doctor opened their record
  COMPLETED = 'completed',             // Visit done
  CANCELLED = 'cancelled',             // No-show / left
}

@Entity('patient_visits')
export class PatientVisit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ── Facility scope ─────────────────────────────────────────────────────────
  @Column({ type: 'uuid' })
  facilityId: string;

  @ManyToOne(() => Facility, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'facilityId' })
  facility: Facility;

  // ── Patient ────────────────────────────────────────────────────────────────
  @Column({ type: 'uuid' })
  patientId: string;

  @ManyToOne(() => Patient, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  // ── Check-in info (receptionist) ───────────────────────────────────────────
  @Column({ type: 'text' })
  reasonForVisit: string;

  @Column({
    type: 'enum',
    enum: VisitStatus,
    default: VisitStatus.CHECKED_IN,
  })
  status: VisitStatus;

  @Column({ type: 'uuid' })
  checkedInById: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'checkedInById' })
  checkedInBy: User;

  @Column({ type: 'timestamp', nullable: true })
  checkedInAt: Date;

  // ── Doctor assignment ──────────────────────────────────────────────────────
  @Column({ type: 'uuid', nullable: true })
  assignedDoctorId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assignedDoctorId' })
  assignedDoctor: User;

  // ── Triage data (optional) ─────────────────────────────────────────────────
  @Column({ default: false })
  triageCompleted: boolean;

  @Column({ type: 'uuid', nullable: true })
  triagedById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'triagedById' })
  triagedBy: User;

  @Column({ type: 'timestamp', nullable: true })
  triagedAt: Date | null;

  // Vitals stored as jsonb for flexibility
  @Column({ type: 'jsonb', nullable: true })
  triageData: {
    bloodPressure?: string;    // e.g. "120/80"
    temperature?: string;      // e.g. "37.2°C"
    pulse?: string;            // e.g. "72 bpm"
    weight?: string;           // e.g. "70 kg"
    height?: string;           // e.g. "170 cm"
    spO2?: string;             // e.g. "98%"
    respiratoryRate?: string;  // e.g. "16/min"
    notes?: string;            // Additional triage notes
  } | null;

  // ── Timestamps ─────────────────────────────────────────────────────────────
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}