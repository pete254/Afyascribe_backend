import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/** A ward / unit that holds beds — the unit of the daily bed return (MOH 328). */
@Entity('wards')
@Index(['facilityId'])
export class Ward {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  // general | maternity | paediatric | surgical | private | icu | other
  @Column({ name: 'ward_type', type: 'varchar', length: 32, default: 'general' })
  wardType: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
