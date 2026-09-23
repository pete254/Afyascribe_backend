/**
 * Family history coding.
 *
 * KNHTS publishes no family-relationship value set — its only relationship list
 * (MOH-KENYA ORG-00001-SRC-017 "Coverage Relationship") holds three concepts
 * for insurance cover (child, spouse, principal) and is not fit for recording
 * who in a family had what. So relationships use the HL7 v3 RoleCode value set
 * that FHIR binds `FamilyMemberHistory.relationship` to, and conditions use
 * ICD-11 through KNHTS, as everywhere else in the record.
 */
export const FAMILY_RELATIONSHIP_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v3-RoleCode';

export interface FamilyRelationship {
  code: string;
  label: string;
  /** Roughly how much genetic material is shared — first-degree relatives matter most. */
  degree: 1 | 2 | 3;
}

export const FAMILY_RELATIONSHIPS: FamilyRelationship[] = [
  { code: 'MTH', label: 'Mother', degree: 1 },
  { code: 'FTH', label: 'Father', degree: 1 },
  { code: 'DAU', label: 'Daughter', degree: 1 },
  { code: 'SON', label: 'Son', degree: 1 },
  { code: 'SIS', label: 'Sister', degree: 1 },
  { code: 'BRO', label: 'Brother', degree: 1 },
  { code: 'NSIB', label: 'Sibling', degree: 1 },
  { code: 'GRMTH', label: 'Grandmother', degree: 2 },
  { code: 'GRFTH', label: 'Grandfather', degree: 2 },
  { code: 'AUNT', label: 'Aunt', degree: 2 },
  { code: 'UNCLE', label: 'Uncle', degree: 2 },
  { code: 'NEPHEW', label: 'Nephew', degree: 2 },
  { code: 'NIECE', label: 'Niece', degree: 2 },
  { code: 'COUSN', label: 'Cousin', degree: 3 },
  { code: 'FAMMEMB', label: 'Other family member', degree: 3 },
];

export const RELATIONSHIP_CODES = FAMILY_RELATIONSHIPS.map((r) => r.code);

export const relationshipOf = (code?: string | null): FamilyRelationship | undefined =>
  FAMILY_RELATIONSHIPS.find((r) => r.code === code);

/** FHIR FamilyMemberHistory.status. */
export const FAMILY_HISTORY_STATUSES = ['partial', 'completed', 'health-unknown', 'entered-in-error'] as const;
export type FamilyHistoryStatus = (typeof FAMILY_HISTORY_STATUSES)[number];
