import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A notifiable condition seen in a patient.
 *
 * A row begins life as `suggested` — something the detector read in a
 * diagnosis — and only becomes `notified` when a person says so. The system
 * never notifies on its own: a public health response to a case that does not
 * exist has a cost, and the clinician is the one who can tell.
 *
 * Dismissals are kept rather than deleted. "Nobody was told about this, and
 * here is who decided that and why" is the question an outbreak review asks.
 */
@Entity('disease_notifications')
@Index(['facilityId', 'status'])
@Index(['facilityId', 'conditionCode', 'onsetDate'])
export class DiseaseNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  @Column({ name: 'visit_id', type: 'uuid', nullable: true })
  visitId: string | null;

  /** The IDSR condition code. */
  @Column({ name: 'condition_code', type: 'varchar', length: 40 })
  conditionCode: string;

  @Column({ name: 'condition_name', type: 'varchar', length: 200 })
  conditionName: string;

  /** True when the Ministry requires notification within 24 hours. */
  @Column({ type: 'boolean', default: false })
  immediate: boolean;

  /** Where it came from: a diagnosis, the problem list, or a person. */
  @Column({ name: 'detected_from', type: 'varchar', length: 20, default: 'diagnosis' })
  detectedFrom: 'diagnosis' | 'problem' | 'manual' | 'register';

  /** The words the detector read, kept so the suggestion can be argued with. */
  @Column({ name: 'source_text', type: 'text', nullable: true })
  sourceText: string | null;

  @Column({ type: 'varchar', length: 20, default: 'suggested' })
  status: 'suggested' | 'notified' | 'dismissed';

  /** How certain the case is, in the Ministry's terms. */
  @Column({ name: 'case_classification', type: 'varchar', length: 20, default: 'suspected' })
  caseClassification: 'suspected' | 'probable' | 'confirmed';

  @Column({ name: 'onset_date', type: 'date', nullable: true })
  onsetDate: string | null;

  @Column({ name: 'detected_at', type: 'timestamp with time zone', nullable: true })
  detectedAt: Date | null;

  @Column({ name: 'notified_at', type: 'timestamp with time zone', nullable: true })
  notifiedAt: Date | null;

  @Column({ name: 'notified_by_name', type: 'varchar', length: 200, nullable: true })
  notifiedByName: string | null;

  /** Why nobody was told, where nobody was. */
  @Column({ name: 'dismissed_reason', type: 'text', nullable: true })
  dismissedReason: string | null;

  @Column({ name: 'dismissed_by_name', type: 'varchar', length: 200, nullable: true })
  dismissedByName: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
