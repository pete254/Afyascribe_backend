/**
 * Stock is one table, but three *stores* with different rules: what each store
 * holds, how items leave it, and which accounts they hit.
 *
 *   pharmacy — drugs & vaccines: dispensed to patients (billed), HPT-coded.
 *   medical  — consumables, reagents, surgical, radiology, dental supplies:
 *              issued to departments, sometimes billed as procedure supplies.
 *   general  — cleaning, stationery, linen, kitchen, fuel, maintenance: issued
 *              to departments, never sold — straight to expense.
 *
 * Assets (equipment, furniture, vehicles) are NOT stock; they live in the
 * asset register.
 */
export type ItemClass = 'pharmacy' | 'medical' | 'general';

export const ITEM_CLASSES: { value: ItemClass; label: string }[] = [
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'medical', label: 'Medical supplies' },
  { value: 'general', label: 'General stores' },
];

export interface ItemCategoryMeta {
  label: string;
  itemClass: ItemClass;
  /** Stock (asset) account. */
  inventory: string;
  /** Where the value goes when the item is consumed: COGS for sold stock,
   *  an operating expense for general stores. */
  cogs: string;
  /** Sales account; general stores have none. */
  revenue: string | null;
}

export const ITEM_CATEGORY_META: Record<string, ItemCategoryMeta> = {
  // Pharmacy
  drug: { label: 'Drug / medicine', itemClass: 'pharmacy', inventory: '13001', cogs: '51001', revenue: '42001' },
  vaccine: { label: 'Vaccine', itemClass: 'pharmacy', inventory: '13007', cogs: '51006', revenue: '41004' },
  // Medical supplies
  consumable: { label: 'Medical consumable', itemClass: 'medical', inventory: '13003', cogs: '51002', revenue: '41004' },
  reagent: { label: 'Lab reagent', itemClass: 'medical', inventory: '13002', cogs: '51003', revenue: '43001' },
  surgical: { label: 'Surgical supply', itemClass: 'medical', inventory: '13004', cogs: '51005', revenue: '45001' },
  radiology: { label: 'Radiology consumable', itemClass: 'medical', inventory: '13005', cogs: '51007', revenue: '44001' },
  dental: { label: 'Dental supply', itemClass: 'medical', inventory: '13006', cogs: '51002', revenue: '41004' },
  other: { label: 'Other medical', itemClass: 'medical', inventory: '13003', cogs: '51002', revenue: '41004' },
  // General stores (expensed on issue; no revenue)
  cleaning: { label: 'Cleaning material', itemClass: 'general', inventory: '13010', cogs: '62007', revenue: null },
  stationery: { label: 'Stationery & printing', itemClass: 'general', inventory: '13009', cogs: '62009', revenue: null },
  linen: { label: 'Linen & laundry', itemClass: 'general', inventory: '13011', cogs: '62010', revenue: null },
  kitchen: { label: 'Kitchen & catering', itemClass: 'general', inventory: '13012', cogs: '62011', revenue: null },
  fuel: { label: 'Fuel & lubricants', itemClass: 'general', inventory: '13013', cogs: '66001', revenue: null },
  maintenance: { label: 'Maintenance spares', itemClass: 'general', inventory: '13014', cogs: '62008', revenue: null },
};

export const ITEM_CATEGORIES = Object.keys(ITEM_CATEGORY_META);

export const categoryMeta = (category?: string | null): ItemCategoryMeta =>
  ITEM_CATEGORY_META[category ?? 'drug'] ?? ITEM_CATEGORY_META.drug;

export const classOf = (category?: string | null): ItemClass => categoryMeta(category).itemClass;

/** GL accounts for a category (revenue falls back to the generic sales account). */
export const accountsFor = (category?: string | null) => {
  const m = categoryMeta(category);
  return { inventory: m.inventory, cogs: m.cogs, revenue: m.revenue ?? '41004' };
};
