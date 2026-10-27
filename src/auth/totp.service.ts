import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'crypto';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import {
  base32Encode,
  hashBackupCode,
  newBackupCodes,
  newTotpSecret,
  otpauthUrl,
  verifyTotp,
} from './totp';

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

/**
 * The authenticator-app second factor: setting it up, checking it at sign-in,
 * and removing it (by its user, or by an administrator for a lost phone).
 *
 * The shared secret is sealed with AES-256-GCM before it is stored, under a
 * key derived from MFA_SECRET_KEY or, failing that, JWT_SECRET — so a copy
 * of the database alone (a backup, the off-site copy) does not yield anyone's
 * codes. Changing that key invalidates every enrolment: keep it.
 */
@Injectable()
export class TotpService {
  private readonly key: Buffer;

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    config: ConfigService,
  ) {
    const base =
      config.get<string>('MFA_SECRET_KEY') ||
      config.get<string>('JWT_SECRET') ||
      '';
    this.key = base
      ? createHmac('sha256', base).update('afyascribe totp seal v1').digest()
      : Buffer.alloc(0);
  }

  // ── Sealing ───────────────────────────────────────────────────────────────

  private seal(secret: Buffer): string {
    if (!this.key.length)
      throw new BadRequestException(
        'Two-factor set-up is not configured on this server.',
      );
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([c.update(secret), c.final()]);
    return [
      'v1',
      iv.toString('base64'),
      c.getAuthTag().toString('base64'),
      ct.toString('base64'),
    ].join(':');
  }

  private open(sealed: string): Buffer {
    const [v, iv, tag, ct] = sealed.split(':');
    if (v !== 'v1' || !this.key.length)
      throw new Error('Cannot open the authenticator secret');
    const d = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(iv, 'base64'),
    );
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]);
  }

  // ── The user's own ────────────────────────────────────────────────────────

  async status(userId: string) {
    const u = await this.users.findOne({ where: { id: userId } });
    if (!u) throw new NotFoundException();
    return {
      enabled: !!u.totpEnabledAt,
      enabledAt: u.totpEnabledAt,
      backupCodesLeft: u.totpBackupCodes?.length ?? 0,
    };
  }

  /** Start set-up: a new secret, shown once as a QR link and as text. */
  async begin(userId: string) {
    const u = await this.users.findOne({ where: { id: userId } });
    if (!u) throw new NotFoundException();
    if (u.totpEnabledAt) {
      throw new BadRequestException(
        'An authenticator app is already set up. Remove it first to set up another.',
      );
    }
    const secret = newTotpSecret();
    await this.users.update(u.id, { totpPendingSecret: this.seal(secret) });
    return {
      secret: base32Encode(secret)
        .replace(/(.{4})/g, '$1 ')
        .trim(),
      otpauthUrl: otpauthUrl(secret, u.email),
    };
  }

  /** Finish set-up with a code from the app; returns the backup codes, once. */
  async confirm(
    userId: string,
    code: string,
  ): Promise<{ backupCodes: string[] }> {
    const u = await this.users.findOne({ where: { id: userId } });
    if (!u?.totpPendingSecret)
      throw new BadRequestException('Start the set-up first.');
    const step = verifyTotp(this.open(u.totpPendingSecret), code, null);
    if (step === null)
      throw new BadRequestException(
        'That code is not right. Check the time on your phone and try the newest code.',
      );
    const backupCodes = newBackupCodes();
    await this.users.update(u.id, {
      totpSecret: u.totpPendingSecret,
      totpPendingSecret: null,
      totpEnabledAt: new Date(),
      totpLastStep: step,
      totpBackupCodes: backupCodes.map(hashBackupCode),
      totpFailedAttempts: 0,
      totpLockedUntil: null,
    });
    return { backupCodes };
  }

  /** Remove it, proving possession with a current code or a backup code. */
  async remove(userId: string, code: string): Promise<void> {
    const u = await this.users.findOne({ where: { id: userId } });
    if (!u?.totpEnabledAt)
      throw new BadRequestException('No authenticator app is set up.');
    await this.check(u, code);
    await this.clear(u.id);
  }

  // ── An administrator's ────────────────────────────────────────────────────

  /**
   * For a lost phone. A facility administrator may reset staff of their own
   * facility; the platform super administrator anyone. Nobody resets their
   * own this way — they have their backup codes.
   */
  async reset(
    admin: { id: string; role: string; facilityId?: string | null },
    targetId: string,
  ): Promise<User> {
    if (admin.id === targetId)
      throw new ForbiddenException(
        'Use one of your backup codes to remove your own.',
      );
    const u = await this.users.findOne({ where: { id: targetId } });
    if (!u) throw new NotFoundException('User not found');
    if (
      admin.role !== 'super_admin' &&
      (!admin.facilityId || u.facilityId !== admin.facilityId)
    ) {
      throw new NotFoundException('User not found');
    }
    if (u.role === 'super_admin' && admin.role !== 'super_admin')
      throw new NotFoundException('User not found');
    await this.clear(u.id);
    return u;
  }

  // ── Sign-in ───────────────────────────────────────────────────────────────

  isEnabled(user: Pick<User, 'totpEnabledAt'>): boolean {
    return !!user.totpEnabledAt;
  }

  /**
   * Check a sign-in code: the app's current code, or one of the backup codes
   * (spent on use). Five wrong codes lock the factor for fifteen minutes.
   * Returns which kind was used.
   */
  async check(user: User, code: string): Promise<'app' | 'backup'> {
    if (user.totpLockedUntil && user.totpLockedUntil > new Date()) {
      throw new UnauthorizedException(
        'Too many wrong codes. Try again in a few minutes.',
      );
    }
    if (!user.totpSecret)
      throw new UnauthorizedException('No authenticator app is set up.');

    const step = verifyTotp(
      this.open(user.totpSecret),
      code,
      user.totpLastStep ?? null,
    );
    if (step !== null) {
      await this.users.update(user.id, {
        totpLastStep: step,
        totpFailedAttempts: 0,
        totpLockedUntil: null,
      });
      return 'app';
    }

    const hash = hashBackupCode(code);
    const codes = user.totpBackupCodes ?? [];
    if (code && /[A-Za-z]/.test(code) && codes.includes(hash)) {
      await this.users.update(user.id, {
        totpBackupCodes: codes.filter((c) => c !== hash),
        totpFailedAttempts: 0,
        totpLockedUntil: null,
      });
      return 'backup';
    }

    const failures = (user.totpFailedAttempts ?? 0) + 1;
    const locked = failures >= MAX_FAILURES;
    await this.users.update(user.id, {
      totpFailedAttempts: locked ? 0 : failures,
      totpLockedUntil: locked
        ? new Date(Date.now() + LOCK_MINUTES * 60_000)
        : null,
    });
    throw new UnauthorizedException(
      locked
        ? `Too many wrong codes. Try again in ${LOCK_MINUTES} minutes.`
        : `That code is not right. ${MAX_FAILURES - failures} attempt(s) left.`,
    );
  }

  private async clear(userId: string) {
    await this.users.update(userId, {
      totpSecret: null,
      totpPendingSecret: null,
      totpEnabledAt: null,
      totpLastStep: null,
      totpBackupCodes: null,
      totpFailedAttempts: 0,
      totpLockedUntil: null,
    });
  }
}
