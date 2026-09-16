import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TerminologyConcept } from './entities/terminology-concept.entity';
import { OclClient, OclConcept } from './ocl.client';
import { SYNC_TARGETS, SyncTarget, findTarget } from './sync-targets';

@Injectable()
export class TerminologySyncService {
  private readonly logger = new Logger(TerminologySyncService.name);

  constructor(
    @InjectRepository(TerminologyConcept)
    private readonly repo: Repository<TerminologyConcept>,
    private readonly ocl: OclClient,
  ) {}

  private toRow(target: SyncTarget, c: OclConcept): Partial<TerminologyConcept> {
    const system = target.system ?? target.source;
    const synonyms = Array.from(
      new Set(
        (c.names ?? [])
          .map((n) => n.name?.trim())
          .filter((n): n is string => !!n && n !== c.display_name),
      ),
    );
    return {
      org: target.org,
      system,
      code: c.id,
      display: c.display_name ?? c.id,
      domain: target.domain,
      concept_class: c.concept_class ?? null,
      datatype: c.datatype ?? null,
      synonyms,
      extras: c.extras && Object.keys(c.extras).length ? c.extras : null,
      retired: !!c.retired,
      source_updated_at: c.updated_on ? new Date(c.updated_on) : null,
    };
  }

  /** Sync one org/source into the mirror. Returns how many concepts were upserted. */
  async syncSource(org: string, source: string): Promise<number> {
    const target = findTarget(org, source) ?? {
      domain: 'reference' as const,
      org,
      source,
    };
    const limit = 100;
    let page = 1;
    let total = 0;
    // Safety cap: 500 pages × 100 = 50k; LOINC needs more, so scale with size.
    const maxPages = 6000;

    this.logger.log(`🔄 Syncing ${org}/${source} → domain ${target.domain}`);
    for (; page <= maxPages; page++) {
      const batch = await this.ocl.concepts(org, source, page, limit);
      if (batch.length === 0) break;
      const rows = batch.map((c) => this.toRow(target, c));
      // Chunked upsert on the natural key.
      for (let i = 0; i < rows.length; i += 500) {
        await this.repo.upsert(rows.slice(i, i + 500) as TerminologyConcept[], ['org', 'system', 'code']);
      }
      total += batch.length;
      if (page % 10 === 0) this.logger.log(`  … ${org}/${source}: ${total} concepts`);
      if (batch.length < limit) break;
    }
    this.logger.log(`✅ ${org}/${source}: ${total} concepts synced`);
    return total;
  }

  /** Sync every non-optional target. */
  async syncAll(includeOptional = false): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const t of SYNC_TARGETS) {
      if (t.optional && !includeOptional) continue;
      out[`${t.org}/${t.source}`] = await this.syncSource(t.org, t.source);
    }
    return out;
  }
}
