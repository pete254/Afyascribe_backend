import { MeasureDefinition, periodFor, rate, result, toCsv, toMeasureReport } from './quality';
import { BUILT_IN_MEASURES, MEASURE_BY_ID } from './data/measures';

const def = (over: Partial<MeasureDefinition> = {}): MeasureDefinition => ({
  id: 'test-measure',
  title: 'Test measure',
  description: 'For the tests.',
  numerator: 'Those who had the thing',
  denominator: 'Those eligible for the thing',
  improvement: 'increase',
  scoring: 'proportion',
  category: 'Test',
  provenance: 'built-in',
  ...over,
});

describe('the rate', () => {
  it('is a percentage to one decimal place', () => {
    expect(rate(1, 2)).toBe(50);
    expect(rate(1, 3)).toBe(33.3);
    expect(rate(2, 3)).toBe(66.7);
    expect(rate(7, 7)).toBe(100);
  });

  it('is null when nobody was eligible', () => {
    // A proportion of an empty population is undefined. Reporting 0% would read
    // as a failure of care rather than an absence of patients.
    expect(rate(0, 0)).toBeNull();
    expect(rate(5, 0)).toBeNull();
    expect(rate(1, -1)).toBeNull();
  });

  it('is null for a number it cannot use', () => {
    expect(rate(NaN, 10)).toBeNull();
    expect(rate(1, Infinity)).toBeNull();
    expect(rate(-1, 10)).toBeNull();
  });

  it('is zero when nobody eligible had it', () => {
    // Which is a real result, unlike a rate over an empty denominator.
    expect(rate(0, 40)).toBe(0);
  });
});

describe('a result', () => {
  it('says why there is no rate', () => {
    const r = result(def(), '2026-01-01', '2026-01-31', 0, 0);
    expect(r.rate).toBeNull();
    expect(r.note).toContain('No one was eligible');
  });

  it('carries no denominator for a count', () => {
    const r = result(def({ scoring: 'count' }), '2026-01-01', '2026-01-31', 3, 100);
    expect(r).toMatchObject({ numerator: 3, denominator: null, rate: null, scoring: 'count' });
  });

  it('reports a real zero without a note', () => {
    const r = result(def(), '2026-01-01', '2026-01-31', 0, 12);
    expect(r.rate).toBe(0);
    expect(r.note).toBeUndefined();
  });
});

describe('the reporting period', () => {
  it('takes a year and a month', () => {
    expect(periodFor({ year: 2026, month: 2 })).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(periodFor({ year: 2024, month: 2 })).toEqual({ from: '2024-02-01', to: '2024-02-29' }); // leap
    expect(periodFor({ year: 2026, month: 12 })).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('takes a pair of dates', () => {
    expect(periodFor({ from: '2026-01-01', to: '2026-03-31' })).toEqual({
      from: '2026-01-01',
      to: '2026-03-31',
    });
  });

  it('refuses a period it cannot read', () => {
    expect(periodFor({})).toBeNull();
    expect(periodFor({ year: 2026, month: 13 })).toBeNull();
    expect(periodFor({ year: 2026, month: 0 })).toBeNull();
    expect(periodFor({ from: '2026-03-01', to: '2026-01-01' })).toBeNull();
  });
});

describe('the FHIR MeasureReport', () => {
  const facility = { id: 'fac-1', name: 'Test Health Centre' };
  const sys = 'https://afyascribe.health/Measure';

  it('carries the numerator, the denominator and the score', () => {
    const r = result(def(), '2026-01-01', '2026-01-31', 30, 40);
    const mr = toMeasureReport(r, def(), facility, sys);
    expect(mr.resourceType).toBe('MeasureReport');
    expect(mr.type).toBe('summary');
    expect(mr.measure).toBe(`${sys}/test-measure`);
    expect(mr.group[0].population).toHaveLength(2);
    expect(mr.group[0].measureScore.value).toBe(75);
    expect(mr.period).toEqual({ start: '2026-01-01', end: '2026-01-31' });
  });

  it('omits the score when there is no rate', () => {
    const r = result(def(), '2026-01-01', '2026-01-31', 0, 0);
    expect(toMeasureReport(r, def(), facility, sys).group[0].measureScore).toBeUndefined();
  });

  it('carries only a numerator for a count', () => {
    const d = def({ scoring: 'count' });
    const mr = toMeasureReport(result(d, '2026-01-01', '2026-01-31', 2, null), d, facility, sys);
    expect(mr.group[0].population).toHaveLength(1);
  });

  it('sends the definition with the number', () => {
    // So a receiver can see what was counted instead of assuming it matches
    // whatever they call by the same name.
    const mr = toMeasureReport(result(def(), '2026-01-01', '2026-01-31', 1, 2), def(), facility, sys);
    const urls = mr.extension.map((e: { url: string }) => e.url);
    expect(urls).toEqual([
      `${sys}/definition-numerator`,
      `${sys}/definition-denominator`,
      `${sys}/definition-provenance`,
    ]);
    expect(mr.extension[2].valueString).toBe('built-in');
  });
});

describe('the CSV export', () => {
  it('writes a header and one row per measure, with the definitions', () => {
    const defs = new Map([['test-measure', def()]]);
    const csv = toCsv([result(def(), '2026-01-01', '2026-01-31', 3, 4)], defs);
    const [head, row] = csv.split('\n');
    expect(head).toContain('Numerator definition');
    expect(row).toContain('75');
    expect(row).toContain('Those eligible for the thing');
  });

  it('quotes a field containing a comma', () => {
    const d = def({ numerator: 'Those who had it, or were offered it' });
    const csv = toCsv([result(d, '2026-01-01', '2026-01-31', 1, 2)], new Map([[d.id, d]]));
    expect(csv).toContain('"Those who had it, or were offered it"');
  });

  it('leaves the rate blank rather than writing a zero', () => {
    const csv = toCsv([result(def(), '2026-01-01', '2026-01-31', 0, 0)], new Map([[def().id, def()]]));
    expect(csv.split('\n')[1]).toMatch(/,,/);
  });
});

describe('the built-in definitions', () => {
  it('states both populations for every measure', () => {
    for (const m of BUILT_IN_MEASURES) {
      expect(m.numerator.length).toBeGreaterThan(10);
      expect(m.denominator.length).toBeGreaterThan(10);
      expect(m.title).toBeTruthy();
    }
  });

  it("marks them as this system's wording, not the Ministry's", () => {
    // Resembling a national indicator is not matching one, and a facility must
    // not report one of these as though it were MOH 711.
    for (const m of BUILT_IN_MEASURES) {
      expect(m.provenance).toBe('built-in');
      expect(m.nationalIndicator ?? null).toBeNull();
    }
  });

  it('has no duplicate identifiers', () => {
    expect(MEASURE_BY_ID.size).toBe(BUILT_IN_MEASURES.length);
  });
});
