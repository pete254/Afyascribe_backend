import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * One entry in an asset's ledger/history: acquisition, assignment, transfer of
 * custody, repair, maintenance, revaluation, depreciation or disposal. Together
 * these give a full account of the asset over its life.
 */
@Entity('asset_events')
@Index(['facilityId', 'assetId', 'date'])
export class AssetEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'asset_id', type: 'uuid' })
  assetId: string;

  /** acquired | assigned | transferred | repair | maintenance | revaluation | depreciation | disposed | note */
  @Column({ type: 'varchar', length: 24 })
  type: string;

  @Column({ type: 'date' })
  date: string;

  /** Money attached to the event — repair cost, disposal proceeds, revaluation, etc. */
  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  amount: string;

  @Column({ name: 'from_custodian', type: 'varchar', nullable: true })
  fromCustodian: string | null;

  @Column({ name: 'to_custodian', type: 'varchar', nullable: true })
  toCustodian: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
