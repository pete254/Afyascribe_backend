/**
 * Which KNHTS (OCL) org/source feeds each of our logical domains.
 *
 * `system` is stored on each concept and is what the rest of the app references
 * (e.g. a diagnosis carries system 'ICD-11'). Keep these ids exactly as they
 * appear in the national service (https://ilm-hie.dha.go.ke/ocl).
 */
export interface SyncTarget {
  domain: 'diagnosis' | 'procedure' | 'lab' | 'drug' | 'benefit' | 'allergen' | 'reference';
  org: string;
  source: string;
  /** Stored `system` for concepts from this source (defaults to source). */
  system?: string;
  /** Skip from the default "sync everything" run (huge or optional sources). */
  optional?: boolean;
}

export const SYNC_TARGETS: SyncTarget[] = [
  // Diagnoses
  { domain: 'diagnosis', org: 'WHO', source: 'ICD-11' },
  { domain: 'diagnosis', org: 'WHO', source: 'ICD-10-WHO', optional: true },
  // Procedures / interventions
  { domain: 'procedure', org: 'WHO', source: 'ICHI' },
  // Labs & imaging investigations (Kenya-curated, carry LOINC in extras)
  { domain: 'lab', org: 'MOH-PPB', source: 'Investigations' },
  // Full LOINC — very large (~243k); sync explicitly when needed.
  { domain: 'lab', org: 'Regenstrief', source: 'LOINC', optional: true },
  // Drugs / commodities
  { domain: 'drug', org: 'MOH-PPB', source: 'HPT' },
  // Allergens — the national Allergy Intolerance Code list (~3,000 substances).
  { domain: 'allergen', org: 'MOH-KENYA', source: 'ORG-00001-SRC-012', system: 'AllergyIntoleranceCode' },
  // Reaction manifestations and severity, for coding what actually happened.
  { domain: 'reference', org: 'MOH-KENYA', source: 'ORG-00001-SRC-052', system: 'AllergyReactionManifestation' },
  { domain: 'reference', org: 'MOH-KENYA', source: 'ORG-00001-SRC-028', system: 'ConditionSeverity' },
  // SHA benefit package — billable services map to these for claims.
  { domain: 'benefit', org: 'MOH-KENYA', source: 'BenefitsAndInterventions', system: 'BenefitsAndInterventions' },
];

export const findTarget = (org: string, source: string): SyncTarget | undefined =>
  SYNC_TARGETS.find((t) => t.org === org && t.source === source);
