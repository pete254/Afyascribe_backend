import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, scryptSync, sign, verify, createCipheriv, createDecipheriv } from 'crypto';

/**
 * Digital signatures over clinical records, with a key per practitioner.
 *
 * The point of a signature is to answer two questions later: was this record
 * altered after it was signed, and who signed it. A checksum answers the
 * first. Only a key that nobody else holds answers the second.
 *
 * ── What this does ────────────────────────────────────────────────────────
 *
 * Each practitioner has their own Ed25519 key pair. The private key is stored
 * encrypted with a key derived from a signing PIN that only they know, so a
 * signature cannot be produced without that PIN — not by an administrator, not
 * by anyone with the database, and not by this system on its own.
 *
 * ── What it does not do ───────────────────────────────────────────────────
 *
 * The PIN reaches the server to sign, so a compromised server could capture it
 * while it is in memory and sign as that practitioner afterwards. Defeating
 * that needs the key to stay on a card or in a hardware module and never
 * arrive here at all. This is materially stronger than a single server key,
 * and weaker than a smartcard; it should not be described as either.
 */

export const SIGNATURE_ALGORITHM = 'Ed25519';
const KDF = { N: 16384, r: 8, p: 1, keyLength: 32 } as const;

export interface EncryptedKey {
  /** The public half, as SPKI DER in base64. */
  publicKey: string;
  /** The private half, encrypted. */
  encryptedPrivateKey: string;
  salt: string;
  iv: string;
  authTag: string;
  /** A short, stable name for the key, for showing beside a signature. */
  fingerprint: string;
}

/** A short identifier for a public key — the first bytes of its SHA-256. */
export function fingerprint(publicKeyBase64: string): string {
  return createHash('sha256')
    .update(Buffer.from(publicKeyBase64, 'base64'))
    .digest('hex')
    .slice(0, 16);
}

const derive = (pin: string, salt: Buffer): Buffer =>
  scryptSync(pin.normalize('NFKC'), salt, KDF.keyLength, { N: KDF.N, r: KDF.r, p: KDF.p });

/**
 * Make a key pair for a practitioner and lock the private half with their PIN.
 *
 * The plain private key exists only inside this function; what comes back can
 * be stored, and cannot be used without the PIN.
 */
export function createKeyPair(pin: string): EncryptedKey {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const spki = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  const pkcs8 = privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer;

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', derive(pin, salt), iv);
  const encrypted = Buffer.concat([cipher.update(pkcs8), cipher.final()]);

  const publicKeyBase64 = spki.toString('base64');
  return {
    publicKey: publicKeyBase64,
    encryptedPrivateKey: encrypted.toString('base64'),
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    fingerprint: fingerprint(publicKeyBase64),
  };
}

/** Unlock a private key. Returns null when the PIN is wrong. */
export function unlock(key: EncryptedKey, pin: string): Buffer | null {
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      derive(pin, Buffer.from(key.salt, 'base64')),
      Buffer.from(key.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(key.authTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(key.encryptedPrivateKey, 'base64')),
      decipher.final(),
    ]);
  } catch {
    // A wrong PIN fails the authentication tag. There is nothing to
    // distinguish it from a tampered key, and both mean the same: no signing.
    return null;
  }
}

/**
 * The exact bytes a signature covers.
 *
 * Keys are sorted so two objects with the same content hash the same whatever
 * order they arrive in, and the volatile fields are dropped: a signature that
 * broke because `updatedAt` moved would break on every save and teach everyone
 * to ignore it.
 */
export function canonicalRecord(record: Record<string, unknown>, exclude: string[] = []): string {
  const skip = new Set(['updatedAt', 'createdAt', ...exclude]);

  const normalise = (value: unknown): unknown => {
    if (value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(normalise);
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(value as Record<string, unknown>).sort()) {
        if (skip.has(key)) continue;
        out[key] = normalise((value as Record<string, unknown>)[key]);
      }
      return out;
    }
    return value;
  };

  return JSON.stringify(normalise(record));
}

/** The checksum of a record — what the signature is over, and what proves it unaltered. */
export function payloadHash(canonical: string): string {
  return createHash('sha256').update(canonical).digest('hex');
}

/** Sign a hash with an unlocked private key. */
export function signHash(privateKeyDer: Buffer, hash: string): string {
  const key = createPrivateKey({ key: privateKeyDer, format: 'der', type: 'pkcs8' });
  // Ed25519 signs the message itself; the message here is the hex digest.
  return sign(null, Buffer.from(hash, 'utf8'), key).toString('base64');
}

/** Check a signature against a public key and a hash. */
export function verifySignature(publicKeyBase64: string, hash: string, signature: string): boolean {
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKeyBase64, 'base64'),
      format: 'der',
      type: 'spki',
    });
    return verify(null, Buffer.from(hash, 'utf8'), key, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}
