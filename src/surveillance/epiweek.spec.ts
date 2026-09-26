import { epiWeekOf, inWeek, lastCompleteWeek, weekBounds, weekStart, weeksInYear } from './epiweek';

describe('epidemiological weeks run Monday to Sunday', () => {
  it('starts the week on Monday', () => {
    // 2026-09-26 is a Saturday; its week began Monday the 21st.
    expect(weekStart(new Date('2026-09-26T00:00:00Z')).toISOString().slice(0, 10)).toBe('2026-09-21');
  });

  it('keeps Sunday in the week that began six days earlier', () => {
    // The commonest off-by-one: Sunday is day 0, and belongs to the week before.
    expect(weekStart(new Date('2026-09-27T00:00:00Z')).toISOString().slice(0, 10)).toBe('2026-09-21');
    expect(weekStart(new Date('2026-09-28T00:00:00Z')).toISOString().slice(0, 10)).toBe('2026-09-28'); // Monday
  });

  it('gives a week its Monday and Sunday', () => {
    const w = epiWeekOf('2026-09-26')!;
    expect(w.start).toBe('2026-09-21');
    expect(w.end).toBe('2026-09-27');
  });
});

describe('numbering the weeks', () => {
  it('starts week 1 with the week containing the first Thursday', () => {
    // 2026-01-01 is a Thursday, so that week is week 1 of 2026.
    expect(epiWeekOf('2026-01-01')).toMatchObject({ year: 2026, week: 1 });
    expect(epiWeekOf('2026-01-04')).toMatchObject({ year: 2026, week: 1 }); // the Sunday
    expect(epiWeekOf('2026-01-05')).toMatchObject({ year: 2026, week: 2 });
  });

  it('puts early January in the previous year where it belongs', () => {
    // 2027-01-01 is a Friday, so it is still week 53 of 2026. A return filed
    // under 2027 would be one the sub-county cannot reconcile.
    expect(epiWeekOf('2027-01-01')).toMatchObject({ year: 2026, week: 53 });
    expect(epiWeekOf('2027-01-03')).toMatchObject({ year: 2026, week: 53 }); // Sunday
    expect(epiWeekOf('2027-01-04')).toMatchObject({ year: 2027, week: 1 }); // Monday
  });

  it('puts late December in the next year where it belongs', () => {
    // 2024-12-30 is a Monday, and that week's Thursday falls in 2025.
    expect(epiWeekOf('2024-12-30')).toMatchObject({ year: 2025, week: 1 });
  });

  it('refuses a date it cannot read', () => {
    expect(epiWeekOf('not-a-date')).toBeNull();
  });
});

describe('going from a week back to its dates', () => {
  it('round-trips every week of a year', () => {
    for (const year of [2024, 2025, 2026, 2027]) {
      for (let w = 1; w <= weeksInYear(year); w += 1) {
        const bounds = weekBounds(year, w)!;
        expect(bounds).not.toBeNull();
        expect(epiWeekOf(bounds.start)).toMatchObject({ year, week: w });
        expect(epiWeekOf(bounds.end)).toMatchObject({ year, week: w });
      }
    }
  });

  it('knows which years have 53 weeks', () => {
    expect(weeksInYear(2026)).toBe(53);
    expect(weeksInYear(2025)).toBe(52);
  });

  it('refuses week 53 of a year that has only 52', () => {
    // Otherwise it would quietly hand back week 1 of the following year.
    expect(weekBounds(2025, 53)).toBeNull();
    expect(weekBounds(2026, 53)).not.toBeNull();
  });

  it('refuses nonsense', () => {
    expect(weekBounds(2026, 0)).toBeNull();
    expect(weekBounds(2026, 54)).toBeNull();
    expect(weekBounds(2026, 1.5)).toBeNull();
  });
});

describe('the week a return reports on', () => {
  it('is the one that has just ended', () => {
    // Filed on Monday 28 September 2026, the return covers 21–27 September.
    const w = lastCompleteWeek('2026-09-28');
    expect(w.start).toBe('2026-09-21');
    expect(w.end).toBe('2026-09-27');
  });

  it('does not jump ahead mid-week', () => {
    // Still the same completed week on the Thursday.
    expect(lastCompleteWeek('2026-10-01').end).toBe('2026-09-27');
  });
});

describe('deciding what falls in a week', () => {
  const bounds = { start: '2026-09-21', end: '2026-09-27' };

  it('includes both ends', () => {
    expect(inWeek('2026-09-21', bounds)).toBe(true);
    expect(inWeek('2026-09-27', bounds)).toBe(true);
  });

  it('excludes the days either side', () => {
    expect(inWeek('2026-09-20', bounds)).toBe(false);
    expect(inWeek('2026-09-28', bounds)).toBe(false);
  });

  it('ignores a timestamp beyond the date', () => {
    expect(inWeek('2026-09-24T18:30:00.000Z', bounds)).toBe(true);
  });

  it('counts nothing for a missing date', () => {
    expect(inWeek(null, bounds)).toBe(false);
    expect(inWeek(undefined, bounds)).toBe(false);
  });
});
