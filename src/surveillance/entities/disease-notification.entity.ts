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

  // ── MOH 502, the integrated case-based surveillance form ────────────────

  /** Assigned at national level: country / county / sub-county / year. */
  @Column({ name: 'epid_no', type: 'varchar', length: 60, nullable: true })
  epidNo: string | null;

  /** C2 — when the patient was first seen at this facility. */
  @Column({ name: 'first_seen_date', type: 'date', nullable: true })
  firstSeenDate: string | null;

  /** C3 — when the sub-county was told. The 24-hour clock runs to this. */
  @Column({ name: 'notified_sub_county_at', type: 'timestamp with time zone', nullable: true })
  notifiedSubCountyAt: Date | null;

  /** C7 — clinical, laboratory, epidemiological linkage, or other. */
  @Column({ name: 'means_of_diagnosis', type: 'varchar', length: 20, nullable: true })
  meansOfDiagnosis: 'clinical' | 'lab' | 'epi-linkage' | 'other' | null;

  /** C9 — where the patient had got to when the form was completed. */
  @Column({ name: 'patient_status', type: 'varchar', length: 20, nullable: true })
  patientStatus: 'hospitalised' | 'discharged' | 'dead' | null;

  /** G1 — whether a specimen went to the laboratory. */
  @Column({ name: 'specimen_collected', type: 'boolean', nullable: true })
  specimenCollected: boolean | null;

  @Column({ name: 'specimen_type', type: 'varchar', length: 60, nullable: true })
  specimenType: string | null;

  @Column({ name: 'specimen_sent_date', type: 'date', nullable: true })
  specimenSentDate: string | null;

  @Column({ name: 'lab_name', type: 'varchar', length: 200, nullable: true })
  labName: string | null;

  /** G2 — received, or not yet. */
  @Column({ name: 'lab_result_received', type: 'boolean', nullable: true })
  labResultReceived: boolean | null;

  /** H1 — who completed the form, and in what capacity. */
  @Column({ name: 'reported_by_name', type: 'varchar', length: 200, nullable: true })
  reportedByName: string | null;

  @Column({ name: 'reported_by_designation', type: 'varchar', length: 120, nullable: true })
  reportedByDesignation: string | null;

  /**
   * The rest of the form, including the sections that apply only to one
   * disease — paralysis sites for AFP, delivery practices for neonatal
   * tetanus, rash onset for measles — and the tracer details used to find the
   * patient again. Kept whole rather than flattened into columns that would be
   * null for every other condition.
   */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  form: Record<string, unknown>;

  // ── Telling someone ─────────────────────────────────────────────────────

  /** When the alert left this system, and how it went. */
  @Column({ name: 'alerted_at', type: 'timestamp with time zone', nullable: true })
  alertedAt: Date | null;

  @Column({ name: 'alert_channel', type: 'varchar', length: 60, nullable: true })
  alertChannel: string | null;

  @Column({ name: 'alert_status', type: 'varchar', length: 40, nullable: true })
  alertStatus: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
