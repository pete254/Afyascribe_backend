/**
 * Kenya's antenatal and postnatal contact schedules.
 *
 * Both are the Ministry of Health's own, not this system's invention, and the
 * provenance travels with every response so a reviewer can see what the numbers
 * are and where they came from.
 */

export const ANC_SOURCE = {
  publisher: 'Ministry of Health, Kenya — National Guidelines for Quality Obstetrics and Perinatal Care (2022)',
  model: 'WHO 2016 ANC model, eight contacts',
  note: 'Kenya raised the recommended contacts from four to eight in 2022.',
  url: 'https://www.who.int/publications/i/item/9789241549912',
} as const;

export interface AncContactRow {
  /** 1–8, the contact's place in the schedule. */
  contact: number;
  /** Completed weeks of gestation at which the contact falls. */
  weeks: number;
  trimester: 1 | 2 | 3;
}

/**
 * First contact in the first trimester (by 12 weeks), two in the second (20 and
 * 26), five in the third (30, 34, 36, 38, 40).
 */
export const ANC_CONTACTS: readonly AncContactRow[] = [
  { contact: 1, weeks: 12, trimester: 1 },
  { contact: 2, weeks: 20, trimester: 2 },
  { contact: 3, weeks: 26, trimester: 2 },
  { contact: 4, weeks: 30, trimester: 3 },
  { contact: 5, weeks: 34, trimester: 3 },
  { contact: 6, weeks: 36, trimester: 3 },
  { contact: 7, weeks: 38, trimester: 3 },
  { contact: 8, weeks: 40, trimester: 3 },
];

export const PNC_SOURCE = {
  publisher:
    'Ministry of Health, Kenya — Healthy Mothers and Newborns: Guidelines for Postnatal Care (2016)',
  quote: 'In Kenya, the visits are scheduled; within 48 hours after birth, 1-2 weeks, 4-6 weeks, and 4-6 months.',
  url: 'https://familyhealth.go.ke/wp-content/uploads/2018/02/Guidelines-for-postnatal-care-to-mothers-and-newborns-2016-18-12-2016B.pdf',
} as const;

export type PncWindow = 'within-48h' | 'week-1-2' | 'week-4-6' | 'month-4-6';

export interface PncContactRow {
  window: PncWindow;
  label: string;
  /** The window in days after birth, inclusive at both ends. */
  fromDays: number;
  toDays: number;
}

export const PNC_CONTACTS: readonly PncContactRow[] = [
  { window: 'within-48h', label: 'Within 48 hours', fromDays: 0, toDays: 2 },
  { window: 'week-1-2', label: '1–2 weeks', fromDays: 7, toDays: 14 },
  { window: 'week-4-6', label: '4–6 weeks', fromDays: 28, toDays: 42 },
  { window: 'month-4-6', label: '4–6 months', fromDays: 120, toDays: 183 },
];

export const PNC_WINDOW_LABEL: Record<PncWindow, string> = Object.fromEntries(
  PNC_CONTACTS.map((c) => [c.window, c.label]),
) as Record<PncWindow, string>;
