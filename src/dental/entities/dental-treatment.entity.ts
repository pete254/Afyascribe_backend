import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Patient } from '../../patients/entities/patient.entity';
import { User } from '../../users/entities/user.entity';
import { Facility } from '../../facilities/entities/facility.entity';
import { DentalProcedure, DentalStatus } from '../dental.enums';

/**
 * One dental treatment / procedure on a patient — optionally against a specific
 * tooth (FDI notation, e.g. "11", "46"; null means whole-mouth / general).
 * Modelled like a radiology study: request → in progress → complete, with a
 * price that bills the patient.
 */
@Entity('dental_treatments')
export class DentalTreatment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @ManyToOne(() => Facility, { eager: true })
  @JoinColumn({ name: 'facility_id' })
  facility: Facility;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  @ManyToOne(() => Patient, { eager: true })
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;

  @Column({ name: 'visit_id', type: 'uuid', nullable: true })
  visitId?: string | null;

  // FDI tooth number as a string ("11".."48"), or null for whole-mouth work.
  @Column({ name: 'tooth', type: 'varchar', length: 10, nullable: true })
  tooth?: string | null;

  // Tooth surfaces involved, e.g. "MOD" (mesial/occlusal/distal). Free text.
  @Column({ name: 'surfaces', type: 'varchar', length: 20, nullable: true })
  surfaces?: string | null;

  @Column({ name: 'procedure', type: 'varchar', length: 30 })
  procedure: DentalProcedure;

  @Column({ name: 'status', type: 'varchar', length: 20, default: DentalStatus.PLANNED })
  status: DentalStatus;

  // Clinical findings / diagnosis for the tooth (caries, mobility, etc.).
  @Column({ name: 'findings', type: 'text', nullable: true })
  findings?: string | null;

  // What was done / notes.
  @Column({ name: 'notes', type: 'text', nullable: true })
  notes?: string | null;

  @Column({ name: 'price', type: 'numeric', precision: 12, scale: 2, nullable: true })
  price?: string | null;

  @Column({ name: 'billing_id', type: 'uuid', nullable: true })
  billingId?: string | null;

  @ManyToOne(() => User, { nullable: true, eager: true })
  @JoinColumn({ name: 'requested_by_id' })
  requestedBy?: User;

  @ManyToOne(() => User, { nullable: true, eager: true })
  @JoinColumn({ name: 'performed_by_id' })
  performedBy?: User;

  @Column({ name: 'performed_at', type: 'timestamp', nullable: true })
  performedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
