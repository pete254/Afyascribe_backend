/**
 * MOH 505 — the IDSR Weekly Epidemic Monitoring Form.
 *
 * Transcribed from Annex 2H of Kenya's IDSR Technical Guidelines (2022 edition
 * of the form marked Edition 2020). The rows are in the order the paper form
 * prints them, so a focal person comparing the screen with the form reads down
 * the same list.
 *
 * Each row is counted four ways: cases and deaths, under five and five and
 * over. The form's own instruction is that the facility's disease surveillance
 * focal person submits it by Monday for the week just ended, to the sub-county
 * disease surveillance coordinator, retaining the duplicate.
 */

export const MOH505_SOURCE = {
  publisher: 'Ministry of Health, Kenya',
  form: 'MOH 505 — IDSR Weekly Epidemic Monitoring Form (Edition 2020)',
  annex: 'IDSR Technical Guidelines for Kenya, Annex 2H',
  instruction:
    'The facility disease surveillance focal person submits the form by Monday of every week to the sub-county disease surveillance coordinator, and retains the duplicate.',
  url: 'https://nphi.go.ke/sites/default/files/2024-02/IDSR%20Technical%20Guidelines%20for%20Kenya%2011.05.2022_9am.pdf',
} as const;

export interface Moh505Row {
  /** The label as the form prints it. */
  label: string;
  /** The IDSR condition this row counts, where it maps to one. */
  conditionCode: string | null;
  /**
   * A row that counts deaths from another row rather than cases of its own.
   * "Deaths due to Malaria" is the form's only one.
   */
  deathsOf?: string;
  note?: string;
}

export const MOH505_ROWS: readonly Moh505Row[] = [
  { label: 'AEFI', conditionCode: 'AEFI' },
  { label: 'Acute Jaundice', conditionCode: 'ACUTE_JAUNDICE' },
  { label: 'Acute Malnutrition', conditionCode: 'ACUTE_MALNUTRITION' },
  { label: 'AFP (Poliomyelitis)', conditionCode: 'AFP' },
  { label: 'Anthrax', conditionCode: 'ANTHRAX' },
  { label: 'Cholera', conditionCode: 'CHOLERA' },
  { label: 'Dengue', conditionCode: 'DENGUE' },
  { label: 'Dysentery (Bacillary)', conditionCode: 'BLOODY_DIARRHOEA' },
  { label: 'Guinea Worm Disease', conditionCode: 'GUINEA_WORM' },
  { label: 'Measles', conditionCode: 'MEASLES' },
  { label: 'Suspected Malaria', conditionCode: 'MALARIA' },
  {
    label: 'Deaths due to Malaria',
    conditionCode: null,
    deathsOf: 'MALARIA',
    note: 'The form counts malaria deaths on their own row as well as in the deaths columns above.',
  },
  { label: 'Maternal deaths', conditionCode: 'MATERNAL_DEATH', note: 'Counted from the maternity register.' },
  { label: 'Meningococcal Meningitis', conditionCode: 'MENINGOCOCCAL' },
  { label: 'Neonatal deaths', conditionCode: 'NEONATAL_DEATH', note: 'Counted from the newborn register.' },
  { label: 'Neonatal Tetanus', conditionCode: 'NNT' },
  { label: 'Plague', conditionCode: 'PLAGUE' },
  { label: 'Rabies', conditionCode: 'RABIES' },
  { label: 'Rift Valley Fever', conditionCode: 'RVF' },
  {
    label: 'SARI (Cluster ≥3 cases)',
    conditionCode: 'SARI',
    note: 'The form asks for clusters of three or more, not every case.',
  },
  { label: 'Suspected MDR/XDR TB', conditionCode: 'MDR_TB' },
  { label: 'Typhoid', conditionCode: 'TYPHOID' },
  { label: 'VHF', conditionCode: 'VHF' },
  { label: 'Yellow Fever', conditionCode: 'YELLOW_FEVER' },
];

/** The four numbers every row carries. */
export interface Moh505Counts {
  under5Cases: number;
  under5Deaths: number;
  over5Cases: number;
  over5Deaths: number;
}

export const emptyCounts = (): Moh505Counts => ({
  under5Cases: 0,
  under5Deaths: 0,
  over5Cases: 0,
  over5Deaths: 0,
});

/**
 * The laboratory surveillance block at the foot of the form.
 *
 * Left as entered rather than computed: it counts tests and positives by
 * method and sub-type, and this system does not hold malaria microscopy or
 * CSF sub-typing in a shape that could produce them honestly.
 */
export const MOH505_LAB_SECTIONS = [
  { key: 'malariaMicroscopy', label: 'Malaria — microscopy', fields: ['Tested', 'Positive'] },
  { key: 'malariaRdt', label: 'Malaria — mRDT', fields: ['Tested', 'Positive'] },
  { key: 'bacterialMeningitis', label: 'Bacterial meningitis — CSF', fields: ['No CSF', 'No contaminated', 'No tested'] },
  { key: 'dysentery', label: 'Dysentery', fields: ['Tested', 'Positive (S. dysenteriae)'] },
  { key: 'tuberculosis', label: 'Tuberculosis (MDR/XDR)', fields: ['Tested', 'Positive'] },
  { key: 'typhoid', label: 'Typhoid', fields: ['Tested', 'Positive'] },
] as const;

/** Five is the age the form splits on. */
export const AGE_SPLIT_YEARS = 5;
