import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { InventoryItem } from './inventory-item.entity';

export type StockMovementType =
  | 'opening'
  | 'receipt'
  | 'issue'
  | 'adjustment_in'
  | 'adjustment_out'
  | 'transfer_in'
  | 'transfer_out';

/**
 * One line of the stock ledger. `quantity` and `value` are signed (+in / −out),
 * and `balanceQty` / `balanceValue` snapshot the item's running position right
 * after this movement, so valuation history is auditable without replay.
 */
@Entity('stock_movements')
@Index(['facilityId', 'itemId', 'createdAt'])
export class StockMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @ManyToOne(() => InventoryItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: InventoryItem;

  @Column({ type: 'varchar', length: 20 })
  type: StockMovementType;

  @Column({ type: 'date' })
  date: string;

  /** Signed change in units (positive in, negative out). */
  @Column({ type: 'numeric', precision: 14, scale: 3 })
  quantity: string;

  @Column({ name: 'unit_cost', type: 'numeric', precision: 14, scale: 4, default: 0 })
  unitCost: string;

  /** Signed change in value. */
  @Column({ type: 'numeric', precision: 14, scale: 2 })
  value: string;

  @Column({ name: 'balance_qty', type: 'numeric', precision: 14, scale: 3, default: 0 })
  balanceQty: string;

  @Column({ name: 'balance_value', type: 'numeric', precision: 14, scale: 2, default: 0 })
  balanceValue: string;

  @Column({ type: 'varchar', nullable: true })
  reference: string | null;

  @Column({ name: 'source_type', type: 'varchar', length: 60, nullable: true })
  sourceType: string | null;

  @Column({ name: 'source_id', type: 'uuid', nullable: true })
  sourceId: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
