import {
  LCG_ACTIVE_PHASE_CM,
  LCG_CERVIX_LAG_HOURS,
  LCG_ROWS,
  PARTOGRAPH_LEGACY,
} from './data/labour-care-guide';

/**
 * Evaluating a labour observation against the WHO Labour Care Guide.
 *
 * Every rule here is the form's own 'Alert' criterion, and nothing alerts that
 * the form does not. This is the code that tells a midwife to call the doctor,
 * so it is pure and tested rather than threaded through a service.
 */

/** One row's recorded value. Codes are the guide's abbreviations. */
export interface LabourValues {
  companion?: string | null;
  painRelief?: string | null;
  oralFluid?: string | null;
  posture?: string | null;
  baselineFhr?: number | null;
  fhrDeceleration?: string | null;
  amnioticFluid?: string | null;
  fetalPosition?: string | null;
  caput?: string | null;
  moulding?: string | null;
  pulse?: number | null;
  systolic?: number | null;
  diastolic?: number | null;
  temperature?: number | null;
  urine?: string | null;
  contractionsPer10?: number | null;
  contractionDuration?: number | null;
  cervix?: number | null;
  descent?: number | null;
}

export interface LabourAlert {
  key: string;
  label: string;
  /** The criterion as the form prints it. */
  criterion: string;
  /** What was actually recorded, for the note. */
  value: string;
}

const num = (v: unknown): number | null =>
  v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);

/** Rows whose alert is simply "this code was recorded". */
const CODE_ALERTS: Record<string, string[]> = {
  companion: ['N'],
  painRelief: ['N'],
  oralFluid: ['N'],
  posture: ['SP'],
  fhrDeceleration: ['L'],
  amnioticFluid: ['M+++', 'B'],
  fetalPosition: ['P', 'T'],
  caput: ['+++'],
  moulding: ['+++'],
  urine: ['P++', 'A++'],
};

/** Rows whose alert is a numeric range, written as the form writes it. */
const RANGE_ALERTS: { key: keyof LabourValues; below?: number; atOrAbove?: number; above?: number }[] = [
  { key: 'baselineFhr', below: 110, atOrAbove: 160 },
  { key: 'pulse', below: 60, atOrAbove: 120 },
  { key: 'systolic', below: 80, atOrAbove: 140 },
  { key: 'diastolic', atOrAbove: 90 },
  { key: 'temperature', below: 35.0, atOrAbove: 37.5 },
  { key: 'contractionsPer10', below: 3, above: 5 }, // the form reads "≤2, >5"
  { key: 'contractionDuration', below: 20, above: 60 },
];

const ROW = new Map(LCG_ROWS.map((r) => [r.key, r]));

/**
 * Which of this observation's values meet the guide's alert criteria.
 *
 * A value that was not recorded never alerts: a blank is a blank, and treating
 * it as normal would be the same mistake as treating an unasked question as a
 * reassuring answer.
 */
export function alertsFor(values: LabourValues): LabourAlert[] {
  const out: LabourAlert[] = [];

  const push = (key: string, value: string) => {
    const row = ROW.get(key);
    if (!row) return;
    out.push({ key, label: row.label, criterion: row.alert ?? '', value });
  };

  for (const [key, codes] of Object.entries(CODE_ALERTS)) {
    const v = (values as Record<string, unknown>)[key];
    if (typeof v === 'string' && codes.includes(v)) push(key, v);
  }

  for (const rule of RANGE_ALERTS) {
    const v = num(values[rule.key]);
    if (v == null) continue;
    if (
      (rule.below != null && v < rule.below) ||
      (rule.atOrAbove != null && v >= rule.atOrAbove) ||
      (rule.above != null && v > rule.above)
    ) {
      push(rule.key as string, String(v));
    }
  }

  return out;
}

export interface CervixReading {
  /** When the examination was done. */
  at: string;
  /** Dilatation in centimetres. */
  cervix: number;
}

export interface CervixAlert {
  /** The dilatation that has been sat at too long. */
  atCm: number;
  /** The lag the guide allows at that dilatation. */
  allowedHours: number;
  /** How long it has actually been. */
  elapsedHours: number;
  message: string;
}

const hoursBetween = (a: string, b: string): number =>
  (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;

/**
 * Whether labour has stalled by the guide's reckoning.
 *
 * The guide alerts when the lag time for the *current* dilatation is exceeded
 * with no progress — so the clock runs from the first reading that found this
 * dilatation, not from admission and not from the last examination. A woman
 * examined hourly at 6 cm has been at 6 cm for the whole of that time, and
 * measuring from her most recent check would keep resetting the clock and
 * never alert at all.
 */
export function cervixAlert(readings: CervixReading[], now: string): CervixAlert | null {
  const sorted = [...readings]
    .filter((r) => Number.isFinite(r.cervix) && !Number.isNaN(new Date(r.at).getTime()))
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  if (!sorted.length) return null;

  const latest = sorted[sorted.length - 1];
  const current = Math.floor(latest.cervix);

  // Below the active phase, and at full dilatation, the guide sets no lag time.
  const allowed = LCG_CERVIX_LAG_HOURS[current];
  if (allowed == null || current < LCG_ACTIVE_PHASE_CM) return null;

  // The first time this dilatation was reached, walking back while it holds.
  let since = latest.at;
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    if (Math.floor(sorted[i].cervix) >= current) since = sorted[i].at;
    else break;
  }

  const elapsed = hoursBetween(since, now);
  if (elapsed < allowed) return null;

  return {
    atCm: current,
    allowedHours: allowed,
    elapsedHours: Math.round(elapsed * 10) / 10,
    message: `${current} cm for ${Math.round(elapsed * 10) / 10} h with no progress — the guide allows ${allowed} h at this dilatation`,
  };
}

/**
 * The partograph's alert and action lines, for drawing the familiar chart only.
 *
 * Returned as plotted points, never as a reason to act: the lines assume 1 cm
 * an hour from 4 cm, which is the assumption WHO moved away from. Callers draw
 * these; `alertsFor` and `cervixAlert` decide what is actually flagged.
 */
export function partographLines(
  activePhaseStart: string,
  hours = 12,
): { alert: { at: string; cm: number }[]; action: { at: string; cm: number }[] } {
  const start = new Date(activePhaseStart).getTime();
  if (Number.isNaN(start)) return { alert: [], action: [] };

  const { activePhaseCm, alertRateCmPerHour, actionLineOffsetHours } = PARTOGRAPH_LEGACY;
  const alert: { at: string; cm: number }[] = [];
  const action: { at: string; cm: number }[] = [];

  for (let h = 0; h <= hours; h += 1) {
    const cm = activePhaseCm + h * alertRateCmPerHour;
    if (cm > 10) break;
    alert.push({ at: new Date(start + h * 3_600_000).toISOString(), cm });
    action.push({ at: new Date(start + (h + actionLineOffsetHours) * 3_600_000).toISOString(), cm });
  }
  return { alert, action };
}
