import raw from './kenya-schedule.json';

/**
 * Kenya's national immunisation schedule.
 *
 * Source: WHO WIISE, the database behind the WHO Immunization Data portal,
 * read from its open OData API on 2026-09-23:
 *   https://xmart-api-public.who.int/WIISE/AD_SCHEDULES?$filter=COUNTRY eq 'KEN'
 * This is the schedule **Kenya reported to WHO**, reporting year 2025 — the most
 * recent on file. It is authoritative and dated, but it is WHO's record rather
 * than a document published by the Ministry of Health: if the national EPI has
 * changed since that report, MOH is the tiebreaker, and the fix is to reload
 * this file rather than to edit logic.
 *
 * COVID-19 rows are excluded: they carry no routine childhood age and are run
 * as a separate programme.
 */
export const SCHEDULE_SOURCE = {
  publisher: 'WHO WIISE (AD_SCHEDULES)',
  country: 'KEN',
  reportingYear: 2025,
  retrieved: '2026-09-23',
  url: "https://xmart-api-public.who.int/WIISE/AD_SCHEDULES?$filter=COUNTRY eq 'KEN'",
} as const;

export interface ScheduleRow {
  vaccine: string;
  dose: number;
  /** WHO age code: B, W6, M9, Y10, +M6 (after the previous dose), or "1st contact". */
  age: string | null;
  /** FEMALE, PW (pregnant women), RISKGROUPS… null means everyone. */
  target: string | null;
  /** NATIONAL, or SUBNATIONAL where a vaccine is only given in some counties. */
  geo: string;
}

export const KENYA_SCHEDULE = raw as ScheduleRow[];

/**
 * Readable names for the vaccine codes. WHO's antigen list labels only a few of
 * them, so the rest are the standard expansion of the abbreviation — noted here
 * so it is clear which came from WHO and which did not.
 */
export const VACCINE_LABELS: Record<string, string> = {
  BCG: 'BCG', // from WHO's antigen list
  TYPHOID_CONJ: 'Typhoid conjugate vaccine', // from WHO's antigen list
  // Standard expansions of the code:
  OPV: 'Oral polio vaccine (OPV)',
  IPV: 'Inactivated polio vaccine (IPV)',
  DTWPHIBHEPB: 'Pentavalent (DTwP-Hib-HepB)',
  PCV10: 'Pneumococcal conjugate (PCV10)',
  ROTAVIRUS_1: 'Rotavirus',
  MR: 'Measles-Rubella (MR)',
  VITAMINA: 'Vitamin A',
  HPV4: 'HPV',
  TD_S: 'Tetanus-diphtheria (Td)',
  MALARIA: 'Malaria vaccine',
  YF: 'Yellow fever',
};

export const vaccineLabel = (code: string): string => VACCINE_LABELS[code] ?? code;

/** The childhood schedule: excludes maternal Td and anything not given nationally. */
export const childhoodSchedule = (): ScheduleRow[] =>
  KENYA_SCHEDULE.filter((r) => r.target !== 'PW' && r.geo === 'NATIONAL');

/** Given only in certain counties — never offered as routine everywhere. */
export const subnationalSchedule = (): ScheduleRow[] =>
  KENYA_SCHEDULE.filter((r) => r.geo !== 'NATIONAL');

/** The maternal schedule, given in pregnancy. */
export const maternalSchedule = (): ScheduleRow[] =>
  KENYA_SCHEDULE.filter((r) => r.target === 'PW');
