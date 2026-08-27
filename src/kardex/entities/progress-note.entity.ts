import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * A free-text clinical progress note on the ward — the running narrative that
 * sits alongside the structured care plan, vitals and MAR. Each note is tagged
 * with the author's role so the kardex can split them into the doctor's
 * ward-round notes and the nurses' shift/progress notes.
 */
@Entity('progress_notes')
@Index(['facilityId', 'patientId'])
@Index(['facilityId', 'admissionId'])
export class ProgressNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  @Column({ name: 'admission_id', type: 'uuid', nullable: true })
  admissionId: string | null;

  // doctor | nurse
  @Column({ name: 'author_role', type: 'varchar', length: 10 })
  authorRole: 'doctor' | 'nurse';

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @Column({ name: 'created_by_name', type: 'varchar', length: 160, nullable: true })
  createdByName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
