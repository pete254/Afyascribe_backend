import { OclConcept } from '../terminology/ocl.client';

/**
 * The KNHTS Health Products & Technologies dictionary (MOH-PPB/HPT) is tiered,
 * not a flat catalogue. Concept ids carry the tier:
 *
 *   GE  generic product    "Budesonide 100 mcg Nasal Spray" — what a pharmacy stocks
 *   PH  registered product "Morphine Sulphate" (PPB reg.)   — a registered pack
 *   AC  active component   "Morphine"                       — a substance, not dispensable
 *   FS  brand / trade name "SOFTRON"                        — a registered brand
 *   DF / UM / RT           dose forms, units, routes        — reference data
 *
 * Measured 2026-09-22 across all 17,793 concepts: PH 11,266 · GE 2,635 ·
 * AC 2,632 · DF 596 · UM 493 · FS 120 · RT 39.
 *
 * Only the generic tier is stockable: it is what clinicians prescribe and what
 * national reporting aggregates on, and it carries the ATC code, dose form,
 * route and strength. Everything else is reference data or brand detail that
 * belongs on a batch, never as an inventory line.
 */
export type HptTier = 'generic' | 'brand' | 'product' | 'component' | 'reference';

/** Dose-form and route concepts — the lookup that turns a code into words. */
export const isDoseFormCode = (code?: string | null) => (code ?? '').startsWith('DF');
export const isRouteCode = (code?: string | null) => (code ?? '').startsWith('RT');

export function hptTier(code?: string | null): HptTier {
  const p = (code ?? '').slice(0, 2);
  if (p === 'GE') return 'generic';
  if (p === 'FS') return 'brand';
  if (p === 'PH') return 'product';
  if (p === 'AC') return 'component';
  return 'reference';
}

/** Tiers that may exist as a stock item. */
export const STOCKABLE_TIERS: HptTier[] = ['generic'];
export const isStockableHpt = (code?: string | null) => STOCKABLE_TIERS.includes(hptTier(code));

export interface HptDetails {
  knhtsCode: string;
  knhtsName: string | null;
  hptTier: HptTier;
  atcCode: string | null;
  doseFormCode: string | null;
  routeCode: string | null;
  strength: string | null;
  genericCode: string | null;
  activeComponentCode: string | null;
  ppbRegistrationCode: string | null;
}

const str = (x: Record<string, unknown>, k: string): string | null => {
  const v = x[k];
  return typeof v === 'string' && v.trim() && v.trim().toUpperCase() !== 'NULL' ? v.trim() : null;
};

/** Pull the coded detail KNHTS carries for a product into our columns. */
export function hptDetails(c: OclConcept): HptDetails {
  const x = (c.extras ?? {}) as Record<string, unknown>;
  const amount = str(x, 'strength_amount');
  const unit = str(x, 'strength_unit');
  return {
    knhtsCode: c.id,
    knhtsName: c.display_name || null,
    hptTier: hptTier(c.id),
    atcCode: str(x, 'atc_code'),
    doseFormCode: str(x, 'form_code'),
    routeCode: str(x, 'route_code'),
    strength: amount && unit ? `${amount} ${unit}` : amount,
    genericCode: str(x, 'generic_concept_code'),
    activeComponentCode: str(x, 'active_component_code'),
    ppbRegistrationCode: str(x, 'ppb_registration_code'),
  };
}

/**
 * The fullest name KNHTS has for a concept: its long name where one exists
 * ("Morphine Sulphate 10 mg Injection Solution") rather than the short display.
 */
export function hptName(c: OclConcept): string {
  const longest = (c.names ?? [])
    .map((n) => n.name)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0];
  return (longest && longest.length > (c.display_name ?? '').length ? longest : c.display_name) || c.id;
}
