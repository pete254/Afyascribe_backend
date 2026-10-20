import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { RevokedSession } from './entities/revoked-session.entity';

/** Signed-out sessions, checked on every request. */
@Injectable()
export class SessionRevocationService {
  constructor(
    @InjectRepository(RevokedSession)
    private readonly repo: Repository<RevokedSession>,
  ) {}

  async revoke(sessionId: string, userId: string | null, expiresAt: Date): Promise<void> {
    await this.repo.upsert({ sessionId, userId, expiresAt }, ['sessionId']);
    // Opportunistic tidy-up: a row past its session's natural end protects
    // nothing. Never lets a failure here undo the sign-out itself.
    await this.repo.delete({ expiresAt: LessThan(new Date()) }).catch(() => undefined);
  }

  async isRevoked(sessionId: string | undefined | null): Promise<boolean> {
    // Guarded explicitly: TypeORM drops an undefined where-value, so
    // `findOne({ where: { sessionId: undefined } })` would match any row.
    if (!sessionId) return false;
    return (await this.repo.count({ where: { sessionId } })) > 0;
  }
}
