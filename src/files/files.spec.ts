import { mkdtempSync, readFileSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import {
  assertKey,
  pathFor,
  removeFile,
  storeFile,
  verifiedType,
} from './file-store';
import { LINK_MINUTES, linkKey, linkValid, signedPath } from './file-links';
import { publicApiUrl } from './files.service';

const PDF = Buffer.from('%PDF-1.7\n...');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const WEBP = Buffer.from('RIFF\0\0\0\0WEBPVP8 ');
const HTML = Buffer.from('<html><script>alert(1)</script></html>');
const DOCS = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
];
const FACILITY = '11111111-2222-4333-8444-555555555555';
const DOC = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const USER = '99999999-8888-4777-8666-555555555555';

describe('verifiedType', () => {
  it('accepts each allowed type when the bytes match', () => {
    expect(verifiedType(PDF, 'application/pdf', DOCS)).toBe('application/pdf');
    expect(verifiedType(PNG, 'image/png', DOCS)).toBe('image/png');
    expect(verifiedType(JPEG, 'image/jpg', DOCS)).toBe('image/jpeg');
    expect(verifiedType(WEBP, 'image/webp', DOCS)).toBe('image/webp');
  });

  it('refuses a file whose bytes are not what it claims', () => {
    expect(() => verifiedType(HTML, 'application/pdf', DOCS)).toThrow();
    expect(() => verifiedType(PDF, 'image/png', DOCS)).toThrow();
  });

  it('refuses a type that is not allowed here', () => {
    expect(() => verifiedType(PDF, 'application/pdf', ['image/png'])).toThrow();
    expect(() => verifiedType(HTML, 'text/html', DOCS)).toThrow();
  });
});

describe('storage keys', () => {
  it('refuses anything that could leave the uploads folder', () => {
    expect(() => assertKey(`patients/${FACILITY}/../../etc/passwd`)).toThrow();
    expect(() => pathFor('/data/uploads', '../x')).toThrow();
    expect(() => assertKey(`patients/${FACILITY}/${DOC}.html`)).toThrow();
  });
});

describe('storeFile / removeFile', () => {
  let root: string;
  beforeEach(() => (root = mkdtempSync(path.join(tmpdir(), 'uploads-'))));
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('stores the bytes under a fresh key, readable by the owner only, and removes them', async () => {
    const key = await storeFile(
      root,
      'patients',
      FACILITY,
      PDF,
      'application/pdf',
    );
    expect(key).toMatch(
      new RegExp(`^patients/${FACILITY}/[0-9a-f-]{36}\\.pdf$`),
    );
    const file = pathFor(root, key);
    expect(readFileSync(file).equals(PDF)).toBe(true);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    await removeFile(root, key);
    expect(() => statSync(file)).toThrow();
  });

  it('never reuses a key', async () => {
    const a = await storeFile(root, 'staff', FACILITY, PNG, 'image/png');
    const b = await storeFile(root, 'staff', FACILITY, PNG, 'image/png');
    expect(a).not.toBe(b);
  });
});

describe('signed links', () => {
  const key = linkKey('test-secret');
  const now = Date.UTC(2026, 9, 26, 8, 0, 0);
  const parse = (p: string) =>
    Object.fromEntries(new URL(p, 'https://x').searchParams);

  it('opens the file it was issued for, for the user it was issued to', () => {
    const q = parse(signedPath(key, 'doc', DOC, USER, now));
    expect(linkValid(key, 'doc', DOC, q.u, q.e, q.s, now + 60_000)).toBe(true);
  });

  it('expires', () => {
    const q = parse(signedPath(key, 'doc', DOC, USER, now));
    expect(
      linkValid(
        key,
        'doc',
        DOC,
        q.u,
        q.e,
        q.s,
        now + (LINK_MINUTES + 1) * 60_000,
      ),
    ).toBe(false);
  });

  it('cannot be moved to another file, kind or user, or extended', () => {
    const q = parse(signedPath(key, 'doc', DOC, USER, now));
    expect(linkValid(key, 'doc', USER, q.u, q.e, q.s, now)).toBe(false);
    expect(linkValid(key, 'staff', DOC, q.u, q.e, q.s, now)).toBe(false);
    expect(linkValid(key, 'doc', DOC, FACILITY, q.e, q.s, now)).toBe(false);
    expect(
      linkValid(key, 'doc', DOC, q.u, String(Number(q.e) + 3600), q.s, now),
    ).toBe(false);
  });

  it('is refused under another server secret, or with parts missing', () => {
    const q = parse(signedPath(key, 'doc', DOC, USER, now));
    expect(linkValid(linkKey('other'), 'doc', DOC, q.u, q.e, q.s, now)).toBe(
      false,
    );
    expect(linkValid(key, 'doc', DOC, q.u, q.e, undefined, now)).toBe(false);
    expect(linkValid(key, 'doc', DOC, undefined, q.e, q.s, now)).toBe(false);
  });

  it('needs a secret', () => {
    expect(() => linkKey('')).toThrow();
  });
});

describe('publicApiUrl', () => {
  it('uses the setting, else the production address, else localhost', () => {
    expect(publicApiUrl({ PUBLIC_API_URL: 'https://api.example.ke/' })).toBe(
      'https://api.example.ke',
    );
    expect(publicApiUrl({ NODE_ENV: 'production' })).toBe(
      'https://api.afyascribe.co.ke',
    );
    expect(publicApiUrl({ PORT: '4000' })).toBe('http://localhost:4000');
  });
});
