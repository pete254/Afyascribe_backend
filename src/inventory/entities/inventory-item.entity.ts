import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * A stock item / product. Carries its own account mapping so posting rules know
 * which inventory, COGS and revenue accounts a movement of this item hits —
 * pharmacy drugs, lab reagents and consumables each land in different accounts.
 * Current on-hand quantity and value are kept here (moving average = value/qty)
 * and updated on every stock movement.
 */
@Entity('inventory_items')
@Index(['facilityId', 'sku'])
export class InventoryItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  sku: string | null;

  @Column()
  name: string;

  /** drug | reagent | consumable | surgical | vaccine | radiology | other */
  @Column({ type: 'varchar', length: 40, default: 'drug' })
  category: string;

  @Column({ type: 'varchar', length: 20, default: 'unit' })
  unit: string;

  @Column({ name: 'sale_price', type: 'numeric', precision: 14, scale: 2, default: 0 })
  salePrice: string;

  /** Reference cost — kept in step with the moving-average cost on each receipt. */
  @Column({ name: 'cost_price', type: 'numeric', precision: 14, scale: 2, default: 0 })
  costPrice: string;

  /** When set, sale price is derived as cost × (1 + markupPct/100). Null = manual. */
  @Column({ name: 'markup_pct', type: 'numeric', precision: 6, scale: 2, nullable: true })
  markupPct: string | null;

  @Column({ name: 'reorder_level', type: 'numeric', precision: 14, scale: 3, default: 0 })
  reorderLevel: string;

  @Column({ name: 'track_stock', type: 'boolean', default: true })
  trackStock: boolean;

  @Column({ name: 'stock_qty', type: 'numeric', precision: 14, scale: 3, default: 0 })
  stockQty: string;

  @Column({ name: 'stock_value', type: 'numeric', precision: 14, scale: 2, default: 0 })
  stockValue: string;

  // ── Account mapping (COA codes) ─────────────────────────────────────────────
  @Column({ name: 'inventory_account_code', type: 'varchar', length: 20, default: '13001' })
  inventoryAccountCode: string;

  @Column({ name: 'cogs_account_code', type: 'varchar', length: 20, default: '51001' })
  cogsAccountCode: string;

  @Column({ name: 'revenue_account_code', type: 'varchar', length: 20, default: '42001' })
  revenueAccountCode: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
