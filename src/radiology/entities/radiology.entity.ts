import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, JoinColumn } from 'typeorm';
import { Patient } from '../../patients/entities/patient.entity';
import { User } from '../../users/entities/user.entity';
import { Facility } from '../../facilities/entities/facility.entity';
import { RadiologyType } from '../radiology-type.enum';
import { RadiologyStatus } from '../radiology-status.enum';

@Entity('radiology')
export class Radiology {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Stored as varchar to match the migration (see 1717400000000-AddRadiology);
  // the enum stays the TS type for compile-time safety.
  @Column({ type: 'varchar', length: 30 })
  type: RadiologyType;

  @ManyToOne(() => Patient, { eager: true })
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;

  @ManyToOne(() => Facility, { eager: true })
  @JoinColumn({ name: 'facility_id' })
  facility: Facility;

  @ManyToOne(() => User, { nullable: true, eager: true })
  @JoinColumn({ name: 'requested_by_id' })
  requestedBy?: User;

  @ManyToOne(() => User, { nullable: true, eager: true })
  @JoinColumn({ name: 'performed_by_id' })
  performedBy?: User;

  @Column({ name: 'scheduled_at', type: 'timestamp', nullable: true })
  scheduledAt?: Date;

  @Column({ type: 'varchar', length: 20, default: RadiologyStatus.REQUESTED })
  status: RadiologyStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'text', nullable: true })
  report?: string;

  // Billing: the price charged, the visit the charge hangs on, and the raised
  // bill's id. Set when the study is requested with a price.
  @Column({ name: 'price', type: 'numeric', precision: 12, scale: 2, nullable: true })
  price?: string | null;

  @Column({ name: 'visit_id', type: 'uuid', nullable: true })
  visitId?: string | null;

  @Column({ name: 'billing_id', type: 'uuid', nullable: true })
  billingId?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
