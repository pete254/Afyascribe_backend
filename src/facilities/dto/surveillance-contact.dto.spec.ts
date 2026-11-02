import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SurveillanceContactDto } from './surveillance-contact.dto';

const errors = (body: unknown) =>
  validateSync(plainToInstance(SurveillanceContactDto, body)).length;

describe('the surveillance contact', () => {
  it('takes an email, or nothing (the administrators)', () => {
    expect(errors({ surveillanceEmail: 'focal@test.local' })).toBe(0);
    expect(errors({ surveillanceEmail: '' })).toBe(0);
    expect(errors({ surveillanceEmail: null })).toBe(0);
    expect(errors({})).toBe(0);
  });

  it('refuses something that is not an email', () => {
    expect(errors({ surveillanceEmail: 'focal person' })).toBeGreaterThan(0);
  });
});
