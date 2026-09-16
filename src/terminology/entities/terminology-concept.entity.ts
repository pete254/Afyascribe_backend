import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * A single concept mirrored from the Kenya National Health Terminology Service
 * (KNHTS, an Open Concept Lab deployment at ilm-hie.dha.go.ke/ocl).
 *
 * The mirror lets us search and validate codes offline (fast, resilient) while
 * a periodic sync keeps it in step with the national service. `domain` is our
 * own logical grouping (diagnosis, procedure, lab, drug, reference) mapped onto
 * the KNHTS org/source in sync-targets.ts.
 */
@Entity('terminology_concepts')
@Index(['org', 'system', 'code'], { unique: true })
@Index(['domain', 'system'])
export class TerminologyConcept {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** OCL organisation short code, e.g. WHO, MOH-PPB, MOH-KENYA. */
  @Column({ length: 64 })
  org: string;

  /** OCL source short code, e.g. ICD-11, ICHI, HPT, Investigations, LOINC. */
  @Column({ length: 64 })
  system: string;

  /** The concept code within the source, e.g. 1A00, INV-00001893. */
  @Column({ length: 64 })
  code: string;

  @Column({ type: 'text' })
  display: string;

  /** Our logical domain: diagnosis | procedure | lab | drug | reference. */
  @Column({ length: 32 })
  domain: string;

  @Column({ length: 64, nullable: true })
  concept_class: string | null;

  @Column({ length: 64, nullable: true })
  datatype: string | null;

  /** Synonyms / alternative names, used to widen local search. */
  @Column({ type: 'text', array: true, default: [] })
  synonyms: string[];

  /** OCL `extras` verbatim — carries crosswalks (e.g. LOINC code on an investigation). */
  @Column({ type: 'jsonb', nullable: true })
  extras: Record<string, unknown> | null;

  @Column({ default: false })
  retired: boolean;

  /** OCL `updated_on` for the concept, for incremental sync. */
  @Column({ type: 'timestamp', nullable: true })
  source_updated_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
