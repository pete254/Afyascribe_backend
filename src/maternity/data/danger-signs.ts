/**
 * The danger signs a provider is asked to look for, taken verbatim in substance
 * from Kenya's postnatal and obstetric guidelines rather than composed here.
 * Each one is a checkbox on the contact form; any of them present is a referral.
 */

export const DANGER_SIGN_SOURCE = {
  publisher:
    'Ministry of Health, Kenya — Healthy Mothers and Newborns: Guidelines for Postnatal Care (2016)',
  note: 'Maternal and newborn signs enquired after at every postnatal contact.',
} as const;

export interface DangerSign {
  code: string;
  label: string;
  /** What the sign points at, so the referral note can say why. */
  group: string;
}

/** Signs a pregnant woman is taught to report, and a provider asks after. */
export const ANC_DANGER_SIGNS: readonly DangerSign[] = [
  { code: 'bleeding', label: 'Vaginal bleeding', group: 'Haemorrhage' },
  { code: 'headache', label: 'Severe headache', group: 'Pre-eclampsia' },
  { code: 'visual', label: 'Visual disturbance', group: 'Pre-eclampsia' },
  { code: 'epigastric', label: 'Epigastric or hypochondrial pain', group: 'Pre-eclampsia' },
  { code: 'convulsions', label: 'Convulsions', group: 'Pre-eclampsia' },
  { code: 'swelling', label: 'Swelling of face or hands', group: 'Pre-eclampsia' },
  { code: 'fever', label: 'Fever', group: 'Infection' },
  { code: 'discharge', label: 'Offensive vaginal discharge', group: 'Infection' },
  { code: 'fluid-loss', label: 'Draining liquor', group: 'Membranes' },
  { code: 'reduced-movement', label: 'Reduced fetal movement', group: 'Fetal wellbeing' },
  { code: 'breathlessness', label: 'Shortness of breath', group: 'Anaemia or thromboembolism' },
];

/** Postnatal maternal signs — haemorrhage, pre-eclampsia, infection, thromboembolism. */
export const PNC_MATERNAL_DANGER_SIGNS: readonly DangerSign[] = [
  { code: 'pph-bleeding', label: 'Sudden or persistent heavy bleeding', group: 'Postpartum haemorrhage' },
  { code: 'faintness', label: 'Faintness or dizziness', group: 'Postpartum haemorrhage' },
  { code: 'palpitations', label: 'Palpitations or tachycardia', group: 'Postpartum haemorrhage' },
  { code: 'headache', label: 'Headache with visual disturbance, nausea or vomiting', group: 'Pre-eclampsia' },
  { code: 'epigastric', label: 'Epigastric or hypochondrial pain', group: 'Pre-eclampsia' },
  { code: 'convulsions', label: 'Convulsions', group: 'Pre-eclampsia' },
  { code: 'fever', label: 'Fever', group: 'Infection' },
  { code: 'shivering', label: 'Shivering', group: 'Infection' },
  { code: 'abdominal-pain', label: 'Abdominal pain', group: 'Infection' },
  { code: 'offensive-lochia', label: 'Offensive vaginal discharge', group: 'Infection' },
  { code: 'calf-pain', label: 'Unilateral calf pain, redness or swelling', group: 'Thromboembolism' },
  { code: 'chest-pain', label: 'Shortness of breath or chest pain', group: 'Thromboembolism' },
];

/** Newborn signs, enquired after at every postnatal contact. */
export const PNC_NEWBORN_DANGER_SIGNS: readonly DangerSign[] = [
  { code: 'fever', label: 'Fever (above 37.5 °C)', group: 'Infection' },
  { code: 'hypothermia', label: 'Low temperature (below 35.5 °C)', group: 'Infection' },
  { code: 'fast-breathing', label: 'Fast breathing (over 60 a minute)', group: 'Breathing' },
  { code: 'chest-indrawing', label: 'Severe chest in-drawing', group: 'Breathing' },
  { code: 'eye-discharge', label: 'Swollen eyes, pus from eye or ear', group: 'Infection' },
  { code: 'jaundice', label: 'Jaundice in the first 24 hours, or of palms and soles at any age', group: 'Jaundice' },
  { code: 'cyanosis', label: 'Blue around the mouth', group: 'Breathing' },
  { code: 'cord-redness', label: 'Redness of the cord stump at the base', group: 'Infection' },
  { code: 'not-feeding', label: 'Not breastfeeding', group: 'Feeding' },
  { code: 'convulsions', label: 'History of convulsions', group: 'Neurological' },
  { code: 'lethargy', label: 'No spontaneous movement, or lethargic', group: 'Neurological' },
];

const index = (signs: readonly DangerSign[]) => new Map(signs.map((s) => [s.code, s]));
const ANC_INDEX = index(ANC_DANGER_SIGNS);
const PNC_MATERNAL_INDEX = index(PNC_MATERNAL_DANGER_SIGNS);
const PNC_NEWBORN_INDEX = index(PNC_NEWBORN_DANGER_SIGNS);

export const ancDangerSignLabel = (code: string) => ANC_INDEX.get(code)?.label ?? code;
export const pncMaternalDangerSignLabel = (code: string) => PNC_MATERNAL_INDEX.get(code)?.label ?? code;
export const pncNewbornDangerSignLabel = (code: string) => PNC_NEWBORN_INDEX.get(code)?.label ?? code;
