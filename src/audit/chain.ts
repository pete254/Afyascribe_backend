import { createHash } from 'crypto';

/**
 * Tamper-evidence for the audit ledger.
 *
 * Kenya's Digital Health (Health Information Management Procedures)
 * Regulations, 2025 require health data controllers to "log all user actions
 * and data access within the System in a secure and tamper-proof manner
 * including timestamps, user IDs and actions performed".
 *
 * Software cannot make a row impossible to change — anyone with the database
 * can rewrite anything. What it can do is make a change impossible to hide.
 * Every line carries the hash of the line before it, so altering or removing
 * one breaks every hash that follows, and `verifyChain` says exactly where.
 * That is what "tamper-proof" means in practice: not unchangeable, but
 * unchangeable without leaving a mark.
 */

/** The fields that are hashed. Adding a field here invalidates every old row. */
export interface ChainableEvent {
  seq: number;
  facilityId: string | null;
  actorId: string | null;
  actorRole: string | null;
  method: string;
  path: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  patientId: string | null;
  category: string;
  statusCode: number | null;
  createdAt: Date | string;
}

/** The first line has nothing before it, so it chains from a fixed root. */
export const GENESIS_HASH = '0'.repeat(64);

const iso = (v: Date | string): string =>
  typeof v === 'string' ? new Date(v).toISOString() : v.toISOString();

/**
 * The exact bytes that get hashed.
 *
 * Field order and separator are fixed and the values are not escaped away:
 * a unit separator (0x1F) is used precisely because it cannot appear in any of
 * these values, so no two different events can produce the same string.
 */
export function canonical(e: ChainableEvent): string {
  return [
    e.seq,
    e.facilityId ?? '',
    e.actorId ?? '',
    e.actorRole ?? '',
    e.method,
    e.path,
    e.action,
    e.entityType ?? '',
    e.entityId ?? '',
    e.patientId ?? '',
    e.category,
    e.statusCode ?? '',
    iso(e.createdAt),
  ].join('\u001f');
}

/** This line's hash: the previous hash and this line's content, together. */
export function hashEvent(prevHash: string, e: ChainableEvent): string {
  return createHash('sha256').update(`${prevHash}\u001e${canonical(e)}`).digest('hex');
}

export interface ChainBreak {
  seq: number;
  /** What is wrong with this line. */
  reason: 'content-altered' | 'link-broken' | 'sequence-gap' | 'missing-hash';
  detail: string;
}

export interface ChainVerdict {
  ok: boolean;
  checked: number;
  /** Every line that does not hold up, in order. */
  breaks: ChainBreak[];
  /** The range verified, so a report can say what it covers. */
  from: number | null;
  to: number | null;
}

/**
 * Walk the chain and report every line that does not hold up.
 *
 * Reports all breaks rather than stopping at the first: a single altered row
 * breaks its own hash and the link of the row after it, and an investigator
 * needs to see the whole picture to tell one edit from a rewritten range.
 *
 * `expectedStart` is the sequence the caller believes this slice begins at.
 * Without it a chain whose first rows were deleted outright would verify
 * cleanly, which is the one kind of tampering a chain must not miss.
 */
export function verifyChain(
  rows: (ChainableEvent & { hash: string | null; prevHash: string | null })[],
  expectedStart?: number,
): ChainVerdict {
  const breaks: ChainBreak[] = [];
  if (!rows.length) {
    return { ok: true, checked: 0, breaks, from: null, to: null };
  }

  const sorted = [...rows].sort((a, b) => a.seq - b.seq);
  let previous: (typeof sorted)[number] | null = null;

  if (expectedStart != null && sorted[0].seq !== expectedStart) {
    breaks.push({
      seq: sorted[0].seq,
      reason: 'sequence-gap',
      detail: `The ledger should start at ${expectedStart} but starts at ${sorted[0].seq} — ${sorted[0].seq - expectedStart} line(s) missing from the front`,
    });
  }

  for (const row of sorted) {
    if (!row.hash) {
      breaks.push({ seq: row.seq, reason: 'missing-hash', detail: 'This line carries no hash' });
      previous = row;
      continue;
    }

    // A gap in the sequence means lines were removed between these two.
    if (previous && row.seq !== previous.seq + 1) {
      breaks.push({
        seq: row.seq,
        reason: 'sequence-gap',
        detail: `Jumps from ${previous.seq} to ${row.seq} — ${row.seq - previous.seq - 1} line(s) missing`,
      });
    }

    const expectedPrev = previous ? previous.hash : (row.prevHash ?? GENESIS_HASH);
    if (previous && row.prevHash !== previous.hash) {
      breaks.push({
        seq: row.seq,
        reason: 'link-broken',
        detail: `Points at ${short(row.prevHash)} but line ${previous.seq} hashes to ${short(previous.hash)}`,
      });
    }

    // Recompute from the link this row actually claims, so an altered row is
    // reported for its own content rather than for its neighbour's.
    const recomputed = hashEvent(row.prevHash ?? GENESIS_HASH, row);
    if (recomputed !== row.hash) {
      breaks.push({
        seq: row.seq,
        reason: 'content-altered',
        detail: `Content hashes to ${short(recomputed)} but the line stores ${short(row.hash)}`,
      });
    }
    void expectedPrev;

    previous = row;
  }

  return {
    ok: breaks.length === 0,
    checked: sorted.length,
    breaks,
    from: sorted[0].seq,
    to: sorted[sorted.length - 1].seq,
  };
}

const short = (h: string | null) => (h ? `${h.slice(0, 12)}…` : 'nothing');
