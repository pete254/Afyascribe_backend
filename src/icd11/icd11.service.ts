import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Icd11Code } from './entities/icd11-code.entity';
import { COMMON_ICD11_CODES } from './seeds/common-icd11-codes.seed';

@Injectable()
export class Icd11Service {
  private readonly logger = new Logger(Icd11Service.name);
  private pgTrgmAvailable: boolean | null = null;

  constructor(
    @InjectRepository(Icd11Code)
    private icd11Repository: Repository<Icd11Code>,
  ) {
    this.checkPgTrgmExtension();
  }

  /**
   * Check if pg_trgm extension is available
   */
  private async checkPgTrgmExtension(): Promise<void> {
    try {
      await this.icd11Repository.query(
        `SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'`
      );
      this.pgTrgmAvailable = true;
      this.logger.log('✅ pg_trgm extension is available');
    } catch (error) {
      this.pgTrgmAvailable = false;
      this.logger.warn('⚠️ pg_trgm extension is not available. Fuzzy search will be disabled.');
      this.logger.warn('💡 To enable fuzzy search, run: CREATE EXTENSION IF NOT EXISTS pg_trgm;');
    }
  }

  /**
   * MAIN SEARCH METHOD
   */
  async searchCodes(query: string, limit: number = 15): Promise<Icd11Code[]> {
    if (!query || query.trim().length < 2) {
      // Return most popular codes if no query
      return this.getMostUsedCodes(limit);
    }

    const normalizedQuery = query.trim().toLowerCase();

    // Search local database
    this.logger.log(`🔍 Searching local cache for: "${query}"`);
    const localResults = await this.searchLocal(normalizedQuery, limit);

    if (localResults.length > 0) {
      this.logger.log(`✅ Found ${localResults.length} results in local cache`);
      return localResults;
    }

    // If no local results and database is empty, suggest seeding
    const totalCodes = await this.icd11Repository.count();
    if (totalCodes === 0) {
      this.logger.warn(`⚠️ No ICD-11 codes in database. Please seed the database first.`);
      this.logger.warn(`💡 Call POST /icd11/seed to populate common codes`);
      return [];
    }

    // Try enhanced fuzzy search as fallback
    this.logger.log(`🔎 Trying enhanced search...`);
    const fuzzyResults = await this.enhancedSearch(normalizedQuery, limit);
    if (fuzzyResults.length > 0) {
      this.logger.log(`✅ Found ${fuzzyResults.length} results with enhanced search`);
      return fuzzyResults;
    }

    this.logger.log(`ℹ️ No results found for: "${query}"`);
    return [];
  }

  /**
   * Search local PostgreSQL database
   * Uses full-text search with ranking
   */
  private async searchLocal(query: string, limit: number): Promise<Icd11Code[]> {
    const searchPattern = `%${query}%`;

    const results = await this.icd11Repository
      .createQueryBuilder('icd11')
      .where('icd11.is_active = true')
      .andWhere(
        '(LOWER(icd11.code) LIKE :searchPattern ' +
        'OR LOWER(icd11.short_description) LIKE :searchPattern ' +
        'OR LOWER(icd11.long_description) LIKE :searchPattern ' +
        'OR EXISTS(SELECT 1 FROM unnest(icd11.search_terms) AS term WHERE LOWER(term) LIKE :searchPattern))',
        { searchPattern, query: query.toLowerCase() }
      )
      // Prioritize exact code matches
      .orderBy('CASE WHEN LOWER(icd11.code) = :exactQuery THEN 0 ELSE 1 END', 'ASC')
      .addOrderBy('icd11.usage_count', 'DESC')
      .addOrderBy('icd11.last_used_at', 'DESC')
      .setParameter('exactQuery', query.toLowerCase())
      .limit(limit)
      .getMany();

    return results;
  }

  /**
   * Enhanced search with multiple fallback strategies
   */
  private async enhancedSearch(query: string, limit: number): Promise<Icd11Code[]> {
    // Try pg_trgm fuzzy search if available
    if (this.pgTrgmAvailable) {
      try {
        const fuzzyResults = await this.fuzzySearchLocal(query, limit);
        if (fuzzyResults.length > 0) {
          return fuzzyResults;
        }
      } catch (error) {
        this.logger.error(`Fuzzy search failed: ${error.message}`);
        this.pgTrgmAvailable = false;
      }
    }

    // Fallback 1: Word-by-word search
    const words = query.split(/\s+/).filter(w => w.length > 2);
    if (words.length > 0) {
      const wordResults = await this.wordByWordSearch(words, limit);
      if (wordResults.length > 0) {
        return wordResults;
      }
    }

    // Fallback 2: Partial matching on individual words
    if (words.length > 0) {
      const partialResults = await this.partialWordSearch(words, limit);
      if (partialResults.length > 0) {
        return partialResults;
      }
    }

    return [];
  }

  /**
   * Fuzzy search using PostgreSQL trigram similarity
   * Requires pg_trgm extension
   */
  private async fuzzySearchLocal(query: string, limit: number): Promise<Icd11Code[]> {
    const results = await this.icd11Repository.query(
      `SELECT * FROM icd11_codes 
       WHERE is_active = true
       AND similarity(short_description, $1) > 0.2
       ORDER BY similarity(short_description, $1) DESC
       LIMIT $2`,
      [query, limit]
    );

    return results;
  }

  /**
   * Word-by-word search - matches all words
   */
  private async wordByWordSearch(words: string[], limit: number): Promise<Icd11Code[]> {
    let queryBuilder = this.icd11Repository
      .createQueryBuilder('icd11')
      .where('icd11.is_active = true');

    words.forEach((word, index) => {
      const pattern = `%${word}%`;
      queryBuilder = queryBuilder.andWhere(
        `(LOWER(icd11.short_description) LIKE :pattern${index} OR LOWER(icd11.long_description) LIKE :pattern${index})`,
        { [`pattern${index}`]: pattern }
      );
    });

    return queryBuilder
      .orderBy('icd11.usage_count', 'DESC')
      .limit(limit)
      .getMany();
  }

  /**
   * Partial word search - matches any word
   */
  private async partialWordSearch(words: string[], limit: number): Promise<Icd11Code[]> {
    let queryBuilder = this.icd11Repository
      .createQueryBuilder('icd11')
      .where('icd11.is_active = true');

    const conditions = words.map((word, index) => {
      return `LOWER(icd11.short_description) LIKE :pattern${index} OR LOWER(icd11.long_description) LIKE :pattern${index}`;
    }).join(' OR ');

    queryBuilder = queryBuilder.andWhere(`(${conditions})`);

    words.forEach((word, index) => {
      queryBuilder.setParameter(`pattern${index}`, `%${word}%`);
    });

    return queryBuilder
      .orderBy('icd11.usage_count', 'DESC')
      .limit(limit)
      .getMany();
  }

  /**
   * Get most frequently used codes
   */
  async getMostUsedCodes(limit: number = 20): Promise<Icd11Code[]> {
    return this.icd11Repository.find({
      where: { is_active: true, billable: true },
      order: {
        usage_count: 'DESC',
        last_used_at: 'DESC',
      },
      take: limit,
    });
  }

  /**
   * Get codes by chapter
   */
  async getCodesByChapter(chapterCode: string, limit: number = 50): Promise<Icd11Code[]> {
    return this.icd11Repository.find({
      where: { chapter_code: chapterCode, is_active: true },
      order: { code: 'ASC' },
      take: limit,
    });
  }

  /**
   * Get code details by exact code
   * Fetches from WHO API if not in local database
   */
  async getCodeDetails(code: string): Promise<Icd11Code | null> {
    // Normalize code (uppercase, remove spaces)
    const normalizedCode = code.toUpperCase().trim();

    // Search local first
    let codeEntity = await this.icd11Repository.findOne({
      where: { code: normalizedCode },
    });

    if (codeEntity) {
      // Track usage
      await this.incrementUsage(normalizedCode);
      return codeEntity;
    }

    // Curated offline set — no external WHO API lookup. If the code is not in
    // the local database it is simply not found.
    return null;
  }

  /**
   * Increment usage counter for a code
   */
  async incrementUsage(code: string): Promise<void> {
    try {
      await this.icd11Repository
        .createQueryBuilder()
        .update()
        .set({
          usage_count: () => 'usage_count + 1',
          last_used_at: new Date(),
        })
        .where('code = :code', { code })
        .execute();
    } catch (error) {
      this.logger.error(`Failed to increment usage: ${error.message}`);
    }
  }

  /**
   * Validate ICD-11 code format
   */
  validateCodeFormat(code: string): boolean {
    // ICD-11 MMS stem-code format: an alphanumeric first character, a letter,
    // then two alphanumerics, with an optional dotted extension.
    // Examples: 1A00, BA00, 5A11, 1F4Z, CA40, RA01.0, ME84.2, 8A8Z
    const regex = /^[0-9A-Z][A-Z][0-9A-Z]{2}(\.[0-9A-Z]{1,3})?$/;
    return regex.test(code.toUpperCase().trim());
  }

  /**
   * HELPER: Seed database with common ICD-11 codes
   */
  async seedCommonCodes(): Promise<void> {
    this.logger.log('🌱 Seeding common ICD-11 codes...');
    
    // Authoritative ICD-11 MMS codes pulled from the official WHO ICD API
    // (see scripts/fetch-icd11-codes.ts). Regenerate that seed file to refresh.
    const commonCodes = COMMON_ICD11_CODES;

    let seededCount = 0;
    for (const item of commonCodes) {
      const existing = await this.icd11Repository.findOne({
        where: { code: item.code },
      });

      if (!existing) {
        await this.icd11Repository.save({
          code: item.code,
          short_description: item.short_description,
          long_description: item.short_description,
          billable: true,
          is_active: true,
          search_terms: item.search_terms || [item.short_description.toLowerCase()],
        });
        seededCount++;
        this.logger.log(`✅ Seeded: ${item.code} - ${item.short_description}`);
      }
    }
    
    this.logger.log(`✅ Seeding complete - Added ${seededCount} new codes`);
  }
}