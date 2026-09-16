import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { LabAnalyte } from './lab-analyte.entity';

/**
 * A test the lab offers (e.g. Full Blood Count). Its analytes define what is
 * measured and the normal range each result is flagged against.
 */
@Entity('lab_tests')
@Index(['facilityId'])
export class LabTest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  code: string | null;

  @Column()
  name: string;

  /** KNHTS Investigation concept code (MOH-PPB/Investigations) for interoperability. */
  @Column({ name: 'knhts_code', type: 'varchar', length: 64, nullable: true })
  knhtsCode: string | null;

  /** LOINC code (from the KNHTS Investigation concept's extras). */
  @Column({ name: 'loinc_code', type: 'varchar', length: 32, nullable: true })
  loincCode: string | null;

  /** LOINC long common name, kept for display and FHIR export. */
  @Column({ name: 'loinc_name', type: 'text', nullable: true })
  loincName: string | null;

  /** blood | serum | plasma | urine | stool | swab | sputum | csf | other */
  @Column({ type: 'varchar', length: 40, default: 'blood' })
  specimen: string;

  /** haematology | chemistry | microbiology | serology | parasitology | … */
  @Column({ type: 'varchar', length: 40, nullable: true })
  department: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  price: string;

  @Column({ name: 'turnaround_hours', type: 'int', nullable: true })
  turnaroundHours: number | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @OneToMany(() => LabAnalyte, (a) => a.test, { cascade: true, eager: true })
  analytes: LabAnalyte[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
