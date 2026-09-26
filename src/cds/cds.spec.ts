import { CdsContext, DATA_SOURCES_USED, evaluate } from './cds';

const base = (over: Partial<CdsContext> = {}): CdsContext => ({
  ageYears: 28,
  sex: 'female',
  problems: [],
  allergies: [],
  vitals: null,
  labs: [],
  pregnancy: null,
  ...over,
});

const pregnancy = (over: Partial<NonNullable<CdsContext['pregnancy']>> = {}) => ({
  active: true,
  gestationWeeks: 20,
  aspirinGiven: false,
  calciumGiven: false,
  ifasGiven: true,
  dewormingGiven: true,
  para: 1,
  profileHb: null,
  ...over,
});

const ids = (ctx: CdsContext) => evaluate(ctx).map((a) => a.ruleId);

describe('an empty record produces no advice', () => {
  it('says nothing when it has been told nothing', () => {
    expect(evaluate(base())).toEqual([]);
  });

  it('never treats an absent measurement as a normal one', () => {
    const ctx = base({ vitals: { systolic: null, diastolic: null, temperature: null }, pregnancy: pregnancy() });
    expect(ids(ctx)).not.toContain('pregnancy-bp');
    expect(ids(ctx)).not.toContain('fever');
  });
});

describe('drug allergy — uses the allergy list and the HPT registry', () => {
  it('matches on the HPT active component', () => {
    const ctx = base({
      allergies: [{ display: 'Penicillin', componentCode: 'AC123', severity: 'severe' }],
      proposedDrug: { name: 'Amoxicillin 500mg capsule', componentCode: 'AC123' },
    });
    const [a] = evaluate(ctx);
    expect(a.ruleId).toBe('drug-allergy');
    expect(a.severity).toBe('danger');
    expect(a.uses).toEqual(expect.arrayContaining(['allergies', 'hpt']));
  });

  it('falls back to the name when the allergy was never coded', () => {
    const ctx = base({
      allergies: [{ display: 'penicillin', componentCode: null }],
      proposedDrug: { name: 'Penicillin V 250mg', componentCode: 'AC999' },
    });
    expect(ids(ctx)).toContain('drug-allergy');
  });

  it('does not fire on an unrelated drug', () => {
    const ctx = base({
      allergies: [{ display: 'Penicillin', componentCode: 'AC123' }],
      proposedDrug: { name: 'Paracetamol 500mg', componentCode: 'AC777' },
    });
    expect(ids(ctx)).toEqual([]);
  });

  it('says nothing when no drug is being proposed', () => {
    expect(ids(base({ allergies: [{ display: 'Penicillin', componentCode: 'AC1' }] }))).toEqual([]);
  });
});

describe('drugs to avoid in pregnancy — uses problems, HPT and demographics', () => {
  it('warns on an ACE inhibitor', () => {
    const ctx = base({
      pregnancy: pregnancy(),
      proposedDrug: { name: 'Enalapril 5mg tablet', componentName: 'enalapril maleate' },
    });
    const hit = evaluate(ctx).find((a) => a.ruleId === 'avoid-in-pregnancy')!;
    expect(hit.severity).toBe('danger');
    expect(hit.title).toContain('ACE inhibitor');
    expect(hit.action).toContain('Labetalol');
  });

  it('warns on an ARB, a diuretic and atenolol', () => {
    for (const name of ['Losartan 50mg', 'Furosemide 40mg', 'Atenolol 50mg']) {
      const ctx = base({ pregnancy: pregnancy(), proposedDrug: { name } });
      expect(ids(ctx)).toContain('avoid-in-pregnancy');
    }
  });

  it('does not fire when she is not pregnant', () => {
    const ctx = base({ proposedDrug: { name: 'Enalapril 5mg tablet' } });
    expect(ids(ctx)).not.toContain('avoid-in-pregnancy');
  });

  it('leaves a safe antihypertensive alone', () => {
    const ctx = base({ pregnancy: pregnancy(), proposedDrug: { name: 'Methyldopa 250mg' } });
    expect(ids(ctx)).not.toContain('avoid-in-pregnancy');
  });
});

describe('pre-eclampsia prophylaxis — reads the problem list', () => {
  it('fires on a risk factor in the problem list', () => {
    const ctx = base({
      pregnancy: pregnancy({ gestationWeeks: 12 }),
      problems: [{ code: 'BA00', display: 'Essential hypertension', status: 'active' }],
    });
    const hit = evaluate(ctx).find((a) => a.ruleId === 'pre-eclampsia-aspirin')!;
    expect(hit.uses).toContain('problems');
    expect(hit.because[0]).toContain('Chronic hypertension');
    expect(hit.source.publisher).toContain('Basic Obstetric Protocols');
  });

  it('fires on age alone', () => {
    const ctx = base({ ageYears: 42, pregnancy: pregnancy({ gestationWeeks: 12 }) });
    expect(ids(ctx)).toContain('pre-eclampsia-aspirin');
    const ctxYoung = base({ ageYears: 16, pregnancy: pregnancy({ gestationWeeks: 12 }) });
    expect(ids(ctxYoung)).toContain('pre-eclampsia-aspirin');
  });

  it('fires on nulliparity', () => {
    const ctx = base({ pregnancy: pregnancy({ para: 0, gestationWeeks: 12 }) });
    expect(ids(ctx)).toContain('pre-eclampsia-aspirin');
  });

  it('ignores a resolved problem', () => {
    const ctx = base({
      pregnancy: pregnancy({ gestationWeeks: 12 }),
      problems: [{ code: null, display: 'Diabetes mellitus', status: 'resolved' }],
    });
    expect(ids(ctx)).not.toContain('pre-eclampsia-aspirin');
  });

  it('does not repeat advice that has already been acted on', () => {
    const ctx = base({
      ageYears: 42,
      pregnancy: pregnancy({ gestationWeeks: 12, aspirinGiven: true, calciumGiven: true }),
    });
    expect(ids(ctx)).not.toContain('pre-eclampsia-aspirin');
    expect(ids(ctx)).not.toContain('pre-eclampsia-calcium');
  });

  it('stops advising aspirin once the window has closed', () => {
    const ctx = base({ ageYears: 42, pregnancy: pregnancy({ gestationWeeks: 38 }) });
    expect(ids(ctx)).not.toContain('pre-eclampsia-aspirin');
  });

  it('still advises it late, saying the ideal window has passed', () => {
    const ctx = base({ ageYears: 42, pregnancy: pregnancy({ gestationWeeks: 24 }) });
    const hit = evaluate(ctx).find((a) => a.ruleId === 'pre-eclampsia-aspirin')!;
    expect(hit.detail).toContain('window has passed');
  });

  it('holds calcium back before twelve weeks', () => {
    const ctx = base({ ageYears: 42, pregnancy: pregnancy({ gestationWeeks: 8 }) });
    expect(ids(ctx)).not.toContain('pre-eclampsia-calcium');
  });
});

describe('vital signs and lab results', () => {
  it('flags raised and severely raised blood pressure in pregnancy', () => {
    const raised = base({ pregnancy: pregnancy(), vitals: { systolic: 145, diastolic: 92 } });
    expect(evaluate(raised).find((a) => a.ruleId === 'pregnancy-bp')!.severity).toBe('warning');

    const severe = base({ pregnancy: pregnancy(), vitals: { systolic: 165, diastolic: 115 } });
    expect(evaluate(severe).find((a) => a.ruleId === 'pregnancy-bp')!.severity).toBe('danger');
  });

  it('grades anaemia from a LOINC-coded result', () => {
    const ctx = base({ labs: [{ loinc: '718-7', name: 'Haemoglobin', value: 6.4, unit: 'g/dL' }] });
    const hit = evaluate(ctx).find((a) => a.ruleId === 'anaemia')!;
    expect(hit.title).toBe('Severe anaemia');
    expect(hit.severity).toBe('danger');
    expect(hit.uses).toContain('labs');
  });

  it('asks for a haemoglobin in pregnancy when there is none', () => {
    const ctx = base({ pregnancy: pregnancy() });
    expect(ids(ctx)).toContain('anaemia-screening');
  });

  it('does not chase a haemoglobin for a patient who is not pregnant', () => {
    expect(ids(base())).not.toContain('anaemia-screening');
  });

  it('flags a fever', () => {
    expect(ids(base({ vitals: { temperature: 38.5 } }))).toContain('fever');
    expect(ids(base({ vitals: { temperature: 37.2 } }))).not.toContain('fever');
  });
});

describe('the shape of the advice', () => {
  it('puts the most serious first', () => {
    const ctx = base({
      ageYears: 42,
      pregnancy: pregnancy({ gestationWeeks: 12 }),
      vitals: { systolic: 170, diastolic: 115, temperature: 38.4 },
      allergies: [{ display: 'Penicillin', componentCode: 'AC1' }],
      proposedDrug: { name: 'Penicillin V', componentCode: 'AC1' },
    });
    const severities = evaluate(ctx).map((a) => a.severity);
    expect(severities[0]).toBe('danger');
    expect([...severities].sort((a, b) => severities.indexOf(a) - severities.indexOf(b))).toEqual(severities);
  });

  it('carries a citation on every piece of advice', () => {
    const ctx = base({
      ageYears: 42,
      pregnancy: pregnancy({ gestationWeeks: 12 }),
      vitals: { systolic: 150, diastolic: 95 },
      labs: [{ name: 'Hb', value: 8 }],
    });
    const all = evaluate(ctx);
    expect(all.length).toBeGreaterThan(2);
    for (const a of all) {
      expect(a.source.publisher).toBeTruthy();
      expect(a.because.length).toBeGreaterThan(0);
      expect(a.uses.length).toBeGreaterThan(0);
    }
  });

  it('draws on all six parts of the record the assessment asks about', () => {
    expect(DATA_SOURCES_USED).toEqual(
      expect.arrayContaining(['problems', 'allergies', 'hpt', 'demographics', 'labs', 'vitals']),
    );
    const ctx = base({
      ageYears: 42,
      problems: [{ code: null, display: 'Diabetes mellitus', status: 'active' }],
      pregnancy: pregnancy({ gestationWeeks: 12 }),
      vitals: { systolic: 150, diastolic: 95 },
      labs: [{ loinc: '718-7', name: 'Haemoglobin', value: 9 }],
      allergies: [{ display: 'Penicillin', componentCode: 'AC1' }],
      proposedDrug: { name: 'Penicillin V', componentCode: 'AC1' },
    });
    const used = new Set(evaluate(ctx).flatMap((a) => a.uses));
    expect([...used].sort()).toEqual(['allergies', 'demographics', 'hpt', 'labs', 'problems', 'vitals']);
  });
});
