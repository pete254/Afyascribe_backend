import { IDSR_CONDITIONS } from '../surveillance/data/idsr';
import { MOH505_ROWS } from '../surveillance/data/moh505';

/**
 * The structural metadata behind our ADX messages — dimensions, codelists and
 * data elements, one definition per MOH return.
 *
 * ADX requires this. The profile defines the data message and mandates three
 * dimensions (`dataElement`, `orgUnit`, `period`) but leaves the codelists to
 * the jurisdiction: "Individual jurisdictions will extend the DSD by specifying
 * relevant codelists and additional dimensions of data to satisfy their message
 * exchange use cases." This file is that extension, and {@link renderDsd} emits
 * it as an SDMX v2.1 structure message.
 *
 * ── An honest limit on the data element codes ──────────────────────────────
 * `orgUnit` and `dataSet` are nationally meaningful: the first is the facility's
 * KMHFL code, the second the MOH form number. The `dataElement` codes are ours.
 * KHIS (Kenya's DHIS2) identifies its data elements by opaque UIDs which the
 * Ministry does not publish, so no correct mapping to them can be written from
 * outside. A message produced here is structurally valid SDMX and carries a DSD
 * that says exactly what each code means; loading it into KHIS additionally
 * needs the Ministry's own metadata export, which is a request to make and not
 * a thing to guess.
 */

export interface AdxCode {
  code: string;
  name: string;
}

export interface AdxDimension {
  /** The XML attribute name on <dataValue>. */
  id: string;
  name: string;
  /** Enumerated values. Empty where the codelist is open — see `open`. */
  codes: AdxCode[];
  /**
   * True where the values cannot be enumerated in advance because they come
   * from the facility's own data (a ward name, a test name). ADX permits this;
   * it is recorded so a consumer is not misled into expecting a closed list.
   */
  open?: boolean;
}

export interface AdxDataElement {
  code: string;
  name: string;
  /** Dimensions this element is always disaggregated by. */
  dims?: string[];
  /** A caveat that travels with each value as an <annotation>. */
  caveat?: string;
}

export interface AdxDataSetDef {
  /** The `dataSet` attribute — the MOH form number. */
  id: string;
  name: string;
  cadence: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
  dimensions: AdxDimension[];
  dataElements: AdxDataElement[];
  /**
   * True where data elements are one-per-thing-seen (a diagnosis, a test) so
   * the list cannot be fixed in advance.
   */
  openDataElements?: boolean;
  note?: string;
}

// ── Shared dimensions ───────────────────────────────────────────────────────

/**
 * Sex. `U` exists because the patient register stores gender as free text, so a
 * value that is neither male nor female is real and must go somewhere — without
 * this code the sex-disaggregated figures would not sum to the total, and a
 * consumer would be right to reject the message.
 */
const SEX: AdxDimension = {
  id: 'sex',
  name: 'Sex',
  codes: [
    { code: 'M', name: 'Male' },
    { code: 'F', name: 'Female' },
    { code: 'U', name: 'Not recorded as male or female' },
  ],
};

/** The age split every MOH outpatient and surveillance return uses. */
const AGE_GROUP: AdxDimension = {
  id: 'ageGroup',
  name: 'Age group',
  codes: [
    { code: 'under5', name: 'Under 5 years' },
    { code: '5andOver', name: '5 years and over' },
  ],
};

const WARD: AdxDimension = {
  id: 'ward',
  name: 'Ward',
  codes: [],
  open: true,
};

const LAB_DEPARTMENT: AdxDimension = {
  id: 'department',
  name: 'Laboratory department',
  codes: [],
  open: true,
};

const LAB_TEST: AdxDimension = {
  id: 'test',
  name: 'Laboratory test',
  codes: [],
  open: true,
};

/**
 * Kenya's IDSR priority conditions — the one genuinely closed codelist here,
 * because the list is published and finite. MOH 505 has a few printed lines
 * that do not map to an IDSR condition; those carry a `MOH505-` code of their
 * own so nothing is silently dropped.
 */
const IDSR_CONDITION: AdxDimension = {
  id: 'condition',
  name: 'IDSR priority condition',
  codes: [
    ...IDSR_CONDITIONS.map((c) => ({ code: c.code, name: c.name })),
    ...MOH505_ROWS.filter((r) => !r.conditionCode).map((r) => ({
      code: moh505Code(r.label),
      name: `${r.label} (MOH 505 line with no IDSR code)`,
    })),
  ],
};

/** A stable code for an MOH 505 line the IDSR list does not cover. */
export function moh505Code(label: string): string {
  return `MOH505-${slug(label)}`;
}

/** Upper-case, punctuation-free, stable across runs. Used where no code exists. */
export function slug(text: string): string {
  return (
    text
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'UNSPECIFIED'
  );
}

// ── The data sets ───────────────────────────────────────────────────────────

/** Attendance elements shared by MOH 705A and 705B. */
const ATTENDANCE: AdxDataElement[] = [
  { code: 'ATT-NEW', name: 'New attendances' },
  { code: 'ATT-REVISIT', name: 'Re-attendances' },
];

export const MOH705A: AdxDataSetDef = {
  id: 'MOH705A',
  name: 'Outpatient morbidity summary, under 5 years',
  cadence: 'monthly',
  dimensions: [SEX],
  dataElements: ATTENDANCE,
  openDataElements: true,
  note:
    'One data element per diagnosis seen in the period, coded to ICD-11 where the note carried a code and to a DX- slug of the diagnosis text where it did not. The age group is carried by the data set, as the paper form does: 705A is under 5, 705B is 5 and over.',
};

export const MOH705B: AdxDataSetDef = {
  ...MOH705A,
  id: 'MOH705B',
  name: 'Outpatient morbidity summary, 5 years and over',
};

export const MOH717: AdxDataSetDef = {
  id: 'MOH717',
  name: 'Monthly service workload summary',
  cadence: 'monthly',
  dimensions: [AGE_GROUP, SEX],
  dataElements: [
    { code: 'OUT-ATT-TOTAL', name: 'Outpatient attendances', dims: ['ageGroup', 'sex'] },
    { code: 'OUT-ATT-NEW', name: 'New outpatient attendances', dims: ['ageGroup'] },
    { code: 'OUT-ATT-REVISIT', name: 'Outpatient re-attendances', dims: ['ageGroup'] },
    { code: 'OUT-REFERRALS-IN', name: 'Referrals received' },
    { code: 'LAB-TESTS', name: 'Laboratory tests ordered' },
    { code: 'LAB-TESTS-COMPLETED', name: 'Laboratory tests resulted' },
    { code: 'IP-ADMISSIONS', name: 'Admissions' },
    { code: 'IP-DISCHARGES', name: 'Discharges' },
    { code: 'IP-DEATHS', name: 'Deaths' },
    {
      code: 'IP-BEDS',
      name: 'Beds',
      caveat: 'A count of beds as at export, not an average over the period.',
    },
    {
      code: 'IP-OCCUPIED',
      name: 'Beds occupied',
      caveat: 'Occupancy as at export, not an average over the period.',
    },
  ],
  openDataElements: true,
  note:
    'Billed services add one SVC- element per service type, so that list grows with the catalogue. Bed figures are a point in time: the record keeps current bed state, not a daily census, so no period average can be derived from it honestly.',
};

export const MOH706: AdxDataSetDef = {
  id: 'MOH706',
  name: 'Laboratory monthly summary',
  cadence: 'monthly',
  dimensions: [LAB_DEPARTMENT, LAB_TEST],
  dataElements: [
    { code: 'LAB-TESTS', name: 'Tests ordered', dims: ['department', 'test'] },
    { code: 'LAB-TESTS-COMPLETED', name: 'Tests resulted', dims: ['department', 'test'] },
  ],
  note:
    'Test and department names come from the facility\'s own catalogue, so both codelists are open. A test counts as resulted once it is awaiting review or released.',
};

export const MOH328: AdxDataSetDef = {
  id: 'MOH328',
  name: 'Bed return',
  cadence: 'daily',
  dimensions: [WARD],
  dataElements: [
    { code: 'IP-ADMISSIONS', name: 'Admissions', dims: ['ward'] },
    { code: 'IP-DISCHARGES', name: 'Discharges', dims: ['ward'] },
    { code: 'IP-DEATHS', name: 'Deaths', dims: ['ward'] },
    {
      code: 'BED-CAPACITY',
      name: 'Beds',
      dims: ['ward'],
      caveat: 'A count of beds as at export, not an average over the period.',
    },
    {
      code: 'BED-OCCUPIED',
      name: 'Beds occupied',
      dims: ['ward'],
      caveat: 'Occupancy as at export, not an average over the period.',
    },
    {
      code: 'BED-AVAILABLE',
      name: 'Beds available',
      dims: ['ward'],
      caveat: 'Availability as at export, not an average over the period.',
    },
  ],
};

export const MOH505: AdxDataSetDef = {
  id: 'MOH505',
  name: 'IDSR weekly epidemiological return',
  cadence: 'weekly',
  dimensions: [IDSR_CONDITION, AGE_GROUP],
  dataElements: [
    { code: 'IDSR-CASES', name: 'Cases', dims: ['condition', 'ageGroup'] },
    { code: 'IDSR-DEATHS', name: 'Deaths', dims: ['condition', 'ageGroup'] },
  ],
  note:
    'The period is an ISO epidemiological week, Monday to Sunday. The form has no column for an unknown age, so a case whose age is not recorded counts with the 5-and-over group — the same choice the weekly return itself makes.',
};

export const ADX_DATASETS: AdxDataSetDef[] = [
  MOH705A,
  MOH705B,
  MOH717,
  MOH706,
  MOH328,
  MOH505,
];

export const datasetById = (id: string): AdxDataSetDef | undefined =>
  ADX_DATASETS.find((d) => d.id.toLowerCase() === id.toLowerCase());

/**
 * MOH 204A and 204B are deliberately absent. They are line-listing registers —
 * one row per patient seen — and ADX carries aggregate data only. Their totals
 * are here, in MOH 705 and MOH 717, which is where they belong; the register
 * lines themselves are individual-level data and go to the SHR as FHIR, under
 * consent, not into a statistical message.
 */
export const NOT_AGGREGATE = ['MOH204A', 'MOH204B'];
