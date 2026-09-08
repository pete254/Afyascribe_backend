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
import { OpticalRxType, OpticalStatus } from '../optical.enums';

/**
 * An optical (optometry) encounter: the eye exam, the spectacle prescription —
 * a refraction per eye (OD = right, OS = left): sphere / cylinder / axis / add,
 * plus visual acuity — and the dispensing (frame + lens) that can be billed.
 * Refraction values are stored as text so signs and notations like "+1.25",
 * "-0.50", "PL" (plano) are preserved verbatim.
 */
@Entity('optical_prescriptions')
export class OpticalRx {
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

  @Column({ name: 'rx_type', type: 'varchar', length: 20, default: OpticalRxType.DISTANCE })
  rxType: OpticalRxType;

  // ── Right eye (OD) ─────────────────────────────────────────────────────────
  @Column({ name: 'sphere_r', type: 'varchar', length: 12, nullable: true })
  sphereR?: string | null;
  @Column({ name: 'cylinder_r', type: 'varchar', length: 12, nullable: true })
  cylinderR?: string | null;
  @Column({ name: 'axis_r', type: 'varchar', length: 8, nullable: true })
  axisR?: string | null;
  @Column({ name: 'add_r', type: 'varchar', length: 8, nullable: true })
  addR?: string | null;
  @Column({ name: 'va_r', type: 'varchar', length: 12, nullable: true })
  vaR?: string | null;

  // ── Left eye (OS) ──────────────────────────────────────────────────────────
  @Column({ name: 'sphere_l', type: 'varchar', length: 12, nullable: true })
  sphereL?: string | null;
  @Column({ name: 'cylinder_l', type: 'varchar', length: 12, nullable: true })
  cylinderL?: string | null;
  @Column({ name: 'axis_l', type: 'varchar', length: 8, nullable: true })
  axisL?: string | null;
  @Column({ name: 'add_l', type: 'varchar', length: 8, nullable: true })
  addL?: string | null;
  @Column({ name: 'va_l', type: 'varchar', length: 12, nullable: true })
  vaL?: string | null;

  // Pupillary distance (mm) and intraocular pressure (free text, e.g. "14/15").
  @Column({ name: 'pd', type: 'varchar', length: 12, nullable: true })
  pd?: string | null;
  @Column({ name: 'iop', type: 'varchar', length: 20, nullable: true })
  iop?: string | null;

  @Column({ name: 'complaint', type: 'text', nullable: true })
  complaint?: string | null;
  @Column({ name: 'findings', type: 'text', nullable: true })
  findings?: string | null;
  @Column({ name: 'advice', type: 'text', nullable: true })
  advice?: string | null;

  // ── Dispensing ─────────────────────────────────────────────────────────────
  @Column({ name: 'frame', type: 'varchar', length: 160, nullable: true })
  frame?: string | null;
  @Column({ name: 'lens_type', type: 'varchar', length: 160, nullable: true })
  lensType?: string | null;

  @Column({ name: 'price', type: 'numeric', precision: 12, scale: 2, nullable: true })
  price?: string | null;
  @Column({ name: 'billing_id', type: 'uuid', nullable: true })
  billingId?: string | null;

  @Column({ name: 'status', type: 'varchar', length: 20, default: OpticalStatus.EXAM })
  status: OpticalStatus;

  @ManyToOne(() => User, { nullable: true, eager: true })
  @JoinColumn({ name: 'optometrist_id' })
  optometrist?: User;

  @Column({ name: 'dispensed_at', type: 'timestamp', nullable: true })
  dispensedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
