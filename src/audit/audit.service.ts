import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';
import { AuditEvent } from './entities/audit-event.entity';
import { AuditReview } from './entities/audit-review.entity';
import { ChainVerdict, GENESIS_HASH, hashEvent, verifyChain } from './chain';

/**
 * Kenya's Digital Health (Health Information Management Procedures)
 * Regulations, 2025 set the minimum retention for audit logs. Nothing in this
 * system prunes the ledger; the figure is recorded so a reviewer can see the
 * obligation the design is meeting.
 */
export const AUDIT_RETENTION_YEARS = 20;

/** One lock for the whole ledger, so concurrent writes cannot interleave and
 *  leave two lines claiming the same predecessor. */
const CHAIN_LOCK_KEY = 4_820_115;

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
  /** 'read' or 'write'; the regulations require both. */
  category?: string;
  /** The patient whose record was touched, where the route names one. */
  patientId?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditEvent)
    private readonly repo: Repository<AuditEvent>,
    @InjectRepository(AuditReview)
    private readonly reviews: Repository<AuditReview>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Persist one audit line, chained to the one before it.
   *
   * Best-effort: auditing must never break the action it records. But a
   * failure is logged loudly rather than swallowed, because a ledger that has
   * quietly stopped recording is worse than one that is obviously broken.
   */
  async log(input: LogAuditInput): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        // Serialise the chain's tail. Without this two concurrent writes can
        // read the same last row and both claim to follow it.
        await manager.query('SELECT pg_advisory_xact_lock($1)', [CHAIN_LOCK_KEY]);

        const [last] = (await manager.query(
          'SELECT seq, hash FROM audit_events ORDER BY seq DESC NULLS LAST LIMIT 1',
        )) as { seq: string | null; hash: string | null }[];

        const seq = Number(last?.seq ?? 0) + 1;
        const prevHash = last?.hash ?? GENESIS_HASH;
        const createdAt = new Date();

        const chainable = {
          seq,
          facilityId: input.facilityId,
          actorId: input.actorId,
          actorRole: input.actorRole,
          method: input.method,
          path: input.path,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          patientId: input.patientId ?? null,
          category: input.category ?? 'write',
          statusCode: input.statusCode,
          createdAt,
        };

        await manager.insert(AuditEvent, {
          ...input,
          category: chainable.category,
          patientId: chainable.patientId,
          seq: String(seq),
          prevHash,
          hash: hashEvent(prevHash, chainable),
          createdAt,
        });
      });
    } catch (err) {
      this.logger.error(`Audit line not written: ${(err as Error).message}`);
    }
  }

  /**
   * Walk the ledger and report anything that does not hold up.
   *
   * Reads in batches so a ledger years long can still be verified without
   * pulling it all into memory at once.
   */
  async verify(
    opts: { from?: number; to?: number } = {},
  ): Promise<ChainVerdict & { retentionYears: number; unchained: number }> {
    const batchSize = 5_000;
    const start = opts.from ?? 1;
    let cursor = start;
    const breaks: ChainVerdict['breaks'] = [];
    let checked = 0;
    let first: number | null = null;
    let last: number | null = null;
    let carried: { seq: number; hash: string | null } | null = null;

    for (;;) {
      const qb = this.repo
        .createQueryBuilder('a')
        .where('a.seq >= :cursor', { cursor })
        .orderBy('a.seq', 'ASC')
        .take(batchSize);
      if (opts.to != null) qb.andWhere('a.seq <= :to', { to: opts.to });

      const rows = await qb.getMany();
      if (!rows.length) break;

      const mapped = rows.map((r) => ({
        seq: Number(r.seq),
        facilityId: r.facilityId,
        actorId: r.actorId,
        actorRole: r.actorRole,
        method: r.method,
        path: r.path,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        patientId: r.patientId,
        category: r.category,
        statusCode: r.statusCode,
        createdAt: r.createdAt,
        hash: r.hash,
        prevHash: r.prevHash,
      }));

      // Each batch after the first must link back to the one before it.
      if (carried && mapped[0].prevHash !== carried.hash) {
        breaks.push({
          seq: mapped[0].seq,
          reason: 'link-broken',
          detail: `Does not follow line ${carried.seq}`,
        });
      }

      const verdict = verifyChain(mapped, carried ? undefined : start);
      breaks.push(...verdict.breaks);
      checked += verdict.checked;
      if (first == null) first = verdict.from;
      last = verdict.to;

      const tail = mapped[mapped.length - 1];
      carried = { seq: tail.seq, hash: tail.hash };
      cursor = tail.seq + 1;
      if (rows.length < batchSize) break;
    }

    // Lines written before the ledger was hardened carry no sequence and so no
    // hash. They are counted and reported rather than quietly skipped: claiming
    // a clean verdict over a period that was never protected would be the same
    // dishonesty the chain exists to prevent.
    const unchained = await this.repo.createQueryBuilder('a').where('a.seq IS NULL').getCount();

    return {
      ok: breaks.length === 0,
      checked,
      breaks,
      from: first,
      to: last,
      retentionYears: AUDIT_RETENTION_YEARS,
      unchained,
    };
  }

  /** Everyone who has touched one patient's record, newest first. */
  async patientAccess(
    facilityId: string,
    patientId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<{ rows: AuditEvent[]; total: number }> {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
    const [rows, total] = await this.repo
      .createQueryBuilder('a')
      .where('a.facility_id = :facilityId', { facilityId })
      .andWhere('a.patient_id = :patientId', { patientId })
      .orderBy('a.created_at', 'DESC')
      .take(limit)
      .skip(Math.max(opts.offset ?? 0, 0))
      .getManyAndCount();
    return { rows, total };
  }

  /** Filtered, paginated audit ledger for a facility, newest first. */
  async list(
    facilityId: string,
    opts: {
      from?: Date;
      to?: Date;
      actorId?: string;
      entityType?: string;
      category?: string;
      patientId?: string;
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
    if (opts.category) qb.andWhere('a.category = :category', { category: opts.category });
    if (opts.patientId) qb.andWhere('a.patient_id = :patientId', { patientId: opts.patientId });
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

  // ── The quarterly review ──────────────────────────────────────────────────

  /**
   * Record that the log was reviewed, verifying the chain as part of it.
   *
   * The verification is run here rather than trusted from the caller, so the
   * verdict stored against a review is one the system produced, not one a
   * reviewer typed.
   */
  async recordReview(
    facilityId: string,
    input: {
      periodFrom: string;
      periodTo: string;
      concernsFound?: boolean;
      findings?: string;
      reviewedById?: string | null;
      reviewedByName?: string | null;
    },
  ): Promise<AuditReview> {
    const from = new Date(input.periodFrom);
    const to = new Date(input.periodTo);
    to.setHours(23, 59, 59, 999);

    const linesReviewed = await this.repo
      .createQueryBuilder('a')
      .where('a.facility_id = :facilityId', { facilityId })
      .andWhere('a.created_at >= :from', { from })
      .andWhere('a.created_at <= :to', { to })
      .getCount();

    const verdict = await this.verify();

    return this.reviews.save(
      this.reviews.create({
        facilityId,
        periodFrom: input.periodFrom,
        periodTo: input.periodTo,
        reviewedById: input.reviewedById ?? null,
        reviewedByName: input.reviewedByName ?? null,
        linesReviewed,
        chainOk: verdict.ok,
        chainVerdict: verdict,
        concernsFound: input.concernsFound ?? false,
        findings: input.findings?.trim() || null,
      }),
    );
  }

  /** Past reviews, newest first, with when the next one falls due. */
  async reviewHistory(facilityId: string): Promise<{
    reviews: AuditReview[];
    lastReviewedTo: string | null;
    nextDue: string | null;
    overdue: boolean;
  }> {
    const reviews = await this.reviews.find({
      where: { facilityId },
      order: { periodTo: 'DESC' },
      take: 40,
    });

    const lastReviewedTo = reviews[0]?.periodTo ?? null;
    if (!lastReviewedTo) {
      return { reviews, lastReviewedTo: null, nextDue: null, overdue: false };
    }

    // Quarterly: three months on from the end of the period last reviewed.
    const due = new Date(`${lastReviewedTo}T00:00:00Z`);
    due.setUTCMonth(due.getUTCMonth() + 3);
    const nextDue = due.toISOString().slice(0, 10);
    return { reviews, lastReviewedTo, nextDue, overdue: nextDue < new Date().toISOString().slice(0, 10) };
  }
}