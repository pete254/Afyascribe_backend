import { SurveillanceJobsService } from './surveillance-jobs.service';

/**
 * D-3 / D-8 / I-3 / I-6: who is emailed, when, and never twice.
 * Test data only — no real facility or patient.
 */
function setup(opts: { contact?: string | null; admins?: string[] } = {}) {
  const sent: { to: string; subject: string; html: string }[] = [];
  const email = {
    sendCustomEmail: jest.fn((to: string, subject: string, html: string) => {
      sent.push({ to, subject, html });
      return Promise.resolve();
    }),
  };
  const facility = {
    id: 'f1',
    surveillanceEmail: opts.contact ?? null,
    idsrRemindedWeek: null as string | null,
    status: 'active',
  };
  const facilities = {
    findOne: jest.fn(() => Promise.resolve(facility)),
    find: jest.fn(() => Promise.resolve([facility])),
    update: jest.fn((_id: string, patch: Record<string, unknown>) =>
      Promise.resolve(Object.assign(facility, patch)),
    ),
  };
  const users = {
    find: jest.fn(() =>
      Promise.resolve(
        (opts.admins ?? ['admin@test.local']).map((e) => ({ email: e })),
      ),
    ),
  };
  const returns = {
    findOne: jest.fn(() => Promise.resolve(null)),
    update: jest.fn(),
  };
  const cases = {
    dueForResend: jest.fn(() => Promise.resolve([])),
    resend: jest.fn(),
    overdueUnreminded: jest.fn(() => Promise.resolve([] as unknown[])),
    markReminded: jest.fn(),
  };
  const weekly = {
    dueForResend: jest.fn(() => Promise.resolve([])),
    resend: jest.fn(),
    raiseSignals: jest.fn(() => Promise.resolve([] as unknown[])),
  };
  const jobs = new SurveillanceJobsService(
    cases as never,
    weekly as never,
    email as never,
    facilities as never,
    users as never,
    returns as never,
  );
  return { jobs, sent, cases, weekly, facility, returns };
}

describe('who is told', () => {
  it('the surveillance contact when one is set', async () => {
    const { jobs } = setup({ contact: 'focal@test.local' });
    expect(await jobs.recipients('f1')).toEqual(['focal@test.local']);
  });

  it('otherwise the facility administrators', async () => {
    const { jobs } = setup({
      admins: ['a@test.local', 'b@test.local', 'a@test.local'],
    });
    expect(await jobs.recipients('f1')).toEqual([
      'a@test.local',
      'b@test.local',
    ]);
  });
});

describe('overdue cases (D-8)', () => {
  it('emails once per facility, names the disease, never the patient', async () => {
    const { jobs, sent, cases } = setup();
    cases.overdueUnreminded.mockResolvedValue([
      { id: 'n1', facilityId: 'f1', conditionName: 'Cholera', patientId: 'p1' },
      { id: 'n2', facilityId: 'f1', conditionName: 'Measles', patientId: 'p2' },
    ]);
    await jobs.remindOverdue();
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe('2 suspected cases overdue for notification');
    expect(sent[0].html).toContain('Cholera, Measles');
    expect(sent[0].html).not.toMatch(/p1|p2/);
    expect(cases.markReminded).toHaveBeenCalledWith(
      ['n1', 'n2'],
      'overdueRemindedAt',
      expect.any(Date),
    );
  });

  it('does not mark a case reminded when nobody could be emailed', async () => {
    const { jobs, cases } = setup({ admins: [] });
    cases.overdueUnreminded.mockResolvedValue([
      { id: 'n1', facilityId: 'f1', conditionName: 'Cholera' },
    ]);
    await jobs.remindOverdue();
    expect(cases.markReminded).not.toHaveBeenCalled();
  });
});

describe('failed sending (D-3)', () => {
  it('escalates after the third failure, and only once', async () => {
    const { jobs, sent, cases } = setup();
    const row = {
      id: 'n1',
      facilityId: 'f1',
      conditionName: 'Cholera',
      alertError: 'responded 503',
    };
    await jobs.escalateCase({
      ...row,
      alertAttempts: 2,
      alertEscalatedAt: null,
    } as never);
    expect(sent).toHaveLength(0);
    await jobs.escalateCase({
      ...row,
      alertAttempts: 3,
      alertEscalatedAt: null,
    } as never);
    expect(sent).toHaveLength(1);
    expect(sent[0].html).toContain('phone the case through');
    await jobs.escalateCase({
      ...row,
      alertAttempts: 4,
      alertEscalatedAt: new Date(),
    } as never);
    expect(sent).toHaveLength(1);
    expect(cases.markReminded).toHaveBeenCalledWith(['n1'], 'alertEscalatedAt');
  });

  it('resends what is due, cases and returns', async () => {
    const { jobs, cases, weekly } = setup();
    cases.dueForResend.mockResolvedValue([{ id: 'n1' }] as never);
    cases.resend.mockResolvedValue({ id: 'n1', alertStatus: 'sent' });
    weekly.dueForResend.mockResolvedValue([{ id: 'r1' }] as never);
    weekly.resend.mockResolvedValue({ id: 'r1', submissionStatus: 'sent' });
    expect(await jobs.resendDue()).toEqual({ cases: 1, returns: 1 });
  });
});

describe('Monday (I-3)', () => {
  it('reminds about an unsubmitted week and open signals, once per week', async () => {
    const { jobs, sent, weekly, facility } = setup();
    weekly.raiseSignals.mockResolvedValue([
      { conditionName: 'Cholera', level: 'alert', status: 'open' },
      { conditionName: 'Measles', level: 'alert', status: 'acknowledged' },
    ]);
    expect(await jobs.mondayReminders('2026-11-02')).toBe(1);
    expect(sent[0].html).toContain('2026 week 44');
    expect(sent[0].html).toContain('Cholera (alert)');
    expect(sent[0].html).not.toContain('Measles');
    expect(facility.idsrRemindedWeek).toBe('2026-W44');

    expect(await jobs.mondayReminders('2026-11-02')).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it('says nothing when the week is in and nothing is open', async () => {
    const { jobs, sent, returns } = setup();
    returns.findOne.mockResolvedValue({
      id: 'r1',
      status: 'submitted',
    } as never);
    expect(await jobs.mondayReminders('2026-11-02')).toBe(0);
    expect(sent).toHaveLength(0);
  });
});
