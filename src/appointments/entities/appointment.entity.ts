// src/appointments/entities/appointment.entity.ts
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
import { SoapNote } from '../../soap-notes/entities/soap-note.entity';

export enum AppointmentStatus {
  SCHEDULED = 'scheduled',
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed',
  MISSED = 'missed',
  RESCHEDULED = 'rescheduled',
  CANCELLED = 'cancelled',
}

export enum AppointmentReason {
  FOLLOW_UP = 'Follow-up',
  REVIEW_RESULTS = 'Review Results',
  WOUND_DRESSING = 'Wound Dressing',
  MEDICATION_REVIEW = 'Medication Review',
  PHYSIOTHERAPY = 'Physiotherapy',
  POST_PROCEDURE = 'Post-procedure Check',
  VACCINATION = 'Vaccination',
  ANTENATAL = 'Antenatal Visit',
  CHRONIC_DISEASE = 'Chronic Disease Management',
  SPECIALIST_REFERRAL = 'Specialist Referral',
  OTHER = 'Other',
}

@Entity('appointments')
export class Appointment {
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

  // ── Doctor ─────────────────────────────────────────────────────────────────
  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId: string;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctor_id' })
  doctor: User;

  // ── Linked SOAP note (optional) ────────────────────────────────────────────
  @Column({ name: 'soap_note_id', type: 'uuid', nullable: true })
  soapNoteId: string | null;

  @ManyToOne(() => SoapNote, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'soap_note_id' })
  soapNote: SoapNote | null;

  // ── Appointment details ────────────────────────────────────────────────────
  @Column({ name: 'appointment_date', type: 'date' })
  appointmentDate: string; // YYYY-MM-DD

  @Column({ name: 'appointment_time', type: 'varchar', length: 10 })
  appointmentTime: string; // HH:MM (24h)

  @Column({
    type: 'enum',
    enum: AppointmentReason,
    default: AppointmentReason.FOLLOW_UP,
  })
  reason: AppointmentReason;

  @Column({ name: 'custom_reason', type: 'text', nullable: true })
  customReason: string | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  // ── Status ─────────────────────────────────────────────────────────────────
  @Column({
    type: 'enum',
    enum: AppointmentStatus,
    default: AppointmentStatus.SCHEDULED,
  })
  status: AppointmentStatus;

  // ── Reminder tracking ──────────────────────────────────────────────────────
  @Column({ name: 'reminder_sent', default: false })
  reminderSent: boolean;

  @Column({ name: 'confirmation_sent', default: false })
  confirmationSent: boolean;

  // ── Timestamps ─────────────────────────────────────────────────────────────
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}