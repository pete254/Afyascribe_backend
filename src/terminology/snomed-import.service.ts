import { createReadStream, existsSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TerminologyConcept } from './entities/terminology-concept.entity';
import {
  SNOMED_ATTRIBUTION,
  SNOMED_ORG,
  SNOMED_SYSTEM,
  parseGpsLine,
  toConceptRow,
} from './snomed-gps';

export interface GpsImportResult {
  file: string;
  bytes: number;
  linesRead: number;
  imported: number;
  skipped: number;
  byDomain: Record<string, number>;
  seconds: number;
  attribution: typeof SNOMED_ATTRIBUTION;
}

/** Rows per insert. Large enough to be quick, small enough not to blow a parameter limit. */
const BATCH = 2_000;

/**
 * Loads the SNOMED CT Global Patient Set into the terminology mirror.
 *
 * The GPS is a file, not an API: SNOMED International asks you to register
 * your use and then hands you a download, so this takes a path on disk rather
 * than fetching anything. That registration is the facility's to complete —
 * it records who is using SNOMED CT and under what terms, and is not
 * something a program should submit on someone's behalf.
 *
 * The file is a few hundred thousand lines, so it is streamed and inserted in
 * batches rather than read into memory.
 */
@Injectable()
export class SnomedImportService {
  private readonly logger = new Logger(SnomedImportService.name);

  constructor(
    @InjectRepository(TerminologyConcept)
    private readonly repo: Repository<TerminologyConcept>,
  ) {}

  /** How much SNOMED is already loaded, for a status panel. */
  async status(): Promise<{
    loaded: number;
    active: number;
    byDomain: Record<string, number>;
    attribution: typeof SNOMED_ATTRIBUTION;
  }> {
    const rows = await this.repo
      .createQueryBuilder('c')
      .select('c.domain', 'domain')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COUNT(*) FILTER (WHERE c.retired = false)', 'active')
      .where('c.system = :system', { system: SNOMED_SYSTEM })
      .groupBy('c.domain')
      .getRawMany<{ domain: string; count: string; active: string }>();

    const byDomain: Record<string, number> = {};
    let loaded = 0;
    let active = 0;
    for (const r of rows) {
      byDomain[r.domain] = Number(r.count);
      loaded += Number(r.count);
      active += Number(r.active);
    }
    return { loaded, active, byDomain, attribution: SNOMED_ATTRIBUTION };
  }

  /**
   * Check the file is there and readable, synchronously.
   *
   * The import itself runs in the background, so a bad path would otherwise
   * surface as a rejected promise nobody is waiting on — the caller would be
   * told the import started and never learn that it had not.
   */
  assertReadable(path: string): { file: string; bytes: number } {
    if (!path?.trim()) throw new BadRequestException('A path to the GPS file is required');
    const file = path.trim();
    if (!existsSync(file)) {
      throw new BadRequestException(
        `No file at ${file}. Download the Global Patient Set from https://www.snomed.org/gps and give the path to the .txt it contains.`,
      );
    }
    const bytes = statSync(file).size;
    if (bytes === 0) throw new BadRequestException(`${file} is empty`);
    return { file, bytes };
  }

  /**
   * Import the GPS file at `path`.
   *
   * `activeOnly` leaves out concepts SNOMED has inactivated. The default keeps
   * them: an inactive concept still has to be readable, because a record
   * written years ago may carry it, and silently failing to resolve an old
   * code would misrepresent what a clinician actually wrote.
   */
  async importFile(path: string, opts: { activeOnly?: boolean } = {}): Promise<GpsImportResult> {
    if (!path?.trim()) throw new BadRequestException('A path to the GPS file is required');
    const file = path.trim();
    if (!existsSync(file)) {
      throw new BadRequestException(
        `No file at ${file}. Download the Global Patient Set from https://www.snomed.org/gps and give the path to the .txt it contains.`,
      );
    }

    const started = Date.now();
    const bytes = statSync(file).size;
    this.logger.log(`Importing the SNOMED GPS from ${file} (${Math.round(bytes / 1e6)} MB)`);

    const stream = createInterface({
      input: createReadStream(file, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });

    let linesRead = 0;
    let imported = 0;
    let skipped = 0;
    const byDomain: Record<string, number> = {};
    let batch: ReturnType<typeof toConceptRow>[] = [];

    const flush = async () => {
      if (!batch.length) return;
      // Re-importing a newer release should update terms in place, not
      // duplicate them; the unique index is (org, system, code).
      await this.repo
        .createQueryBuilder()
        .insert()
        .into(TerminologyConcept)
        .values(batch)
        .orUpdate(
          ['display', 'domain', 'concept_class', 'synonyms', 'extras', 'retired'],
          ['org', 'system', 'code'],
        )
        .execute();
      imported += batch.length;
      batch = [];
    };

    for await (const line of stream) {
      linesRead += 1;
      const row = parseGpsLine(line);
      if (!row) {
        skipped += 1;
        continue;
      }
      if (opts.activeOnly && !row.active) {
        skipped += 1;
        continue;
      }
      const concept = toConceptRow(row);
      byDomain[concept.domain] = (byDomain[concept.domain] ?? 0) + 1;
      batch.push(concept);
      if (batch.length >= BATCH) await flush();
    }
    await flush();

    const seconds = Math.round((Date.now() - started) / 100) / 10;
    this.logger.log(`SNOMED GPS: ${imported} concepts in ${seconds}s (${skipped} skipped)`);

    return {
      file,
      bytes,
      linesRead,
      imported,
      skipped,
      byDomain,
      seconds,
      attribution: SNOMED_ATTRIBUTION,
    };
  }

  /** Remove the whole SNOMED mirror — for reloading a release cleanly. */
  async clear(): Promise<number> {
    const res = await this.repo.delete({ org: SNOMED_ORG, system: SNOMED_SYSTEM });
    return res.affected ?? 0;
  }
}
