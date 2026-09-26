import { MENINGITIS, SARI_CLUSTER, Signal, evaluateWeek } from './thresholds';
import { IDSR_CONDITIONS } from './data/idsr';

const week = (pairs: Record<string, number>) =>
  Object.entries(pairs).map(([conditionCode, cases]) => ({ conditionCode, cases }));

const run = (pairs: Record<string, number>, history: Record<string, number>[] = []) =>
  evaluateWeek(IDSR_CONDITIONS, week(pairs), history.map(week));

const rules = (s: Signal[]) => s.map((x) => `${x.conditionCode}:${x.rule}:${x.level}`);

describe('one case of an epidemic-prone disease', () => {
  it('is an action signal on its own', () => {
    const [s] = run({ CHOLERA: 1 });
    expect(s.level).toBe('action');
    expect(s.rule).toBe('single-case');
    expect(s.published).toBe(true);
    expect(s.detail).toContain('single case');
  });

  it('applies to every immediately reportable condition', () => {
    for (const c of IDSR_CONDITIONS.filter((x) => x.immediate)) {
      if (c.code === 'SARI' || c.code === 'MENINGOCOCCAL') continue; // their own rules
      expect(run({ [c.code]: 1 })).toHaveLength(1);
    }
  });

  it('says nothing when there were no cases', () => {
    expect(run({ CHOLERA: 0 })).toEqual([]);
    expect(run({})).toEqual([]);
  });
});

describe('bacterial meningitis uses its published numbers', () => {
  it('alerts at two in a week and acts at five', () => {
    expect(MENINGITIS.alertCasesPerWeek).toBe(2);
    expect(MENINGITIS.actionCasesPerWeek).toBe(5);

    expect(run({ MENINGOCOCCAL: 1 })).toEqual([]);
    expect(rules(run({ MENINGOCOCCAL: 2 }))).toEqual(['MENINGOCOCCAL:meningitis-weekly:alert']);
    expect(rules(run({ MENINGOCOCCAL: 5 }))).toEqual(['MENINGOCOCCAL:meningitis-weekly:action']);
  });

  it('acts on a doubling over three weeks', () => {
    // 2 cases three weeks ago, 4 now: doubled, and at least the minimum of 2.
    const signals = run({ MENINGOCOCCAL: 4 }, [{ MENINGOCOCCAL: 3 }, { MENINGOCOCCAL: 3 }, { MENINGOCOCCAL: 2 }]);
    expect(rules(signals)).toContain('MENINGOCOCCAL:meningitis-doubling:action');
  });

  it('ignores a doubling below the minimum of two cases', () => {
    // 0 then 1 is a doubling in proportion but not in substance.
    const signals = run({ MENINGOCOCCAL: 1 }, [{ MENINGOCOCCAL: 1 }, { MENINGOCOCCAL: 1 }, { MENINGOCOCCAL: 1 }]);
    expect(rules(signals)).not.toContain('MENINGOCOCCAL:meningitis-doubling:action');
  });

  it('does not also give meningitis the single-case rule', () => {
    expect(rules(run({ MENINGOCOCCAL: 2 })).filter((r) => r.includes('single-case'))).toEqual([]);
  });
});

describe('SARI is counted as a cluster', () => {
  it('alerts at three, which is what MOH 505 asks for', () => {
    expect(SARI_CLUSTER).toBe(3);
    expect(run({ SARI: 2 })).toEqual([]);
    expect(rules(run({ SARI: 3 }))).toEqual(['SARI:sari-cluster:alert']);
  });
});

describe('an unexplained increase', () => {
  const history = [{ MALARIA: 4 }, { MALARIA: 5 }, { MALARIA: 3 }, { MALARIA: 6 }];

  it('flags a week higher than any in the recent record', () => {
    const [s] = run({ MALARIA: 9 }, history);
    expect(s.rule).toBe('unusual-increase');
    expect(s.level).toBe('alert');
  });

  it('is marked as a prompt, not a published threshold', () => {
    // The guidelines call an unexplained increase an alert but give no number.
    // Presenting a made-up cut-off as the Ministry's would be the lie to avoid.
    const [s] = run({ MALARIA: 9 }, history);
    expect(s.published).toBe(false);
    expect(s.threshold).toBeNull();
    expect(s.detail).toContain('not a published threshold');
  });

  it('says nothing when the week is within the recent range', () => {
    expect(run({ MALARIA: 6 }, history)).toEqual([]);
    expect(run({ MALARIA: 2 }, history)).toEqual([]);
  });

  it('says nothing without enough history to judge against', () => {
    expect(run({ MALARIA: 9 }, [{ MALARIA: 1 }])).toEqual([]);
  });

  it('does not fire on a single case of a common condition', () => {
    // One more malaria case than a quiet fortnight is not an outbreak.
    expect(run({ MALARIA: 1 }, [{ MALARIA: 0 }, { MALARIA: 0 }, { MALARIA: 0 }])).toEqual([]);
  });
});

describe('the order signals arrive in', () => {
  it('puts action before alert, then the larger count first', () => {
    const signals = run({ CHOLERA: 1, SARI: 4, MEASLES: 3 });
    expect(signals[0].level).toBe('action');
    expect(signals[signals.length - 1].level).toBe('alert');
    const actions = signals.filter((s) => s.level === 'action').map((s) => s.count);
    expect([...actions].sort((a, b) => b - a)).toEqual(actions);
  });

  it('ignores a condition it does not know', () => {
    expect(run({ NOT_A_CONDITION: 12 })).toEqual([]);
  });
});
