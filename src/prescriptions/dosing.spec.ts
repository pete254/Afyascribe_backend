import { daysSupply, dosesPerDay, durationDays, quantityForCourse, unitsPerDose } from './dosing';

describe('dosesPerDay', () => {
  it.each([
    ['TDS', 3],
    ['t.d.s', 3],
    ['BD', 2],
    ['OD', 1],
    ['QID', 4],
    ['nocte', 1],
    ['1x3', 3],
    ['q8h', 3],
    ['8 hourly', 3],
    ['every 6 hours', 4],
    ['3 times a day', 3],
    ['2 times daily', 2],
    ['alternate days', 0.5],
  ])('reads %s as %s doses/day', (text, expected) => {
    expect(dosesPerDay(text)).toBeCloseTo(expected as number, 2);
  });

  // The whole point: never invent a rate we cannot read.
  it.each(['PRN', 'as needed', 'tds prn', 'sos', 'gibberish', '', null])(
    'refuses to guess a rate for %s',
    (text) => {
      expect(dosesPerDay(text as string | null)).toBeNull();
    },
  );
});

describe('unitsPerDose', () => {
  it.each([
    ['1 tablet', 1],
    ['2 tabs', 2],
    ['5ml', 5],
    ['1/2 tab', 0.5],
    ['2x2', 2],
  ])('reads %s as %s units', (text, expected) => {
    expect(unitsPerDose(text)).toBeCloseTo(expected as number, 2);
  });

  it('returns null when no amount is written, rather than assuming one', () => {
    expect(unitsPerDose('tablet')).toBeNull();
    expect(unitsPerDose('')).toBeNull();
  });
});

describe('daysSupply', () => {
  it('works out how long a quantity lasts', () => {
    expect(daysSupply(15, '1 tab', 'TDS')?.days).toBe(5);
    expect(daysSupply(20, '2 tabs', 'BD')?.days).toBe(5);
    expect(daysSupply(30, '1 tab', 'OD')?.days).toBe(30);
  });

  it('rounds down — a part day of cover is not a day', () => {
    expect(daysSupply(10, '1 tab', 'TDS')?.days).toBe(3);
  });

  it('gives no answer when the dose or rate cannot be read', () => {
    expect(daysSupply(10, '1 tab', 'PRN')).toBeNull();
    expect(daysSupply(10, 'tablet', 'TDS')).toBeNull();
    expect(daysSupply(0, '1 tab', 'TDS')).toBeNull();
  });
});

describe('quantityForCourse', () => {
  it('works out what a written course needs', () => {
    expect(quantityForCourse(5, '1 tab', 'TDS')).toBe(15);
    expect(quantityForCourse(7, '2 tabs', 'BD')).toBe(28);
  });

  it('gives no answer when the course cannot be read', () => {
    expect(quantityForCourse(5, '1 tab', 'PRN')).toBeNull();
    expect(quantityForCourse(null, '1 tab', 'TDS')).toBeNull();
  });
});

describe('durationDays', () => {
  it.each([
    ['5 days', 5],
    ['5/7', 35],      // Kenyan shorthand: 5 weeks
    ['2/12', 60],     // 2 months
    ['1 week', 7],
    ['2 weeks', 14],
    ['1 month', 30],
    ['3d', 3],
  ])('reads %s as %s days', (text, expected) => {
    expect(durationDays(text)).toBe(expected);
  });

  it('returns null when no duration was written', () => {
    expect(durationDays('')).toBeNull();
    expect(durationDays(null)).toBeNull();
    expect(durationDays('until finished')).toBeNull();
  });
});
