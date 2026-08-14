import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * An inpatient admission — from admission to discharge. Feeds the daily bed
 * return (MOH 328) and the inpatient section of the workload report (MOH 717).
 */
@Entity('admissions')
@Index(['facilityId', 'status'])
@Index(['facilityId', 'patientId'])
export class Admission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'admission_no', type: 'varchar', length: 30, nullable: true })
  admissionNo: string | null;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  @Column({ name: 'ward_id', type: 'uuid' })
  wardId: string;

  @Column({ name: 'bed_id', type: 'uuid', nullable: true })
  bedId: string | null;

  @Column({ name: 'visit_id', type: 'uuid', nullable: true })
  visitId: string | null;

  @Column({ name: 'admitted_at', type: 'timestamptz' })
  admittedAt: Date;

  @Column({ name: 'admitted_by_id', type: 'uuid', nullable: true })
  admittedById: string | null;

  @Column({ name: 'admission_diagnosis', type: 'text', nullable: true })
  admissionDiagnosis: string | null;

  // admitted | discharged
  @Column({ type: 'varchar', length: 20, default: 'admitted' })
  status: string;

  @Column({ name: 'discharged_at', type: 'timestamptz', nullable: true })
  dischargedAt: Date | null;

  // discharged | referred | deceased | absconded
  @Column({ type: 'varchar', length: 20, nullable: true })
  outcome: string | null;

  @Column({ name: 'discharge_notes', type: 'text', nullable: true })
  dischargeNotes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
