/**
 * Quality measures: computing a rate, and saying honestly what it is made of.
 *
 * A measure is a numerator over a denominator across a period. The arithmetic
 * is trivial; what matters is that the two populations are stated in words
 * beside the number, and that a rate is never invented where the denominator
 * is empty. A "0%" over nobody is not a result — it is a missing one, and
 * reporting it as zero would understate care that was never measured.
 */

export type MeasureProvenance = 'built-in' | 'imported' | 'manual';

export interface MeasureDefinition {
  /** Stable identifier used in reports and submissions. */
  id: string;
  title: string;
  /** What the measure is for, in a sentence. */
  description: string;
  /** Exactly who is counted, in words. */
  numerator: string;
  denominator: string;
  /** Higher is better, or lower is. */
  improvement: 'increase' | 'decrease';
  /** proportion | count — a count has no denominator. */
  scoring: 'proportion' | 'count';
  category: string;
  /**
   * Where the definition came from. Built-in measures are this system's own
   * wording, not the Ministry's — the distinction is kept because a measure
   * that merely resembles a national indicator must not be reported as one.
   */
  provenance: MeasureProvenance;
  /** Set only where a definition has been matched to a published indicator. */
  nationalIndicator?: string | null;
}

export interface MeasureResult {
  measureId: string;
  title: string;
  periodStart: string;
  periodEnd: string;
  numerator: number | null;
  denominator: number | null;
  /** Null where there is no denominator to divide by. */
  rate: number | null;
  scoring: 'proportion' | 'count';
  /** Why there is no rate, where there is none. */
  note?: string;
}

/**
 * The rate, or null.
 *
 * Null when nobody was eligible: a proportion of an empty population is
 * undefined, and a zero in its place would read as a failure of care rather
 * than an absence of patients.
 */
export function rate(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator <= 0) return null;
  if (numerator < 0) return null;
  // One decimal place is as much precision as a facility-month can carry.
  return Math.round((numerator / denominator) * 1000) / 10;
}

/** Assemble a result, with the reason when there is no rate to give. */
export function result(
  def: MeasureDefinition,
  periodStart: string,
  periodEnd: string,
  numerator: number,
  denominator: number | null,
): MeasureResult {
  if (def.scoring === 'count') {
    return {
      measureId: def.id,
      title: def.title,
      periodStart,
      periodEnd,
      numerator,
      denominator: null,
      rate: null,
      scoring: 'count',
    };
  }

  const den = denominator ?? 0;
  const r = rate(numerator, den);
  return {
    measureId: def.id,
    title: def.title,
    periodStart,
    periodEnd,
    numerator,
    denominator: den,
    rate: r,
    scoring: 'proportion',
    note: r === null ? 'No one was eligible in this period, so there is no rate to report' : undefined,
  };
}

/** A period given as a year and a month, or a pair of dates. */
export function periodFor(input: { year?: number; month?: number; from?: string; to?: string }): {
  from: string;
  to: string;
} | null {
  if (input.from && input.to) {
    if (input.to < input.from) return null;
    return { from: input.from, to: input.to };
  }
  if (input.year && input.month) {
    if (input.month < 1 || input.month > 12) return null;
    const from = new Date(Date.UTC(input.year, input.month - 1, 1));
    // The last day of the month, found by stepping back from the first of the next.
    const to = new Date(Date.UTC(input.year, input.month, 0));
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }
  return null;
}

/**
 * A calculated set as a FHIR MeasureReport.
 *
 * `type: 'summary'` because these are facility totals, not per-patient results.
 * Each measure becomes its own report: MeasureReport carries one measure, and
 * flattening several into one would misrepresent what the resource means.
 */
export function toMeasureReport(
  r: MeasureResult,
  def: MeasureDefinition,
  facility: { id: string; name?: string | null },
  measureSystem: string,
): Record<string, any> {
  const populations: Record<string, any>[] = [
    {
      code: {
        coding: [
          { system: 'http://terminology.hl7.org/CodeSystem/measure-population', code: 'numerator' },
        ],
      },
      count: r.numerator ?? 0,
    },
  ];
  if (r.scoring === 'proportion') {
    populations.push({
      code: {
        coding: [
          { system: 'http://terminology.hl7.org/CodeSystem/measure-population', code: 'denominator' },
        ],
      },
      count: r.denominator ?? 0,
    });
  }

  return {
    resourceType: 'MeasureReport',
    id: `measure-${r.measureId}-${r.periodStart}-${r.periodEnd}`,
    status: 'complete',
    type: 'summary',
    measure: `${measureSystem}/${def.id}`,
    reporter: { reference: `Organization/org-${facility.id}`, display: facility.name ?? undefined },
    period: { start: r.periodStart, end: r.periodEnd },
    group: [
      {
        code: { text: def.title },
        population: populations,
        ...(r.rate != null
          ? { measureScore: { value: r.rate, unit: '%', system: 'http://unitsofmeasure.org', code: '%' } }
          : {}),
      },
    ],
    // The definition travels with the number so a receiver can see what was
    // counted rather than having to assume it matches their own measure.
    extension: [
      { url: `${measureSystem}/definition-numerator`, valueString: def.numerator },
      { url: `${measureSystem}/definition-denominator`, valueString: def.denominator },
      { url: `${measureSystem}/definition-provenance`, valueString: def.provenance },
    ],
  };
}

/** The same results as a CSV, for a facility that reports on paper or by email. */
export function toCsv(results: MeasureResult[], defs: Map<string, MeasureDefinition>): string {
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = [
    'Measure',
    'Title',
    'Period start',
    'Period end',
    'Numerator',
    'Denominator',
    'Rate (%)',
    'Numerator definition',
    'Denominator definition',
    'Definition source',
  ];
  const rows = results.map((r) => {
    const d = defs.get(r.measureId);
    return [
      r.measureId,
      r.title,
      r.periodStart,
      r.periodEnd,
      r.numerator ?? '',
      r.denominator ?? '',
      r.rate ?? '',
      d?.numerator ?? '',
      d?.denominator ?? '',
      d?.provenance ?? '',
    ].map(esc);
  });
  return [head.map(esc).join(','), ...rows.map((r) => r.join(','))].join('\n');
}
