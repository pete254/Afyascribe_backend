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

/** Kenya Core IG profile canonicals (fhir.dha.go.ke/ig). */
const KENYA_CORE = env('FHIR_KENYA_CORE_BASE', 'https://fhir.dha.go.ke/core/StructureDefinition');

export const FHIR_PROFILE = {
  observation: `${KENYA_CORE}/kenya-core-observation`,
  diagnosticReport: `${KENYA_CORE}/kenya-core-diagnosticreport`,
  serviceRequest: `${KENYA_CORE}/kenya-core-servicerequest`,
} as const;

export const FHIR_SYS = {
  /** Diagnoses — WHO ICD-11 MMS (the widely-used canonical). */
  icd11: env('FHIR_SYS_ICD11', 'http://id.who.int/icd/release/11/mms'),
  /** Labs — LOINC. */
  loinc: env('FHIR_SYS_LOINC', 'http://loinc.org'),
  /** Units — UCUM. */
  ucum: 'http://unitsofmeasure.org',
  /** Drugs / commodities — KNHTS MOH-PPB Health Products & Technologies. */
  hpt: env('FHIR_SYS_HPT', `${OCL_BASE}/orgs/MOH-PPB/sources/HPT`),
  /** Procedures / interventions — WHO ICHI via KNHTS. */
  ichi: env('FHIR_SYS_ICHI', `${OCL_BASE}/orgs/WHO/sources/ICHI`),

  /** Patient identifiers. */
  mrn: env('FHIR_SYS_MRN', 'https://afyascribe.health/identifier/mrn'),
  nationalId: env('FHIR_SYS_NATIONAL_ID', 'https://dha.go.ke/identifier/national-id'),
  shaId: env('FHIR_SYS_SHA', 'https://sha.go.ke/identifier/beneficiary'),

  /** Base for nationally-coded patient identifier types; the type code is appended. */
  patientIdentifier: env('FHIR_SYS_PATIENT_IDENTIFIER', 'https://dha.go.ke/identifier/patient'),

  /** The ANC clinic number the maternity register assigns. */
  ancNumber: env('FHIR_SYS_ANC_NUMBER', 'https://afyascribe.health/identifier/anc-number'),

  /** Facility identifier (KMHFL code when available). */
  facility: env('FHIR_SYS_FACILITY', 'https://kmhfl.health.go.ke/identifier/facility-code'),

  /** Base for practitioner regulatory identifiers; the licensing body is appended
   *  (e.g. .../kmpdc, .../nck). */
  practitioner: env('FHIR_SYS_PRACTITIONER', 'https://dha.go.ke/identifier/practitioner'),

  /** Coverage type code system + the per-patient coverage identifier system. */
  coverageType: env('FHIR_SYS_COVERAGE_TYPE', 'https://dha.go.ke/CodeSystem/coverage-type'),
  coverage: env('FHIR_SYS_COVERAGE', 'https://afyascribe.health/identifier/coverage'),

  /** This system's own visit identifier, and the HIE's when a visit is opened. */
  visit: env('FHIR_SYS_VISIT', 'https://afyascribe.health/identifier/visit'),
  hieVisit: env('FHIR_SYS_HIE_VISIT', 'https://dha.go.ke/identifier/shr-visit'),

  /** Encounter / visit type code system (KNHTS Visit type). */
  visitType: env('FHIR_SYS_VISIT_TYPE', 'https://dha.go.ke/CodeSystem/visit-type'),

  /** Vaccines — the codes Kenya's national schedule uses, as WHO records them. */
  vaccine: env('FHIR_SYS_VACCINE', 'https://xmart-api-public.who.int/WIISE/vaccine-code'),

  /** Condition severity — national Condition Severity value set. */
  conditionSeverity: env('FHIR_SYS_CONDITION_SEVERITY', `${OCL_BASE}/orgs/MOH-KENYA/sources/ORG-00001-SRC-028`),
  /** Allergens — national Allergy Intolerance Code list. */
  allergen: env('FHIR_SYS_ALLERGEN', `${OCL_BASE}/orgs/MOH-KENYA/sources/ORG-00001-SRC-012`),
  /** Allergy reaction manifestations. */
  allergyManifestation: env('FHIR_SYS_ALLERGY_MANIFESTATION', `${OCL_BASE}/orgs/MOH-KENYA/sources/ORG-00001-SRC-052`),
  /** Active components of a medicinal product (HPT `AC…` tier). */
  hptComponent: env('FHIR_SYS_HPT_COMPONENT', `${OCL_BASE}/orgs/MOH-PPB/sources/HPT`),

  /** SHA benefit package (KNHTS MOH-KENYA/BenefitsAndInterventions). */
  benefit: env('FHIR_SYS_BENEFIT', `${OCL_BASE}/orgs/MOH-KENYA/sources/BenefitsAndInterventions`),
} as const;
