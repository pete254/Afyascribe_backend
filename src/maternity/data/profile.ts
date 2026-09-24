/**
 * The antenatal profile — the panel taken at the first contact.
 *
 * Kenya's Mother and Child Health booklet lists these for the first trimester:
 * haemoglobin, blood group and rhesus, urinalysis, random blood sugar, syphilis,
 * hepatitis B, HIV counselling and testing, and TB screening. They are recorded
 * here as the panel the register expects, one result each per pregnancy.
 */

export const ANC_PROFILE_SOURCE = {
  publisher: 'Ministry of Health, Kenya — Mother and Child Health (MCH) booklet',
  note: 'First-trimester antenatal profile.',
} as const;

export type ProfileTest =
  | 'hb'
  | 'bloodGroup'
  | 'urinalysis'
  | 'rbs'
  | 'syphilis'
  | 'hepB'
  | 'hiv'
  | 'tb';

export interface ProfileTestMeta {
  test: ProfileTest;
  label: string;
  /** How the result is captured, so the form knows what to draw. */
  kind: 'numeric' | 'reactive' | 'blood-group' | 'text';
  unit?: string;
}

export const ANC_PROFILE: readonly ProfileTestMeta[] = [
  { test: 'hb', label: 'Haemoglobin', kind: 'numeric', unit: 'g/dL' },
  { test: 'bloodGroup', label: 'Blood group & rhesus', kind: 'blood-group' },
  { test: 'urinalysis', label: 'Urinalysis', kind: 'text' },
  { test: 'rbs', label: 'Random blood sugar', kind: 'numeric', unit: 'mmol/L' },
  { test: 'syphilis', label: 'Syphilis (VDRL/RPR)', kind: 'reactive' },
  { test: 'hepB', label: 'Hepatitis B', kind: 'reactive' },
  { test: 'hiv', label: 'HIV', kind: 'reactive' },
  { test: 'tb', label: 'TB screening', kind: 'reactive' },
];

/** ABO and rhesus, the only values the register accepts. */
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

/** A reactive result reads the same across syphilis, hepatitis B, HIV and TB. */
export const REACTIVE_RESULTS = ['negative', 'positive', 'not-done', 'declined'] as const;
export type ReactiveResult = (typeof REACTIVE_RESULTS)[number];
