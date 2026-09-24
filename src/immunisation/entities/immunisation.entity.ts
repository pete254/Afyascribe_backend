import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * A dose actually given to a patient.
 *
 * Doses given elsewhere are recorded too — a child arriving with a home-based
 * card has had them, and treating them as missing would mean repeating them.
 */
@Entity('immunisations')
@Index(['facilityId', 'patientId'])
export class Immunisation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  /** WHO vaccine code, as the national schedule states it (BCG, MR, PCV10…). */
  @Column({ type: 'varchar', length: 40 })
  vaccine: string;

  @Column({ type: 'int' })
  dose: number;

  @Column({ name: 'given_date', type: 'date' })
  givenDate: string;

  /** Where it was given — this facility, or brought in on a card. */
  @Column({ name: 'given_here', type: 'boolean', default: true })
  givenHere: boolean;

  @Column({ name: 'batch_no', type: 'varchar', length: 60, nullable: true })
  batchNo: string | null;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate: string | null;

  /** Where in the body — left thigh, right arm, oral. */
  @Column({ type: 'varchar', length: 60, nullable: true })
  site: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'given_by_id', type: 'uuid', nullable: true })
  givenById: string | null;

  @Column({ name: 'given_by_name', type: 'varchar', length: 200, nullable: true })
  givenByName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
