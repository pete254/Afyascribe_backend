import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, In } from 'typeorm';
import { Icd10Code } from './entities/icd10-code.entity';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

interface WhoApiSearchResult {
  destinationEntities: Array<{
    id: string;
    title: string;
    theCode?: string;
    chapter?: string;
  }>;
}

@Injectable()
export class Icd10Service {
  private readonly logger = new Logger(Icd10Service.name);
  private apiToken: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private readonly WHO_API_BASE = 'https://id.who.int/icd/release/10/2019';
  private readonly TOKEN_ENDPOINT = 'https://icdaccessmanagement.who.int/connect/token';

  constructor(
    @InjectRepository(Icd10Code)
    private icd10Repository: Repository<Icd10Code>,
    private configService: ConfigService,
  ) {}

  /**
   * MAIN SEARCH METHOD - Hybrid approach
   * 1. Search local database first (fast, reliable)
   * 2. If insufficient results, try WHO API
   * 3. Cache new results from API
   */
  async searchCodes(query: string, limit: number = 15): Promise<Icd10Code[]> {
    if (!query || query.trim().length < 2) {
      // Return most popular codes if no query
      return this.getMostUsedCodes(limit);
    }

    const normalizedQuery = query.trim().toLowerCase();

    // STEP 1: Search local database (FAST)
    this.logger.log(`🔍 Searching local cache for: "${query}"`);
    const localResults = await this.searchLocal(normalizedQuery, limit);

    if (localResults.length >= 5) {
      // Good enough results from local cache
      this.logger.log(`✅ Found ${localResults.length} results in local cache`);
      return localResults;
    }

    // STEP 2: Try WHO API for better results
    this.logger.log(`🌐 Searching WHO API for additional results...`);
    
    try {
      const apiResults = await this.searchWhoApi(query, limit);
      
      if (apiResults.length > 0) {
        // Cache API results for future use
        await this.cacheResults(apiResults);
        
        // Combine and deduplicate results
        const combined = this.deduplicateResults([...localResults, ...apiResults]);
        this.logger.log(`✅ Combined results: ${combined.length} codes`);
        
        return combined.slice(0, limit);
      }
    } catch (error) {
      this.logger.warn(`⚠️ WHO API failed: ${error.message}`);
    }

    // STEP 3: Fallback - use fuzzy search on local DB
    if (localResults.length < 3) {
      this.logger.log(`🔎 Trying fuzzy search...`);
      const fuzzyResults = await this.fuzzySearchLocal(normalizedQuery, limit);
      return fuzzyResults;
    }

    return localResults;
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
        'OR :query = ANY(icd10.search_terms))',
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
   * Fuzzy search using PostgreSQL trigram similarity
   * Requires pg_trgm extension: CREATE EXTENSION IF NOT EXISTS pg_trgm;
   */
  private async fuzzySearchLocal(query: string, limit: number): Promise<Icd10Code[]> {
    try {
      const results = await this.icd10Repository.query(
        `SELECT * FROM icd10_codes 
         WHERE is_active = true
         AND similarity(short_description, $1) > 0.2
         ORDER BY similarity(short_description, $1) DESC
         LIMIT $2`,
        [query, limit]
      );

      return results.map(row => this.icd10Repository.create(row));
    } catch (error) {
      this.logger.error(`Fuzzy search failed: ${error.message}`);
      return [];
    }
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
   * Search WHO ICD-10 API
   */
  private async searchWhoApi(query: string, limit: number): Promise<Icd10Code[]> {
    try {
      // Ensure we have a valid token
      await this.ensureAuthenticated();

      // Search API (ICD-10 2019 version - most stable)
      const searchUrl = `${this.WHO_API_BASE}/mms/search?q=${encodeURIComponent(query)}&useFlexisearch=true&flatResults=true`;
      
      const response = await fetch(searchUrl, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Accept': 'application/json',
          'API-Version': 'v2',
          'Accept-Language': 'en',
        },
      });

      if (!response.ok) {
        throw new Error(`WHO API returned ${response.status}`);
      }

      const data: WhoApiSearchResult = await response.json();
      
      // Transform API response to our format
      const transformedResults = this.transformWhoApiResults(
        data.destinationEntities || [],
        limit
      );

      return transformedResults;
    } catch (error) {
      this.logger.error(`WHO API search failed: ${error.message}`);
      throw error;
    }
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
   * Transform WHO API results to our format
   */
  private transformWhoApiResults(entities: any[], limit: number): Icd10Code[] {
    return entities.slice(0, limit).map(entity => {
      const code = this.extractCode(entity.theCode || entity.id);
      
      return this.icd10Repository.create({
        code: code,
        short_description: entity.title || '',
        long_description: entity.definition || entity.title || '',
        chapter_name: entity.chapter || '',
        billable: true,
        is_active: true,
        search_terms: [entity.title?.toLowerCase() || ''],
      });
    });
  }

  /**
   * Cache API results locally for future use
   */
  private async cacheResults(results: Icd10Code[]): Promise<void> {
    try {
      for (const result of results) {
        const existing = await this.icd10Repository.findOne({
          where: { code: result.code },
        });

        if (!existing) {
          await this.icd10Repository.save(result);
          this.logger.log(`📥 Cached new code: ${result.code} - ${result.short_description}`);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to cache results: ${error.message}`);
    }
  }

  /**
   * Deduplicate results by code
   */
  private deduplicateResults(results: Icd10Code[]): Icd10Code[] {
    const seen = new Set<string>();
    return results.filter(result => {
      if (seen.has(result.code)) {
        return false;
      }
      seen.add(result.code);
      return true;
    });
  }

  /**
   * Get code details by exact code
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

      const url = `${this.WHO_API_BASE}/mms/codeinfo/${normalizedCode}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Accept': 'application/json',
          'API-Version': 'v2',
          'Accept-Language': 'en',
        },
      });

      if (response.ok) {
        const data = await response.json();
        
        codeEntity = this.icd10Repository.create({
          code: normalizedCode,
          short_description: data.title || '',
          long_description: data.definition || data.title || '',
          billable: true,
          is_active: true,
        });

        // Save to cache
        await this.icd10Repository.save(codeEntity);
        this.logger.log(`✅ Fetched and cached code: ${normalizedCode}`);
        
        return codeEntity;
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
   * Extract ICD-10 code from WHO URI format
   * Example: "http://id.who.int/icd/release/10/2019/E11.9" -> "E11.9"
   */
  private extractCode(fullCode: string): string {
    if (fullCode.includes('/')) {
      return fullCode.split('/').pop() || fullCode;
    }
    return fullCode;
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
}