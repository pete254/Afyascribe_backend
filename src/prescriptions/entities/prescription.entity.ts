import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { PrescriptionItem } from './prescription-item.entity';

/**
 * A prescription's lifecycle:
 *  - pending    the doctor wrote it; it is waiting in the pharmacy queue.
 *  - dispensed  the pharmacy handed the medicine over (stock depleted).
 *  - cancelled  voided before dispensing.
 */
export type PrescriptionStatus = 'pending' | 'dispensed' | 'cancelled';

/**
 * A prescription written by a doctor during a consultation. It lands in the
 * pharmacy queue where the pharmacist links each line to a stocked item, prices
 * it, raises the bill, and — once paid — dispenses it (depleting inventory).
 * Patient/doctor names are snapshotted so history is stable.
 */
@Entity('prescriptions')
@Index(['facilityId', 'status'])
@Index(['facilityId', 'patientId'])
export class Prescription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'rx_no', type: 'varchar', length: 30 })
  rxNo: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  @Column({ name: 'patient_name', nullable: true })
  patientName: string | null;

  @Column({ name: 'patient_no', type: 'varchar', nullable: true })
  patientNo: string | null;

  @Column({ name: 'visit_id', type: 'uuid', nullable: true })
  visitId: string | null;

  @Column({ name: 'doctor_id', type: 'uuid', nullable: true })
  doctorId: string | null;

  @Column({ name: 'doctor_name', nullable: true })
  doctorName: string | null;

  @Column({ type: 'text', nullable: true })
  diagnosis: string | null;

  /** Special instructions / notes for the whole prescription. */
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: PrescriptionStatus;

  @Column({ name: 'dispensed_by_id', type: 'uuid', nullable: true })
  dispensedById: string | null;

  @Column({ name: 'dispensed_by_name', nullable: true })
  dispensedByName: string | null;

  @Column({ name: 'dispensed_at', type: 'timestamptz', nullable: true })
  dispensedAt: Date | null;

  @OneToMany(() => PrescriptionItem, (i) => i.prescription, { cascade: true, eager: true })
  items: PrescriptionItem[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
