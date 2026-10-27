import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { base32Decode, hotp, timeStep } from './totp';
import { TotpService } from './totp.service';

/** Just enough of a repository: users kept in a map. */
function store(users: Record<string, unknown>[]) {
  const rows = new Map(
    users.map((u) => [
      u.id as string,
      { totpFailedAttempts: 0, ...u } as unknown as User,
    ]),
  );
  const repo = {
    findOne: jest.fn(async ({ where: { id } }: { where: { id: string } }) => {
      const r = rows.get(id);
      return r ? ({ ...r } as User) : null;
    }),
    update: jest.fn(async (id: string, patch: Partial<User>) => {
      rows.set(id, { ...rows.get(id)!, ...patch } as User);
    }),
  } as unknown as Repository<User>;
  return { repo, rows };
}

const config = {
  get: (k: string) => (k === 'JWT_SECRET' ? 'test-secret' : undefined),
} as ConfigService;
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const codeFor = (secret: string, offset = 0) =>
  hotp(base32Decode(secret.replace(/ /g, '')), timeStep() + offset);

async function enrolled() {
  const { repo, rows } = store([
    { id: 'nurse', email: 'nurse@a.ke', role: 'nurse', facilityId: A },
    { id: 'admin', email: 'admin@a.ke', role: 'facility_admin', facilityId: A },
    { id: 'other', email: 'admin@b.ke', role: 'facility_admin', facilityId: B },
  ]);
  const totp = new TotpService(repo, config);
  const { secret, otpauthUrl } = await totp.begin('nurse');
  // Confirmed with the previous step's code (still inside the window), so the
  // current code is unused for the sign-in tests below.
  const { backupCodes } = await totp.confirm('nurse', codeFor(secret, -1));
  return { totp, rows, secret, otpauthUrl, backupCodes };
}

describe('TotpService', () => {
  // A fixed instant mid-step, so a 30-second step cannot roll over mid-test.
  beforeEach(() =>
    jest.useFakeTimers({
      now: 1_800_000_015_000,
      doNotFake: ['nextTick', 'setImmediate'],
    }),
  );
  afterEach(() => jest.useRealTimers());

  it('sets up: a QR link and secret, then backup codes once a code is confirmed', async () => {
    const { rows, otpauthUrl, backupCodes } = await enrolled();
    const u = rows.get('nurse')!;
    expect(otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(u.totpEnabledAt).toBeInstanceOf(Date);
    expect(u.totpPendingSecret).toBeNull();
    expect(backupCodes).toHaveLength(10);
    // Stored sealed and hashed, never as given.
    expect(u.totpSecret).toMatch(/^v1:/);
    expect(u.totpBackupCodes).not.toContain(backupCodes[0]);
  });

  it('refuses a wrong code at set-up', async () => {
    const { repo } = store([
      { id: 'x', email: 'x@a.ke', role: 'nurse', facilityId: A },
    ]);
    const totp = new TotpService(repo, config);
    await totp.begin('x');
    await expect(totp.confirm('x', '000000')).rejects.toThrow(/not right/);
  });

  it('accepts a current code once, and never the same code twice', async () => {
    const { totp, rows, secret } = await enrolled();
    const code = codeFor(secret, 0);
    await expect(totp.check(rows.get('nurse')!, code)).resolves.toBe('app');
    await expect(totp.check(rows.get('nurse')!, code)).rejects.toThrow(
      /not right/,
    );
    // Nor the older code used at set-up.
    await expect(
      totp.check(rows.get('nurse')!, codeFor(secret, -1)),
    ).rejects.toThrow();
  });

  it('accepts a backup code once', async () => {
    const { totp, rows, backupCodes } = await enrolled();
    await expect(
      totp.check(rows.get('nurse')!, backupCodes[3].toLowerCase()),
    ).resolves.toBe('backup');
    await expect(
      totp.check(rows.get('nurse')!, backupCodes[3]),
    ).rejects.toThrow();
    expect(rows.get('nurse')!.totpBackupCodes).toHaveLength(9);
  });

  it('locks for 15 minutes after five wrong codes, even for a right one', async () => {
    const { totp, rows, backupCodes } = await enrolled();
    for (let i = 0; i < 4; i++)
      await expect(totp.check(rows.get('nurse')!, '000000')).rejects.toThrow(
        /left/,
      );
    await expect(totp.check(rows.get('nurse')!, '000000')).rejects.toThrow(
      /Too many/,
    );
    await expect(
      totp.check(rows.get('nurse')!, backupCodes[0]),
    ).rejects.toThrow(/Too many/);
  });

  it('is removed by its user only with proof', async () => {
    const { totp, rows, backupCodes } = await enrolled();
    await expect(totp.remove('nurse', '000000')).rejects.toThrow();
    await totp.remove('nurse', backupCodes[0]);
    expect(rows.get('nurse')!.totpEnabledAt).toBeNull();
    expect(rows.get('nurse')!.totpSecret).toBeNull();
  });

  it('is reset by an administrator of the same facility, and no other', async () => {
    const { totp, rows } = await enrolled();
    await expect(
      totp.reset(
        { id: 'other', role: 'facility_admin', facilityId: B },
        'nurse',
      ),
    ).rejects.toThrow(/not found/);
    expect(rows.get('nurse')!.totpEnabledAt).not.toBeNull();
    await totp.reset(
      { id: 'admin', role: 'facility_admin', facilityId: A },
      'nurse',
    );
    expect(rows.get('nurse')!.totpEnabledAt).toBeNull();
  });

  it('cannot be reset on oneself', async () => {
    const { totp } = await enrolled();
    await expect(
      totp.reset(
        { id: 'nurse', role: 'facility_admin', facilityId: A },
        'nurse',
      ),
    ).rejects.toThrow(/backup codes/);
  });

  it('cannot read a secret sealed under another key', async () => {
    const { rows } = await enrolled();
    const { repo } = store([
      rows.get('nurse') as unknown as Record<string, unknown>,
    ]);
    const other = new TotpService(repo, {
      get: () => 'a different secret',
    } as unknown as ConfigService);
    await expect(other.check(rows.get('nurse')!, '123456')).rejects.toThrow();
  });
});
