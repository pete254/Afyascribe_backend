/**
 * Reporting periods.
 *
 * Routine reporting runs monthly, quarterly and annually, and every report in
 * this system takes a `from` and a `to`. Rather than teach twenty endpoints
 * about quarters, the period is resolved once, here, and the dates handed to
 * the reports unchanged.
 *
 * All arithmetic is in UTC. A quarter that shifted by a day depending on the
 * reader's clock would put a case in the wrong return.
 */

export type PeriodSpec =
  | 'today'
  | 'this-week'
  | 'this-month'
  | 'last-month'
  | 'this-quarter'
  | 'last-quarter'
  | 'this-year'
  | 'last-year'
  | string; // month:YYYY-MM · quarter:YYYY-Qn · year:YYYY

export interface ResolvedPeriod {
  from: string;
  to: string;
  /** How the period reads to a person, for the heading of a report. */
  label: string;
  /** monthly | quarterly | annual | other — which routine return it feeds. */
  cadence: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'custom';
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const monthPeriod = (year: number, month: number): ResolvedPeriod => ({
  // Day 0 of the next month is the last day of this one, which is how February
  // gets its length right in a leap year without a special case.
  from: iso(day(year, month, 1)),
  to: iso(day(year, month + 1, 0)),
  label: `${MONTHS[month]} ${year}`,
  cadence: 'monthly',
});

const quarterPeriod = (year: number, quarter: number): ResolvedPeriod => ({
  from: iso(day(year, (quarter - 1) * 3, 1)),
  to: iso(day(year, quarter * 3, 0)),
  label: `Q${quarter} ${year}`,
  cadence: 'quarterly',
});

const yearPeriod = (year: number): ResolvedPeriod => ({
  from: iso(day(year, 0, 1)),
  to: iso(day(year, 11, 31)),
  label: String(year),
  cadence: 'annual',
});

/** The quarter a month falls in, 1 to 4. */
export const quarterOf = (month: number) => Math.floor(month / 3) + 1;

/**
 * Turn a period specification into dates.
 *
 * Returns null rather than guessing: a report run over a period nobody asked
 * for is worse than one that refuses to run.
 */
export function resolvePeriod(spec: PeriodSpec, todayIso?: string): ResolvedPeriod | null {
  const now = new Date(`${(todayIso ?? new Date().toISOString()).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(now.getTime())) return null;

  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();

  switch (spec) {
    case 'today':
      return { from: iso(now), to: iso(now), label: 'Today', cadence: 'daily' };

    case 'this-week': {
      // Monday to Sunday, as everything else in this system counts a week.
      const shift = (now.getUTCDay() + 6) % 7;
      const monday = new Date(now.getTime() - shift * 86_400_000);
      const sunday = new Date(monday.getTime() + 6 * 86_400_000);
      return { from: iso(monday), to: iso(sunday), label: 'This week', cadence: 'weekly' };
    }

    case 'this-month':
      return { ...monthPeriod(y, m), label: `This month — ${MONTHS[m]} ${y}` };

    case 'last-month': {
      const d = day(y, m - 1, 1);
      return {
        ...monthPeriod(d.getUTCFullYear(), d.getUTCMonth()),
        label: `Last month — ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
      };
    }

    case 'this-quarter': {
      const q = quarterOf(m);
      return { ...quarterPeriod(y, q), label: `This quarter — Q${q} ${y}` };
    }

    case 'last-quarter': {
      const q = quarterOf(m);
      // Q1's predecessor is Q4 of the year before.
      const [py, pq] = q === 1 ? [y - 1, 4] : [y, q - 1];
      return { ...quarterPeriod(py, pq), label: `Last quarter — Q${pq} ${py}` };
    }

    case 'this-year':
      return { ...yearPeriod(y), label: `This year — ${y}` };

    case 'last-year':
      return { ...yearPeriod(y - 1), label: `Last year — ${y - 1}` };

    default:
      break;
  }

  const month = /^month:(\d{4})-(\d{2})$/.exec(spec);
  if (month) {
    const mm = Number(month[2]);
    if (mm < 1 || mm > 12) return null;
    return monthPeriod(Number(month[1]), mm - 1);
  }

  const quarter = /^quarter:(\d{4})-Q([1-4])$/i.exec(spec);
  if (quarter) return quarterPeriod(Number(quarter[1]), Number(quarter[2]));

  const year = /^year:(\d{4})$/.exec(spec);
  if (year) return yearPeriod(Number(year[1]));

  return null;
}

/** The presets a report page offers, in the order they should be listed. */
export const PERIOD_PRESETS: { spec: PeriodSpec; label: string; cadence: ResolvedPeriod['cadence'] }[] = [
  { spec: 'today', label: 'Today', cadence: 'daily' },
  { spec: 'this-week', label: 'This week', cadence: 'weekly' },
  { spec: 'this-month', label: 'This month', cadence: 'monthly' },
  { spec: 'last-month', label: 'Last month', cadence: 'monthly' },
  { spec: 'this-quarter', label: 'This quarter', cadence: 'quarterly' },
  { spec: 'last-quarter', label: 'Last quarter', cadence: 'quarterly' },
  { spec: 'this-year', label: 'This year', cadence: 'annual' },
  { spec: 'last-year', label: 'Last year', cadence: 'annual' },
];
