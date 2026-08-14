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
  CHECKED_IN = 'checked_in',
  TRIAGE = 'triage',
  WAITING_FOR_DOCTOR = 'waiting_for_doctor',
  WITH_DOCTOR = 'with_doctor',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity('patient_visits')
export class PatientVisit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ── Facility scope ─────────────────────────────────────────────────────────
  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @ManyToOne(() => Facility, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'facility_id' })
  facility: Facility;

  // ── Patient ────────────────────────────────────────────────────────────────
  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  @ManyToOne(() => Patient, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;

  // ── Check-in info ──────────────────────────────────────────────────────────
  @Column({ name: 'reason_for_visit', type: 'text' })
  reasonForVisit: string;

  // Structured attendance type — powers New/Revisit classification on the MOH
  // outpatient registers. One of: first_visit | appointment | follow_up |
  // referral | emergency | other. Nullable for pre-existing visits.
  @Column({ name: 'visit_type', type: 'varchar', length: 32, nullable: true })
  visitType: string | null;

  // When the visit was booked as an appointment, the appointment it fulfils.
  @Column({ name: 'appointment_id', type: 'uuid', nullable: true })
  appointmentId: string | null;

  @Column({
    type: 'enum',
    enum: VisitStatus,
    default: VisitStatus.CHECKED_IN,
  })
  status: VisitStatus;

  @Column({ name: 'checked_in_by_id', type: 'uuid', nullable: true })
  checkedInById: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'checked_in_by_id' })
  checkedInBy: User;

  @Column({ name: 'checked_in_at', type: 'timestamp with time zone', nullable: true })
  checkedInAt: Date;

  // ── Doctor assignment ──────────────────────────────────────────────────────
  @Column({ name: 'assigned_doctor_id', type: 'uuid', nullable: true })
  assignedDoctorId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assigned_doctor_id' })
  assignedDoctor: User;

  // ── Triage ─────────────────────────────────────────────────────────────────
  @Column({ name: 'triage_completed', default: false })
  triageCompleted: boolean;

  @Column({ name: 'triaged_by_id', type: 'uuid', nullable: true })
  triagedById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'triaged_by_id' })
  triagedBy: User;

  @Column({ name: 'triaged_at', type: 'timestamp with time zone', nullable: true })
  triagedAt: Date | null;

  @Column({ name: 'triage_data', type: 'jsonb', nullable: true })
  triageData: {
    bloodPressure?: string;
    temperature?: string;
    pulse?: string;
    weight?: string;
    height?: string;
    spO2?: string;
    respiratoryRate?: string;
    notes?: string;
  } | null;

  // ── Timestamps ─────────────────────────────────────────────────────────────
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}