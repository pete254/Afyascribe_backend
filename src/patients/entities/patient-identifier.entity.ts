import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * One identifier a patient holds. A patient may hold several — a child has a
 * birth certificate and later a national ID; a refugee holds a refugee ID and
 * perhaps an alien ID; SHA needs its own number alongside the national ID — so
 * the old single idType/idNumber pair could only ever record one of them.
 */
@Entity('patient_identifiers')
@Index(['facilityId', 'patientId'])
@Index(['facilityId', 'type', 'value'])
export class PatientIdentifier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  /** Code from the national Kenya Patient Identifiers list, where one exists. */
  @Column({ type: 'varchar', length: 40 })
  type: string;

  /** The value set the type came from, null where the type is not national. */
  @Column({ name: 'type_system', type: 'varchar', length: 40, nullable: true })
  typeSystem: string | null;

  @Column({ type: 'varchar', length: 100 })
  value: string;

  /** The one shown first and used to identify the patient by default. */
  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'now()' })
  createdAt: Date;
}
