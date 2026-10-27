import {
  base32Decode,
  base32Encode,
  hashBackupCode,
  hotp,
  newBackupCodes,
  otpauthUrl,
  timeStep,
  verifyTotp,
} from './totp';

// The RFC's own test key: the ASCII bytes "12345678901234567890".
const KEY = Buffer.from('12345678901234567890');

describe('HOTP (RFC 4226, appendix D)', () => {
  it('matches the published values', () => {
    const want = [
      '755224',
      '287082',
      '359152',
      '969429',
      '338314',
      '254676',
      '287922',
      '162583',
      '399871',
      '520489',
    ];
    want.forEach((code, counter) => expect(hotp(KEY, counter)).toBe(code));
  });
});

describe('TOTP (RFC 6238, appendix B, SHA-1)', () => {
  // The RFC lists 8-digit codes; the last 6 digits are the 6-digit code.
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('at %i seconds', (t, code8) => {
    expect(hotp(KEY, timeStep(t * 1000), 8)).toBe(code8);
    expect(verifyTotp(KEY, code8.slice(2), null, t * 1000)).toBe(
      timeStep(t * 1000),
    );
  });

  it('accepts one step either side for clock drift, and no further', () => {
    const now = 1111111109 * 1000;
    const step = timeStep(now);
    expect(verifyTotp(KEY, hotp(KEY, step - 1), null, now)).toBe(step - 1);
    expect(verifyTotp(KEY, hotp(KEY, step + 1), null, now)).toBe(step + 1);
    expect(verifyTotp(KEY, hotp(KEY, step - 2), null, now)).toBeNull();
    expect(verifyTotp(KEY, hotp(KEY, step + 2), null, now)).toBeNull();
  });

  it('refuses a code already used, or an older one', () => {
    const now = 1111111109 * 1000;
    const step = timeStep(now);
    expect(verifyTotp(KEY, hotp(KEY, step), step, now)).toBeNull();
    expect(verifyTotp(KEY, hotp(KEY, step - 1), step, now)).toBeNull();
    expect(verifyTotp(KEY, hotp(KEY, step + 1), step, now)).toBe(step + 1);
  });

  it('refuses malformed input', () => {
    expect(verifyTotp(KEY, '', null)).toBeNull();
    expect(verifyTotp(KEY, '12345', null)).toBeNull();
    expect(verifyTotp(KEY, 'abcdef', null)).toBeNull();
  });
});

describe('base32 and the otpauth link', () => {
  it('round-trips, and matches RFC 4648', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Decode('MZXW6YTBOI').toString()).toBe('foobar');
    expect(base32Decode('mzxw 6ytb oi').toString()).toBe('foobar');
  });

  it('builds the link authenticator apps expect', () => {
    const url = new URL(otpauthUrl(KEY, 'nurse@clinic.ke'));
    expect(url.protocol).toBe('otpauth:');
    expect(url.host).toBe('totp');
    expect(decodeURIComponent(url.pathname)).toBe(
      '/AfyaScribe:nurse@clinic.ke',
    );
    expect(url.searchParams.get('secret')).toBe(base32Encode(KEY));
    expect(url.searchParams.get('issuer')).toBe('AfyaScribe');
  });
});

describe('backup codes', () => {
  it('are ten distinct readable codes, matched however they are typed', () => {
    const codes = newBackupCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    codes.forEach((c) =>
      expect(c).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/),
    );
    expect(hashBackupCode(codes[0].toLowerCase().replace('-', ' '))).toBe(
      hashBackupCode(codes[0]),
    );
  });
});
