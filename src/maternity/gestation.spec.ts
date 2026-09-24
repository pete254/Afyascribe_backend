import {
  ancContactStatuses,
  anaemiaGrade,
  bpFlag,
  eddFromLmp,
  gestationOn,
  lmpFromEdd,
  pncContactStatuses,
  pncWindowFor,
  resolveDating,
} from './gestation';

describe('pregnancy dating', () => {
  it("applies Naegele's rule to the last menstrual period", () => {
    expect(eddFromLmp('2026-01-01')).toBe('2026-10-08'); // 280 days on
    expect(lmpFromEdd('2026-10-08')).toBe('2026-01-01');
  });

  it('refuses a date it cannot read rather than guessing', () => {
    expect(eddFromLmp('not-a-date')).toBeNull();
    expect(resolveDating({ lmp: 'nonsense' })).toBeNull();
    expect(resolveDating({})).toBeNull();
  });

  it('lets a dating scan override a remembered period', () => {
    // Scanned on 1 March at 12 weeks exactly: term is 280 − 84 = 196 days later.
    const r = resolveDating({ lmp: '2026-01-01', ultrasoundDate: '2026-03-01', ultrasoundGaDays: 84 })!;
    expect(r.basis).toBe('ultrasound');
    expect(r.edd).toBe('2026-09-13');
  });

  it('falls back to the period, then to an EDD entered directly', () => {
    expect(resolveDating({ lmp: '2026-01-01' })).toEqual({ edd: '2026-10-08', basis: 'lmp' });
    expect(resolveDating({ edd: '2026-10-08' })).toEqual({ edd: '2026-10-08', basis: 'edd' });
  });

  it('reports gestation in weeks and days', () => {
    const g = gestationOn({ lmp: '2026-01-01' }, '2026-04-02')!; // 91 days
    expect(g.totalDays).toBe(91);
    expect(g.weeks).toBe(13);
    expect(g.days).toBe(0);
    expect(g.trimester).toBe(1);
    expect(g.postTerm).toBe(false);
  });

  it('puts the trimester boundaries at 14 and 28 weeks', () => {
    expect(gestationOn({ lmp: '2026-01-01' }, '2026-04-01')!.trimester).toBe(1); // 13w6d
    expect(gestationOn({ lmp: '2026-01-01' }, '2026-04-09')!.trimester).toBe(2); // 14w0d
    expect(gestationOn({ lmp: '2026-01-01' }, '2026-07-15')!.trimester).toBe(2); // 27w6d
    expect(gestationOn({ lmp: '2026-01-01' }, '2026-07-16')!.trimester).toBe(3); // 28w0d
  });

  it('says when a pregnancy is past its date', () => {
    expect(gestationOn({ lmp: '2026-01-01' }, '2026-10-08')!.postTerm).toBe(false); // the day itself
    expect(gestationOn({ lmp: '2026-01-01' }, '2026-10-09')!.postTerm).toBe(true);
  });

  it('returns nothing for a day before the pregnancy began', () => {
    expect(gestationOn({ lmp: '2026-06-01' }, '2026-01-01')).toBeNull();
  });
});

describe('the eight antenatal contacts', () => {
  const dating = { lmp: '2026-01-01' }; // EDD 2026-10-08

  it('places each contact at its gestation', () => {
    const s = ancContactStatuses(dating, [], { today: '2026-01-02' });
    expect(s.map((c) => c.weeks)).toEqual([12, 20, 26, 30, 34, 36, 38, 40]);
    expect(s[0].dueDate).toBe('2026-03-26'); // 12 weeks
    expect(s[7].dueDate).toBe('2026-10-08'); // 40 weeks, the EDD itself
  });

  it('counts a late attendance as that contact, not a missed one', () => {
    // Contact 1 was due at 12 weeks but she came at 18. It still counts.
    const s = ancContactStatuses(dating, [{ contactNumber: 1, contactDate: '2026-05-07' }], {
      today: '2026-05-08',
    });
    expect(s[0].state).toBe('attended');
    expect(s[0].attendedDate).toBe('2026-05-07');
  });

  it('calls a contact overdue only after the grace period', () => {
    const on = (today: string) => ancContactStatuses(dating, [], { today })[0].state;
    expect(on('2026-03-25')).toBe('upcoming');
    expect(on('2026-03-26')).toBe('due');
    expect(on('2026-04-09')).toBe('due'); // still inside the 14-day grace
    expect(on('2026-04-10')).toBe('overdue');
  });

  it('stops chasing contacts once the pregnancy has ended', () => {
    // Delivered at 34 weeks (2026-08-27): contacts 6, 7 and 8 were never going to happen.
    const s = ancContactStatuses(dating, [], { today: '2026-11-01', endedOn: '2026-08-27' });
    expect(s.find((c) => c.contact === 5)!.state).toBe('overdue');
    expect(s.find((c) => c.contact === 6)!.state).toBe('past-term');
    expect(s.find((c) => c.contact === 8)!.reason).toContain('already ended');
  });

  it('returns nothing when the pregnancy cannot be dated', () => {
    expect(ancContactStatuses({}, [])).toEqual([]);
  });
});

describe("the four postnatal contacts", () => {
  const birth = '2026-01-01';

  it("uses Kenya's windows, not a single day", () => {
    const s = pncContactStatuses(birth, [], { today: '2026-01-01' });
    expect(s.map((c) => [c.fromDate, c.toDate])).toEqual([
      ['2026-01-01', '2026-01-03'],
      ['2026-01-08', '2026-01-15'],
      ['2026-01-29', '2026-02-12'],
      ['2026-05-01', '2026-07-03'],
    ]);
  });

  it('opens the first window on the day of birth', () => {
    expect(pncContactStatuses(birth, [], { today: '2026-01-01' })[0].state).toBe('due');
  });

  it('is overdue only once the window has closed', () => {
    const on = (today: string) => pncContactStatuses(birth, [], { today })[0].state;
    expect(on('2026-01-03')).toBe('due');
    expect(on('2026-01-04')).toBe('overdue');
  });

  it('marks a window attended whenever in it she came', () => {
    const s = pncContactStatuses(birth, [{ window: 'week-1-2', contactDate: '2026-01-12' }], {
      today: '2026-02-01',
    });
    expect(s[1].state).toBe('attended');
    expect(s[0].state).toBe('overdue');
  });

  it('places a date in its window, and says so when it falls between them', () => {
    expect(pncWindowFor(birth, '2026-01-02')).toBe('within-48h');
    expect(pncWindowFor(birth, '2026-01-10')).toBe('week-1-2');
    expect(pncWindowFor(birth, '2026-01-05')).toBeNull(); // day 4 — between windows
  });
});

describe('flags read off the observations', () => {
  it("grades anaemia on Kenya's thresholds", () => {
    expect(anaemiaGrade(12)).toBe('none');
    expect(anaemiaGrade(11)).toBe('none'); // 11 is the threshold, not anaemia
    expect(anaemiaGrade(10.5)).toBe('mild');
    expect(anaemiaGrade(9)).toBe('moderate');
    expect(anaemiaGrade(6.9)).toBe('severe');
    expect(anaemiaGrade(null)).toBeNull();
    expect(anaemiaGrade(0)).toBeNull();
  });

  it('flags blood pressure at 140/90 and 160/110', () => {
    expect(bpFlag(120, 80)).toBe('normal');
    expect(bpFlag(140, 80)).toBe('raised');
    expect(bpFlag(120, 90)).toBe('raised');
    expect(bpFlag(160, 80)).toBe('severe');
    expect(bpFlag(120, 110)).toBe('severe');
    expect(bpFlag(null, null)).toBeNull();
  });
});
