import { ScheduleRow, childhoodSchedule, vaccineLabel } from './data/schedule';

/**
 * Working out what a child is due, from WHO's age codes.
 *
 *   B            at birth
 *   W6           6 weeks old
 *   M9           9 months old
 *   Y10          10 years old
 *   +M6          6 months after the previous dose of the same vaccine
 *   1st contact  no fixed age (maternal doses, given when the woman presents)
 *
 * A code that cannot be read returns null and the dose is reported as having no
 * computable due date, rather than being silently dropped or guessed at — a
 * missed vaccine is the failure this whole feature exists to prevent.
 */
export interface DueOffset {
  /** Days from birth, where the code fixes an absolute age. */
  fromBirthDays?: number;
  /** Days after the previous dose, where the code is relative. */
  afterPreviousDays?: number;
}

const DAYS_PER_MONTH = 30.4375; // mean Gregorian month, so long intervals don't drift
const DAYS_PER_YEAR = 365.25;

export function parseAgeCode(code?: string | null): DueOffset | null {
  const c = (code ?? '').trim();
  if (!c) return null;
  if (/^1st\s*contact$/i.test(c)) return null; // no fixed age by design

  const relative = c.startsWith('+');
  const body = relative ? c.slice(1) : c;

  if (/^B$/i.test(body)) return { fromBirthDays: 0 };

  const m = body.match(/^([WMY])\s*(\d+(?:\.\d+)?)$/i);
  if (!m) return null;
  const unit = m[1].toUpperCase();
  const n = Number(m[2]);
  const days = unit === 'W' ? n * 7 : unit === 'M' ? n * DAYS_PER_MONTH : n * DAYS_PER_YEAR;
  const rounded = Math.round(days);
  return relative ? { afterPreviousDays: rounded } : { fromBirthDays: rounded };
}

export type DoseState = 'given' | 'due' | 'upcoming' | 'overdue' | 'not-applicable' | 'no-due-date';

export interface DoseStatus {
  vaccine: string;
  vaccineLabel: string;
  dose: number;
  ageCode: string | null;
  /** When it should be given; null where the code fixes no age. */
  dueDate: string | null;
  givenDate: string | null;
  state: DoseState;
  /** Why it does not apply to this child, where it does not. */
  reason?: string;
}

export interface GivenDose {
  vaccine: string;
  dose: number;
  givenDate: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (from: Date, days: number) => {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
};

/**
 * A child's schedule: what has been given, what is due, what is overdue.
 *
 * `overdueAfterDays` is grace, not clinical doctrine — a dose is not "missed"
 * the day after it is due. The default of 14 days mirrors how defaulter
 * tracing is run in practice; it is a parameter so a facility can set its own.
 */
export function doseStatuses(
  dateOfBirth: string,
  given: GivenDose[],
  opts: { sex?: string | null; today?: string; overdueAfterDays?: number; includeSubnational?: boolean } = {},
): DoseStatus[] {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return [];
  const now = opts.today ? new Date(opts.today) : new Date();
  const grace = opts.overdueAfterDays ?? 14;
  const female = (opts.sex ?? '').trim().toLowerCase().startsWith('f');

  const rows: ScheduleRow[] = childhoodSchedule();
  const byVaccine = new Map<string, ScheduleRow[]>();
  for (const r of rows) {
    if (!byVaccine.has(r.vaccine)) byVaccine.set(r.vaccine, []);
    byVaccine.get(r.vaccine)!.push(r);
  }

  const out: DoseStatus[] = [];
  for (const [vaccine, doses] of byVaccine) {
    const ordered = [...doses].sort((a, b) => a.dose - b.dose);
    let previousDue: Date | null = null;

    for (const row of ordered) {
      const hit = given.find((g) => g.vaccine === vaccine && g.dose === row.dose);
      const base: DoseStatus = {
        vaccine,
        vaccineLabel: vaccineLabel(vaccine),
        dose: row.dose,
        ageCode: row.age,
        dueDate: null,
        givenDate: hit?.givenDate ?? null,
        state: 'due',
      };

      // A vaccine given only to girls is not "missed" for a boy.
      if (row.target === 'FEMALE' && !female) {
        out.push({ ...base, state: 'not-applicable', reason: 'Given to girls only' });
        continue;
      }

      const offset = parseAgeCode(row.age);
      let due: Date | null = null;
      if (offset?.fromBirthDays != null) {
        due = addDays(dob, offset.fromBirthDays);
      } else if (offset?.afterPreviousDays != null) {
        // Relative to the previous dose actually given, else to when it was due.
        const prevGiven = given.find((g) => g.vaccine === vaccine && g.dose === row.dose - 1);
        const anchor = prevGiven ? new Date(prevGiven.givenDate) : previousDue;
        due = anchor ? addDays(anchor, offset.afterPreviousDays) : null;
      }
      previousDue = due ?? previousDue;

      if (hit) {
        out.push({ ...base, dueDate: due ? iso(due) : null, state: 'given' });
        continue;
      }
      if (!due) {
        out.push({ ...base, state: 'no-due-date', reason: `Age "${row.age}" has no fixed due date` });
        continue;
      }

      const dueIso = iso(due);
      const overdueFrom = addDays(due, grace);
      const state: DoseState = now > overdueFrom ? 'overdue' : now >= due ? 'due' : 'upcoming';
      out.push({ ...base, dueDate: dueIso, state });
    }
  }

  // Soonest first, so the next thing to give is at the top.
  return out.sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return a.vaccine.localeCompare(b.vaccine);
  });
}
