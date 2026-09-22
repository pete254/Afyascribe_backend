/**
 * Reading a handwritten-style prescription well enough to work out how long a
 * dispensed quantity will last.
 *
 * Every function here returns `null` when it cannot read the text with
 * confidence. A days-supply figure a pharmacist cannot trust is worse than no
 * figure at all, so nothing is guessed: "as needed" has no fixed daily rate,
 * and an unrecognised frequency stays unrecognised.
 */

/** Doses per day for the abbreviations used on Kenyan prescriptions. */
const FREQUENCY_PER_DAY: Record<string, number> = {
  od: 1, // once daily
  'o.d': 1,
  daily: 1,
  once: 1,
  nocte: 1, // at night
  mane: 1, // in the morning
  bd: 2, // twice daily
  'b.d': 2,
  bid: 2,
  twice: 2,
  tds: 3, // three times daily
  't.d.s': 3,
  tid: 3,
  thrice: 3,
  qds: 4, // four times daily
  'q.d.s': 4,
  qid: 4,
};

/**
 * Doses per day, or null when the text does not state a fixed daily rate.
 * PRN ("as needed") deliberately returns null — it has no schedule.
 */
export function dosesPerDay(frequency?: string | null): number | null {
  const f = (frequency ?? '').trim().toLowerCase();
  if (!f) return null;
  // As-needed has no fixed rate, whatever else the text says.
  if (/\b(prn|as needed|as required|sos)\b/.test(f)) return null;

  // "1x3", "1 x 3" — units per dose × doses per day; we want the doses.
  const cross = f.match(/^\s*\d+\s*[x×]\s*(\d+)\s*$/);
  if (cross) {
    const n = Number(cross[1]);
    return n > 0 && n <= 12 ? n : null;
  }

  // "q8h", "8 hourly", "every 8 hours", "6 hrly"
  const hourly = f.match(/\bq\s*(\d{1,2})\s*h\b/) || f.match(/\b(?:every\s*)?(\d{1,2})\s*(?:hourly|hrly|hours|hrs|h)\b/);
  if (hourly) {
    const h = Number(hourly[1]);
    if (h > 0 && h <= 24 && 24 % h === 0) return 24 / h;
    if (h > 0 && h <= 24) return Number((24 / h).toFixed(2));
  }

  // "3 times a day", "2 times daily", "2 times per day"
  const times = f.match(/\b(\d{1,2})\s*(?:times|x)\s*(?:a|per)?\s*dai?l?y?\b/);
  if (times) {
    const n = Number(times[1]);
    return n > 0 && n <= 12 ? n : null;
  }

  // Weekly / alternate-day schedules expressed as a daily average.
  if (/\b(once\s*a\s*week|weekly|every\s*week)\b/.test(f)) return 1 / 7;
  if (/\b(alternate\s*days?|every\s*other\s*day|eod)\b/.test(f)) return 0.5;

  // Abbreviations, on a word boundary so "bd" inside another word is ignored.
  for (const [key, n] of Object.entries(FREQUENCY_PER_DAY)) {
    const esc = key.replace(/\./g, '\\.');
    if (new RegExp(`(^|[^a-z])${esc}([^a-z]|$)`).test(f)) return n;
  }
  return null;
}

/**
 * Units taken per dose — "1 tablet" → 1, "2 tabs" → 2, "5ml" → 5.
 * Returns null when no number is stated, since assuming 1 would silently
 * double the days supply of a two-tablet dose.
 */
export function unitsPerDose(dosage?: string | null): number | null {
  const d = (dosage ?? '').trim().toLowerCase();
  if (!d) return null;

  // "1x3" states units per dose first.
  const cross = d.match(/^\s*(\d+(?:\.\d+)?)\s*[x×]\s*\d+\s*$/);
  if (cross) return Number(cross[1]) || null;

  // A fraction of a tablet, e.g. "1/2 tab".
  const frac = d.match(/^\s*(\d+)\s*\/\s*(\d+)\b/);
  if (frac) {
    const n = Number(frac[1]) / Number(frac[2]);
    return n > 0 && n <= 10 ? n : null;
  }

  const m = d.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 && n <= 1000 ? n : null;
}

export interface DaysSupply {
  days: number;
  unitsPerDose: number;
  dosesPerDay: number;
}

/**
 * How long `quantity` lasts at the written dose and frequency, or null when
 * either cannot be read. Rounded down: a part-day of cover is not a day.
 */
export function daysSupply(
  quantity: number | null | undefined,
  dosage?: string | null,
  frequency?: string | null,
): DaysSupply | null {
  const qty = Number(quantity);
  if (!(qty > 0)) return null;
  const perDose = unitsPerDose(dosage);
  const perDay = dosesPerDay(frequency);
  if (perDose == null || perDay == null || perDose <= 0 || perDay <= 0) return null;
  const consumedPerDay = perDose * perDay;
  const days = Math.floor(qty / consumedPerDay);
  return { days, unitsPerDose: perDose, dosesPerDay: perDay };
}

/**
 * The quantity a written course needs — the other direction, used to warn a
 * pharmacist that what they are about to hand over runs out early.
 */
export function quantityForCourse(
  durationDays: number | null,
  dosage?: string | null,
  frequency?: string | null,
): number | null {
  if (durationDays == null || !(durationDays > 0)) return null;
  const perDose = unitsPerDose(dosage);
  const perDay = dosesPerDay(frequency);
  if (perDose == null || perDay == null) return null;
  return Math.ceil(perDose * perDay * durationDays);
}
