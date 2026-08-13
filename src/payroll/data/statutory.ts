/**
 * Kenyan payroll statutory computations (monthly), reflecting the post-2024
 * regime: NSSF Tier I + II, SHIF, the Affordable Housing Levy, and PAYE with
 * NSSF/SHIF/AHL allowable as deductions before tax.
 *
 * Every rate, band and on/off switch is part of a config object so a facility can
 * set up its own payroll (e.g. turn the housing levy off, or adjust a rate as the
 * law changes). The defaults below are the current statutory values.
 */

export interface PayeBand {
  /** Upper limit of this band; null means "no ceiling" (top band). */
  upTo: number | null;
  rate: number;
}

export interface StatutoryConfig {
  applyPaye: boolean;
  applyNssf: boolean;
  applyShif: boolean;
  applyHousing: boolean;
  nssfRate: number;
  nssfUpperLimit: number;
  shifRate: number;
  shifMin: number;
  housingRate: number;
  personalRelief: number;
  payeBands: PayeBand[];
}

/** The statutory defaults every facility starts from. */
export const DEFAULT_STATUTORY_CONFIG: StatutoryConfig = {
  applyPaye: true,
  applyNssf: true,
  applyShif: true,
  applyHousing: true,
  // NSSF: 6% employee + 6% employer on pensionable pay up to the upper limit.
  nssfRate: 0.06,
  nssfUpperLimit: 72000, // Tier I 8,000 + Tier II up to 72,000
  // SHIF: 2.75% of gross, with a floor.
  shifRate: 0.0275,
  shifMin: 300,
  // Affordable Housing Levy: 1.5% employee + 1.5% employer.
  housingRate: 0.015,
  // PAYE personal relief.
  personalRelief: 2400,
  // Monthly PAYE bands (Finance Act 2023).
  payeBands: [
    { upTo: 24000, rate: 0.1 },
    { upTo: 32333, rate: 0.25 },
    { upTo: 500000, rate: 0.3 },
    { upTo: 800000, rate: 0.325 },
    { upTo: null, rate: 0.35 },
  ],
};

/** Back-compat export for anything still reading the old constant names. */
export const STATUTORY = {
  NSSF_RATE: DEFAULT_STATUTORY_CONFIG.nssfRate,
  NSSF_UPPER_LIMIT: DEFAULT_STATUTORY_CONFIG.nssfUpperLimit,
  SHIF_RATE: DEFAULT_STATUTORY_CONFIG.shifRate,
  SHIF_MIN: DEFAULT_STATUTORY_CONFIG.shifMin,
  AHL_RATE: DEFAULT_STATUTORY_CONFIG.housingRate,
  PERSONAL_RELIEF: DEFAULT_STATUTORY_CONFIG.personalRelief,
};

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** Progressive tax on a taxable amount using the given monthly bands. */
function bandedTax(taxable: number, bands: PayeBand[]): number {
  let tax = 0;
  let lower = 0;
  for (const band of bands) {
    const ceiling = band.upTo ?? Infinity;
    if (taxable <= lower) break;
    const slice = Math.min(taxable, ceiling) - lower;
    if (slice > 0) tax += slice * band.rate;
    lower = ceiling;
  }
  return tax;
}

export interface StatutoryResult {
  gross: number;
  nssfEmployee: number;
  nssfEmployer: number;
  shif: number;
  housingEmployee: number;
  housingEmployer: number;
  taxableIncome: number;
  paye: number;
}

/**
 * Compute all statutory figures for a gross monthly pay under the given config.
 * NSSF, SHIF and the housing levy (when they apply) are deducted before PAYE;
 * personal relief is then applied.
 */
export function computeStatutory(
  gross: number,
  config: StatutoryConfig = DEFAULT_STATUTORY_CONFIG,
): StatutoryResult {
  const c = { ...DEFAULT_STATUTORY_CONFIG, ...config };
  const g = Math.max(0, gross);

  const nssfEmployee = c.applyNssf
    ? round2(Math.min(g, c.nssfUpperLimit) * c.nssfRate)
    : 0;
  const nssfEmployer = nssfEmployee;

  const shif = c.applyShif ? round2(Math.max(g * c.shifRate, c.shifMin)) : 0;

  const housingEmployee = c.applyHousing ? round2(g * c.housingRate) : 0;
  const housingEmployer = housingEmployee;

  // These three are allowable deductions before PAYE.
  const taxableIncome = round2(Math.max(0, g - nssfEmployee - shif - housingEmployee));
  const paye = c.applyPaye
    ? round2(Math.max(0, bandedTax(taxableIncome, c.payeBands) - c.personalRelief))
    : 0;

  return {
    gross: round2(g),
    nssfEmployee,
    nssfEmployer,
    shif,
    housingEmployee,
    housingEmployer,
    taxableIncome,
    paye,
  };
}
