import { IDSR_CONDITIONS, IdsrCondition } from './data/idsr';

/**
 * Spotting a notifiable condition in what a clinician wrote.
 *
 * This suggests; it never notifies. A detector that filed a cholera
 * notification on its own would be wrong more often than a clinician is, and
 * the cost of being wrong is a public health response to a case that does not
 * exist. Every match is a prompt someone confirms or dismisses.
 *
 * Matching is on words, not codes. Kenya's diagnoses are coded to ICD-11 and
 * the IDSR list is not an ICD-11 subset; without a published crosswalk, a
 * code-based mapping would be this system's invention. Text matching is
 * cruder and honest about being so.
 */

/**
 * Phrases that turn a mention into a non-case. Without these the detector
 * fires on "no measles" and on "measles vaccine given", and a prompt that
 * cries wolf is a prompt clinicians learn to dismiss unread.
 *
 * Deliberately short. "Rule out cholera", "r/o dengue" and "query malaria" are
 * *not* here: IDSR notifies on suspicion, and those phrases are how a Kenyan
 * clinician writes down a suspicion. Suppressing them would silence the detector
 * at precisely the moment it is meant to speak. The asymmetry decides it — a
 * missed cholera case is an outbreak, a false prompt is five seconds.
 */
const NEGATIONS = [
  'no ',
  'not ',
  'never ',
  'denies ',
  'denied ',
  'without ',
  'negative for ',
  'ruled out ',
  'excluded ',
  'unlikely ',
  'vaccinated against ',
  'immunised against ',
  'immunized against ',
  'history of ',
  'past ',
  'previous ',
  'screened for ',
  'screening for ',
  'prophylaxis ',
];

/** Words after which a mention is about a product, not a patient. */
const TRAILING_NON_CASE = ['vaccine', 'vaccination', 'immunisation', 'immunization', 'jab'];

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'/\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export interface Detection {
  condition: IdsrCondition;
  /** The term that matched. */
  term: string;
  /** The words around it, so a clinician can see what was read. */
  context: string;
}

/** Does `term` appear in `text` as whole words, not inside another word? */
function findTerm(text: string, term: string): number[] {
  const hits: number[] = [];
  const needle = normalise(term);
  if (!needle) return hits;
  let from = 0;
  for (;;) {
    const at = text.indexOf(needle, from);
    if (at === -1) break;
    const before = at === 0 ? ' ' : text[at - 1];
    const after = at + needle.length >= text.length ? ' ' : text[at + needle.length];
    // Whole-word only: "polio" must not match inside "poliomyelitis" when
    // poliomyelitis is its own term, and "sam" must not match "same".
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) hits.push(at);
    from = at + needle.length;
  }
  return hits;
}

/** Is this mention negated, or about a vaccine rather than a case? */
function isNonCase(text: string, at: number, term: string): boolean {
  const windowStart = Math.max(0, at - 28);
  const before = text.slice(windowStart, at);
  if (NEGATIONS.some((n) => before.endsWith(n))) return true;

  const after = text.slice(at + term.length, at + term.length + 20).trim();
  return TRAILING_NON_CASE.some((w) => after.startsWith(w));
}

/**
 * Every notifiable condition suggested by a piece of clinical text.
 *
 * Conditions derived from the record rather than written down — maternal and
 * neonatal death — are never text-matched: they are counted from the maternity
 * register, and matching on the words would double-count them.
 */
export function detectNotifiable(text: string | null | undefined): Detection[] {
  const hay = normalise(text ?? '');
  if (!hay) return [];

  const found = new Map<string, Detection>();
  for (const condition of IDSR_CONDITIONS) {
    if (condition.derivedFrom) continue;
    for (const term of condition.terms) {
      for (const at of findTerm(hay, term)) {
        if (isNonCase(hay, at, normalise(term))) continue;
        // One detection per condition: the longest term wins, since it is the
        // more specific reading.
        const existing = found.get(condition.code);
        if (existing && existing.term.length >= term.length) continue;
        found.set(condition.code, {
          condition,
          term,
          context: hay.slice(Math.max(0, at - 30), at + term.length + 30).trim(),
        });
      }
    }
  }
  return [...found.values()];
}

/** The most urgent thing found, for deciding whether to interrupt someone. */
export function highestUrgency(detections: Detection[]): 'immediate' | 'weekly' | null {
  if (detections.some((d) => d.condition.immediate)) return 'immediate';
  if (detections.length) return 'weekly';
  return null;
}
