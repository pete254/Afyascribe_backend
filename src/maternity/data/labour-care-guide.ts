/**
 * The WHO Labour Care Guide (2020), transcribed from the published form.
 *
 * WHO retired the partograph in favour of this. The difference that matters is
 * the decision rule: the partograph's alert and action lines come from
 * Friedman's 1950s curves and assume 1 cm an hour from 4 cm, which modern data
 * does not support — labour is often slower than that and still normal, and
 * acting on the action line drives augmentation and caesarean in women who did
 * not need either. The Labour Care Guide replaces the lines with a reference
 * threshold on each row, and a lag time per centimetre of dilatation.
 *
 * Source: WHO Labour Care Guide, © World Health Organization 2021
 * (CC BY-NC-SA 3.0 IGO), to be used with its User's Manual.
 * https://www.who.int/docs/default-source/reproductive-health/maternal-health/who-labour-care-guide.pdf
 */

export const LCG_SOURCE = {
  publisher: 'World Health Organization — Labour Care Guide (2020)',
  edition: '© WHO 2021, CC BY-NC-SA 3.0 IGO',
  url: 'https://www.who.int/docs/default-source/reproductive-health/maternal-health/who-labour-care-guide.pdf',
  note: 'Replaced the partograph. Active first stage begins at 5 cm.',
  instruction:
    "Circle any observation meeting the criteria in the 'Alert' column, alert the senior midwife or doctor, and record the assessment and action taken.",
} as const;

/** The guide's own abbreviation key, so the form reads as the paper one does. */
export const LCG_ABBREVIATIONS: Record<string, string> = {
  Y: 'Yes',
  N: 'No',
  D: 'Declined',
  U: 'Unknown',
  SP: 'Supine',
  MO: 'Mobile',
  E: 'Early',
  L: 'Late',
  V: 'Variable',
  I: 'Intact',
  C: 'Clear',
  M: 'Meconium',
  B: 'Blood',
  A: 'Anterior',
  P: 'Posterior',
  T: 'Transverse',
};

export type LcgSection = 'supportive-care' | 'baby' | 'woman' | 'labour-progress' | 'medication';

export const LCG_SECTION_LABEL: Record<LcgSection, string> = {
  'supportive-care': 'Supportive care',
  baby: 'Baby',
  woman: 'Woman',
  'labour-progress': 'Labour progress',
  medication: 'Medication',
};

/**
 * A row of the guide. `alert` is the printed criterion, kept verbatim so what
 * the screen says and what the form says are the same words; the machine-
 * readable rule lives in `labour.ts` beside its tests.
 */
export interface LcgRow {
  key: string;
  label: string;
  section: LcgSection;
  /** The 'Alert' column exactly as the form prints it; null where it has none. */
  alert: string | null;
  /** How the value is captured. */
  kind: 'code' | 'number' | 'text';
  /** For coded rows, the values the form allows. */
  options?: { value: string; label: string }[];
  unit?: string;
}

const yn = [
  { value: 'Y', label: 'Yes' },
  { value: 'N', label: 'No' },
  { value: 'D', label: 'Declined' },
  { value: 'U', label: 'Unknown' },
];

export const LCG_ROWS: readonly LcgRow[] = [
  { key: 'companion', label: 'Companion', section: 'supportive-care', alert: 'N', kind: 'code', options: yn },
  { key: 'painRelief', label: 'Pain relief', section: 'supportive-care', alert: 'N', kind: 'code', options: yn },
  { key: 'oralFluid', label: 'Oral fluid', section: 'supportive-care', alert: 'N', kind: 'code', options: yn },
  {
    key: 'posture',
    label: 'Posture',
    section: 'supportive-care',
    alert: 'SP',
    kind: 'code',
    options: [
      { value: 'MO', label: 'Mobile' },
      { value: 'SP', label: 'Supine' },
    ],
  },

  { key: 'baselineFhr', label: 'Baseline FHR', section: 'baby', alert: '<110, ≥160', kind: 'number', unit: 'bpm' },
  {
    key: 'fhrDeceleration',
    label: 'FHR deceleration',
    section: 'baby',
    alert: 'L',
    kind: 'code',
    options: [
      { value: 'N', label: 'None' },
      { value: 'E', label: 'Early' },
      { value: 'L', label: 'Late' },
      { value: 'V', label: 'Variable' },
    ],
  },
  {
    key: 'amnioticFluid',
    label: 'Amniotic fluid',
    section: 'baby',
    alert: 'M+++, B',
    kind: 'code',
    options: [
      { value: 'I', label: 'Intact' },
      { value: 'C', label: 'Clear' },
      { value: 'M+', label: 'Meconium +' },
      { value: 'M++', label: 'Meconium ++' },
      { value: 'M+++', label: 'Meconium +++' },
      { value: 'B', label: 'Blood' },
    ],
  },
  {
    key: 'fetalPosition',
    label: 'Fetal position',
    section: 'baby',
    alert: 'P, T',
    kind: 'code',
    options: [
      { value: 'A', label: 'Anterior' },
      { value: 'P', label: 'Posterior' },
      { value: 'T', label: 'Transverse' },
    ],
  },
  {
    key: 'caput',
    label: 'Caput',
    section: 'baby',
    alert: '+++',
    kind: 'code',
    options: [
      { value: '0', label: 'Nil' },
      { value: '+', label: '+' },
      { value: '++', label: '++' },
      { value: '+++', label: '+++' },
    ],
  },
  {
    key: 'moulding',
    label: 'Moulding',
    section: 'baby',
    alert: '+++',
    kind: 'code',
    options: [
      { value: '0', label: 'Nil' },
      { value: '+', label: '+' },
      { value: '++', label: '++' },
      { value: '+++', label: '+++' },
    ],
  },

  { key: 'pulse', label: 'Pulse', section: 'woman', alert: '<60, ≥120', kind: 'number', unit: 'bpm' },
  { key: 'systolic', label: 'Systolic BP', section: 'woman', alert: '<80, ≥140', kind: 'number', unit: 'mmHg' },
  { key: 'diastolic', label: 'Diastolic BP', section: 'woman', alert: '≥90', kind: 'number', unit: 'mmHg' },
  { key: 'temperature', label: 'Temperature', section: 'woman', alert: '<35.0, ≥37.5', kind: 'number', unit: '°C' },
  {
    key: 'urine',
    label: 'Urine',
    section: 'woman',
    alert: 'P++, A++',
    kind: 'code',
    options: [
      { value: 'N', label: 'Nil' },
      { value: 'P+', label: 'Protein +' },
      { value: 'P++', label: 'Protein ++' },
      { value: 'A+', label: 'Acetone +' },
      { value: 'A++', label: 'Acetone ++' },
    ],
  },

  {
    key: 'contractionsPer10',
    label: 'Contractions per 10 min',
    section: 'labour-progress',
    alert: '≤2, >5',
    kind: 'number',
  },
  {
    key: 'contractionDuration',
    label: 'Duration of contractions',
    section: 'labour-progress',
    alert: '<20, >60',
    kind: 'number',
    unit: 'seconds',
  },
  {
    key: 'cervix',
    label: 'Cervix',
    section: 'labour-progress',
    alert: 'Lag time exceeded with no progress',
    kind: 'number',
    unit: 'cm',
  },
  { key: 'descent', label: 'Descent', section: 'labour-progress', alert: null, kind: 'number', unit: '/5' },

  { key: 'oxytocin', label: 'Oxytocin (U/L, drops/min)', section: 'medication', alert: null, kind: 'text' },
  { key: 'medicine', label: 'Medicine', section: 'medication', alert: null, kind: 'text' },
  { key: 'ivFluids', label: 'IV fluids', section: 'medication', alert: null, kind: 'text' },
];

/**
 * The lag time allowed at each centimetre of dilatation before the guide alerts.
 * Printed on the form itself: 5 cm ≥6 h, 6 cm ≥5 h, 7 cm ≥3 h, 8 cm ≥2.5 h,
 * 9 cm ≥2 h. This is what replaces the partograph's alert and action lines.
 */
export const LCG_CERVIX_LAG_HOURS: Record<number, number> = {
  5: 6,
  6: 5,
  7: 3,
  8: 2.5,
  9: 2,
};

/** The guide's active first stage begins here, not at the partograph's 4 cm. */
export const LCG_ACTIVE_PHASE_CM = 5;

/** A guide covers twelve hours; past that, labour continues on a fresh one. */
export const LCG_HOURS = 12;

/**
 * The partograph's alert and action lines, kept only to draw the familiar chart
 * for staff who want it. They are not used to raise an alert: the evidence
 * behind them is what WHO moved away from, and this system does not act on them.
 */
export const PARTOGRAPH_LEGACY = {
  activePhaseCm: 4,
  /** The alert line's assumed rate — Friedman, 1950s. */
  alertRateCmPerHour: 1,
  /** The action line sits four hours to the right of the alert line. */
  actionLineOffsetHours: 4,
  note:
    "Drawn for familiarity only. WHO replaced these lines in 2020 because labour is often slower than 1 cm an hour and still normal; this system alerts on the Labour Care Guide's thresholds instead.",
} as const;
