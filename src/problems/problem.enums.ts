/**
 * A problem list is the patient's standing list of conditions — not the
 * diagnoses written on one visit. It is recorded, updated and read back over
 * time, which is what the DHA criterion asks for ("record, change, and access
 * a patient's active problem list").
 *
 * Conditions are coded with WHO ICD-11 through KNHTS, the same binding the
 * national claims checklist requires ("List ICD 11 diagnosis codes").
 */

/** FHIR Condition.clinicalStatus. */
export const PROBLEM_STATUSES = ['active', 'recurrence', 'relapse', 'inactive', 'remission', 'resolved'] as const;
export type ProblemStatus = (typeof PROBLEM_STATUSES)[number];

/** Statuses that keep a problem on the *active* list. */
export const OPEN_STATUSES: ProblemStatus[] = ['active', 'recurrence', 'relapse'];

/** FHIR Condition.verificationStatus. */
export const PROBLEM_VERIFICATIONS = [
  'unconfirmed',
  'provisional',
  'differential',
  'confirmed',
  'refuted',
  'entered-in-error',
] as const;
export type ProblemVerification = (typeof PROBLEM_VERIFICATIONS)[number];

/**
 * A long-term problem versus something diagnosed at one visit. Both live in the
 * list; the category says which is which, so a cough from March does not read
 * like a chronic condition.
 */
export const PROBLEM_CATEGORIES = ['problem-list-item', 'encounter-diagnosis'] as const;
export type ProblemCategory = (typeof PROBLEM_CATEGORIES)[number];

/** National Condition Severity value set (MOH-KENYA ORG-00001-SRC-028). */
export const PROBLEM_SEVERITIES = ['mild', 'moderate', 'severe'] as const;
export type ProblemSeverity = (typeof PROBLEM_SEVERITIES)[number];
