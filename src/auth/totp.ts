import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'crypto';

/**
 * Time-based one-time passwords (RFC 6238, over RFC 4226): the codes an
 * authenticator app — Google Authenticator, Microsoft Authenticator, Authy —
 * shows. SHA-1, 6 digits, 30-second steps: the parameters every such app
 * assumes when an otpauth:// link says nothing else.
 *
 * Small enough to own rather than import, and checked against the RFC's own
 * test vectors (totp.spec.ts).
 */

export const TOTP_PERIOD = 30;
export const TOTP_DIGITS = 6;
/** Steps either side of now accepted, for a phone clock a little off. */
export const TOTP_WINDOW = 1;

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('Not base32');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new shared secret: 160 bits, the size RFC 4226 recommends for SHA-1. */
export function newTotpSecret(): Buffer {
  return randomBytes(20);
}

/** RFC 4226 HOTP. */
export function hotp(
  key: Buffer,
  counter: number,
  digits = TOTP_DIGITS,
): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', key).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export function timeStep(now = Date.now()): number {
  return Math.floor(now / 1000 / TOTP_PERIOD);
}

/**
 * The time step a code belongs to, or null if it is wrong. A step at or
 * before `lastUsedStep` is refused, so a code seen over a shoulder or caught
 * in transit cannot be used a second time.
 */
export function verifyTotp(
  key: Buffer,
  code: string,
  lastUsedStep: number | null,
  now = Date.now(),
): number | null {
  const given = (code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(given)) return null;
  const current = timeStep(now);
  for (
    let step = current - TOTP_WINDOW;
    step <= current + TOTP_WINDOW;
    step++
  ) {
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    const want = Buffer.from(hotp(key, step));
    if (timingSafeEqual(want, Buffer.from(given))) return step;
  }
  return null;
}

/** The link an authenticator app reads from the QR code. */
export function otpauthUrl(
  key: Buffer,
  account: string,
  issuer = 'AfyaScribe',
): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: base32Encode(key),
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ── Backup codes ────────────────────────────────────────────────────────────
// For a lost phone: ten single-use codes, shown once. Only their hashes are
// kept. 40 random bits each is ample for a code that is also rate-limited.

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O, 1/I

export function newBackupCodes(n = 10): string[] {
  return Array.from({ length: n }, () => {
    let s = '';
    for (let i = 0; i < 8; i++)
      s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}

export function normaliseBackupCode(code: string): string {
  return (code ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function hashBackupCode(code: string): string {
  return createHash('sha256').update(normaliseBackupCode(code)).digest('hex');
}
