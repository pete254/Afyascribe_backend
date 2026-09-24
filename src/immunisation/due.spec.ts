import { doseStatuses, parseAgeCode } from './due';
import { childhoodSchedule, maternalSchedule, subnationalSchedule } from './data/schedule';

describe('WHO age codes', () => {
  it('reads absolute ages', () => {
    expect(parseAgeCode('B')).toEqual({ fromBirthDays: 0 });
    expect(parseAgeCode('W6')).toEqual({ fromBirthDays: 42 });
    expect(parseAgeCode('W14')).toEqual({ fromBirthDays: 98 });
    expect(parseAgeCode('M9')!.fromBirthDays).toBe(274);
    expect(parseAgeCode('Y10')!.fromBirthDays).toBe(3653);
  });

  it('reads ages relative to the previous dose', () => {
    expect(parseAgeCode('+M6')!.afterPreviousDays).toBe(183);
    expect(parseAgeCode('+M1')!.afterPreviousDays).toBe(30);
    expect(parseAgeCode('+Y1')!.afterPreviousDays).toBe(365);
  });

  // Silently guessing a due date is how a vaccine gets missed.
  it('refuses codes that fix no age', () => {
    expect(parseAgeCode('1st contact')).toBeNull();
    expect(parseAgeCode(null)).toBeNull();
    expect(parseAgeCode('')).toBeNull();
    expect(parseAgeCode('sometime')).toBeNull();
  });
});

describe("Kenya's schedule as WHO holds it", () => {
  it('separates the national childhood schedule from the rest', () => {
    const child = childhoodSchedule();
    expect(child.length).toBeGreaterThan(20);
    // Maternal Td belongs to the mother, not the child's card.
    expect(child.some((r) => r.vaccine === 'TD_S')).toBe(false);
    // Malaria and yellow fever are given only in some counties.
    expect(child.some((r) => r.vaccine === 'MALARIA')).toBe(false);
    expect(subnationalSchedule().some((r) => r.vaccine === 'MALARIA')).toBe(true);
    expect(maternalSchedule().every((r) => r.target === 'PW')).toBe(true);
  });

  it('has the doses the Kenyan card is built around', () => {
    const child = childhoodSchedule();
    const at = (v: string, d: number) => child.find((r) => r.vaccine === v && r.dose === d)?.age;
    expect(at('BCG', 1)).toBe('B');
    expect(at('DTWPHIBHEPB', 1)).toBe('W6');
    expect(at('DTWPHIBHEPB', 3)).toBe('W14');
    expect(at('MR', 1)).toBe('M9');
    expect(at('MR', 2)).toBe('M18');
  });
});

describe('what a child is due', () => {
  const dob = '2026-01-01';

  it('marks a dose given', () => {
    const s = doseStatuses(dob, [{ vaccine: 'BCG', dose: 1, givenDate: '2026-01-01' }], { today: '2026-03-01' });
    expect(s.find((d) => d.vaccine === 'BCG')!.state).toBe('given');
  });

  it('computes the due date from the age code', () => {
    const s = doseStatuses(dob, [], { today: '2026-01-05' });
    // Six weeks after 1 January.
    expect(s.find((d) => d.vaccine === 'DTWPHIBHEPB' && d.dose === 1)!.dueDate).toBe('2026-02-12');
  });

  it('is upcoming before the date, due on it, overdue only after the grace period', () => {
    const on = (today: string) =>
      doseStatuses(dob, [], { today }).find((d) => d.vaccine === 'DTWPHIBHEPB' && d.dose === 1)!.state;
    expect(on('2026-02-01')).toBe('upcoming');
    expect(on('2026-02-12')).toBe('due');
    expect(on('2026-02-20')).toBe('due'); // still inside grace
    expect(on('2026-03-10')).toBe('overdue');
  });

  it('does not call HPV missed for a boy', () => {
    const boy = doseStatuses('2015-01-01', [], { sex: 'Male', today: '2026-06-01' });
    const hpv = boy.find((d) => d.vaccine === 'HPV4' && d.dose === 1)!;
    expect(hpv.state).toBe('not-applicable');

    const girl = doseStatuses('2015-01-01', [], { sex: 'Female', today: '2026-06-01' });
    expect(girl.find((d) => d.vaccine === 'HPV4' && d.dose === 1)!.state).not.toBe('not-applicable');
  });

  it('counts a relative dose from when the previous one was actually given', () => {
    // HPV 2 is "+M6" — six months after dose 1, not six months after it was due.
    const s = doseStatuses('2015-01-01', [{ vaccine: 'HPV4', dose: 1, givenDate: '2026-03-01' }], {
      sex: 'Female',
      today: '2026-06-01',
    });
    expect(s.find((d) => d.vaccine === 'HPV4' && d.dose === 2)!.dueDate).toBe('2026-08-31');
  });

  it('says so when a dose has no computable due date', () => {
    const s = doseStatuses(dob, [], { today: '2026-06-01' });
    for (const d of s) {
      if (d.state === 'no-due-date') expect(d.reason).toContain('no fixed due date');
    }
  });

  it('returns nothing for an unreadable date of birth', () => {
    expect(doseStatuses('not-a-date', [])).toEqual([]);
  });

  it('puts the soonest due first', () => {
    const s = doseStatuses(dob, [], { today: '2026-01-02' }).filter((d) => d.dueDate);
    const dates = s.map((d) => d.dueDate!);
    expect([...dates].sort()).toEqual(dates);
  });
});
