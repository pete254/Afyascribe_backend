/**
 * Shaping a submission for Kenya's Shared Health Record.
 *
 * The SHR states three rules for clinical data, and they are the whole of what
 * this file exists to enforce:
 *
 *   - it is written as a FHIR **collection** Bundle, to `POST /shr/bundles`;
 *   - "the `Encounter` must reference the visit's `EpisodeOfCare`";
 *   - "every clinical resource in the bundle must reference that `Encounter`".
 *
 * Without credentials none of this can be tried against the real service, so
 * the rules are written down as a validator instead. That is worth more than a
 * comment: conformance becomes something the test suite checks rather than
 * something anyone has to remember.
 *
 * Source: https://hie-docs.dha.go.ke/docs/sharedHealthRecord/gettingStarted/intro
 */

export type Json = Record<string, any>;

/**
 * Resource types that describe care and so must point at the Encounter.
 *
 * The supporting cast — Patient, Practitioner, Organization, EpisodeOfCare,
 * Encounter itself — describes *who and where*, not what was done, and carries
 * no encounter reference. Listing the clinical types explicitly means a new
 * resource added later is not silently treated as context.
 */
export const CLINICAL_RESOURCE_TYPES = new Set([
  'Observation',
  'Condition',
  'AllergyIntolerance',
  'MedicationStatement',
  'MedicationRequest',
  'MedicationDispense',
  'DiagnosticReport',
  'ServiceRequest',
  'Procedure',
  'Immunization',
  'FamilyMemberHistory',
  'CarePlan',
  'ClinicalImpression',
  'Composition',
]);

/** Types that give the bundle its context rather than its content. */
export const CONTEXT_RESOURCE_TYPES = new Set([
  'Patient',
  'Practitioner',
  'PractitionerRole',
  'Organization',
  'Location',
  'EpisodeOfCare',
  'Encounter',
  'Coverage',
  'Claim',
]);

/**
 * Point every clinical resource at the Encounter.
 *
 * A resource that already names an encounter is left alone — an antenatal
 * contact belongs to the contact it was recorded at, not to whichever visit
 * happens to be being submitted.
 */
export function stampEncounter(resources: Json[], encounterId: string): Json[] {
  const reference = { reference: `Encounter/${encounterId}` };
  return resources.map((r) => {
    if (!CLINICAL_RESOURCE_TYPES.has(String(r.resourceType))) return r;
    if (r.encounter) return r;
    return { ...r, encounter: reference };
  });
}

/** The collection Bundle the SHR accepts. */
export function collectionBundle(resources: Json[]): Json {
  return {
    resourceType: 'Bundle',
    type: 'collection',
    timestamp: new Date().toISOString(),
    total: resources.length,
    entry: resources.map((r) => ({ fullUrl: `urn:uuid:${r.id}`, resource: r })),
  };
}

export interface ShrProblem {
  /** Where the problem is, as a path a reader can follow. */
  at: string;
  rule: 'bundle-type' | 'missing-encounter' | 'encounter-episode' | 'unreferenced' | 'dangling-reference';
  detail: string;
}

/**
 * Check a bundle against the SHR's stated rules before it is sent.
 *
 * Returns every problem rather than the first, so a submission is fixed in one
 * pass rather than one round-trip per mistake.
 */
export function validateShrBundle(bundle: Json): { ok: boolean; problems: ShrProblem[] } {
  const problems: ShrProblem[] = [];

  if (bundle?.resourceType !== 'Bundle' || bundle?.type !== 'collection') {
    problems.push({
      at: 'Bundle.type',
      rule: 'bundle-type',
      detail: `The SHR takes a collection Bundle; this is ${bundle?.type ?? bundle?.resourceType ?? 'not a Bundle'}`,
    });
  }

  const resources: Json[] = (bundle?.entry ?? [])
    .map((e: Json) => e?.resource)
    .filter(Boolean);

  const encounters = resources.filter((r) => r.resourceType === 'Encounter');
  const episodeIds = new Set(
    resources.filter((r) => r.resourceType === 'EpisodeOfCare').map((r) => String(r.id)),
  );

  if (!encounters.length) {
    problems.push({
      at: 'Bundle.entry',
      rule: 'missing-encounter',
      detail: 'A clinical submission needs at least one Encounter',
    });
  }

  for (const enc of encounters) {
    const refs: string[] = (enc.episodeOfCare ?? [])
      .map((e: Json) => String(e?.reference ?? ''))
      .filter(Boolean);
    if (!refs.length) {
      problems.push({
        at: `Encounter/${enc.id}`,
        rule: 'encounter-episode',
        detail: "Must reference the visit's EpisodeOfCare",
      });
      continue;
    }
    // The episode it names has to be in the bundle, or the receiving system has
    // a reference it cannot resolve.
    for (const ref of refs) {
      const id = ref.replace(/^EpisodeOfCare\//, '');
      if (!episodeIds.has(id)) {
        problems.push({
          at: `Encounter/${enc.id}`,
          rule: 'dangling-reference',
          detail: `References ${ref}, which is not in the bundle`,
        });
      }
    }
  }

  const encounterIds = new Set(encounters.map((r) => String(r.id)));
  for (const r of resources) {
    if (!CLINICAL_RESOURCE_TYPES.has(String(r.resourceType))) continue;
    const ref = r.encounter?.reference as string | undefined;
    if (!ref) {
      problems.push({
        at: `${r.resourceType}/${r.id}`,
        rule: 'unreferenced',
        detail: 'Every clinical resource must reference the Encounter',
      });
      continue;
    }
    const id = ref.replace(/^Encounter\//, '');
    if (!encounterIds.has(id)) {
      problems.push({
        at: `${r.resourceType}/${r.id}`,
        rule: 'dangling-reference',
        detail: `References ${ref}, which is not in the bundle`,
      });
    }
  }

  return { ok: problems.length === 0, problems };
}
