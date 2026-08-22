import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A fixed asset in the facility's register — equipment, furniture, vehicles,
 * medical devices, IT, etc. Carries acquisition, custody and depreciation
 * details; its full history (custody changes, repairs, disposal) lives in
 * {@link AssetEvent}.
 */
@Entity('assets')
@Index(['facilityId', 'status'])
export class Asset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'asset_tag', type: 'varchar', length: 40 })
  assetTag: string;

  @Column()
  name: string;

  /** equipment | furniture | vehicle | medical | it | building | other */
  @Column({ name: 'asset_type', type: 'varchar', length: 40, default: 'equipment' })
  assetType: string;

  @Column({ name: 'serial_number', type: 'varchar', nullable: true })
  serialNumber: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'purchase_date', type: 'date', nullable: true })
  purchaseDate: string | null;

  @Column({ name: 'purchase_cost', type: 'numeric', precision: 14, scale: 2, default: 0 })
  purchaseCost: string;

  @Column({ name: 'salvage_value', type: 'numeric', precision: 14, scale: 2, default: 0 })
  salvageValue: string;

  /** straight_line | none */
  @Column({ name: 'depreciation_method', type: 'varchar', length: 20, default: 'straight_line' })
  depreciationMethod: string;

  @Column({ name: 'useful_life_years', type: 'numeric', precision: 6, scale: 2, default: 0 })
  usefulLifeYears: string;

  /** in_use | in_repair | idle | retired | disposed */
  @Column({ type: 'varchar', length: 20, default: 'in_use' })
  status: string;

  @Column({ type: 'varchar', nullable: true })
  custodian: string | null;

  @Column({ type: 'varchar', nullable: true })
  location: string | null;

  @Column({ type: 'varchar', nullable: true })
  supplier: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
