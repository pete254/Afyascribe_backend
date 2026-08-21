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

  /**
   * How the daily bed fee is charged for patients in this ward:
   *   normal  → auto-accrue `bedDailyCharge` every night from the admission day
   *   special → no auto charge; the nurse enters bed/accommodation charges by hand
   */
  @Column({ name: 'bed_charge_mode', type: 'varchar', length: 16, default: 'normal' })
  bedChargeMode: string;

  /** The nightly bed fee (used when bedChargeMode = 'normal'). */
  @Column({ name: 'bed_daily_charge', type: 'numeric', precision: 12, scale: 2, default: 0 })
  bedDailyCharge: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
