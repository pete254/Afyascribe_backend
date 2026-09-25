import { ChainableEvent, GENESIS_HASH, canonical, hashEvent, verifyChain } from './chain';

const event = (seq: number, over: Partial<ChainableEvent> = {}): ChainableEvent => ({
  seq,
  facilityId: 'fac-1',
  actorId: 'user-1',
  actorRole: 'nurse',
  method: 'POST',
  path: '/prescriptions',
  action: 'Created prescriptions',
  entityType: 'prescriptions',
  entityId: 'rx-1',
  patientId: 'pat-1',
  category: 'write',
  statusCode: 201,
  createdAt: new Date(Date.UTC(2026, 8, 25, 10, 0, 0) + seq * 60_000),
  ...over,
});

/** Build a well-formed ledger, the way the service does. */
function ledger(n: number, mutate: (e: ChainableEvent) => ChainableEvent = (e) => e) {
  const rows: (ChainableEvent & { hash: string; prevHash: string })[] = [];
  let prev = GENESIS_HASH;
  for (let i = 1; i <= n; i += 1) {
    const e = mutate(event(i));
    const hash = hashEvent(prev, e);
    rows.push({ ...e, hash, prevHash: prev });
    prev = hash;
  }
  return rows;
}

describe('the audit hash chain', () => {
  it('verifies a ledger nobody has touched', () => {
    const v = verifyChain(ledger(20), 1);
    expect(v.ok).toBe(true);
    expect(v.checked).toBe(20);
    expect(v.breaks).toEqual([]);
    expect(v.from).toBe(1);
    expect(v.to).toBe(20);
  });

  it('accepts an empty ledger', () => {
    expect(verifyChain([])).toEqual({ ok: true, checked: 0, breaks: [], from: null, to: null });
  });

  it('catches a line whose content was altered', () => {
    const rows = ledger(10);
    // Someone changes who did it, leaving the hash alone.
    rows[4] = { ...rows[4], actorId: 'someone-else' };

    const v = verifyChain(rows, 1);
    expect(v.ok).toBe(false);
    expect(v.breaks.some((b) => b.seq === 5 && b.reason === 'content-altered')).toBe(true);
  });

  it('catches a line altered *and* rehashed, because the next link no longer fits', () => {
    const rows = ledger(10);
    const tampered = { ...rows[4], action: 'Deleted prescriptions' };
    rows[4] = { ...tampered, hash: hashEvent(tampered.prevHash, tampered) };

    const v = verifyChain(rows, 1);
    expect(v.ok).toBe(false);
    // Line 5 now hashes correctly on its own, but line 6 still points at the old hash.
    expect(v.breaks.some((b) => b.seq === 6 && b.reason === 'link-broken')).toBe(true);
  });

  it('catches a line removed from the middle', () => {
    const rows = ledger(10);
    rows.splice(4, 1); // seq 5 deleted

    const v = verifyChain(rows, 1);
    expect(v.ok).toBe(false);
    expect(v.breaks.some((b) => b.seq === 6 && b.reason === 'sequence-gap')).toBe(true);
    expect(v.breaks.some((b) => b.seq === 6 && b.reason === 'link-broken')).toBe(true);
  });

  it('catches lines removed from the very front', () => {
    // The one kind of tampering a naive chain misses: lop off the beginning and
    // what remains is internally consistent.
    const rows = ledger(10).slice(3);
    expect(verifyChain(rows).ok).toBe(true); // without knowing where it should start
    const v = verifyChain(rows, 1);
    expect(v.ok).toBe(false);
    expect(v.breaks[0].reason).toBe('sequence-gap');
    expect(v.breaks[0].detail).toContain('3 line(s) missing from the front');
  });

  it('catches a line whose hash was stripped', () => {
    const rows = ledger(5) as unknown as (ChainableEvent & { hash: string | null; prevHash: string })[];
    rows[2] = { ...rows[2], hash: null };
    const v = verifyChain(rows, 1);
    expect(v.breaks.some((b) => b.seq === 3 && b.reason === 'missing-hash')).toBe(true);
  });

  it('reports every break, not just the first', () => {
    const rows = ledger(12);
    rows[2] = { ...rows[2], action: 'changed' };
    rows[8] = { ...rows[8], actorRole: 'admin' };
    const v = verifyChain(rows, 1);
    expect(v.breaks.filter((b) => b.reason === 'content-altered').map((b) => b.seq)).toEqual([3, 9]);
  });

  it('is order-independent — rows may arrive any way round', () => {
    const rows = ledger(8);
    const shuffled = [rows[5], rows[0], rows[7], rows[2], rows[1], rows[4], rows[3], rows[6]];
    expect(verifyChain(shuffled, 1).ok).toBe(true);
  });

  it('gives different hashes to events that differ only in one field', () => {
    const a = hashEvent(GENESIS_HASH, event(1));
    const b = hashEvent(GENESIS_HASH, event(1, { entityId: 'rx-2' }));
    expect(a).not.toBe(b);
  });

  it('cannot be fooled by shuffling text between adjacent fields', () => {
    // Without a separator that cannot occur in the values, "ab"+"c" and
    // "a"+"bc" would hash the same. The unit separator is why they do not.
    const a = canonical(event(1, { entityType: 'ab', entityId: 'c' }));
    const b = canonical(event(1, { entityType: 'a', entityId: 'bc' }));
    expect(a).not.toBe(b);
    expect(hashEvent(GENESIS_HASH, event(1, { entityType: 'ab', entityId: 'c' }))).not.toBe(
      hashEvent(GENESIS_HASH, event(1, { entityType: 'a', entityId: 'bc' })),
    );
  });

  it('hashes the timestamp, so back-dating a line breaks it', () => {
    const rows = ledger(4);
    rows[1] = { ...rows[1], createdAt: new Date('2020-01-01T00:00:00.000Z') };
    expect(verifyChain(rows, 1).breaks.some((b) => b.seq === 2 && b.reason === 'content-altered')).toBe(true);
  });

  it('treats a date and its ISO string as the same event', () => {
    const d = new Date('2026-09-25T10:01:00.000Z');
    expect(hashEvent(GENESIS_HASH, event(1, { createdAt: d }))).toBe(
      hashEvent(GENESIS_HASH, event(1, { createdAt: d.toISOString() })),
    );
  });
});
