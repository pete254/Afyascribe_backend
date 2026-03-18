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
  INSURANCE_PENDING = 'insurance_pending', // insurance portion awaiting claim
}

// How the bill is being settled
export enum PaymentMode {
  CASH = 'cash',           // patient pays everything
  INSURANCE = 'insurance', // insurer pays everything, no patient cash needed
  SPLIT = 'split',         // patient pays copay, insurer covers the rest
}

// How the patient's cash portion was received
export enum PaymentMethod {
  CASH = 'cash',
  MPESA = 'mpesa',
  CARD = 'card',
  INSURANCE_CLAIM = 'insurance_claim', // no cash collected — goes to insurer
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

  // ── Payment mode (set at bill creation) ───────────────────────────────────
  @Column({
    name: 'payment_mode',
    type: 'varchar',
    length: 20,
    default: PaymentMode.CASH,
  })
  paymentMode: PaymentMode;

  // For insurance / split bills — name of the insurer
  @Column({ name: 'insurance_scheme_name', type: 'varchar', length: 200, nullable: true })
  insuranceSchemeName: string | null;

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

  // How the cash portion was collected
  @Column({
    name: 'payment_method',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  paymentMethod: PaymentMethod | null;

  // M-Pesa transaction reference — optional, no validation
  @Column({ name: 'mpesa_reference', type: 'varchar', length: 100, nullable: true })
  mpesaReference: string | null;

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