/**
 * Kenyan payroll statutory computations (monthly), reflecting the post-2024
 * regime: NSSF Tier I + II, SHIF, the Affordable Housing Levy, and PAYE with
 * NSSF/SHIF/AHL allowable as deductions before tax.
 *
 * Rates are kept here as constants so they can be tuned in one place as the law
 * changes. Everything is a pure function of gross pay — no DB, easy to test.
 */

export const STATUTORY = {
  // NSSF: 6% employee + 6% employer on pensionable pay up to the upper limit.
  NSSF_RATE: 0.06,
  NSSF_UPPER_LIMIT: 72000, // Tier I 8,000 + Tier II up to 72,000
  // SHIF: 2.75% of gross, with a floor.
  SHIF_RATE: 0.0275,
  SHIF_MIN: 300,
  // Affordable Housing Levy: 1.5% employee + 1.5% employer.
  AHL_RATE: 0.015,
  // PAYE personal relief.
  PERSONAL_RELIEF: 2400,
};

/** Monthly PAYE bands (Finance Act 2023). */
const PAYE_BANDS: { upTo: number; rate: number }[] = [
  { upTo: 24000, rate: 0.1 },
  { upTo: 32333, rate: 0.25 },
  { upTo: 500000, rate: 0.3 },
  { upTo: 800000, rate: 0.325 },
  { upTo: Infinity, rate: 0.35 },
];

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** Progressive tax on a taxable amount using the monthly bands. */
function bandedTax(taxable: number): number {
  let tax = 0;
  let lower = 0;
  for (const band of PAYE_BANDS) {
    if (taxable <= lower) break;
    const slice = Math.min(taxable, band.upTo) - lower;
    if (slice > 0) tax += slice * band.rate;
    lower = band.upTo;
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
 * Compute all statutory figures for a gross monthly pay. NSSF, SHIF and the
 * housing levy are deducted before PAYE; personal relief is then applied.
 */
export function computeStatutory(gross: number): StatutoryResult {
  const g = Math.max(0, gross);

  const pensionable = Math.min(g, STATUTORY.NSSF_UPPER_LIMIT);
  const nssfEmployee = round2(pensionable * STATUTORY.NSSF_RATE);
  const nssfEmployer = nssfEmployee;

  const shif = round2(Math.max(g * STATUTORY.SHIF_RATE, STATUTORY.SHIF_MIN));

  const housingEmployee = round2(g * STATUTORY.AHL_RATE);
  const housingEmployer = housingEmployee;

  // These three are allowable deductions before PAYE.
  const taxableIncome = round2(Math.max(0, g - nssfEmployee - shif - housingEmployee));
  const paye = round2(Math.max(0, bandedTax(taxableIncome) - STATUTORY.PERSONAL_RELIEF));

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
