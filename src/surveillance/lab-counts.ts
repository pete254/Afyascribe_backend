import { Moh505LabKey } from './data/moh505';

/**
 * The MOH 505 laboratory lines, counted from the laboratory module
 * (IDSR Reporting Specification I-7).
 *
 * A test counts towards a line when the facility has marked it so — each
 * facility names its own tests, so the system cannot guess that "BS for MPS"
 * is malaria microscopy. Only what the record can honestly say is counted:
 *
 * - Tested: results released in the week.
 * - Positive, for malaria (both lines) and typhoid: released results with a
 *   value flagged abnormal or high against the test's reference.
 * - CSF: samples collected in the week, and tested (released) in the week.
 *
 * Not counted, left to the focal person: CSF contaminated; dysentery positive
 * for *S. dysenteriae* (needs the organism, not just a positive); MDR/XDR TB
 * positive (needs the resistance result, not just TB detected).
 */
export interface LabItemFact {
  line: Moh505LabKey;
  collectedInWeek: boolean;
  releasedInWeek: boolean;
  positive: boolean;
}

export type LabFigures = Record<string, Record<string, number>>;

/** The fields each line computes; the rest of the line is typed in. */
export const COMPUTED_LAB_FIELDS: Record<Moh505LabKey, readonly string[]> = {
  malariaMicroscopy: ['Tested', 'Positive'],
  malariaRdt: ['Tested', 'Positive'],
  bacterialMeningitis: ['No CSF', 'No tested'],
  dysentery: ['Tested'],
  tuberculosis: ['Tested'],
  typhoid: ['Tested', 'Positive'],
};

export function countLab(items: readonly LabItemFact[]): LabFigures {
  const out: LabFigures = {};
  for (const [line, fields] of Object.entries(COMPUTED_LAB_FIELDS)) {
    out[line] = Object.fromEntries(fields.map((f) => [f, 0]));
  }
  for (const item of items) {
    const row = out[item.line];
    if (!row) continue;
    if (item.line === 'bacterialMeningitis') {
      if (item.collectedInWeek) row['No CSF'] += 1;
      if (item.releasedInWeek) row['No tested'] += 1;
      continue;
    }
    if (!item.releasedInWeek) continue;
    row.Tested += 1;
    if (item.positive && 'Positive' in row) row.Positive += 1;
  }
  return out;
}

/** The computed figures, with anything a person typed in laid over them. */
export function overlayLab(
  computed: LabFigures,
  entered: LabFigures | null | undefined,
): LabFigures {
  const out: LabFigures = {};
  for (const [line, fields] of Object.entries(computed))
    out[line] = { ...fields };
  for (const [line, fields] of Object.entries(entered ?? {})) {
    out[line] = { ...(out[line] ?? {}), ...fields };
  }
  return out;
}

/** Keep only what a person changed: a figure equal to the computed one is not a correction. */
export function labCorrections(
  computed: LabFigures,
  sent: LabFigures | null | undefined,
): LabFigures {
  const out: LabFigures = {};
  for (const [line, fields] of Object.entries(sent ?? {})) {
    for (const [field, value] of Object.entries(fields ?? {})) {
      if (computed[line]?.[field] === value) continue;
      (out[line] ??= {})[field] = value;
    }
  }
  return out;
}
