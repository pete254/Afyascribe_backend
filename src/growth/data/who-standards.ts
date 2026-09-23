import lms from './who-lms.json';

/**
 * WHO Child Growth Standards (0–5 years) — the L, M and S parameters.
 *
 * Extracted verbatim from WHO's published z-score tables:
 *   https://www.who.int/tools/child-growth-standards/standards
 *   weight-for-age, length/height-for-age, weight-for-length, weight-for-height
 *   (boys and girls, birth to 5 years), downloaded 2026-09-23.
 *
 * These are real reference data, not approximations. A fabricated z-score would
 * be read as clinical fact and acted on — a child classified as severely
 * wasted is admitted to a feeding programme — so nothing here is invented, and
 * a measurement outside the published range returns no z-score at all.
 */

/** weight-for-age, height-for-age, weight-for-length (<2y), weight-for-height (2–5y). */
export type GrowthIndicator = 'wfa' | 'hfa' | 'wfl' | 'wfh';
export type Sex = 'M' | 'F';

/** [L, M, S, SD3neg, SD2neg, SD2pos, SD3pos] as WHO publishes them. */
export type LmsRow = [number, number, number, number | null, number | null, number | null, number | null];

const TABLES = lms as unknown as Record<string, Record<string, LmsRow>>;

/** The table key is age in whole months, or length/height in centimetres. */
export function lmsFor(indicator: GrowthIndicator, sex: Sex, key: number): LmsRow | null {
  const table = TABLES[`${indicator}_${sex}`];
  if (!table) return null;

  // Length and height tables step in half-centimetres; ages step in months.
  const step = indicator === 'wfl' || indicator === 'wfh' ? 0.5 : 1;
  const snapped = Math.round(key / step) * step;
  const exact = table[String(snapped)] ?? table[String(snapped.toFixed(1))];
  if (exact) return exact;

  // Outside what WHO publishes, say nothing rather than extrapolate.
  return null;
}

export const indicatorRange = (indicator: GrowthIndicator, sex: Sex): { min: number; max: number } | null => {
  const table = TABLES[`${indicator}_${sex}`];
  if (!table) return null;
  const keys = Object.keys(table).map(Number);
  return { min: Math.min(...keys), max: Math.max(...keys) };
};

/** Every published point, for drawing the reference curves. */
export const tableFor = (indicator: GrowthIndicator, sex: Sex): Record<string, LmsRow> | null =>
  TABLES[`${indicator}_${sex}`] ?? null;
