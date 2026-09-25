/** Where a pregnancy has got to. */
export type PregnancyStatus = 'active' | 'ended';

/**
 * How a pregnancy ended. Every one of these is a real outcome that has to be
 * recordable — a register that only knows about live births under-counts the
 * losses it exists to measure.
 */
export type PregnancyOutcome =
  | 'live-birth'
  | 'stillbirth'
  | 'miscarriage'
  | 'ectopic'
  | 'termination'
  | 'transferred-out'
  | 'lost-to-follow-up';

export const PREGNANCY_OUTCOMES: PregnancyOutcome[] = [
  'live-birth',
  'stillbirth',
  'miscarriage',
  'ectopic',
  'termination',
  'transferred-out',
  'lost-to-follow-up',
];

/** Outcomes after which postnatal care for the mother still applies. */
export const OUTCOMES_WITH_PNC: PregnancyOutcome[] = ['live-birth', 'stillbirth'];

export type DeliveryMode = 'svd' | 'assisted' | 'caesarean' | 'breech' | 'unknown';

export const DELIVERY_MODES: DeliveryMode[] = ['svd', 'assisted', 'caesarean', 'breech', 'unknown'];

export const DELIVERY_MODE_LABEL: Record<DeliveryMode, string> = {
  svd: 'Spontaneous vaginal delivery',
  assisted: 'Assisted vaginal delivery',
  caesarean: 'Caesarean section',
  breech: 'Breech delivery',
  unknown: 'Not known',
};

/** How the fetus lies, as felt on abdominal palpation. */
export type Presentation = 'cephalic' | 'breech' | 'transverse' | 'oblique' | 'not-assessed';

export const PRESENTATIONS: Presentation[] = ['cephalic', 'breech', 'transverse', 'oblique', 'not-assessed'];

/** A urine dipstick reading, as the stick itself reads. */
export type DipstickResult = 'nil' | 'trace' | '+' | '++' | '+++' | 'not-done';

export const DIPSTICK_RESULTS: DipstickResult[] = ['nil', 'trace', '+', '++', '+++', 'not-done'];

/** Lochia at a postnatal contact — amount and whether it smells. */
export type LochiaAmount = 'normal' | 'heavy' | 'scanty' | 'none';

export const LOCHIA_AMOUNTS: LochiaAmount[] = ['normal', 'heavy', 'scanty', 'none'];

/** How the baby is fed, which decides most of the feeding advice. */
export type FeedingMethod = 'exclusive-breast' | 'mixed' | 'replacement' | 'not-feeding';

export const FEEDING_METHODS: FeedingMethod[] = ['exclusive-breast', 'mixed', 'replacement', 'not-feeding'];

export const FEEDING_LABEL: Record<FeedingMethod, string> = {
  'exclusive-breast': 'Exclusive breastfeeding',
  mixed: 'Mixed feeding',
  replacement: 'Replacement feeding',
  'not-feeding': 'Not feeding',
};

/**
 * Whether a screen was done and what it found. "Not asked" is recorded as such
 * rather than as a negative — an unasked question is not a reassuring answer.
 */
export type ScreenResult = 'not-asked' | 'negative' | 'positive' | 'declined';

export const SCREEN_RESULTS: ScreenResult[] = ['not-asked', 'negative', 'positive', 'declined'];

// ── Labour and delivery ─────────────────────────────────────────────────────

/** How labour started. */
export type LabourOnset = 'spontaneous' | 'induced' | 'no-labour';
export const LABOUR_ONSETS: LabourOnset[] = ['spontaneous', 'induced', 'no-labour'];

/**
 * How a birth ended, as MOH 333 records it. Stillbirths are separated into
 * fresh and macerated because the distinction says roughly when the baby died
 * and so whether the death was plausibly preventable in this facility.
 */
export type BirthOutcome = 'live-birth' | 'fresh-stillbirth' | 'macerated-stillbirth';
export const BIRTH_OUTCOMES: BirthOutcome[] = ['live-birth', 'fresh-stillbirth', 'macerated-stillbirth'];

export const BIRTH_OUTCOME_LABEL: Record<BirthOutcome, string> = {
  'live-birth': 'Live birth',
  'fresh-stillbirth': 'Fresh stillbirth',
  'macerated-stillbirth': 'Macerated stillbirth',
};

/** Where mother or baby had got to when the record was closed. */
export type DischargeStatus = 'alive' | 'died' | 'referred' | 'absconded' | 'still-admitted';
export const DISCHARGE_STATUSES: DischargeStatus[] = ['alive', 'died', 'referred', 'absconded', 'still-admitted'];

export const DISCHARGE_STATUS_LABEL: Record<DischargeStatus, string> = {
  alive: 'Alive and well',
  died: 'Died',
  referred: 'Referred out',
  absconded: 'Absconded',
  'still-admitted': 'Still admitted',
};

/** The state of the perineum after a vaginal birth. */
export type PerineumState = 'intact' | 'tear-1' | 'tear-2' | 'tear-3' | 'tear-4' | 'episiotomy';
export const PERINEUM_STATES: PerineumState[] = ['intact', 'tear-1', 'tear-2', 'tear-3', 'tear-4', 'episiotomy'];

export const PERINEUM_LABEL: Record<PerineumState, string> = {
  intact: 'Intact',
  'tear-1': 'First-degree tear',
  'tear-2': 'Second-degree tear',
  'tear-3': 'Third-degree tear',
  'tear-4': 'Fourth-degree tear',
  episiotomy: 'Episiotomy',
};

/** Which chart the unit draws. The observations underneath are the same. */
export type LabourTool = 'labour-care-guide' | 'partograph';
