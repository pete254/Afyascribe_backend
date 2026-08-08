import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * A received lot of a stock item with its own expiry. Stock is consumed
 * first-expiry-first-out (FEFO), so `qtyRemaining` is drawn down from the
 * earliest-expiring batch on each issue. The item's moving-average value and
 * total quantity remain the master figures; batches track composition + expiry.
 */
@Entity('stock_batches')
@Index(['facilityId', 'itemId'])
export class StockBatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ name: 'batch_no', type: 'varchar', length: 60, nullable: true })
  batchNo: string | null;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate: string | null;

  @Column({ name: 'qty_received', type: 'numeric', precision: 14, scale: 3 })
  qtyReceived: string;

  @Column({ name: 'qty_remaining', type: 'numeric', precision: 14, scale: 3 })
  qtyRemaining: string;

  @Column({ name: 'unit_cost', type: 'numeric', precision: 14, scale: 4, default: 0 })
  unitCost: string;

  @Column({ name: 'received_at', type: 'date' })
  receivedAt: string;

  @Column({ name: 'source_type', type: 'varchar', length: 60, nullable: true })
  sourceType: string | null;

  @Column({ name: 'source_id', type: 'uuid', nullable: true })
  sourceId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
