import { detectNotifiable, highestUrgency } from './detect';
import { IDSR_CONDITIONS, immediateConditions, weeklyConditions, ihrConditions } from './data/idsr';

const codes = (t: string) => detectNotifiable(t).map((d) => d.condition.code).sort();

describe('spotting a notifiable condition', () => {
  it('finds one named plainly', () => {
    expect(codes('Suspected cholera')).toEqual(['CHOLERA']);
    expect(codes('Measles')).toEqual(['MEASLES']);
    expect(codes('Rift Valley Fever')).toEqual(['RVF']);
  });

  it('finds more than one in the same note', () => {
    expect(codes('Fever, malaria; also typhoid fever')).toEqual(['MALARIA', 'TYPHOID']);
  });

  it('finds nothing in an ordinary consultation', () => {
    expect(codes('Hypertension, well controlled. Continue amlodipine.')).toEqual([]);
    expect(detectNotifiable('')).toEqual([]);
    expect(detectNotifiable(null)).toEqual([]);
  });
});

describe('not crying wolf', () => {
  it('ignores a condition that was ruled out', () => {
    expect(codes('No measles')).toEqual([]);
    expect(codes('Ruled out cholera')).toEqual([]);
    expect(codes('Negative for malaria')).toEqual([]);
    expect(codes('Denies rabies exposure')).toEqual([]);
    expect(codes('Unlikely cholera')).toEqual([]);
    // A cue *after* the term is not suppressed: the detector only looks
    // backwards, and erring towards firing is the safe direction here.
    expect(codes('Cholera unlikely')).toEqual(['CHOLERA']);
  });

  it('still fires on a suspicion, however it is written', () => {
    // IDSR notifies on suspected cases. "Rule out cholera" and "query malaria"
    // are how a clinician writes a suspicion down, and are exactly the moments
    // the detector exists for.
    expect(codes('Rule out cholera')).toEqual(['CHOLERA']);
    expect(codes('r/o dengue')).toEqual(['DENGUE']);
    expect(codes('Query malaria')).toEqual(['MALARIA']);
    expect(codes('? viral haemorrhagic fever')).toEqual(['VHF']);
  });

  it('ignores a vaccine rather than a case', () => {
    // "Measles vaccine given" is not a case of measles.
    expect(codes('Measles vaccine given today')).toEqual([]);
    expect(codes('Yellow fever vaccination')).toEqual([]);
  });

  it('ignores a past episode', () => {
    expect(codes('History of MDR TB')).toEqual([]);
    expect(codes('Previous malaria')).toEqual([]);
  });

  it('does not match inside a longer word', () => {
    // "sam" is a term for acute malnutrition; it must not fire on "same".
    expect(codes('Patient reports the same symptoms')).toEqual([]);
    expect(codes('Samuel attended')).toEqual([]);
  });

  it('still fires when a negation belongs to something else', () => {
    // The negation window is short on purpose: "no fever, cholera suspected"
    // must not be silenced by the "no" three words earlier.
    expect(codes('No fever but cholera suspected')).toContain('CHOLERA');
  });
});

describe('what the detection carries', () => {
  it('shows the words it read, so it can be argued with', () => {
    const [d] = detectNotifiable('Child with acute watery diarrhoea since morning');
    expect(d.condition.code).toBe('CHOLERA');
    expect(d.context).toContain('acute watery diarrhoea');
  });

  it('prefers the more specific term', () => {
    const [d] = detectNotifiable('Acute flaccid paralysis in a child');
    expect(d.condition.code).toBe('AFP');
    expect(d.term.length).toBeGreaterThan('polio'.length);
  });

  it('carries the case definition, so the prompt can explain itself', () => {
    const [d] = detectNotifiable('Suspected cholera');
    expect(d.condition.suspectedCase).toContain('watery diarrhoea');
  });
});

describe('urgency', () => {
  it('calls an immediately notifiable condition immediate', () => {
    expect(highestUrgency(detectNotifiable('Suspected cholera'))).toBe('immediate');
  });

  it('calls a weekly-only condition weekly', () => {
    expect(highestUrgency(detectNotifiable('Malaria'))).toBe('weekly');
  });

  it('is null when nothing was found', () => {
    expect(highestUrgency([])).toBeNull();
  });
});

describe("the Ministry's lists, as transcribed", () => {
  it('carries both lists and their overlap', () => {
    expect(immediateConditions()).toHaveLength(15);
    expect(weeklyConditions()).toHaveLength(23);
    expect(IDSR_CONDITIONS).toHaveLength(24); // the union: 14 on both lists, 1 immediate-only, 9 weekly-only
  });

  it('gives every condition a case definition and something to match on', () => {
    for (const c of IDSR_CONDITIONS) {
      expect(c.suspectedCase.length).toBeGreaterThan(20);
      expect(c.terms.length).toBeGreaterThan(0);
      expect(c.immediate || c.weekly).toBe(true);
    }
  });

  it('marks only the conditions the IHR actually names', () => {
    // Kenya's list is wider than Annex 2; over-marking would overstate what
    // the Regulations require.
    const marked = ihrConditions().map((c) => c.code).sort();
    expect(marked).toEqual(['AFP', 'CHOLERA', 'DENGUE', 'FLU_NEW_SUBTYPE', 'MENINGOCOCCAL', 'PLAGUE', 'RVF', 'VHF', 'YELLOW_FEVER']);
    expect(ihrConditions().filter((c) => c.ihr === 'notify').map((c) => c.code).sort()).toEqual([
      'AFP',
      'FLU_NEW_SUBTYPE',
    ]);
  });

  it('never text-matches a condition counted from the register', () => {
    // Maternal and neonatal deaths come from the maternity module; matching the
    // words as well would count them twice.
    expect(codes('Maternal death recorded')).toEqual([]);
    expect(codes('Neonatal death')).toEqual([]);
  });

  it('has no duplicate codes', () => {
    const set = new Set(IDSR_CONDITIONS.map((c) => c.code));
    expect(set.size).toBe(IDSR_CONDITIONS.length);
  });
});
