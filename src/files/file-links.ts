import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Signed, expiring links to uploaded documents.
 *
 * The apps show a document with a plain `<img src>`, `<a href>` or, on the
 * phone, `Linking.openURL` — none of which can send the sign-in token. So when
 * the API lists documents for a signed-in user it gives each one a link that
 * carries its own proof: which file, for whom, until when, signed with a key
 * only the server holds. A link copied out of the app stops working after
 * LINK_MINUTES, and opening it is audited against the user it was issued to.
 */

export const LINK_MINUTES = 30;

export type FileKind = 'doc' | 'staff';

/** A key for links alone, derived from the token secret so no new setting is needed. */
export function linkKey(jwtSecret: string): Buffer {
  if (!jwtSecret) throw new Error('JWT_SECRET is not set');
  return createHmac('sha256', jwtSecret)
    .update('afyascribe file links v1')
    .digest();
}

function signature(
  key: Buffer,
  kind: FileKind,
  id: string,
  userId: string,
  expires: number,
): string {
  return createHmac('sha256', key)
    .update(`${kind}|${id}|${userId}|${expires}`)
    .digest('base64url');
}

export function signedPath(
  key: Buffer,
  kind: FileKind,
  id: string,
  userId: string,
  now = Date.now(),
): string {
  const e = Math.floor(now / 1000) + LINK_MINUTES * 60;
  const s = signature(key, kind, id, userId, e);
  return `/files/${kind}/${id}?u=${encodeURIComponent(userId)}&e=${e}&s=${s}`;
}

/** True only for an unexpired link signed by this server for exactly this file and user. */
export function linkValid(
  key: Buffer,
  kind: FileKind,
  id: string,
  userId: string | undefined,
  expires: string | undefined,
  sig: string | undefined,
  now = Date.now(),
): boolean {
  if (!userId || !expires || !sig || !/^\d+$/.test(expires)) return false;
  if (Number(expires) * 1000 < now) return false;
  const want = Buffer.from(signature(key, kind, id, userId, Number(expires)));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}
