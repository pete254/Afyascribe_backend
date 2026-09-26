/**
 * Where each piece of advice comes from.
 *
 * Every rule in this module cites a published source, and the citation travels
 * with the advice to the screen. Nothing here is this system's clinical
 * opinion: a rule that cannot be pointed at a guideline does not get written,
 * because advice a clinician cannot check is advice they should not take.
 */

export interface CdsSource {
  key: string;
  publisher: string;
  /** The wording the rule is drawn from, so a reader can weigh it themselves. */
  citation: string;
  url?: string;
}

export const SOURCES: Record<string, CdsSource> = {
  obstetricProtocols: {
    key: 'obstetricProtocols',
    publisher: 'Ministry of Health, Kenya — Basic Obstetric Protocols, 1st edition (2026)',
    citation: 'Protocols for hypertensive disorders, anaemia and obstructed labour in pregnancy.',
    url: 'https://www.health.go.ke/',
  },
  pncGuidelines: {
    key: 'pncGuidelines',
    publisher:
      'Ministry of Health, Kenya — Healthy Mothers and Newborns: Guidelines for Postnatal Care (2016)',
    citation: 'Postnatal care of mothers and newborns.',
  },
  whoGrowth: {
    key: 'whoGrowth',
    publisher: 'WHO Child Growth Standards',
    citation: 'Weight-for-age, height-for-age and weight-for-length/height z-scores.',
    url: 'https://www.who.int/tools/child-growth-standards',
  },
  kenyaImmunisation: {
    key: 'kenyaImmunisation',
    publisher: "Kenya's national immunisation schedule (WHO WIISE, KEN 2025)",
    citation: 'Ages at which each vaccine falls due.',
  },
  facilityRecord: {
    key: 'facilityRecord',
    publisher: "This facility's own record",
    citation: 'Drawn from what has been recorded for this patient, not from a guideline.',
  },
};
