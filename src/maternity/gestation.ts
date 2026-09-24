import { ANC_CONTACTS, PNC_CONTACTS, PncWindow } from './data/schedules';

/**
 * Pregnancy dating, and what follows from it.
 *
 * Everything here is pure: dates in, dates out, no repository. Getting gestation
 * wrong moves every contact in the schedule and can push a woman past term
 * without anyone noticing, so it is tested rather than trusted.
 */

const DAY = 24 * 60 * 60 * 1000;
/** Naegele's rule: a term pregnancy is 280 days from the last menstrual period. */
export const TERM_DAYS = 280;

const parse = (iso?: string | null): Date | null => {
  if (!iso) return null;
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * DAY);
const daysBetween = (a: Date, b: Date): number => Math.round((b.getTime() - a.getTime()) / DAY);

/** The expected date of delivery from the last menstrual period. */
export function eddFromLmp(lmp: string): string | null {
  const d = parse(lmp);
  return d ? iso(addDays(d, TERM_DAYS)) : null;
}

/** The last menstrual period implied by an expected date of delivery. */
export function lmpFromEdd(edd: string): string | null {
  const d = parse(edd);
  return d ? iso(addDays(d, -TERM_DAYS)) : null;
}

export interface Dating {
  lmp?: string | null;
  edd?: string | null;
  /** The date the scan was done, and the gestation it showed, in days. */
  ultrasoundDate?: string | null;
  ultrasoundGaDays?: number | null;
}

export type DatingBasis = 'ultrasound' | 'lmp' | 'edd';

export interface ResolvedDating {
  /** The EDD the rest of the record works from. */
  edd: string;
  basis: DatingBasis;
}

/**
 * Which date the record works from.
 *
 * A dating scan beats a remembered period — that is standard obstetric practice
 * and the reason the scan is done — so an ultrasound, where there is one, sets
 * the EDD. Failing that the LMP does, and failing that an EDD entered directly.
 */
export function resolveDating(d: Dating): ResolvedDating | null {
  const scanDate = parse(d.ultrasoundDate);
  if (scanDate && d.ultrasoundGaDays != null && d.ultrasoundGaDays >= 0) {
    // At the scan the pregnancy was ultrasoundGaDays old, so term is the
    // remainder of the 280 days counted on from the day of the scan.
    return { edd: iso(addDays(scanDate, TERM_DAYS - d.ultrasoundGaDays)), basis: 'ultrasound' };
  }
  const fromLmp = d.lmp ? eddFromLmp(d.lmp) : null;
  if (fromLmp) return { edd: fromLmp, basis: 'lmp' };
  const edd = parse(d.edd);
  return edd ? { edd: iso(edd), basis: 'edd' } : null;
}

export interface Gestation {
  weeks: number;
  days: number;
  /** Completed days, for arithmetic that shouldn't round. */
  totalDays: number;
  trimester: 1 | 2 | 3;
  basis: DatingBasis;
  /** True once the pregnancy is past its expected date of delivery. */
  postTerm: boolean;
}

/** How far along the pregnancy is on a given day. */
export function gestationOn(d: Dating, on: string): Gestation | null {
  const resolved = resolveDating(d);
  const day = parse(on);
  if (!resolved || !day) return null;

  const edd = parse(resolved.edd)!;
  const totalDays = TERM_DAYS - daysBetween(day, edd);
  // Before conception there is no gestation to report, and a negative age would
  // quietly produce a due date in the past for every contact.
  if (totalDays < 0) return null;

  const weeks = Math.floor(totalDays / 7);
  return {
    weeks,
    days: totalDays % 7,
    totalDays,
    trimester: weeks < 14 ? 1 : weeks < 28 ? 2 : 3,
    basis: resolved.basis,
    postTerm: day.getTime() > edd.getTime(),
  };
}

export type ContactState = 'attended' | 'due' | 'overdue' | 'upcoming' | 'past-term';

export interface AncContactStatus {
  contact: number;
  weeks: number;
  trimester: 1 | 2 | 3;
  /** The calendar date the contact falls due. */
  dueDate: string;
  attendedDate: string | null;
  state: ContactState;
  /** Why a contact is not simply upcoming, where it isn't. */
  reason?: string;
}

export interface AncStatusOptions {
  today?: string;
  /** How long after the due date a missed contact is called overdue. */
  graceDays?: number;
  /** Set once the pregnancy has ended, so later contacts stop being chased. */
  endedOn?: string | null;
}

/**
 * The eight contacts against what the woman has actually attended.
 *
 * A contact is matched by its number, not by date: a woman who comes late still
 * attended that contact, and calling it missed would misreport her care.
 */
export function ancContactStatuses(
  dating: Dating,
  attended: { contactNumber: number; contactDate: string }[],
  opts: AncStatusOptions = {},
): AncContactStatus[] {
  const resolved = resolveDating(dating);
  if (!resolved) return [];

  const edd = parse(resolved.edd)!;
  const today = parse(opts.today ?? new Date().toISOString().slice(0, 10))!;
  const ended = parse(opts.endedOn);
  const grace = opts.graceDays ?? 14;

  return ANC_CONTACTS.map((row) => {
    const dueDate = addDays(edd, (row.weeks - 40) * 7);
    const hit = attended.find((a) => a.contactNumber === row.contact);
    const base = {
      contact: row.contact,
      weeks: row.weeks,
      trimester: row.trimester,
      dueDate: iso(dueDate),
      attendedDate: hit?.contactDate ?? null,
    };

    if (hit) return { ...base, state: 'attended' as const };

    // Once the pregnancy has ended, an unattended later contact was never going
    // to happen — reporting it overdue would be a reproach for nothing.
    if (ended && dueDate.getTime() > ended.getTime()) {
      return { ...base, state: 'past-term' as const, reason: 'The pregnancy had already ended' };
    }

    const overdueFrom = addDays(dueDate, grace);
    if (today.getTime() > overdueFrom.getTime()) return { ...base, state: 'overdue' as const };
    if (today.getTime() >= dueDate.getTime()) return { ...base, state: 'due' as const };
    return { ...base, state: 'upcoming' as const };
  });
}

export interface PncContactStatus {
  window: PncWindow;
  label: string;
  fromDate: string;
  toDate: string;
  attendedDate: string | null;
  state: 'attended' | 'due' | 'overdue' | 'upcoming';
}

/** The four postnatal windows against what the mother has attended. */
export function pncContactStatuses(
  birthDate: string,
  attended: { window: PncWindow; contactDate: string }[],
  opts: { today?: string } = {},
): PncContactStatus[] {
  const birth = parse(birthDate);
  if (!birth) return [];
  const today = parse(opts.today ?? new Date().toISOString().slice(0, 10))!;

  return PNC_CONTACTS.map((row) => {
    const from = addDays(birth, row.fromDays);
    const to = addDays(birth, row.toDays);
    const hit = attended.find((a) => a.window === row.window);
    const base = {
      window: row.window,
      label: row.label,
      fromDate: iso(from),
      toDate: iso(to),
      attendedDate: hit?.contactDate ?? null,
    };
    if (hit) return { ...base, state: 'attended' as const };
    if (today.getTime() > to.getTime()) return { ...base, state: 'overdue' as const };
    if (today.getTime() >= from.getTime()) return { ...base, state: 'due' as const };
    return { ...base, state: 'upcoming' as const };
  });
}

/** Which postnatal window a date falls in, or null between windows. */
export function pncWindowFor(birthDate: string, on: string): PncWindow | null {
  const birth = parse(birthDate);
  const day = parse(on);
  if (!birth || !day) return null;
  const n = daysBetween(birth, day);
  return PNC_CONTACTS.find((r) => n >= r.fromDays && n <= r.toDays)?.window ?? null;
}

export type AnaemiaGrade = 'none' | 'mild' | 'moderate' | 'severe';

/**
 * Anaemia in pregnancy, graded on Kenya's thresholds.
 *
 * Basic Obstetric Protocols, 1st edition 2026: anaemia is haemoglobin below
 * 11 g/dL — mild 10–11, moderate 7–10, severe below 7.
 */
export function anaemiaGrade(hb: number | null | undefined): AnaemiaGrade | null {
  if (hb == null || !Number.isFinite(hb) || hb <= 0) return null;
  if (hb < 7) return 'severe';
  if (hb < 10) return 'moderate';
  if (hb < 11) return 'mild';
  return 'none';
}

export type BpFlag = 'normal' | 'raised' | 'severe';

/**
 * Blood pressure in pregnancy. 140/90 is the threshold for hypertension and
 * 160/110 for severe — the protocol's referral line.
 */
export function bpFlag(systolic?: number | null, diastolic?: number | null): BpFlag | null {
  if (systolic == null && diastolic == null) return null;
  const s = systolic ?? 0;
  const d = diastolic ?? 0;
  if (s >= 160 || d >= 110) return 'severe';
  if (s >= 140 || d >= 90) return 'raised';
  return 'normal';
}
