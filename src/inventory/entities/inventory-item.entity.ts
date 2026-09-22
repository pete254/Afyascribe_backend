import { ItemClass } from '../item-classes';
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

  /** KNHTS Health Products & Technologies (MOH-PPB/HPT) concept code. */
  @Column({ name: 'knhts_code', type: 'varchar', length: 64, nullable: true })
  knhtsCode: string | null;

  /** KNHTS concept display name, kept for reference and FHIR export. */
  /**
   * Which tier of the HPT dictionary `knhtsCode` belongs to. Only the generic
   * tier is stockable; the rest is reference data or brand detail.
   */
  @Column({ name: 'hpt_tier', type: 'varchar', length: 20, nullable: true })
  hptTier: string | null;

  /** WHO ATC classification, where KNHTS carries one. */
  @Column({ name: 'atc_code', type: 'varchar', length: 20, nullable: true })
  atcCode: string | null;

  @Column({ name: 'dose_form_code', type: 'varchar', length: 30, nullable: true })
  doseFormCode: string | null;

  /** The dose form in words — "Tablet", "Spray" — resolved from its HPT code. */
  @Column({ name: 'dose_form', type: 'varchar', length: 80, nullable: true })
  doseForm: string | null;

  @Column({ name: 'route_code', type: 'varchar', length: 30, nullable: true })
  routeCode: string | null;

  /** The route in words — "Oral", "Nasal" — resolved from its HPT code. */
  @Column({ type: 'varchar', length: 80, nullable: true })
  route: string | null;

  /** e.g. "500 mg", "100 mcg" — as KNHTS states it. */
  @Column({ type: 'varchar', length: 60, nullable: true })
  strength: string | null;

  /** Parent generic and active component, for reporting that aggregates upward. */
  @Column({ name: 'generic_code', type: 'varchar', length: 64, nullable: true })
  genericCode: string | null;

  @Column({ name: 'active_component_code', type: 'varchar', length: 64, nullable: true })
  activeComponentCode: string | null;

  @Column({ name: 'ppb_registration_code', type: 'varchar', length: 60, nullable: true })
  ppbRegistrationCode: string | null;

  @Column({ name: 'knhts_name', type: 'text', nullable: true })
  knhtsName: string | null;

  /** drug | reagent | consumable | surgical | vaccine | radiology | other */
  @Column({ type: 'varchar', length: 40, default: 'drug' })
  category: string;

  /** Which store this belongs to (derived from the category): pharmacy | medical | general. */
  @Column({ name: 'item_class', type: 'varchar', length: 20, default: 'pharmacy' })
  itemClass: ItemClass;

  @Column({ type: 'varchar', length: 20, default: 'unit' })
  unit: string;

  @Column({ name: 'sale_price', type: 'numeric', precision: 14, scale: 2, default: 0 })
  salePrice: string;

  /** Reference cost — kept in step with the moving-average cost on each receipt. */
  @Column({ name: 'cost_price', type: 'numeric', precision: 14, scale: 2, default: 0 })
  costPrice: string;

  /** Last unit price charged at dispensing when the item has no sale price — next time's default. */
  @Column({ name: 'suggested_price', type: 'numeric', precision: 14, scale: 2, nullable: true })
  suggestedPrice: string | null;

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

  /**
   * Controlled-drug schedule under the Narcotic Drugs and Psychotropic
   * Substances (Control) Act, Cap 245 — 'narcotic' or 'psychotropic'. When set,
   * every movement of this item is written to the controlled drugs register.
   */
  @Column({ name: 'controlled_schedule', type: 'varchar', length: 20, nullable: true })
  controlledSchedule: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
