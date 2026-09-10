import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Icd11Code } from './entities/icd11-code.entity';

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
    
    // NOTE: Curated ICD-11 MMS stem codes for offline use, compiled for common
    // East-African primary-care presentations. Verify each code against the
    // official WHO ICD-11 MMS (https://icd.who.int/browse11) before clinical rollout.
    const commonCodes: { code: string; shortDesc: string; chapterCode: string; searchTerms: string[] }[] = [
      // ── Infectious or parasitic diseases (Chapter 01) ──
      { code: '1A00', shortDesc: 'Cholera', chapterCode: '01', searchTerms: ['cholera', 'vibrio'] },
      { code: '1A07', shortDesc: 'Typhoid fever', chapterCode: '01', searchTerms: ['typhoid', 'enteric fever', 'salmonella typhi'] },
      { code: '1A40', shortDesc: 'Gastroenteritis or colitis of infectious origin', chapterCode: '01', searchTerms: ['gastroenteritis', 'diarrhoea', 'diarrhea', 'stomach infection', 'colitis'] },
      { code: '1B10', shortDesc: 'Respiratory tuberculosis', chapterCode: '01', searchTerms: ['tb', 'tuberculosis', 'pulmonary tb', 'lung tb'] },
      { code: '1B1Z', shortDesc: 'Tuberculosis, unspecified', chapterCode: '01', searchTerms: ['tb', 'tuberculosis'] },
      { code: '1C62', shortDesc: 'Human immunodeficiency virus disease', chapterCode: '01', searchTerms: ['hiv', 'aids', 'immunodeficiency'] },
      { code: '1F40', shortDesc: 'Plasmodium falciparum malaria', chapterCode: '01', searchTerms: ['malaria', 'falciparum'] },
      { code: '1F41', shortDesc: 'Plasmodium vivax malaria', chapterCode: '01', searchTerms: ['malaria', 'vivax'] },
      { code: '1F42', shortDesc: 'Plasmodium malariae malaria', chapterCode: '01', searchTerms: ['malaria', 'malariae'] },
      { code: '1F4Z', shortDesc: 'Malaria, unspecified', chapterCode: '01', searchTerms: ['malaria'] },

      // ── Blood or blood-forming organs (Chapter 03) ──
      { code: '3A00', shortDesc: 'Iron deficiency anaemia', chapterCode: '03', searchTerms: ['anaemia', 'anemia', 'iron deficiency'] },
      { code: '3A9Z', shortDesc: 'Anaemia, unspecified', chapterCode: '03', searchTerms: ['anaemia', 'anemia'] },

      // ── Endocrine, nutritional or metabolic (Chapter 05) ──
      { code: '5A10', shortDesc: 'Type 1 diabetes mellitus', chapterCode: '05', searchTerms: ['diabetes', 'type 1', 't1dm', 'insulin dependent'] },
      { code: '5A11', shortDesc: 'Type 2 diabetes mellitus', chapterCode: '05', searchTerms: ['diabetes', 'type 2', 't2dm', 'sugar'] },

      // ── Mental, behavioural or neurodevelopmental (Chapter 06) ──
      { code: '6A70', shortDesc: 'Single episode depressive disorder', chapterCode: '06', searchTerms: ['depression', 'depressive', 'low mood'] },
      { code: '6A71', shortDesc: 'Recurrent depressive disorder', chapterCode: '06', searchTerms: ['depression', 'recurrent depression'] },
      { code: '6B00', shortDesc: 'Generalised anxiety disorder', chapterCode: '06', searchTerms: ['anxiety', 'gad', 'worry'] },

      // ── Nervous system (Chapter 08) ──
      { code: '8A80', shortDesc: 'Migraine', chapterCode: '08', searchTerms: ['migraine', 'headache'] },

      // ── Visual system (Chapter 09) ──
      { code: '9A60', shortDesc: 'Conjunctivitis', chapterCode: '09', searchTerms: ['conjunctivitis', 'red eye', 'pink eye'] },

      // ── Circulatory system (Chapter 11) ──
      { code: 'BA00', shortDesc: 'Essential hypertension', chapterCode: '11', searchTerms: ['hypertension', 'high blood pressure', 'hbp', 'bp'] },
      { code: 'BA01', shortDesc: 'Hypertensive heart disease', chapterCode: '11', searchTerms: ['hypertensive heart disease', 'hypertension'] },

      // ── Respiratory system (Chapter 12) ──
      { code: 'CA00', shortDesc: 'Acute nasopharyngitis', chapterCode: '12', searchTerms: ['common cold', 'cold', 'coryza', 'runny nose'] },
      { code: 'CA07', shortDesc: 'Acute upper respiratory infection', chapterCode: '12', searchTerms: ['uri', 'upper respiratory infection', 'flu', 'cough'] },
      { code: 'CA20', shortDesc: 'Acute bronchitis', chapterCode: '12', searchTerms: ['bronchitis', 'chest infection'] },
      { code: 'CA22', shortDesc: 'Chronic obstructive pulmonary disease', chapterCode: '12', searchTerms: ['copd', 'chronic bronchitis', 'emphysema'] },
      { code: 'CA23', shortDesc: 'Asthma', chapterCode: '12', searchTerms: ['asthma', 'wheezing', 'bronchial'] },
      { code: 'CA40', shortDesc: 'Pneumonia', chapterCode: '12', searchTerms: ['pneumonia', 'lung infection', 'chest infection'] },

      // ── Digestive system (Chapter 13) ──
      { code: 'DA42', shortDesc: 'Gastritis', chapterCode: '13', searchTerms: ['gastritis', 'stomach inflammation'] },
      { code: 'DA63', shortDesc: 'Peptic ulcer, site unspecified', chapterCode: '13', searchTerms: ['peptic ulcer', 'ulcer', 'stomach ulcer'] },

      // ── Musculoskeletal system (Chapter 15) ──
      { code: 'FA0Z', shortDesc: 'Osteoarthritis, unspecified', chapterCode: '15', searchTerms: ['osteoarthritis', 'arthritis', 'joint pain'] },

      // ── Genitourinary system (Chapter 16) ──
      { code: 'GC08', shortDesc: 'Urinary tract infection, site not specified', chapterCode: '16', searchTerms: ['uti', 'urinary tract infection', 'bladder infection'] },

      // ── Symptoms, signs or clinical findings (Chapter 21) ──
      { code: 'MG26', shortDesc: 'Fever', chapterCode: '21', searchTerms: ['fever', 'pyrexia', 'high temperature'] },
      { code: 'ME84.2', shortDesc: 'Low back pain', chapterCode: '21', searchTerms: ['low back pain', 'lumbago', 'back pain'] },

      // ── Codes for special purposes (Chapter 22) ──
      { code: 'RA01.0', shortDesc: 'COVID-19, virus identified', chapterCode: '22', searchTerms: ['covid', 'coronavirus', 'covid-19', 'sars-cov-2'] },
      { code: 'RA01.1', shortDesc: 'COVID-19, virus not identified', chapterCode: '22', searchTerms: ['covid', 'suspected covid', 'covid-19'] },
    ];

    let seededCount = 0;
    for (const item of commonCodes) {
      const existing = await this.icd11Repository.findOne({
        where: { code: item.code },
      });

      if (!existing) {
        await this.icd11Repository.save({
          code: item.code,
          short_description: item.shortDesc,
          long_description: item.shortDesc,
          chapter_code: item.chapterCode,
          billable: true,
          is_active: true,
          search_terms: item.searchTerms || [item.shortDesc.toLowerCase()],
        });
        seededCount++;
        this.logger.log(`✅ Seeded: ${item.code} - ${item.shortDesc}`);
      }
    }
    
    this.logger.log(`✅ Seeding complete - Added ${seededCount} new codes`);
  }
}