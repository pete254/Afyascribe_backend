// src/billing/entities/billing.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PatientVisit } from '../../patient-visits/entities/patient-visit.entity';
import { Patient } from '../../patients/entities/patient.entity';
import { User } from '../../users/entities/user.entity';
import { Facility } from '../../facilities/entities/facility.entity';

export enum ServiceType {
  CONSULTATION = 'consultation',
  LAB = 'lab',
  IMAGING = 'imaging',
  PROCEDURE = 'procedure',
  PHARMACY = 'pharmacy',
  OTHER = 'other',
}

export enum BillingStatus {
  UNPAID = 'unpaid',
  PAID = 'paid',
  WAIVED = 'waived',
}

@Entity('billing')
export class Billing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ── Facility scope ─────────────────────────────────────────────────────────
  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @ManyToOne(() => Facility, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'facility_id' })
  facility: Facility;

  // ── Visit link ─────────────────────────────────────────────────────────────
  @Column({ name: 'visit_id', type: 'uuid' })
  visitId: string;

  @ManyToOne(() => PatientVisit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'visit_id' })
  visit: PatientVisit;

  // ── Patient (denormalised for easy querying) ───────────────────────────────
  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  @ManyToOne(() => Patient, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;

  // ── Service details ────────────────────────────────────────────────────────
  @Column({
    name: 'service_type',
    type: 'enum',
    enum: ServiceType,
    enumName: 'service_type_enum',
    default: ServiceType.CONSULTATION,
  })
  serviceType: ServiceType;

  @Column({ name: 'service_description', type: 'text', nullable: true })
  serviceDescription: string | null;

  @Column({ name: 'amount', type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  // ── Payment status ─────────────────────────────────────────────────────────
  @Column({
    name: 'status',
    type: 'enum',
    enum: BillingStatus,
    enumName: 'billing_status_enum',
    default: BillingStatus.UNPAID,
  })
  status: BillingStatus;

  @Column({ name: 'paid_at', type: 'timestamp with time zone', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'collected_by_id', type: 'uuid', nullable: true })
  collectedById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'collected_by_id' })
  collectedBy: User | null;

  @Column({ name: 'waiver_reason', type: 'text', nullable: true })
  waiverReason: string | null;

  // ── Timestamps ─────────────────────────────────────────────────────────────
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}