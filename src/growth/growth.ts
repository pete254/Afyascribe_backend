import {
  GrowthIndicator,
  LmsRow,
  Sex,
  indicatorRange,
  lmsFor,
} from './data/who-standards';

/**
 * Z-scores against the WHO Child Growth Standards.
 *
 * The LMS method: for a measurement X against the reference parameters L, M, S
 *   Z = ((X/M)^L − 1) / (L·S)       when L ≠ 0
 *   Z = ln(X/M) / S                 when L = 0
 *
 * WHO then *constrains* extreme values for the weight-based indicators, because
 * the distribution's tails are not reliable beyond ±3 SD: outside that range
 * the z-score is re-expressed in units of the distance between the 2nd and 3rd
 * SD cut-offs. Height-for-age is not constrained — WHO applies the plain LMS
 * value. Getting this wrong would misclassify exactly the severely malnourished
 * children the measurement exists to find.
 *
 * Source: WHO Child Growth Standards, and the computation described in the
 * WHO Anthro software manual.
 */

const CONSTRAINED: GrowthIndicator[] = ['wfa', 'wfl', 'wfh'];

function rawZ(x: number, [L, M, S]: LmsRow): number {
  return L === 0 ? Math.log(x / M) / S : (Math.pow(x / M, L) - 1) / (L * S);
}

/** The measurement at a given z, used to rebuild the SD cut-offs. */
function valueAtZ(z: number, [L, M, S]: LmsRow): number {
  return L === 0 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L);
}

export interface ZScoreResult {
  z: number;
  /** True where WHO's ±3 SD constraint was applied. */
  constrained: boolean;
}

export function zScore(
  indicator: GrowthIndicator,
  sex: Sex,
  key: number,
  measurement: number,
): ZScoreResult | null {
  if (!(measurement > 0)) return null;
  const row = lmsFor(indicator, sex, key);
  if (!row) return null;

  const z = rawZ(measurement, row);
  if (!Number.isFinite(z)) return null;
  if (!CONSTRAINED.includes(indicator) || Math.abs(z) <= 3) {
    return { z: Math.round(z * 100) / 100, constrained: false };
  }

  // Re-express beyond ±3 SD in units of the 2nd-to-3rd SD gap, as WHO does.
  const sd3pos = row[6] ?? valueAtZ(3, row);
  const sd2pos = row[5] ?? valueAtZ(2, row);
  const sd3neg = row[3] ?? valueAtZ(-3, row);
  const sd2neg = row[4] ?? valueAtZ(-2, row);

  const adjusted =
    z > 3
      ? 3 + (measurement - sd3pos) / (sd3pos - sd2pos)
      : -3 + (measurement - sd3neg) / (sd2neg - sd3neg);
  return { z: Math.round(adjusted * 100) / 100, constrained: true };
}

/**
 * WHO's classification of each indicator. The wording matters clinically:
 * weight-for-age is *underweight*, height-for-age is *stunting* (long-term),
 * and weight-for-height is *wasting* (acute) — they are not interchangeable,
 * and only wasting warrants a feeding programme.
 */
export interface GrowthFlag {
  label: string;
  severity: 'severe' | 'moderate' | 'normal' | 'high';
}

export function classify(indicator: GrowthIndicator, z: number): GrowthFlag {
  if (indicator === 'wfa') {
    if (z < -3) return { label: 'Severely underweight', severity: 'severe' };
    if (z < -2) return { label: 'Underweight', severity: 'moderate' };
    return { label: 'Normal weight-for-age', severity: 'normal' };
  }
  if (indicator === 'hfa') {
    if (z < -3) return { label: 'Severely stunted', severity: 'severe' };
    if (z < -2) return { label: 'Stunted', severity: 'moderate' };
    return { label: 'Normal height-for-age', severity: 'normal' };
  }
  // Weight-for-length and weight-for-height read the same way.
  if (z < -3) return { label: 'Severe acute malnutrition', severity: 'severe' };
  if (z < -2) return { label: 'Moderate acute malnutrition', severity: 'moderate' };
  if (z > 3) return { label: 'Obese', severity: 'high' };
  if (z > 2) return { label: 'Overweight', severity: 'high' };
  return { label: 'Normal weight-for-height', severity: 'normal' };
}

/** Whole months between two dates — how WHO tables are indexed. */
export function ageInMonths(dateOfBirth: string | Date, on: string | Date): number | null {
  const dob = new Date(dateOfBirth);
  const at = new Date(on);
  if (Number.isNaN(dob.getTime()) || Number.isNaN(at.getTime()) || at < dob) return null;
  let months = (at.getFullYear() - dob.getFullYear()) * 12 + (at.getMonth() - dob.getMonth());
  if (at.getDate() < dob.getDate()) months -= 1;
  return Math.max(0, months);
}

/** Which weight-for-length/height table applies — WHO splits them at 2 years. */
export const weightForLengthIndicator = (ageMonths: number): GrowthIndicator =>
  ageMonths < 24 ? 'wfl' : 'wfh';

export const withinRange = (indicator: GrowthIndicator, sex: Sex, key: number): boolean => {
  const r = indicatorRange(indicator, sex);
  return !!r && key >= r.min && key <= r.max;
};
