/**
 * Canonical code-system and identifier URIs for FHIR export to the Kenya HIE /
 * Shared Health Record. Kenya-first terminology (KNHTS/OCL) is used where a
 * national source exists; LOINC where there is no Kenya equivalent.
 *
 * These are configurable via env because the DHA outpatient FHIR IG
 * (afyalink.dha.go.ke) is the authority for the exact canonical URLs — override
 * any of these once the IG is confirmed, without touching the mappers.
 */
const env = (k: string, fallback: string) => process.env[k]?.trim() || fallback;

const OCL_BASE = env('KNHTS_API_BASE', 'https://ilm-hie.dha.go.ke/ocl').replace(/\/+$/, '');

export const FHIR_SYS = {
  /** Diagnoses — WHO ICD-11 MMS (the widely-used canonical). */
  icd11: env('FHIR_SYS_ICD11', 'http://id.who.int/icd/release/11/mms'),
  /** Labs — LOINC. */
  loinc: env('FHIR_SYS_LOINC', 'http://loinc.org'),
  /** Drugs / commodities — KNHTS MOH-PPB Health Products & Technologies. */
  hpt: env('FHIR_SYS_HPT', `${OCL_BASE}/orgs/MOH-PPB/sources/HPT`),
  /** Procedures / interventions — WHO ICHI via KNHTS. */
  ichi: env('FHIR_SYS_ICHI', `${OCL_BASE}/orgs/WHO/sources/ICHI`),

  /** Patient identifiers. */
  mrn: env('FHIR_SYS_MRN', 'https://afyascribe.health/identifier/mrn'),
  nationalId: env('FHIR_SYS_NATIONAL_ID', 'https://dha.go.ke/identifier/national-id'),
  shaId: env('FHIR_SYS_SHA', 'https://sha.go.ke/identifier/beneficiary'),

  /** Facility identifier (KMHFL code when available). */
  facility: env('FHIR_SYS_FACILITY', 'https://kmhfl.health.go.ke/identifier/facility-code'),

  /** Base for practitioner regulatory identifiers; the licensing body is appended
   *  (e.g. .../kmpdc, .../nck). */
  practitioner: env('FHIR_SYS_PRACTITIONER', 'https://dha.go.ke/identifier/practitioner'),

  /** Coverage type code system + the per-patient coverage identifier system. */
  coverageType: env('FHIR_SYS_COVERAGE_TYPE', 'https://dha.go.ke/CodeSystem/coverage-type'),
  coverage: env('FHIR_SYS_COVERAGE', 'https://afyascribe.health/identifier/coverage'),

  /** Encounter / visit type code system (KNHTS Visit type). */
  visitType: env('FHIR_SYS_VISIT_TYPE', 'https://dha.go.ke/CodeSystem/visit-type'),
} as const;
