/**
 * Epidemiological weeks, as Kenya's IDSR guidelines define them.
 *
 * "An Epidemiological week starts from Monday to Sunday" — which is the
 * ISO-8601 week, so week 1 of a year is the week containing its first Thursday.
 * That matters at the turn of the year: 1 January can belong to week 52 or 53
 * of the year before, and a return filed under the wrong year is a return the
 * sub-county cannot reconcile.
 *
 * The facility's focal person submits MOH 505 by Monday for the week that has
 * just ended.
 */

const DAY = 86_400_000;

const utc = (iso: string): Date | null => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Monday of the week containing this date. */
export function weekStart(date: Date): Date {
  // getUTCDay: Sunday is 0, so Sunday belongs to the week that began six days ago.
  const shift = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - shift * DAY);
}

export interface EpiWeek {
  year: number;
  week: number;
  /** Monday. */
  start: string;
  /** Sunday. */
  end: string;
}

/** The epidemiological week a date falls in. */
export function epiWeekOf(dateIso: string): EpiWeek | null {
  const d = utc(dateIso);
  if (!d) return null;

  const monday = weekStart(d);
  // The ISO year is the year of the Thursday in this week, not of the Monday.
  const thursday = new Date(monday.getTime() + 3 * DAY);
  const year = thursday.getUTCFullYear();

  const firstThursday = (y: number) => {
    const jan4 = new Date(Date.UTC(y, 0, 4));
    return new Date(weekStart(jan4).getTime() + 3 * DAY);
  };

  const week = Math.round((thursday.getTime() - firstThursday(year).getTime()) / (7 * DAY)) + 1;
  return { year, week, start: iso(monday), end: iso(new Date(monday.getTime() + 6 * DAY)) };
}

/** The Monday and Sunday of a given epidemiological week. */
export function weekBounds(year: number, week: number): { start: string; end: string } | null {
  if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1 || week > 53) return null;

  const jan4 = new Date(Date.UTC(year, 0, 4));
  const firstMonday = weekStart(jan4);
  const monday = new Date(firstMonday.getTime() + (week - 1) * 7 * DAY);

  // A 53rd week exists only in years that have one; asking for week 53 of a
  // 52-week year would silently return week 1 of the next.
  const check = epiWeekOf(iso(monday));
  if (!check || check.year !== year || check.week !== week) return null;

  return { start: iso(monday), end: iso(new Date(monday.getTime() + 6 * DAY)) };
}

/** How many epidemiological weeks a year has — 52, or 53. */
export function weeksInYear(year: number): number {
  return weekBounds(year, 53) ? 53 : 52;
}

/** The week that has just ended, which is the one MOH 505 reports on. */
export function lastCompleteWeek(todayIso?: string): EpiWeek {
  const today = utc(todayIso ?? new Date().toISOString()) ?? new Date();
  const thisMonday = weekStart(today);
  return epiWeekOf(iso(new Date(thisMonday.getTime() - DAY)))!;
}

/** Whether a date falls inside a week, inclusive of both ends. */
export function inWeek(dateIso: string | null | undefined, bounds: { start: string; end: string }): boolean {
  if (!dateIso) return false;
  const d = dateIso.slice(0, 10);
  return d >= bounds.start && d <= bounds.end;
}
