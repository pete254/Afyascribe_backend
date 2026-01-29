import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, In } from 'typeorm';
import { Icd10Code } from './entities/icd10-code.entity';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

interface WhoApiEntity {
  '@id': string;
  title: {
    '@value': string;
  } | string;
  definition?: {
    '@value': string;
  } | string;
  code?: string;
  theCode?: string;
}

@Injectable()
export class Icd10Service {
  private readonly logger = new Logger(Icd10Service.name);
  private apiToken: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private readonly WHO_API_BASE = 'https://id.who.int/icd/release/10/2019';
  private readonly TOKEN_ENDPOINT = 'https://icdaccessmanagement.who.int/connect/token';
  private pgTrgmAvailable: boolean | null = null;

  constructor(
    @InjectRepository(Icd10Code)
    private icd10Repository: Repository<Icd10Code>,
    private configService: ConfigService,
  ) {
    this.checkPgTrgmExtension();
  }

  /**
   * Check if pg_trgm extension is available
   */
  private async checkPgTrgmExtension(): Promise<void> {
    try {
      await this.icd10Repository.query(
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
  async searchCodes(query: string, limit: number = 15): Promise<Icd10Code[]> {
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
    const totalCodes = await this.icd10Repository.count();
    if (totalCodes === 0) {
      this.logger.warn(`⚠️ No ICD-10 codes in database. Please seed the database first.`);
      this.logger.warn(`💡 Call POST /icd10/seed to populate common codes`);
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
  private async searchLocal(query: string, limit: number): Promise<Icd10Code[]> {
    const searchPattern = `%${query}%`;

    const results = await this.icd10Repository
      .createQueryBuilder('icd10')
      .where('icd10.is_active = true')
      .andWhere(
        '(LOWER(icd10.code) LIKE :searchPattern ' +
        'OR LOWER(icd10.short_description) LIKE :searchPattern ' +
        'OR LOWER(icd10.long_description) LIKE :searchPattern ' +
        'OR EXISTS(SELECT 1 FROM unnest(icd10.search_terms) AS term WHERE LOWER(term) LIKE :searchPattern))',
        { searchPattern, query: query.toLowerCase() }
      )
      // Prioritize exact code matches
      .orderBy('CASE WHEN LOWER(icd10.code) = :exactQuery THEN 0 ELSE 1 END', 'ASC')
      .addOrderBy('icd10.usage_count', 'DESC')
      .addOrderBy('icd10.last_used_at', 'DESC')
      .setParameter('exactQuery', query.toLowerCase())
      .limit(limit)
      .getMany();

    return results;
  }

  /**
   * Enhanced search with multiple fallback strategies
   */
  private async enhancedSearch(query: string, limit: number): Promise<Icd10Code[]> {
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
  private async fuzzySearchLocal(query: string, limit: number): Promise<Icd10Code[]> {
    const results = await this.icd10Repository.query(
      `SELECT * FROM icd10_codes 
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
  private async wordByWordSearch(words: string[], limit: number): Promise<Icd10Code[]> {
    let queryBuilder = this.icd10Repository
      .createQueryBuilder('icd10')
      .where('icd10.is_active = true');

    words.forEach((word, index) => {
      const pattern = `%${word}%`;
      queryBuilder = queryBuilder.andWhere(
        `(LOWER(icd10.short_description) LIKE :pattern${index} OR LOWER(icd10.long_description) LIKE :pattern${index})`,
        { [`pattern${index}`]: pattern }
      );
    });

    return queryBuilder
      .orderBy('icd10.usage_count', 'DESC')
      .limit(limit)
      .getMany();
  }

  /**
   * Partial word search - matches any word
   */
  private async partialWordSearch(words: string[], limit: number): Promise<Icd10Code[]> {
    let queryBuilder = this.icd10Repository
      .createQueryBuilder('icd10')
      .where('icd10.is_active = true');

    const conditions = words.map((word, index) => {
      return `LOWER(icd10.short_description) LIKE :pattern${index} OR LOWER(icd10.long_description) LIKE :pattern${index}`;
    }).join(' OR ');

    queryBuilder = queryBuilder.andWhere(`(${conditions})`);

    words.forEach((word, index) => {
      queryBuilder.setParameter(`pattern${index}`, `%${word}%`);
    });

    return queryBuilder
      .orderBy('icd10.usage_count', 'DESC')
      .limit(limit)
      .getMany();
  }

  /**
   * Get most frequently used codes
   */
  async getMostUsedCodes(limit: number = 20): Promise<Icd10Code[]> {
    return this.icd10Repository.find({
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
  async getCodesByChapter(chapterCode: string, limit: number = 50): Promise<Icd10Code[]> {
    return this.icd10Repository.find({
      where: { chapter_code: chapterCode, is_active: true },
      order: { code: 'ASC' },
      take: limit,
    });
  }

  /**
   * Get code details by exact code
   * Fetches from WHO API if not in local database
   */
  async getCodeDetails(code: string): Promise<Icd10Code | null> {
    // Normalize code (uppercase, remove spaces)
    const normalizedCode = code.toUpperCase().trim();

    // Search local first
    let codeEntity = await this.icd10Repository.findOne({
      where: { code: normalizedCode },
    });

    if (codeEntity) {
      // Track usage
      await this.incrementUsage(normalizedCode);
      return codeEntity;
    }

    // If not found locally, try WHO API
    try {
      this.logger.log(`🌐 Fetching code ${normalizedCode} from WHO API...`);
      await this.ensureAuthenticated();

      // WHO API endpoint for ICD-10: direct entity lookup
      const url = `${this.WHO_API_BASE}/${normalizedCode}`;
      
      this.logger.log(`🔗 Fetching: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Accept': 'application/json',
          'API-Version': 'v2',
          'Accept-Language': 'en',
        },
      });

      if (response.ok) {
        const data: WhoApiEntity = await response.json();
        
        // Extract title (handle both object and string formats)
        const title = typeof data.title === 'object' ? data.title['@value'] : data.title;
        const definition = data.definition 
          ? (typeof data.definition === 'object' ? data.definition['@value'] : data.definition)
          : '';
        
        codeEntity = this.icd10Repository.create({
          code: normalizedCode,
          short_description: title || '',
          long_description: definition || title || '',
          billable: true,
          is_active: true,
        });

        // Save to cache
        await this.icd10Repository.save(codeEntity);
        this.logger.log(`✅ Fetched and cached code: ${normalizedCode}`);
        
        return codeEntity;
      } else {
        this.logger.warn(`WHO API returned ${response.status} for code ${normalizedCode}`);
      }
    } catch (error) {
      this.logger.error(`Failed to fetch code from API: ${error.message}`);
    }

    return null;
  }

  /**
   * Increment usage counter for a code
   */
  async incrementUsage(code: string): Promise<void> {
    try {
      await this.icd10Repository
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
   * Validate ICD-10 code format
   */
  validateCodeFormat(code: string): boolean {
    // ICD-10 format: Letter + 2 digits + optional decimal + up to 4 more digits
    // Examples: A00, E11.9, J45.909
    const regex = /^[A-Z][0-9]{2}(\.[0-9]{1,4})?$/;
    return regex.test(code);
  }

  /**
   * Ensure WHO API authentication
   */
  private async ensureAuthenticated(): Promise<void> {
    // Check if token is still valid
    if (this.apiToken && this.tokenExpiresAt && new Date() < this.tokenExpiresAt) {
      return;
    }

    // Get new token
    await this.authenticate();
  }

  /**
   * Authenticate with WHO ICD API using OAuth2
   */
  private async authenticate(): Promise<void> {
    const clientId = this.configService.get<string>('ICD10_CLIENT_ID');
    const clientSecret = this.configService.get<string>('ICD10_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new HttpException(
        'ICD-10 API credentials not configured. Please add ICD10_CLIENT_ID and ICD10_CLIENT_SECRET to environment variables.',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }

    try {
      const response = await fetch(this.TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'icdapi_access',
        }),
      });

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.status}`);
      }

      const data = await response.json();
      this.apiToken = data.access_token;
      
      // Token expires in 1 hour, refresh 5 minutes early
      this.tokenExpiresAt = new Date(Date.now() + (data.expires_in - 300) * 1000);
      
      this.logger.log('✅ WHO ICD-10 API authenticated');
    } catch (error) {
      this.logger.error(`Authentication failed: ${error.message}`);
      throw new HttpException(
        'Failed to authenticate with WHO ICD API',
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }

  /**
   * Refresh token periodically (every 50 minutes)
   */
  @Cron(CronExpression.EVERY_HOUR)
  async refreshToken(): Promise<void> {
    if (this.apiToken) {
      this.logger.log('🔄 Refreshing WHO API token...');
      try {
        await this.authenticate();
      } catch (error) {
        this.logger.error(`Token refresh failed: ${error.message}`);
      }
    }
  }

  /**
   * HELPER: Seed database with common ICD-10 codes
   */
  async seedCommonCodes(): Promise<void> {
    this.logger.log('🌱 Seeding common ICD-10 codes...');
    
    const commonCodes = [
      // Malaria codes
      { code: 'B50', shortDesc: 'Plasmodium falciparum malaria', chapterCode: 'I', searchTerms: ['malaria', 'falciparum', 'cerebral malaria'] },
      { code: 'B50.0', shortDesc: 'Plasmodium falciparum malaria with cerebral complications', chapterCode: 'I', searchTerms: ['cerebral malaria', 'falciparum', 'brain'] },
      { code: 'B50.8', shortDesc: 'Other severe and complicated Plasmodium falciparum malaria', chapterCode: 'I', searchTerms: ['severe malaria', 'complicated malaria', 'falciparum'] },
      { code: 'B50.9', shortDesc: 'Plasmodium falciparum malaria, unspecified', chapterCode: 'I', searchTerms: ['malaria', 'falciparum'] },
      { code: 'B51', shortDesc: 'Plasmodium vivax malaria', chapterCode: 'I', searchTerms: ['malaria', 'vivax'] },
      { code: 'B51.0', shortDesc: 'Plasmodium vivax malaria with rupture of spleen', chapterCode: 'I', searchTerms: ['vivax malaria', 'spleen rupture'] },
      { code: 'B51.8', shortDesc: 'Plasmodium vivax malaria with other complications', chapterCode: 'I', searchTerms: ['vivax malaria', 'complications'] },
      { code: 'B51.9', shortDesc: 'Plasmodium vivax malaria without complication', chapterCode: 'I', searchTerms: ['malaria', 'vivax'] },
      { code: 'B52', shortDesc: 'Plasmodium malariae malaria', chapterCode: 'I', searchTerms: ['malaria', 'malariae'] },
      { code: 'B52.0', shortDesc: 'Plasmodium malariae malaria with nephropathy', chapterCode: 'I', searchTerms: ['malariae malaria', 'kidney', 'nephropathy'] },
      { code: 'B52.8', shortDesc: 'Plasmodium malariae malaria with other complications', chapterCode: 'I', searchTerms: ['malariae malaria', 'complications'] },
      { code: 'B52.9', shortDesc: 'Plasmodium malariae malaria without complication', chapterCode: 'I', searchTerms: ['malaria', 'malariae'] },
      { code: 'B53', shortDesc: 'Other parasitologically confirmed malaria', chapterCode: 'I', searchTerms: ['malaria', 'parasites'] },
      { code: 'B53.0', shortDesc: 'Plasmodium ovale malaria', chapterCode: 'I', searchTerms: ['malaria', 'ovale'] },
      { code: 'B53.1', shortDesc: 'Malaria due to simian plasmodia', chapterCode: 'I', searchTerms: ['malaria', 'simian', 'monkey'] },
      { code: 'B53.8', shortDesc: 'Other parasitologically confirmed malaria, not elsewhere classified', chapterCode: 'I', searchTerms: ['malaria', 'other'] },
      { code: 'B54', shortDesc: 'Unspecified malaria', chapterCode: 'I', searchTerms: ['malaria', 'unspecified'] },
      
      // HIV/AIDS
      { code: 'B20', shortDesc: 'Human immunodeficiency virus [HIV] disease', chapterCode: 'I', searchTerms: ['hiv', 'aids', 'immunodeficiency'] },
      { code: 'B24', shortDesc: 'Unspecified human immunodeficiency virus [HIV] disease', chapterCode: 'I', searchTerms: ['hiv', 'aids'] },
      
      // Diabetes codes
      { code: 'E11', shortDesc: 'Type 2 diabetes mellitus', chapterCode: 'IV', searchTerms: ['diabetes', 'type 2', 't2dm', 'sugar'] },
      { code: 'E11.9', shortDesc: 'Type 2 diabetes mellitus without complications', chapterCode: 'IV', searchTerms: ['diabetes', 'type 2', 't2dm'] },
      { code: 'E10', shortDesc: 'Type 1 diabetes mellitus', chapterCode: 'IV', searchTerms: ['diabetes', 'type 1', 't1dm', 'insulin dependent'] },
      { code: 'E10.9', shortDesc: 'Type 1 diabetes mellitus without complications', chapterCode: 'IV', searchTerms: ['diabetes', 'type 1', 't1dm'] },
      
      // Hypertension codes
      { code: 'I10', shortDesc: 'Essential (primary) hypertension', chapterCode: 'IX', searchTerms: ['hypertension', 'high blood pressure', 'hbp', 'bp'] },
      { code: 'I11', shortDesc: 'Hypertensive heart disease', chapterCode: 'IX', searchTerms: ['hypertension', 'heart disease', 'hbp'] },
      { code: 'I15', shortDesc: 'Secondary hypertension', chapterCode: 'IX', searchTerms: ['hypertension', 'secondary', 'high blood pressure'] },
      
      // COVID-19
      { code: 'U07.1', shortDesc: 'COVID-19', chapterCode: 'XXII', searchTerms: ['covid', 'coronavirus', 'covid-19', 'sars-cov-2'] },
      
      // Common respiratory
      { code: 'J45', shortDesc: 'Asthma', chapterCode: 'X', searchTerms: ['asthma', 'wheezing', 'bronchial'] },
      { code: 'J45.9', shortDesc: 'Asthma, unspecified', chapterCode: 'X', searchTerms: ['asthma', 'unspecified'] },
      { code: 'J18', shortDesc: 'Pneumonia, unspecified organism', chapterCode: 'X', searchTerms: ['pneumonia', 'lung infection'] },
      { code: 'J18.9', shortDesc: 'Pneumonia, unspecified', chapterCode: 'X', searchTerms: ['pneumonia', 'chest infection'] },
      { code: 'J06.9', shortDesc: 'Acute upper respiratory infection, unspecified', chapterCode: 'X', searchTerms: ['uri', 'cold', 'flu', 'cough'] },
      
      // TB
      { code: 'A15', shortDesc: 'Respiratory tuberculosis', chapterCode: 'I', searchTerms: ['tb', 'tuberculosis', 'lung tb'] },
      { code: 'A15.0', shortDesc: 'Tuberculosis of lung', chapterCode: 'I', searchTerms: ['tb', 'tuberculosis', 'pulmonary'] },
    ];

    let seededCount = 0;
    for (const item of commonCodes) {
      const existing = await this.icd10Repository.findOne({
        where: { code: item.code },
      });

      if (!existing) {
        await this.icd10Repository.save({
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