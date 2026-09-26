import { PERIOD_PRESETS, quarterOf, resolvePeriod } from './periods';

// A Thursday in the middle of Q3.
const TODAY = '2026-08-13';

describe('months', () => {
  it('runs from the first to the last day', () => {
    expect(resolvePeriod('this-month', TODAY)).toMatchObject({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('gets the length of a short month right', () => {
    expect(resolvePeriod('month:2026-02', TODAY)).toMatchObject({ from: '2026-02-01', to: '2026-02-28' });
    expect(resolvePeriod('month:2024-02', TODAY)).toMatchObject({ from: '2024-02-01', to: '2024-02-29' });
    expect(resolvePeriod('month:2026-04', TODAY)).toMatchObject({ from: '2026-04-01', to: '2026-04-30' });
  });

  it('steps back into the previous year from January', () => {
    expect(resolvePeriod('last-month', '2026-01-15')).toMatchObject({
      from: '2025-12-01',
      to: '2025-12-31',
    });
  });
});

describe('quarters', () => {
  it('puts each month in the right quarter', () => {
    expect([0, 1, 2].map(quarterOf)).toEqual([1, 1, 1]);
    expect([3, 4, 5].map(quarterOf)).toEqual([2, 2, 2]);
    expect([6, 7, 8].map(quarterOf)).toEqual([3, 3, 3]);
    expect([9, 10, 11].map(quarterOf)).toEqual([4, 4, 4]);
  });

  it('runs from the first day to the last', () => {
    expect(resolvePeriod('quarter:2026-Q1', TODAY)).toMatchObject({ from: '2026-01-01', to: '2026-03-31' });
    expect(resolvePeriod('quarter:2026-Q2', TODAY)).toMatchObject({ from: '2026-04-01', to: '2026-06-30' });
    expect(resolvePeriod('quarter:2026-Q3', TODAY)).toMatchObject({ from: '2026-07-01', to: '2026-09-30' });
    expect(resolvePeriod('quarter:2026-Q4', TODAY)).toMatchObject({ from: '2026-10-01', to: '2026-12-31' });
  });

  it('takes this quarter from the date', () => {
    expect(resolvePeriod('this-quarter', TODAY)).toMatchObject({ from: '2026-07-01', to: '2026-09-30' });
  });

  it("makes Q1's predecessor Q4 of the year before", () => {
    expect(resolvePeriod('last-quarter', '2026-02-10')).toMatchObject({
      from: '2025-10-01',
      to: '2025-12-31',
      label: 'Last quarter — Q4 2025',
    });
  });
});

describe('years', () => {
  it('runs the calendar year', () => {
    expect(resolvePeriod('this-year', TODAY)).toMatchObject({ from: '2026-01-01', to: '2026-12-31' });
    expect(resolvePeriod('last-year', TODAY)).toMatchObject({ from: '2025-01-01', to: '2025-12-31' });
    expect(resolvePeriod('year:2019', TODAY)).toMatchObject({ from: '2019-01-01', to: '2019-12-31' });
  });
});

describe('the short periods', () => {
  it('runs a week Monday to Sunday', () => {
    // 13 August 2026 is a Thursday.
    expect(resolvePeriod('this-week', TODAY)).toMatchObject({ from: '2026-08-10', to: '2026-08-16' });
  });

  it('keeps Sunday in the week that began six days earlier', () => {
    expect(resolvePeriod('this-week', '2026-08-16')).toMatchObject({ from: '2026-08-10', to: '2026-08-16' });
  });

  it('makes today a single day', () => {
    expect(resolvePeriod('today', TODAY)).toMatchObject({ from: TODAY, to: TODAY });
  });
});

describe('refusing what it cannot resolve', () => {
  it('returns null rather than guessing', () => {
    // A report run over a period nobody asked for is worse than one that
    // refuses to run.
    expect(resolvePeriod('last-fortnight', TODAY)).toBeNull();
    expect(resolvePeriod('month:2026-13', TODAY)).toBeNull();
    expect(resolvePeriod('month:2026-00', TODAY)).toBeNull();
    expect(resolvePeriod('quarter:2026-Q5', TODAY)).toBeNull();
    expect(resolvePeriod('year:26', TODAY)).toBeNull();
    expect(resolvePeriod('', TODAY)).toBeNull();
  });

  it('refuses a date it cannot read', () => {
    expect(resolvePeriod('this-month', 'not-a-date')).toBeNull();
  });
});

describe('the presets a report offers', () => {
  it('covers monthly, quarterly and annual', () => {
    const cadences = new Set(PERIOD_PRESETS.map((p) => p.cadence));
    expect(cadences.has('monthly')).toBe(true);
    expect(cadences.has('quarterly')).toBe(true);
    expect(cadences.has('annual')).toBe(true);
  });

  it('resolves every one of them', () => {
    for (const preset of PERIOD_PRESETS) {
      const resolved = resolvePeriod(preset.spec, TODAY)!;
      expect(resolved).not.toBeNull();
      expect(resolved.from <= resolved.to).toBe(true);
      expect(resolved.cadence).toBe(preset.cadence);
    }
  });
});
