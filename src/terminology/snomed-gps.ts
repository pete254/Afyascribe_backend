/**
 * SNOMED CT via the Global Patient Set.
 *
 * Kenya is not a member of SNOMED International — South Africa is the only
 * African member — so there is no National Release Centre to obtain SNOMED CT
 * from, and KNHTS carries no SNOMED source. The route that is open is the
 * Global Patient Set, which SNOMED International publishes for exactly this
 * case: "healthcare systems in both Member and non-Member countries to share,
 * store, and display SNOMED CT-coded data without requiring access to the full
 * SNOMED CT terminology or a licensing agreement."
 *
 * ── What this buys, and what it does not ───────────────────────────────────
 * The GPS carries every active concept in the International Edition, plus
 * inactives back to 2012, as four tab-separated columns: identifier, active
 * flag, Fully Specified Name, US preferred term.
 *
 * It explicitly excludes subtype (IS-A) relationships, attribute
 * relationships, logical definitions, concept hierarchies, inference, and
 * historical associations. It is, in SNOMED International's own words, "a flat
 * collection of identifiers and terms".
 *
 * So: coding a finding with a SNOMED identifier and exchanging it — yes.
 * Asking "is this a kind of diabetes" — no. That needs the hierarchy, which
 * needs a paid Affiliate licence, Kenya being lower-middle-income rather than
 * Band E. Nothing here should pretend otherwise.
 *
 * ── Licence ────────────────────────────────────────────────────────────────
 * Creative Commons Attribution-NoDerivatives 4.0. Attribution is required
 * wherever terms are displayed; see {@link SNOMED_ATTRIBUTION}. Terms are
 * stored and shown verbatim, which is what keeps us inside NoDerivatives.
 *
 * https://www.snomed.org/gps
 */

export const SNOMED_ORG = 'SNOMED-INTL';
export const SNOMED_SYSTEM = 'SNOMED-CT';

/** The URI a FHIR Coding uses for SNOMED CT. */
export const SNOMED_FHIR_SYSTEM = 'http://snomed.info/sct';

/** Required by CC BY-ND 4.0 wherever SNOMED terms are shown. */
export const SNOMED_ATTRIBUTION = {
  notice:
    'This material includes SNOMED Clinical Terms® (SNOMED CT®), which is used by permission of SNOMED International. All rights reserved. SNOMED CT® was originally created by the College of American Pathologists.',
  source: 'SNOMED International Global Patient Set',
  licence: 'Creative Commons Attribution-NoDerivatives 4.0 International',
  url: 'https://www.snomed.org/gps',
};

/**
 * A GPS row.
 *
 * The file has no header and no quoting: four tab-separated fields, and the
 * FSN may itself contain spaces, commas and parentheses, so it must be split
 * on tabs and nothing else.
 */
export interface GpsRow {
  conceptId: string;
  active: boolean;
  fsn: string;
  preferredTerm: string;
}

/**
 * Which of our domains a concept belongs to, worked out from the semantic tag
 * at the end of its Fully Specified Name.
 *
 * This is the one piece of structure the GPS does carry. `Myocardial
 * infarction (disorder)` tells us it is a diagnosis without needing the
 * IS-A hierarchy the GPS leaves out — the tag names the top-level branch the
 * concept sits under. Anything unrecognised falls to `reference` rather than
 * being guessed into a clinical domain, because a mis-filed concept offered in
 * a diagnosis picker is worse than one that is merely hard to find.
 */
const DOMAIN_BY_TAG: Record<string, string> = {
  disorder: 'diagnosis',
  finding: 'diagnosis',
  event: 'diagnosis',
  situation: 'diagnosis',
  'morphologic abnormality': 'diagnosis',

  procedure: 'procedure',
  'regime/therapy': 'procedure',

  'observable entity': 'lab',
  specimen: 'lab',
  organism: 'lab',
  'cell structure': 'lab',
  cell: 'lab',

  substance: 'allergen',

  product: 'drug',
  'medicinal product': 'drug',
  'medicinal product form': 'drug',
  'clinical drug': 'drug',
  'dose form': 'drug',
  'unit of presentation': 'drug',
};

/** The parenthesised tag at the end of an FSN, e.g. 'disorder'. */
export function semanticTag(fsn: string): string | null {
  const m = /\(([^()]+)\)\s*$/.exec(fsn.trim());
  return m ? m[1].trim().toLowerCase() : null;
}

/** Our logical domain for a concept, from its FSN. Defaults to reference. */
export function domainForFsn(fsn: string): string {
  const tag = semanticTag(fsn);
  return (tag && DOMAIN_BY_TAG[tag]) || 'reference';
}

/**
 * Parse one line of the GPS file.
 *
 * Returns null for a blank line or one that does not have four fields, rather
 * than throwing: a single malformed row should not abandon an import of
 * several hundred thousand, and the count of what was skipped is reported.
 */
export function parseGpsLine(line: string): GpsRow | null {
  if (!line || !line.trim()) return null;
  const parts = line.split('\t');
  if (parts.length < 4) return null;

  const [conceptId, active, fsn, preferredTerm] = parts;
  // A concept id is a numeric SNOMED identifier; the header row, if the file
  // has one, fails this and is skipped without special-casing it.
  if (!/^\d{6,18}$/.test(conceptId.trim())) return null;

  return {
    conceptId: conceptId.trim(),
    active: active.trim() === '1',
    fsn: fsn.trim(),
    preferredTerm: (preferredTerm ?? '').trim() || fsn.trim(),
  };
}

/** A row shaped for the `terminology_concepts` table. */
export function toConceptRow(row: GpsRow) {
  return {
    org: SNOMED_ORG,
    system: SNOMED_SYSTEM,
    code: row.conceptId,
    // The preferred term is what a clinician should see; the FSN is kept in
    // extras because it carries the semantic tag that disambiguates two
    // concepts whose preferred terms read identically.
    display: row.preferredTerm,
    domain: domainForFsn(row.fsn),
    tier: null as string | null,
    concept_class: semanticTag(row.fsn),
    datatype: null as string | null,
    // The FSN is a synonym worth searching: someone typing "myocardial
    // infarction (disorder)" should find it, and so should the tag alone.
    synonyms: row.fsn && row.fsn !== row.preferredTerm ? [row.fsn] : [],
    extras: { fsn: row.fsn, source: 'GPS' } as Record<string, unknown>,
    retired: !row.active,
    source_updated_at: null as Date | null,
  };
}
