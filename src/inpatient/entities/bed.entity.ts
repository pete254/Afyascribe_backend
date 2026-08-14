import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/** A physical bed in a ward. Its status drives ward occupancy. */
@Entity('beds')
@Index(['facilityId', 'wardId'])
export class Bed {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'ward_id', type: 'uuid' })
  wardId: string;

  @Column({ type: 'varchar', length: 40 })
  label: string;

  // available | occupied | blocked (maintenance / not usable)
  @Column({ type: 'varchar', length: 20, default: 'available' })
  status: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
