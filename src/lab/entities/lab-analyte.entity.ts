import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { LabTest } from './lab-test.entity';

/**
 * One measured component of a test (e.g. Haemoglobin within a Full Blood Count),
 * with the unit and normal range its results are checked against. A numeric range
 * (low/high) drives High/Low flagging; refText handles qualitative results
 * (e.g. expected "Negative").
 */
@Entity('lab_analytes')
export class LabAnalyte {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'lab_test_id', type: 'uuid' })
  labTestId: string;

  @ManyToOne(() => LabTest, (t) => t.analytes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lab_test_id' })
  test: LabTest;

  @Column()
  name: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  unit: string | null;

  @Column({ name: 'ref_low', type: 'numeric', precision: 14, scale: 4, nullable: true })
  refLow: string | null;

  @Column({ name: 'ref_high', type: 'numeric', precision: 14, scale: 4, nullable: true })
  refHigh: string | null;

  @Column({ name: 'ref_text', type: 'varchar', nullable: true })
  refText: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;
}
