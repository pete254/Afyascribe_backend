import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Uploaded files — patient documents, staff documents, facility logos — kept
 * on this server's disk, in the Docker volume mounted at UPLOADS_DIR.
 *
 * They used to go to Cloudinary, which put patient documents in the USA, at
 * public URLs anyone holding the link could open, and outside every backup.
 * Here they sit on the Kenyan server (encrypted disk), are served only through
 * the API (signed, expiring links; every opening audited), and are included in
 * the nightly encrypted backup (deploy/backup.sh), whose off-site copy is each
 * file encrypted to the backup key and kept on Cloudinary
 * (deploy/offsite-uploads.sh) — ciphertext only.
 *
 * Plain functions as well as the service, so deploy/import-cloudinary.js can
 * store files exactly as the application does.
 */

export const DEFAULT_UPLOADS_DIR = '/data/uploads';

/**
 * 9.5 MB. Each file is also kept, encrypted, on Cloudinary's free plan
 * (deploy/offsite-uploads.sh), which takes at most 10 MB per file; encryption
 * adds a few kilobytes, so the limit leaves room for it.
 */
export const MAX_UPLOAD_BYTES = 9.5 * 1024 * 1024;

/** The types we accept, by the bytes a file starts with — not by what the client claims. */
const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  'application/pdf': (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  'image/png': (b) =>
    b
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) =>
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP',
};

const EXTENSION: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** `image/jpg` is not a registered type but browsers and phones send it. */
export function normaliseMime(mime: string): string {
  return mime === 'image/jpg' ? 'image/jpeg' : mime;
}

/**
 * The type the content really is, provided it is one of `allowed`. A file
 * whose bytes do not match its claimed type is refused: an HTML page renamed
 * `.pdf` must never be stored, because it would later be served from our own
 * domain.
 */
export function verifiedType(
  buffer: Buffer,
  claimed: string,
  allowed: string[],
): string {
  const mime = normaliseMime(claimed);
  if (
    !allowed.map(normaliseMime).includes(mime) ||
    !SIGNATURES[mime]?.(buffer)
  ) {
    throw new BadRequestException(
      'Unsupported or damaged file. Allowed: JPEG, PNG, WebP, PDF',
    );
  }
  return mime;
}

/** Keys are generated here, never taken from a request — but checked anyway before touching the disk. */
const KEY = /^[a-z]+\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|png|jpg|webp)$/;

export function assertKey(key: string): void {
  if (!KEY.test(key)) throw new Error(`invalid storage key: ${key}`);
}

export function pathFor(root: string, key: string): string {
  assertKey(key);
  return path.join(root, key);
}

/**
 * Write a file and return its storage key: `<kind>/<facility id>/<random id>.<ext>`.
 * Written under a temporary name and renamed, so a crash never leaves half a
 * file under a real key; readable by the application's user alone.
 */
export async function storeFile(
  root: string,
  kind: 'patients' | 'staff' | 'logos',
  facilityId: string,
  buffer: Buffer,
  mime: string,
): Promise<string> {
  const key = `${kind}/${facilityId}/${randomUUID()}.${EXTENSION[mime]}`;
  const dest = pathFor(root, key);
  await fs.mkdir(path.dirname(dest), { recursive: true, mode: 0o700 });
  const tmp = `${dest}.partial`;
  await fs.writeFile(tmp, buffer, { mode: 0o600 });
  await fs.rename(tmp, dest);
  return key;
}

export async function removeFile(root: string, key: string): Promise<void> {
  await fs.rm(pathFor(root, key), { force: true });
}
