import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * An imaging exam the facility offers (e.g. "Chest X-Ray"), the radiology
 * counterpart of a lab test. Seeded from the KNHTS national Investigations
 * (Imaging domain), each carrying its LOINC code, so studies are coded for
 * DHA/SHA interoperability.
 */
@Entity('radiology_exams')
@Index(['facilityId'])
export class RadiologyExam {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column()
  name: string;

  /** Modality / sub-domain, e.g. X-Ray, CT, MRI, Ultrasound (from KNHTS subdomain). */
  @Column({ type: 'varchar', length: 60, nullable: true })
  modality: string | null;

  /** KNHTS Investigation concept code (MOH-PPB/Investigations). */
  @Column({ name: 'knhts_code', type: 'varchar', length: 64, nullable: true })
  knhtsCode: string | null;

  /** LOINC code (from the KNHTS concept's extras). */
  @Column({ name: 'loinc_code', type: 'varchar', length: 32, nullable: true })
  loincCode: string | null;

  @Column({ name: 'loinc_name', type: 'text', nullable: true })
  loincName: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  price: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
