import { ageInMonths, classify, weightForLengthIndicator, zScore } from './growth';
import { lmsFor } from './data/who-standards';

/**
 * The strongest check available: WHO publishes both the LMS parameters and the
 * measurement at each SD cut-off. Feeding the published cut-off back in must
 * return that z-score, or our maths disagrees with the standard.
 */
describe('z-scores reproduce WHO\'s own published cut-offs', () => {
  const cases: [string, 'wfa' | 'hfa' | 'wfl' | 'wfh', 'M' | 'F', number][] = [
    ['weight-for-age, boy, 12m', 'wfa', 'M', 12],
    ['weight-for-age, girl, 24m', 'wfa', 'F', 24],
    ['height-for-age, boy, 36m', 'hfa', 'M', 36],
    ['weight-for-length, girl, 80cm', 'wfl', 'F', 80],
    ['weight-for-height, boy, 100cm', 'wfh', 'M', 100],
  ];

  it.each(cases)('%s — median returns z ≈ 0', (_n, ind, sex, key) => {
    const row = lmsFor(ind, sex, key)!;
    const median = row[1];
    expect(zScore(ind, sex, key, median)!.z).toBeCloseTo(0, 1);
  });

  it.each(cases)('%s — the published −2 SD value returns z ≈ −2', (_n, ind, sex, key) => {
    const row = lmsFor(ind, sex, key)!;
    const sd2neg = row[4]!;
    // WHO rounds its published cut-offs, so allow a tenth either way.
    expect(zScore(ind, sex, key, sd2neg)!.z).toBeCloseTo(-2, 1);
  });

  it.each(cases)('%s — the published −3 SD value returns z ≈ −3', (_n, ind, sex, key) => {
    const row = lmsFor(ind, sex, key)!;
    const sd3neg = row[3]!;
    expect(zScore(ind, sex, key, sd3neg)!.z).toBeCloseTo(-3, 1);
  });
});

describe('the ±3 SD constraint', () => {
  it('applies to weight-based indicators below −3', () => {
    const row = lmsFor('wfa', 'M', 12)!;
    const wellBelow = row[3]! * 0.7;
    const r = zScore('wfa', 'M', 12, wellBelow)!;
    expect(r.constrained).toBe(true);
    expect(r.z).toBeLessThan(-3);
  });

  it('does not apply to height-for-age, which WHO leaves unconstrained', () => {
    const row = lmsFor('hfa', 'M', 12)!;
    const veryShort = row[3]! * 0.8;
    expect(zScore('hfa', 'M', 12, veryShort)!.constrained).toBe(false);
  });
});

describe('refusing to answer outside the standard', () => {
  it('gives nothing beyond the published age range', () => {
    expect(zScore('wfa', 'M', 61, 20)).toBeNull();
    expect(zScore('wfa', 'M', -1, 20)).toBeNull();
  });

  it('gives nothing beyond the published length range', () => {
    expect(zScore('wfl', 'F', 44, 2)).toBeNull();
    expect(zScore('wfh', 'M', 121, 20)).toBeNull();
  });

  it('gives nothing for a missing measurement', () => {
    expect(zScore('wfa', 'M', 12, 0)).toBeNull();
  });
});

describe('classification', () => {
  it('names the right condition for each indicator', () => {
    // Wasting, stunting and underweight are not interchangeable.
    expect(classify('wfh', -3.5).label).toBe('Severe acute malnutrition');
    expect(classify('hfa', -3.5).label).toBe('Severely stunted');
    expect(classify('wfa', -3.5).label).toBe('Severely underweight');
  });

  it('separates moderate from severe at −3', () => {
    expect(classify('wfh', -2.5).severity).toBe('moderate');
    expect(classify('wfh', -3.1).severity).toBe('severe');
    expect(classify('wfh', -1.9).severity).toBe('normal');
  });

  it('flags the high end for weight-for-height', () => {
    expect(classify('wfh', 2.5).label).toBe('Overweight');
    expect(classify('wfh', 3.5).label).toBe('Obese');
  });
});

describe('age and table selection', () => {
  it('counts whole months, not started ones', () => {
    expect(ageInMonths('2024-01-15', '2024-07-14')).toBe(5);
    expect(ageInMonths('2024-01-15', '2024-07-15')).toBe(6);
  });

  it('refuses a measurement dated before birth', () => {
    expect(ageInMonths('2024-06-01', '2024-01-01')).toBeNull();
  });

  it('switches from weight-for-length to weight-for-height at two years', () => {
    expect(weightForLengthIndicator(23)).toBe('wfl');
    expect(weightForLengthIndicator(24)).toBe('wfh');
  });
});
