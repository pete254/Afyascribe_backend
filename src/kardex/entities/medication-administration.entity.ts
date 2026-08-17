import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * One line on a nurse's medication kardex (MAR — Medication Administration
 * Record): a single "the drug was given / held / refused" event, time-stamped
 * and signed by the nurse who did it.
 *
 * The drug *orders* themselves come from the doctor's prescriptions — this table
 * only records what actually happened at the bedside, drug by drug, round by
 * round. Each row optionally links back to the prescription item it fulfils
 * (`prescriptionItemId`) so a medication's whole administration trail can be
 * reconstructed; ad-hoc / PRN ward drugs that were never on a pharmacy
 * prescription are captured by the snapshot fields alone.
 */
export type AdministrationStatus =
  | 'given'
  | 'held'
  | 'refused'
  | 'omitted'
  | 'not_available';

@Entity('medication_administrations')
@Index(['facilityId', 'patientId'])
@Index(['facilityId', 'admissionId'])
export class MedicationAdministration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  /** The admission this kardex round belongs to (inpatient bedside context). */
  @Column({ name: 'admission_id', type: 'uuid', nullable: true })
  admissionId: string | null;

  /** The prescription the drug came from, when it was a pharmacy order. */
  @Column({ name: 'prescription_id', type: 'uuid', nullable: true })
  prescriptionId: string | null;

  /** The specific prescription line this administration fulfils. */
  @Column({ name: 'prescription_item_id', type: 'uuid', nullable: true })
  prescriptionItemId: string | null;

  // ── Snapshot of what was given (stable even if the order changes) ───────────
  @Column({ type: 'varchar' })
  medication: string;

  @Column({ type: 'varchar', nullable: true })
  dose: string | null;

  @Column({ type: 'varchar', nullable: true })
  route: string | null;

  /** Ordered frequency, snapshotted for context on the round sheet. */
  @Column({ type: 'varchar', nullable: true })
  frequency: string | null;

  /** When this dose was due (the scheduled round), if known. */
  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt: Date | null;

  /** When the nurse actually acted. Defaults to now. */
  @Column({ name: 'administered_at', type: 'timestamptz' })
  administeredAt: Date;

  @Column({ type: 'varchar', length: 20, default: 'given' })
  status: AdministrationStatus;

  // ── Who signed for it ──────────────────────────────────────────────────────
  @Column({ name: 'administered_by_id', type: 'uuid', nullable: true })
  administeredById: string | null;

  @Column({ name: 'administered_by_name', nullable: true })
  administeredByName: string | null;

  /** Why held/refused, site of injection, patient response, etc. */
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
