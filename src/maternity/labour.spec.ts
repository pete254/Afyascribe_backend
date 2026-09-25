import { alertsFor, cervixAlert, partographLines } from './labour';
import { LCG_CERVIX_LAG_HOURS, LCG_ROWS } from './data/labour-care-guide';

describe("the Labour Care Guide's alert column", () => {
  const keys = (v: Parameters<typeof alertsFor>[0]) => alertsFor(v).map((a) => a.key);

  it('alerts on a fetal heart outside 110–160', () => {
    expect(keys({ baselineFhr: 109 })).toContain('baselineFhr');
    expect(keys({ baselineFhr: 160 })).toContain('baselineFhr'); // ≥160
    expect(keys({ baselineFhr: 110 })).toEqual([]);
    expect(keys({ baselineFhr: 159 })).toEqual([]);
  });

  it("reads the woman's observations as the form writes them", () => {
    expect(keys({ pulse: 59 })).toContain('pulse');
    expect(keys({ pulse: 120 })).toContain('pulse');
    expect(keys({ pulse: 100 })).toEqual([]);

    expect(keys({ systolic: 79 })).toContain('systolic');
    expect(keys({ systolic: 140 })).toContain('systolic');
    expect(keys({ diastolic: 90 })).toContain('diastolic');
    expect(keys({ diastolic: 89 })).toEqual([]);

    expect(keys({ temperature: 34.9 })).toContain('temperature');
    expect(keys({ temperature: 37.5 })).toContain('temperature');
    expect(keys({ temperature: 37.4 })).toEqual([]);
  });

  it('reads contractions as "≤2, >5" and duration as "<20, >60"', () => {
    expect(keys({ contractionsPer10: 2 })).toContain('contractionsPer10');
    expect(keys({ contractionsPer10: 3 })).toEqual([]);
    expect(keys({ contractionsPer10: 5 })).toEqual([]);
    expect(keys({ contractionsPer10: 6 })).toContain('contractionsPer10');

    expect(keys({ contractionDuration: 19 })).toContain('contractionDuration');
    expect(keys({ contractionDuration: 20 })).toEqual([]);
    expect(keys({ contractionDuration: 60 })).toEqual([]);
    expect(keys({ contractionDuration: 61 })).toContain('contractionDuration');
  });

  it('alerts on the coded rows the form marks', () => {
    expect(keys({ companion: 'N' })).toContain('companion');
    expect(keys({ companion: 'Y' })).toEqual([]);
    expect(keys({ posture: 'SP' })).toContain('posture');
    expect(keys({ posture: 'MO' })).toEqual([]);
    expect(keys({ fhrDeceleration: 'L' })).toContain('fhrDeceleration');
    expect(keys({ fhrDeceleration: 'E' })).toEqual([]); // early decelerations do not alert
    expect(keys({ amnioticFluid: 'M+++' })).toContain('amnioticFluid');
    expect(keys({ amnioticFluid: 'B' })).toContain('amnioticFluid');
    expect(keys({ amnioticFluid: 'M+' })).toEqual([]);
    expect(keys({ fetalPosition: 'P' })).toContain('fetalPosition');
    expect(keys({ fetalPosition: 'A' })).toEqual([]);
    expect(keys({ moulding: '+++' })).toContain('moulding');
    expect(keys({ moulding: '++' })).toEqual([]);
    expect(keys({ urine: 'P++' })).toContain('urine');
    expect(keys({ urine: 'P+' })).toEqual([]);
  });

  it('never alerts on a value that was not recorded', () => {
    expect(alertsFor({})).toEqual([]);
    expect(alertsFor({ baselineFhr: null, pulse: null, companion: null })).toEqual([]);
  });

  it('carries the printed criterion so the note says why', () => {
    const [a] = alertsFor({ baselineFhr: 170 });
    expect(a.criterion).toBe('<110, ≥160');
    expect(a.label).toBe('Baseline FHR');
    expect(a.value).toBe('170');
  });

  it('alerts on every row at once when everything is wrong', () => {
    const all = alertsFor({
      companion: 'N',
      painRelief: 'N',
      oralFluid: 'N',
      posture: 'SP',
      baselineFhr: 170,
      fhrDeceleration: 'L',
      amnioticFluid: 'B',
      fetalPosition: 'T',
      caput: '+++',
      moulding: '+++',
      pulse: 130,
      systolic: 150,
      diastolic: 95,
      temperature: 38,
      urine: 'A++',
      contractionsPer10: 1,
      contractionDuration: 10,
    });
    expect(all).toHaveLength(17);
  });
});

describe('the cervix lag time', () => {
  it("uses the guide's own hours per centimetre", () => {
    expect(LCG_CERVIX_LAG_HOURS).toEqual({ 5: 6, 6: 5, 7: 3, 8: 2.5, 9: 2 });
  });

  it('alerts once the lag for the current dilatation is exceeded', () => {
    const readings = [{ at: '2026-09-25T00:00:00Z', cervix: 7 }];
    expect(cervixAlert(readings, '2026-09-25T02:59:00Z')).toBeNull(); // 7 cm allows 3 h
    const hit = cervixAlert(readings, '2026-09-25T03:00:00Z')!;
    expect(hit.atCm).toBe(7);
    expect(hit.allowedHours).toBe(3);
    expect(hit.message).toContain('no progress');
  });

  it('times from when the dilatation was first reached, not the last examination', () => {
    // Examined hourly and stuck at 6 cm since midnight. Measuring from the most
    // recent check would reset the clock every hour and never alert.
    const readings = [
      { at: '2026-09-25T00:00:00Z', cervix: 6 },
      { at: '2026-09-25T02:00:00Z', cervix: 6 },
      { at: '2026-09-25T04:00:00Z', cervix: 6 },
    ];
    // The form prints "≥ 5h" at 6 cm, so five hours exactly is already an alert.
    expect(cervixAlert(readings, '2026-09-25T04:59:00Z')).toBeNull();
    expect(cervixAlert(readings, '2026-09-25T05:00:00Z')!.atCm).toBe(6);
  });

  it('restarts the clock when labour progresses', () => {
    const readings = [
      { at: '2026-09-25T00:00:00Z', cervix: 6 },
      { at: '2026-09-25T04:00:00Z', cervix: 7 },
    ];
    // Now at 7 cm since 04:00, which allows 3 h — not in alert at 06:00.
    expect(cervixAlert(readings, '2026-09-25T06:00:00Z')).toBeNull();
    expect(cervixAlert(readings, '2026-09-25T07:00:00Z')!.atCm).toBe(7);
  });

  it('sets no lag time below the active phase or at full dilatation', () => {
    const early = [{ at: '2026-09-25T00:00:00Z', cervix: 4 }];
    expect(cervixAlert(early, '2026-09-26T00:00:00Z')).toBeNull();
    const full = [{ at: '2026-09-25T00:00:00Z', cervix: 10 }];
    expect(cervixAlert(full, '2026-09-26T00:00:00Z')).toBeNull();
  });

  it('ignores readings it cannot read', () => {
    expect(cervixAlert([], '2026-09-25T00:00:00Z')).toBeNull();
    expect(cervixAlert([{ at: 'not-a-date', cervix: 7 }], '2026-09-25T00:00:00Z')).toBeNull();
  });
});

describe('the partograph lines, drawn but never acted on', () => {
  it('runs the alert line at 1 cm an hour from 4 cm', () => {
    const { alert } = partographLines('2026-09-25T00:00:00Z');
    expect(alert[0]).toEqual({ at: '2026-09-25T00:00:00.000Z', cm: 4 });
    expect(alert[6]).toEqual({ at: '2026-09-25T06:00:00.000Z', cm: 10 });
    expect(alert).toHaveLength(7); // stops at full dilatation
  });

  it('puts the action line four hours to the right', () => {
    const { alert, action } = partographLines('2026-09-25T00:00:00Z');
    expect(action[0].cm).toBe(alert[0].cm);
    expect(new Date(action[0].at).getTime() - new Date(alert[0].at).getTime()).toBe(4 * 3_600_000);
  });

  it('returns nothing for a start it cannot read', () => {
    expect(partographLines('nonsense')).toEqual({ alert: [], action: [] });
  });
});

describe('the guide itself', () => {
  it('transcribes every row of the published form', () => {
    expect(LCG_ROWS).toHaveLength(22); // 4 supportive + 6 baby + 5 woman + 4 progress + 3 medication
    const alerting = LCG_ROWS.filter((r) => r.alert).map((r) => r.key);
    // Descent and the medication rows carry no alert criterion on the form.
    expect(alerting).not.toContain('descent');
    expect(alerting).not.toContain('oxytocin');
  });
});
