/**
 * The identifier types a Kenyan patient may hold.
 *
 * The first eight are the national list published on KNHTS
 * (MOH-KENYA / ORG-00001-SRC-016 "Kenya Patient Identifiers"), checked against
 * the service on 2026-09-23 — those carry `national: true` and their code is
 * the national code, so it travels unchanged.
 *
 * The remainder are required by the HIE's own Client Registry search (the DHA
 * UAT checklist asks for birth certificate, birth notification, refugee ID,
 * mandate number and temporary ID) but are **not** in the published value set.
 * They are marked `national: false` so nothing claims a national code it does
 * not have; if DHA publishes them later, only this table changes.
 */
export interface IdentifierType {
  /** National code where one exists, otherwise our own stable key. */
  code: string;
  label: string;
  national: boolean;
  /** FHIR v2-0203 identifier type, where one fits. */
  fhirType?: string;
}

export const PATIENT_IDENTIFIER_TYPES: IdentifierType[] = [
  // Published national value set
  { code: 'nationalID', label: 'National ID', national: true, fhirType: 'NI' },
  { code: 'passportID', label: 'Passport Number', national: true, fhirType: 'PPN' },
  { code: 'alienID', label: 'Alien ID', national: true },
  { code: 'militaryID', label: 'Military ID', national: true },
  { code: 'shaNumber', label: 'SHA Number', national: true, fhirType: 'SB' },
  { code: 'payerID', label: 'Payer ID', national: true },
  { code: 'kraPIN', label: 'KRA PIN', national: true, fhirType: 'TAX' },
  { code: 'householdNumber', label: 'Household Number', national: true },
  // Required by the Client Registry search, not yet in the national value set
  { code: 'birthCertificate', label: 'Birth Certificate', national: false, fhirType: 'BR' },
  { code: 'birthNotification', label: 'Birth Notification', national: false },
  { code: 'refugeeID', label: 'Refugee ID', national: false },
  { code: 'mandateNumber', label: 'Mandate Number', national: false },
  { code: 'temporaryID', label: 'Temporary ID', national: false },
  { code: 'clientRegistryID', label: 'Client Registry ID (CR ID)', national: false },
];

export const IDENTIFIER_TYPE_CODES = PATIENT_IDENTIFIER_TYPES.map((t) => t.code);

export const identifierType = (code?: string | null): IdentifierType | undefined =>
  PATIENT_IDENTIFIER_TYPES.find((t) => t.code === code);

/** The national value set these codes come from. */
export const NATIONAL_IDENTIFIER_SOURCE = 'ORG-00001-SRC-016';

/**
 * Legacy single-field values (`idType`) mapped onto the coded list, so records
 * registered before this existed carry their identifier forward.
 */
export function normaliseLegacyIdType(idType?: string | null): string | null {
  const t = (idType ?? '').trim().toLowerCase().replace(/[\s_-]/g, '');
  if (!t) return null;
  const map: Record<string, string> = {
    nationalid: 'nationalID',
    national: 'nationalID',
    id: 'nationalID',
    idcard: 'nationalID',
    passport: 'passportID',
    passportnumber: 'passportID',
    alien: 'alienID',
    alienid: 'alienID',
    military: 'militaryID',
    militaryid: 'militaryID',
    birthcertificate: 'birthCertificate',
    birthcert: 'birthCertificate',
    birthnotification: 'birthNotification',
    refugee: 'refugeeID',
    refugeeid: 'refugeeID',
    kra: 'kraPIN',
    krapin: 'kraPIN',
    sha: 'shaNumber',
    shanumber: 'shaNumber',
  };
  return map[t] ?? null;
}
