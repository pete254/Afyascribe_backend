import {
  SIGNATURE_ALGORITHM,
  canonicalRecord,
  createKeyPair,
  fingerprint,
  payloadHash,
  signHash,
  unlock,
  verifySignature,
} from './signing';

const PIN = 'correct horse battery';

describe('a practitioner key pair', () => {
  it('locks the private key with the PIN', () => {
    const key = createKeyPair(PIN);
    expect(key.publicKey.length).toBeGreaterThan(20);
    expect(unlock(key, PIN)).not.toBeNull();
  });

  it('cannot be unlocked with the wrong PIN', () => {
    // This is the whole point: without the practitioner's PIN nobody signs —
    // not an administrator, not anyone holding the database.
    const key = createKeyPair(PIN);
    expect(unlock(key, 'wrong')).toBeNull();
    expect(unlock(key, `${PIN} `)).toBeNull();
    expect(unlock(key, '')).toBeNull();
  });

  it('cannot be unlocked after the stored key is tampered with', () => {
    const key = createKeyPair(PIN);
    const bytes = Buffer.from(key.encryptedPrivateKey, 'base64');
    bytes[0] ^= 0xff;
    expect(unlock({ ...key, encryptedPrivateKey: bytes.toString('base64') }, PIN)).toBeNull();
  });

  it('gives every practitioner a different key', () => {
    const a = createKeyPair(PIN);
    const b = createKeyPair(PIN);
    expect(a.publicKey).not.toBe(b.publicKey);
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it('names a key by its public half, stably', () => {
    const key = createKeyPair(PIN);
    expect(fingerprint(key.publicKey)).toBe(key.fingerprint);
    expect(key.fingerprint).toHaveLength(16);
  });
});

describe('signing and verifying', () => {
  it('verifies a signature it made', () => {
    const key = createKeyPair(PIN);
    const hash = payloadHash(canonicalRecord({ dose: '500 mg' }));
    const signature = signHash(unlock(key, PIN)!, hash);
    expect(verifySignature(key.publicKey, hash, signature)).toBe(true);
  });

  it('rejects a signature over different content', () => {
    // The record was altered after signing — which is the question a signature
    // exists to answer.
    const key = createKeyPair(PIN);
    const signed = payloadHash(canonicalRecord({ dose: '500 mg' }));
    const altered = payloadHash(canonicalRecord({ dose: '5 g' }));
    const signature = signHash(unlock(key, PIN)!, signed);
    expect(verifySignature(key.publicKey, altered, signature)).toBe(false);
  });

  it("rejects another practitioner's signature", () => {
    const mine = createKeyPair(PIN);
    const theirs = createKeyPair('another pin entirely');
    const hash = payloadHash(canonicalRecord({ dose: '500 mg' }));
    const signature = signHash(unlock(theirs, 'another pin entirely')!, hash);
    expect(verifySignature(mine.publicKey, hash, signature)).toBe(false);
  });

  it('rejects a mangled signature rather than throwing', () => {
    const key = createKeyPair(PIN);
    const hash = payloadHash(canonicalRecord({ a: 1 }));
    expect(verifySignature(key.publicKey, hash, 'not-a-signature')).toBe(false);
    expect(verifySignature('not-a-key', hash, 'AAAA')).toBe(false);
  });

  it('uses Ed25519', () => {
    expect(SIGNATURE_ALGORITHM).toBe('Ed25519');
  });
});

describe('what the signature covers', () => {
  it('does not depend on the order the fields arrive in', () => {
    expect(canonicalRecord({ b: 2, a: 1 })).toBe(canonicalRecord({ a: 1, b: 2 }));
    expect(canonicalRecord({ x: { q: 1, p: 2 } })).toBe(canonicalRecord({ x: { p: 2, q: 1 } }));
  });

  it('ignores the timestamps a save moves on its own', () => {
    // A signature that broke every time `updatedAt` changed would break on
    // every save, and everyone would learn to ignore it.
    const a = canonicalRecord({ dose: '500 mg', updatedAt: new Date('2026-01-01') });
    const b = canonicalRecord({ dose: '500 mg', updatedAt: new Date('2026-06-01') });
    expect(a).toBe(b);
  });

  it('notices a change anywhere in the record', () => {
    const base = { dose: '500 mg', route: 'oral', items: [{ name: 'x', qty: 1 }] };
    const hash = payloadHash(canonicalRecord(base));
    expect(payloadHash(canonicalRecord({ ...base, route: 'IV' }))).not.toBe(hash);
    expect(payloadHash(canonicalRecord({ ...base, items: [{ name: 'x', qty: 2 }] }))).not.toBe(hash);
  });

  it('treats a missing field and a null one alike', () => {
    expect(canonicalRecord({ a: 1, b: undefined })).toBe(canonicalRecord({ a: 1, b: null }));
  });

  it('can be told to ignore further fields', () => {
    expect(canonicalRecord({ a: 1, signedAt: 'x' }, ['signedAt'])).toBe(canonicalRecord({ a: 1 }));
  });

  it('gives a hex digest of a fixed length', () => {
    expect(payloadHash(canonicalRecord({ a: 1 }))).toMatch(/^[0-9a-f]{64}$/);
  });
});
