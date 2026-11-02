import {
  ESCALATE_AFTER,
  MAX_SEND_ATTEMPTS,
  afterAttempt,
  nextAttemptAt,
} from './retry';

const t0 = new Date('2026-11-02T08:00:00Z');
const minutesAfter = (d: Date | null) =>
  d ? (d.getTime() - t0.getTime()) / 60_000 : null;

describe('resending a failed case or return (D-3, I-6)', () => {
  it('backs off: 5, 15, 60, 180 minutes, then every 6 hours', () => {
    expect(
      [1, 2, 3, 4, 5, 6, 10].map((n) => minutesAfter(nextAttemptAt(n, t0))),
    ).toEqual([5, 15, 60, 180, 360, 360, 360]);
  });

  it('stops after the last attempt, about three days in', () => {
    expect(nextAttemptAt(MAX_SEND_ATTEMPTS, t0)).toBeNull();
    expect(nextAttemptAt(0, t0)).toBeNull();
  });

  it('escalates before it gives up', () => {
    expect(ESCALATE_AFTER).toBeLessThan(MAX_SEND_ATTEMPTS);
  });

  it('schedules a retry only for a real failure', () => {
    const failed = afterAttempt(
      0,
      { attempted: true, ok: false, detail: 'responded 503' },
      t0,
    );
    expect(failed).toMatchObject({
      status: 'failed',
      attempts: 1,
      error: 'responded 503',
    });
    expect(minutesAfter(failed.nextAt)).toBe(5);

    const sent = afterAttempt(
      3,
      { attempted: true, ok: true, detail: 'Sent' },
      t0,
    );
    expect(sent).toEqual({
      status: 'sent',
      attempts: 4,
      nextAt: null,
      error: null,
    });

    // Nothing configured, or not HTTPS: trying again in five minutes will not help.
    const none = afterAttempt(
      0,
      { attempted: false, ok: false, detail: 'No endpoint' },
      t0,
    );
    expect(none).toMatchObject({
      status: 'not-configured',
      attempts: 0,
      nextAt: null,
    });
  });
});
