import { bmiFrom, heightInMetres, weightInKg } from './anthropometry';

describe('heightInMetres', () => {
  it('accepts metres or centimetres, since triage is typed by hand', () => {
    expect(heightInMetres('1.68')).toBeCloseTo(1.68, 2);
    expect(heightInMetres('168')).toBeCloseTo(1.68, 2);
    expect(heightInMetres('168 cm')).toBeCloseTo(1.68, 2);
  });

  it('rejects entries that are not a person', () => {
    expect(heightInMetres('0')).toBeNull();
    expect(heightInMetres('900')).toBeNull();
    expect(heightInMetres('')).toBeNull();
    expect(heightInMetres(null)).toBeNull();
  });
});

describe('weightInKg', () => {
  it('reads a weight with or without its unit', () => {
    expect(weightInKg('72')).toBe(72);
    expect(weightInKg('72 kg')).toBe(72);
  });

  it('rejects impossible weights', () => {
    expect(weightInKg('0')).toBeNull();
    expect(weightInKg('900')).toBeNull();
  });
});

describe('bmiFrom', () => {
  it('computes BMI and the adult category', () => {
    const r = bmiFrom('70', '1.75', 34);
    expect(r?.value).toBeCloseTo(22.9, 1);
    expect(r?.category).toBe('Normal');
  });

  it('works the same whether height came in metres or centimetres', () => {
    expect(bmiFrom('70', '175', 34)?.value).toBeCloseTo(bmiFrom('70', '1.75', 34)!.value, 1);
  });

  it('applies the WHO adult cut-offs', () => {
    expect(bmiFrom('45', '1.75', 30)?.category).toBe('Underweight');
    expect(bmiFrom('80', '1.75', 30)?.category).toBe('Overweight');
    expect(bmiFrom('100', '1.75', 30)?.category).toBe('Obese');
  });

  // Adult cut-offs do not apply to children; saying nothing beats saying wrong.
  it('withholds the adult category for a child', () => {
    const r = bmiFrom('20', '1.10', 6);
    expect(r?.value).toBeGreaterThan(0);
    expect(r?.category).toBeNull();
  });

  it('gives nothing when a measurement is missing', () => {
    expect(bmiFrom('70', null)).toBeNull();
    expect(bmiFrom(null, '1.75')).toBeNull();
  });
});
