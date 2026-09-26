/**
 * The clinical content behind the pregnancy rules, transcribed from Kenya's
 * Basic Obstetric Protocols (1st edition, 2026) rather than composed here.
 */

/**
 * Risk factors for pre-eclampsia, as the protocol lists them. A woman with any
 * of these is a candidate for low-dose aspirin.
 *
 * The codes are matched against the problem list by the words a clinician is
 * likely to have recorded; matching on text is imperfect and a rule that does
 * not fire is reported as nothing rather than as reassurance.
 */
export interface RiskFactor {
  key: string;
  label: string;
  /** Lower-case fragments that, found in a problem's text, indicate this factor. */
  matches: string[];
}

export const PRE_ECLAMPSIA_RISK_FACTORS: readonly RiskFactor[] = [
  { key: 'chronic-hypertension', label: 'Chronic hypertension', matches: ['hypertension', 'hypertensive'] },
  { key: 'chronic-kidney-disease', label: 'Chronic kidney disease', matches: ['kidney disease', 'renal failure', 'nephropathy', 'ckd'] },
  { key: 'autoimmune', label: 'Autoimmune disease (APLS, SLE)', matches: ['lupus', 'sle', 'antiphospholipid', 'apls', 'autoimmune'] },
  { key: 'thrombophilia', label: 'Inherited thrombophilia', matches: ['thrombophilia', 'factor v leiden'] },
  { key: 'diabetes', label: 'Diabetes mellitus', matches: ['diabetes', 'diabetic'] },
  { key: 'family-history', label: 'Family history of pre-eclampsia', matches: ['pre-eclampsia', 'preeclampsia'] },
  { key: 'previous-pre-eclampsia', label: 'Previous pre-eclampsia', matches: ['pre-eclampsia', 'preeclampsia', 'eclampsia'] },
  { key: 'vitamin-d', label: 'Vitamin D deficiency', matches: ['vitamin d deficiency'] },
  { key: 'obesity', label: 'Obesity', matches: ['obesity', 'obese'] },
];

/** The protocol's ages, which come from demographics rather than the problem list. */
export const PRE_ECLAMPSIA_AGE_HIGH = 40;
export const PRE_ECLAMPSIA_AGE_LOW = 18;

/**
 * Drugs the protocol says to avoid in pregnancy, by active component.
 *
 * "Atenolol, ACE inhibitors, ARBs, and diuretics should be avoided during
 * pregnancy." The component names below are what those classes are; matching
 * is by active component and so will miss a brand whose component is not
 * recorded, which the advice says plainly rather than implying completeness.
 */
export const AVOID_IN_PREGNANCY: { component: string; klass: string }[] = [
  { component: 'atenolol', klass: 'beta-blocker (atenolol)' },
  { component: 'enalapril', klass: 'ACE inhibitor' },
  { component: 'lisinopril', klass: 'ACE inhibitor' },
  { component: 'ramipril', klass: 'ACE inhibitor' },
  { component: 'captopril', klass: 'ACE inhibitor' },
  { component: 'perindopril', klass: 'ACE inhibitor' },
  { component: 'losartan', klass: 'angiotensin receptor blocker' },
  { component: 'valsartan', klass: 'angiotensin receptor blocker' },
  { component: 'telmisartan', klass: 'angiotensin receptor blocker' },
  { component: 'irbesartan', klass: 'angiotensin receptor blocker' },
  { component: 'candesartan', klass: 'angiotensin receptor blocker' },
  { component: 'hydrochlorothiazide', klass: 'diuretic' },
  { component: 'furosemide', klass: 'diuretic' },
  { component: 'bendroflumethiazide', klass: 'diuretic' },
  { component: 'spironolactone', klass: 'diuretic' },
  { component: 'indapamide', klass: 'diuretic' },
];

/** First-line antihypertensives in pregnancy, with the protocol's doses. */
export const PREGNANCY_ANTIHYPERTENSIVES = [
  'Labetalol 100 mg BD (maximum 2400 mg daily)',
  'Nifedipine 20 mg BD (maximum 80 mg daily)',
  'Methyldopa 500 mg TDS (maximum 3000 mg daily)',
];

/** Aspirin prophylaxis, as the protocol sets it out. */
export const ASPIRIN_PROPHYLAXIS = {
  dose: '150 mg once a day',
  startWeeks: 11,
  idealByWeeks: 16,
  stopWeeks: 36,
  note: 'Started before 16 weeks it reduces preterm pre-eclampsia by over 62%.',
} as const;

export const CALCIUM_PROPHYLAXIS = { dose: '1 g once a day', fromWeeks: 12 } as const;

/** Iron and folic acid in pregnancy. */
export const IFAS = {
  dose: '30–60 mg elemental iron with 400 µg folic acid, daily',
  postpartum: '60 mg iron with 400 µg folic acid, to three months postpartum',
} as const;

/** Deworming, given once in the second trimester. */
export const DEWORMING = {
  fromWeeks: 14,
  dose: 'Mebendazole 500 mg once, or albendazole 400 mg once',
} as const;

/** Anaemia screening, once in each trimester. */
export const ANAEMIA_SCREENING = 'Screen for anaemia at least once in every trimester.';
