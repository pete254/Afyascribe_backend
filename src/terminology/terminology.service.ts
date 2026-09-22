import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TerminologyConcept } from './entities/terminology-concept.entity';
import { OclClient } from './ocl.client';
import { SYNC_TARGETS } from './sync-targets';

export interface ConceptHit {
  system: string;
  code: string;
  display: string;
  domain: string;
  synonyms: string[];
  extras: Record<string, unknown> | null;
}

@Injectable()
export class TerminologyService {
  private readonly logger = new Logger(TerminologyService.name);

  constructor(
    @InjectRepository(TerminologyConcept)
    private readonly repo: Repository<TerminologyConcept>,
    private readonly ocl: OclClient,
  ) {}

  private toHit(c: TerminologyConcept): ConceptHit {
    return {
      system: c.system,
      code: c.code,
      display: c.display,
      domain: c.domain,
      synonyms: c.synonyms ?? [],
      extras: c.extras ?? null,
    };
  }

  /**
   * Search the local mirror by domain and/or system. Falls back to the live
   * KNHTS service when the mirror has nothing (e.g. a source not yet synced).
   */
  async search(
    params: { q: string; domain?: string; system?: string; tier?: string; limit?: number },
  ): Promise<ConceptHit[]> {
    const q = (params.q ?? '').trim();
    const limit = Math.min(params.limit ?? 20, 100);
    if (q.length < 2) return [];

    const qb = this.repo
      .createQueryBuilder('c')
      .where('c.retired = false')
      .andWhere(
        '(c.code ILIKE :exact OR c.display ILIKE :like OR EXISTS ' +
          '(SELECT 1 FROM unnest(c.synonyms) s WHERE s ILIKE :like))',
        { exact: `${q}%`, like: `%${q}%` },
      );
    if (params.domain) qb.andWhere('c.domain = :domain', { domain: params.domain });
    if (params.system) qb.andWhere('c.system = :system', { system: params.system });
    if (params.tier) qb.andWhere('c.tier = :tier', { tier: params.tier });

    const local = await qb
      .orderBy('CASE WHEN UPPER(c.code) = :ucode THEN 0 ELSE 1 END', 'ASC')
      .addOrderBy('length(c.display)', 'ASC')
      .setParameter('ucode', q.toUpperCase())
      .limit(limit)
      .getMany();

    if (local.length > 0) return local.map((c) => this.toHit(c));

    // Live fallback: search the matching KNHTS sources directly.
    return this.liveSearch(q, limit, params.domain, params.system);
  }

  private async liveSearch(
    q: string,
    limit: number,
    domain?: string,
    system?: string,
  ): Promise<ConceptHit[]> {
    const targets = SYNC_TARGETS.filter(
      (t) => (!domain || t.domain === domain) && (!system || (t.system ?? t.source) === system),
    );
    for (const t of targets) {
      try {
        const res = await this.ocl.search(t.org, t.source, q, limit);
        if (res.length) {
          return res.map((c) => ({
            system: t.system ?? t.source,
            code: c.id,
            display: c.display_name ?? c.id,
            domain: t.domain,
            synonyms: (c.names ?? []).map((n) => n.name).filter((n) => n && n !== c.display_name),
            extras: c.extras ?? null,
          }));
        }
      } catch {
        /* try next target */
      }
    }
    return [];
  }

  /** Validate that a code exists in a system. Checks the mirror, then live. */
  async validate(system: string, code: string): Promise<ConceptHit | null> {
    const local = await this.repo.findOne({ where: { system, code, retired: false } });
    if (local) return this.toHit(local);

    const target = SYNC_TARGETS.find((t) => (t.system ?? t.source) === system);
    if (!target) return null;
    const live = await this.ocl.lookup(target.org, target.source, code);
    if (!live) return null;
    return {
      system,
      code: live.id,
      display: live.display_name ?? live.id,
      domain: target.domain,
      synonyms: (live.names ?? []).map((n) => n.name),
      extras: live.extras ?? null,
    };
  }

  /** A short browse list for a domain (used before the user types a query). */
  async common(domain: string, limit = 20): Promise<ConceptHit[]> {
    const rows = await this.repo.find({
      where: { domain, retired: false },
      order: { display: 'ASC' },
      take: Math.min(limit, 100),
    });
    return rows.map((c) => this.toHit(c));
  }

  /** The code systems in the mirror, with counts — for admin/status views. */
  async systems(): Promise<{ domain: string; system: string; count: number }[]> {
    const rows = await this.repo
      .createQueryBuilder('c')
      .select('c.domain', 'domain')
      .addSelect('c.system', 'system')
      .addSelect('COUNT(*)', 'count')
      .groupBy('c.domain')
      .addGroupBy('c.system')
      .orderBy('c.domain')
      .getRawMany();
    return rows.map((r) => ({ domain: r.domain, system: r.system, count: Number(r.count) }));
  }
}
