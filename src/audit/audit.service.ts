import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { AuditEvent } from './entities/audit-event.entity';

export interface LogAuditInput {
  facilityId: string | null;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  method: string;
  path: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  statusCode: number | null;
  ip: string | null;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditEvent)
    private readonly repo: Repository<AuditEvent>,
  ) {}

  /** Persist one audit line. Best-effort — never throws into the request path. */
  async log(input: LogAuditInput): Promise<void> {
    try {
      await this.repo.insert(this.repo.create(input));
    } catch {
      // Auditing must never break the action it records.
    }
  }

  /** Filtered, paginated audit ledger for a facility, newest first. */
  async list(
    facilityId: string,
    opts: {
      from?: Date;
      to?: Date;
      actorId?: string;
      entityType?: string;
      q?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ rows: AuditEvent[]; total: number }> {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
    const offset = Math.max(opts.offset ?? 0, 0);

    const qb = this.repo
      .createQueryBuilder('a')
      .where('a.facility_id = :facilityId', { facilityId })
      .orderBy('a.created_at', 'DESC')
      .take(limit)
      .skip(offset);

    if (opts.from) qb.andWhere('a.created_at >= :from', { from: opts.from });
    if (opts.to) {
      const toEnd = new Date(opts.to);
      toEnd.setHours(23, 59, 59, 999);
      qb.andWhere('a.created_at <= :to', { to: toEnd });
    }
    if (opts.actorId) qb.andWhere('a.actor_id = :actorId', { actorId: opts.actorId });
    if (opts.entityType) qb.andWhere('a.entity_type = :entityType', { entityType: opts.entityType });
    if (opts.q) {
      const like = `%${opts.q.toLowerCase()}%`;
      qb.andWhere(
        new Brackets((w) => {
          w.where('LOWER(a.action) LIKE :like', { like })
            .orWhere('LOWER(a.actor_name) LIKE :like', { like })
            .orWhere('LOWER(a.path) LIKE :like', { like });
        }),
      );
    }

    const [rows, total] = await qb.getManyAndCount();
    return { rows, total };
  }

  /** Distinct entity types seen for a facility — powers the filter dropdown. */
  async entityTypes(facilityId: string): Promise<string[]> {
    const rows = await this.repo
      .createQueryBuilder('a')
      .select('DISTINCT a.entity_type', 'entityType')
      .where('a.facility_id = :facilityId', { facilityId })
      .andWhere('a.entity_type IS NOT NULL')
      .orderBy('a.entity_type', 'ASC')
      .getRawMany();
    return rows.map((r) => r.entityType).filter(Boolean);
  }
}
