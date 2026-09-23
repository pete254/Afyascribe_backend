/**
 * Clinical services a provider orders for a patient and another department
 * fulfils: physiotherapy, occupational therapy, nutrition, social work,
 * counselling.
 *
 * These share one shape — ordered at a consultation, worked from a departmental
 * list, recorded with findings, sometimes billed — so they share one module
 * rather than five near-identical ones. Adding a discipline is a line here.
 */
export const SERVICE_DISCIPLINES = [
  'physiotherapy',
  'occupational_therapy',
  'nutrition',
  'social_work',
  'counselling',
  'speech_therapy',
  'psychology',
  'other',
] as const;
export type ServiceDiscipline = (typeof SERVICE_DISCIPLINES)[number];

export const DISCIPLINE_LABELS: Record<ServiceDiscipline, string> = {
  physiotherapy: 'Physiotherapy',
  occupational_therapy: 'Occupational therapy',
  nutrition: 'Nutrition & dietetics',
  social_work: 'Social work',
  counselling: 'Counselling',
  speech_therapy: 'Speech & language therapy',
  psychology: 'Psychology',
  other: 'Other service',
};

/** Mirrors the lab and imaging worklists so every department reads the same. */
export const SERVICE_ORDER_STATUSES = ['requested', 'scheduled', 'in_progress', 'completed', 'cancelled'] as const;
export type ServiceOrderStatus = (typeof SERVICE_ORDER_STATUSES)[number];

export const SERVICE_ORDER_PRIORITIES = ['routine', 'urgent'] as const;
export type ServiceOrderPriority = (typeof SERVICE_ORDER_PRIORITIES)[number];

/** Which staff role works each discipline's list, for the capability check. */
export const DISCIPLINE_ROLES: Record<ServiceDiscipline, string[]> = {
  physiotherapy: ['physiotherapist'],
  occupational_therapy: ['occupational_therapist'],
  nutrition: ['nutritionist'],
  social_work: ['social_worker'],
  counselling: ['counsellor', 'psychologist'],
  speech_therapy: ['speech_therapist'],
  psychology: ['psychologist', 'counsellor'],
  other: [],
};
