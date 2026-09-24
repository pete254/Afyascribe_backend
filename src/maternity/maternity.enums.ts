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
