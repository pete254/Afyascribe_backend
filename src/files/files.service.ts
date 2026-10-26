import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import {
  DEFAULT_UPLOADS_DIR,
  pathFor,
  removeFile,
  storeFile,
  verifiedType,
} from './file-store';
import { FileKind, linkKey, signedPath } from './file-links';

/** Where the apps reach the API, for links they open directly. */
export function publicApiUrl(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): string {
  if (env.PUBLIC_API_URL) return env.PUBLIC_API_URL.replace(/\/+$/, '');
  return env.NODE_ENV === 'production'
    ? 'https://api.afyascribe.co.ke'
    : `http://localhost:${env.PORT || 3000}`;
}

@Injectable()
export class FilesService {
  readonly root: string;
  private readonly baseUrl: string;
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    this.root = config.get<string>('UPLOADS_DIR') || DEFAULT_UPLOADS_DIR;
    this.baseUrl = publicApiUrl({
      PUBLIC_API_URL: config.get<string>('PUBLIC_API_URL'),
      NODE_ENV: config.get<string>('NODE_ENV'),
      PORT: config.get<string>('PORT'),
    });
    this.key = linkKey(config.get<string>('JWT_SECRET') ?? '');
  }

  /** Check the content, store it, and return its storage key and verified type. */
  async store(
    kind: 'patients' | 'staff' | 'logos',
    facilityId: string,
    buffer: Buffer,
    claimedMime: string,
    allowed: string[],
  ): Promise<{ key: string; mime: string }> {
    const mime = verifiedType(buffer, claimedMime, allowed);
    return {
      key: await storeFile(this.root, kind, facilityId, buffer, mime),
      mime,
    };
  }

  remove(key: string | null | undefined): Promise<void> {
    return key ? removeFile(this.root, key) : Promise.resolve();
  }

  /** The file's path on disk, or null if it is missing. */
  async existing(key: string): Promise<string | null> {
    const p = pathFor(this.root, key);
    try {
      await fs.access(p);
      return p;
    } catch {
      return null;
    }
  }

  /** A link the given user can open for LINK_MINUTES. */
  link(kind: FileKind, id: string, userId: string): string {
    return this.baseUrl + signedPath(this.key, kind, id, userId);
  }

  get linkSecret(): Buffer {
    return this.key;
  }

  /**
   * Give each stored document a signed link in `fileUrl`. Rows not yet moved
   * off Cloudinary keep the address they have until deploy/import-cloudinary.js
   * moves them.
   */
  withLinks<
    T extends { id: string; storageKey: string | null; fileUrl: string | null },
  >(kind: FileKind, docs: T[], userId: string): T[] {
    for (const d of docs)
      if (d.storageKey) d.fileUrl = this.link(kind, d.id, userId);
    return docs;
  }

  /** The stable public address of a facility's logo; the version defeats stale caches after a change. */
  logoUrl(facilityId: string, version: number = Date.now()): string {
    return `${this.baseUrl}/files/logo/${facilityId}?v=${version}`;
  }
}
