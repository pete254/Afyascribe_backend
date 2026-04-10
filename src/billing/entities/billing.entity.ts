// src/billing/entities/billing.entity.ts
// UPDATED: Added amountPaid and paymentHistory for partial payments
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
  INSURANCE_PENDING = 'insurance_pending',
}

export enum PaymentMode {
  CASH = 'cash',
  INSURANCE = 'insurance',
  SPLIT = 'split',
}

export enum PaymentMethod {
  CASH = 'cash',
  MPESA = 'mpesa',
  CARD = 'card',
  INSURANCE_CLAIM = 'insurance_claim',
}

@Entity('billing')
export class Billing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @ManyToOne(() => Facility, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'facility_id' })
  facility: Facility;

  @Column({ name: 'visit_id', type: 'uuid' })
  visitId: string;

  @ManyToOne(() => PatientVisit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'visit_id' })
  visit: PatientVisit;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  @ManyToOne(() => Patient, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;

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

  // ── Partial payment tracking ───────────────────────────────────────────────
  @Column({ name: 'amount_paid', type: 'decimal', precision: 10, scale: 2, default: 0 })
  amountPaid: number;

  @Column({ name: 'payment_history', type: 'jsonb', default: [] })
  paymentHistory: {
    paymentMethod: string;
    amount: number;
    mpesaReference?: string;
    paidAt: string;
    collectedById: string;
  }[];

  @Column({
    name: 'payment_mode',
    type: 'varchar',
    length: 20,
    default: PaymentMode.CASH,
  })
  paymentMode: PaymentMode;

  @Column({ name: 'insurance_scheme_name', type: 'varchar', length: 200, nullable: true })
  insuranceSchemeName: string | null;

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

  @Column({
    name: 'payment_method',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  paymentMethod: PaymentMethod | null;

  @Column({ name: 'mpesa_reference', type: 'varchar', length: 100, nullable: true })
  mpesaReference: string | null;

  @Column({ name: 'collected_by_id', type: 'uuid', nullable: true })
  collectedById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'collected_by_id' })
  collectedBy: User | null;

  @Column({ name: 'waiver_reason', type: 'text', nullable: true })
  waiverReason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}