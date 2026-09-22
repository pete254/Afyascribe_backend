/**
 * Allergy coding follows the national value sets published on KNHTS
 * (https://ilm-hie.dha.go.ke/ocl, org MOH-KENYA):
 *   allergen (general)   ORG-00001-SRC-012  "Allergy Intolerance Code"        (~3,000 substances)
 *   manifestation        ORG-00001-SRC-052  "Allergy Reaction Manifestation"  (rash, itching, hives…)
 *   severity             ORG-00001-SRC-028  "Condition Severity"              (mild | moderate | severe)
 *
 * A *drug* allergy is additionally bound to the HPT active-component tier
 * (MOH-PPB/HPT, `AC…` codes) — a patient is allergic to the substance
 * ("Morphine"), not to a particular pack of it. That is the binding the DHA
 * certification criterion calls "HPT allergy integration".
 */
export const ALLERGEN_TYPES = ['medication', 'food', 'environment', 'biologic', 'other'] as const;
export type AllergenType = (typeof ALLERGEN_TYPES)[number];

/** FHIR AllergyIntolerance.type. */
export const ALLERGY_KINDS = ['allergy', 'intolerance'] as const;
export type AllergyKind = (typeof ALLERGY_KINDS)[number];

/** National Condition Severity value set. */
export const ALLERGY_SEVERITIES = ['mild', 'moderate', 'severe'] as const;
export type AllergySeverity = (typeof ALLERGY_SEVERITIES)[number];

/** FHIR AllergyIntolerance.criticality — the risk if the patient is exposed again. */
export const ALLERGY_CRITICALITIES = ['low', 'high', 'unable-to-assess'] as const;
export type AllergyCriticality = (typeof ALLERGY_CRITICALITIES)[number];

/**
 * Clinical status. `active` is the patient's current allergy list; everything
 * else is history, which the record keeps rather than deletes.
 */
export const ALLERGY_STATUSES = ['active', 'inactive', 'resolved', 'entered-in-error'] as const;
export type AllergyStatus = (typeof ALLERGY_STATUSES)[number];

/** How sure we are — FHIR verificationStatus. */
export const ALLERGY_VERIFICATIONS = ['unconfirmed', 'confirmed', 'refuted'] as const;
export type AllergyVerification = (typeof ALLERGY_VERIFICATIONS)[number];

/** KNHTS sources backing each coded field. */
export const ALLERGY_SYSTEMS = {
  allergen: 'ORG-00001-SRC-012',
  manifestation: 'ORG-00001-SRC-052',
  severity: 'ORG-00001-SRC-028',
  hpt: 'HPT',
} as const;
