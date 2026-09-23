/**
 * Body measurements derived from what triage records.
 *
 * Nothing here is a reference range or a growth standard: BMI is arithmetic,
 * and the adult categories below are the WHO cut-offs, which are fixed and
 * universal. Child growth (weight-for-age, height-for-age z-scores) needs the
 * WHO LMS reference tables and is deliberately NOT approximated here — a
 * fabricated z-score would be read as clinical fact.
 */

/** Read a measurement that may carry its unit ("72", "72 kg", "1.68m"). */
export function parseMeasurement(v?: string | number | null): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Height in metres, accepting either unit. Triage is typed by hand, so "168"
 * (cm) and "1.68" (m) both arrive; anything at or above 3 is taken as
 * centimetres, since no patient is three metres tall.
 */
export function heightInMetres(height?: string | number | null): number | null {
  const n = parseMeasurement(height);
  if (n == null) return null;
  const m = n >= 3 ? n / 100 : n;
  // Outside this range the entry is a typo, not a person.
  return m >= 0.3 && m <= 2.6 ? m : null;
}

export function weightInKg(weight?: string | number | null): number | null {
  const n = parseMeasurement(weight);
  if (n == null) return null;
  return n >= 0.5 && n <= 400 ? n : null;
}

export const BMI_CATEGORIES = [
  { max: 18.5, label: 'Underweight' },
  { max: 25, label: 'Normal' },
  { max: 30, label: 'Overweight' },
  { max: Infinity, label: 'Obese' },
] as const;

export interface Bmi {
  value: number;
  /** WHO adult category. Null for a child, where adult cut-offs do not apply. */
  category: string | null;
  heightM: number;
  weightKg: number;
}

/**
 * BMI from a triage record. `ageYears` is used only to withhold the adult
 * category from children — BMI-for-age in children is read against the WHO
 * growth reference, not these cut-offs, and labelling a child "obese" from an
 * adult table would be wrong.
 */
export function bmiFrom(
  weight?: string | number | null,
  height?: string | number | null,
  ageYears?: number | null,
): Bmi | null {
  const w = weightInKg(weight);
  const h = heightInMetres(height);
  if (w == null || h == null) return null;
  const value = Math.round((w / (h * h)) * 10) / 10;
  const isAdult = ageYears == null || ageYears >= 20;
  const category = isAdult ? BMI_CATEGORIES.find((c) => value < c.max)!.label : null;
  return { value, category, heightM: h, weightKg: w };
}
