import { IdsrCondition } from './data/idsr';

/**
 * Alert and action thresholds, as Kenya's IDSR guidelines set them out.
 *
 * The guidelines describe two levels:
 *
 *   An *alert threshold* "suggests to health staff and the surveillance team
 *   that further investigation is needed... reached when there is one
 *   suspected case (as for an epidemic-prone disease or a disease targeted for
 *   elimination or eradication) or when there is an unexplained increase for
 *   any disease or unusual pattern seen over a period of time".
 *
 *   An *action (epidemic) threshold* "triggers a definite response... For rare
 *   diseases or diseases targeted for eradication, detection of a single case
 *   suggests an epidemic."
 *
 * Two are given as numbers and are implemented as such. The rest are not, and
 * the guidelines say why: "the national level is responsible for communicating
 * the thresholds for priority diseases to all reporting sites". Where no
 * number has been communicated, this raises a prompt to look rather than
 * inventing a cut-off and calling it the Ministry's.
 */

export const THRESHOLD_SOURCE = {
  publisher: 'Ministry of Health, Kenya — IDSR Technical Guidelines (3rd edition, 2022)',
  section: 'Thresholds for alert and action',
  note: 'Thresholds are set nationally and communicated to reporting sites; those not published here are left to be configured.',
} as const;

export type SignalLevel = 'alert' | 'action';

export interface Signal {
  conditionCode: string;
  conditionName: string;
  level: SignalLevel;
  /** Which rule fired, so it can be looked up in the guidelines. */
  rule: 'single-case' | 'meningitis-weekly' | 'meningitis-doubling' | 'sari-cluster' | 'unusual-increase';
  detail: string;
  /** What was counted, and over what. */
  count: number;
  /** The published figure, where the guidelines give one. */
  threshold: number | null;
  /** True where the rule is the guidelines' own number rather than a prompt to look. */
  published: boolean;
}

export interface WeekCount {
  conditionCode: string;
  cases: number;
}

/**
 * Bacterial meningitis, for a catchment under 30,000 — which is what a single
 * facility is. The guidelines give the larger-population figures too, but a
 * facility does not know its denominator, and applying a per-100,000 rate to
 * an unknown population would be arithmetic dressed as evidence.
 */
export const MENINGITIS = {
  alertCasesPerWeek: 2,
  actionCasesPerWeek: 5,
  /** "doubling of the number of cases in three weeks (minimum of 2 cases in one week)" */
  doublingWeeks: 3,
  doublingMinimum: 2,
} as const;

/** MOH 505 asks for SARI as clusters of three or more, not as single cases. */
export const SARI_CLUSTER = 3;

/**
 * Signals for one week.
 *
 * `history` is the weekly case counts before this week, most recent first. It
 * is only used by the rules that need a trend; the single-case rules do not.
 */
export function evaluateWeek(
  conditions: readonly IdsrCondition[],
  week: WeekCount[],
  history: WeekCount[][] = [],
): Signal[] {
  const byCode = new Map(conditions.map((c) => [c.code, c]));
  const countOf = (counts: WeekCount[], code: string) =>
    counts.find((c) => c.conditionCode === code)?.cases ?? 0;

  const signals: Signal[] = [];

  for (const { conditionCode, cases } of week) {
    if (cases <= 0) continue;
    const condition = byCode.get(conditionCode);
    if (!condition) continue;
    const name = condition.name;

    // Meningitis has its own published numbers, so it does not also get the
    // single-case rule.
    if (conditionCode === 'MENINGOCOCCAL') {
      if (cases >= MENINGITIS.actionCasesPerWeek) {
        signals.push({
          conditionCode,
          conditionName: name,
          level: 'action',
          rule: 'meningitis-weekly',
          detail: `${cases} suspected cases in one week. The action threshold for a catchment under 30,000 is ${MENINGITIS.actionCasesPerWeek}.`,
          count: cases,
          threshold: MENINGITIS.actionCasesPerWeek,
          published: true,
        });
      } else if (cases >= MENINGITIS.alertCasesPerWeek) {
        signals.push({
          conditionCode,
          conditionName: name,
          level: 'alert',
          rule: 'meningitis-weekly',
          detail: `${cases} suspected cases in one week. The alert threshold for a catchment under 30,000 is ${MENINGITIS.alertCasesPerWeek}.`,
          count: cases,
          threshold: MENINGITIS.alertCasesPerWeek,
          published: true,
        });
      }

      // "doubling of the number of cases in three weeks (minimum of 2 cases in one week)"
      const threeWeeksAgo = history[MENINGITIS.doublingWeeks - 1];
      if (threeWeeksAgo && cases >= MENINGITIS.doublingMinimum) {
        const then = countOf(threeWeeksAgo, conditionCode);
        if (then > 0 && cases >= then * 2) {
          signals.push({
            conditionCode,
            conditionName: name,
            level: 'action',
            rule: 'meningitis-doubling',
            detail: `Cases have doubled over ${MENINGITIS.doublingWeeks} weeks — ${then} then, ${cases} now.`,
            count: cases,
            threshold: then * 2,
            published: true,
          });
        }
      }
      continue;
    }

    // SARI is counted on MOH 505 as clusters of three or more.
    if (conditionCode === 'SARI') {
      if (cases >= SARI_CLUSTER) {
        signals.push({
          conditionCode,
          conditionName: name,
          level: 'alert',
          rule: 'sari-cluster',
          detail: `${cases} cases. MOH 505 counts SARI as clusters of ${SARI_CLUSTER} or more.`,
          count: cases,
          threshold: SARI_CLUSTER,
          published: true,
        });
      }
      continue;
    }

    /**
     * One suspected case of an immediately reportable condition is an alert.
     *
     * The guidelines' wording is "one suspected case (as for an epidemic-prone
     * disease or a disease targeted for elimination or eradication)", and
     * Kenya's immediately reportable list is exactly those diseases — which is
     * why they are reportable within 24 hours in the first place.
     */
    if (condition.immediate) {
      signals.push({
        conditionCode,
        conditionName: name,
        level: 'action',
        rule: 'single-case',
        detail:
          cases === 1
            ? 'One suspected case. For an epidemic-prone or eradication-targeted disease, a single case is an alert.'
            : `${cases} suspected cases. For an epidemic-prone or eradication-targeted disease, a single case is an alert.`,
        count: cases,
        threshold: 1,
        published: true,
      });
      continue;
    }

    /**
     * Everything else: the guidelines call an "unexplained increase... or
     * unusual pattern" an alert, and deliberately give no number — thresholds
     * are set nationally per disease. So this flags a week higher than any in
     * the recent record and says plainly that it is a prompt to look, not a
     * threshold that has been crossed.
     */
    if (history.length >= 3) {
      const past = history.map((h) => countOf(h, conditionCode));
      const highest = Math.max(...past);
      if (cases > highest && cases >= 2) {
        signals.push({
          conditionCode,
          conditionName: name,
          level: 'alert',
          rule: 'unusual-increase',
          detail: `${cases} cases, more than any of the past ${history.length} weeks (highest was ${highest}). The guidelines call an unexplained increase an alert but set no number — this is a prompt to look, not a published threshold.`,
          count: cases,
          threshold: null,
          published: false,
        });
      }
    }
  }

  // Action before alert, then the larger count first.
  return signals.sort(
    (a, b) => (a.level === b.level ? b.count - a.count : a.level === 'action' ? -1 : 1),
  );
}
