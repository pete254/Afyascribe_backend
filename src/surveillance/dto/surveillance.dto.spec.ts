import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SaveWeeklyDto } from './surveillance.dto';

/** Disease Reporting Specification D-6: weekly figures are checked on the server. */
const errors = (body: unknown) =>
  validateSync(plainToInstance(SaveWeeklyDto, body), { whitelist: true })
    .length;

const row = (counts: Partial<Record<string, unknown>> = {}) => ({
  label: 'Cholera',
  conditionCode: 'CHOLERA',
  under5Cases: 0,
  under5Deaths: 0,
  over5Cases: 2,
  over5Deaths: 0,
  ...counts,
});

describe('saving a weekly return', () => {
  it('accepts whole numbers of zero or more', () => {
    expect(errors({ year: 2026, week: 44, rows: [row()] })).toBe(0);
    expect(errors({ rows: [row({ conditionCode: null })] })).toBe(0);
  });

  it('refuses a negative, a fraction, text or an absurd figure', () => {
    expect(errors({ rows: [row({ over5Cases: -1 })] })).toBeGreaterThan(0);
    expect(errors({ rows: [row({ over5Cases: 1.5 })] })).toBeGreaterThan(0);
    expect(errors({ rows: [row({ over5Cases: 'three' })] })).toBeGreaterThan(0);
    expect(errors({ rows: [row({ over5Cases: 1_000_000 })] })).toBeGreaterThan(
      0,
    );
  });

  it('refuses a row with a figure missing', () => {
    const partial: Record<string, unknown> = row();
    delete partial.over5Deaths;
    expect(errors({ rows: [partial] })).toBeGreaterThan(0);
  });

  it('refuses a week that cannot exist', () => {
    expect(errors({ year: 2026, week: 54 })).toBeGreaterThan(0);
    expect(errors({ year: 2026, week: 0 })).toBeGreaterThan(0);
  });

  it('checks the other conditions the same way', () => {
    expect(
      errors({
        others: [{ label: 'Anthrax cluster', ...row({ under5Cases: -2 }) }],
      }),
    ).toBeGreaterThan(0);
  });
});
