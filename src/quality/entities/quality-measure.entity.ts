import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { MeasureProvenance } from '../quality';

/**
 * A measure definition brought in from outside — a national indicator, a donor
 * programme's, a county's.
 *
 * Imported definitions are stored and reported against; they are not executed.
 * Running arbitrary criteria would need a query language this system does not
 * have, and pretending otherwise would produce numbers nobody could defend.
 * A value for an imported measure is captured, not calculated, and the record
 * says which it was.
 */
@Entity('quality_measures')
@Index(['facilityId', 'measureId'], { unique: true })
export class QualityMeasure {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  /** The identifier the source uses, kept so submissions line up. */
  @Column({ name: 'measure_id', type: 'varchar', length: 120 })
  measureId: string;

  @Column({ type: 'varchar', length: 300 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text' })
  numerator: string;

  @Column({ type: 'text' })
  denominator: string;

  @Column({ type: 'varchar', length: 20, default: 'proportion' })
  scoring: 'proportion' | 'count';

  @Column({ type: 'varchar', length: 20, default: 'increase' })
  improvement: 'increase' | 'decrease';

  @Column({ type: 'varchar', length: 120, nullable: true })
  category: string | null;

  @Column({ type: 'varchar', length: 20, default: 'imported' })
  provenance: MeasureProvenance;

  /** The published indicator this was taken from, where it names one. */
  @Column({ name: 'national_indicator', type: 'varchar', length: 200, nullable: true })
  nationalIndicator: string | null;

  /** The definition as it arrived, kept whole so nothing is lost in translation. */
  @Column({ name: 'source_document', type: 'jsonb', nullable: true })
  sourceDocument: unknown;

  @Column({ name: 'imported_by_name', type: 'varchar', length: 200, nullable: true })
  importedByName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
