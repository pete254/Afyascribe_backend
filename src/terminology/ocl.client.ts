import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OclConceptName {
  name: string;
  locale?: string;
  locale_preferred?: boolean;
  name_type?: string;
}

export interface OclConcept {
  id: string;
  display_name: string;
  concept_class?: string;
  datatype?: string;
  retired?: boolean;
  names?: OclConceptName[];
  extras?: Record<string, unknown>;
  updated_on?: string;
  url?: string;
}

export interface OclMapping {
  map_type: string;
  from_concept_code?: string;
  to_concept_code?: string;
  to_concept_name?: string;
  to_source_name?: string;
  sort_weight?: number | null;
}

/**
 * Thin client for the KNHTS Open Concept Lab REST API
 * (default base https://ilm-hie.dha.go.ke/ocl). Read-only, public.
 */
@Injectable()
export class OclClient {
  private readonly logger = new Logger(OclClient.name);
  readonly base: string;

  constructor(private readonly config: ConfigService) {
    this.base = (
      this.config.get<string>('KNHTS_API_BASE') || 'https://ilm-hie.dha.go.ke/ocl'
    ).replace(/\/+$/, '');
  }

  private async getJson<T>(path: string, attempt = 0): Promise<T | null> {
    // OCL emits http:// self-links; always call over https.
    const url = `${this.base}${path}`.replace(/^http:\/\//, 'https://');
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if ((res.status === 429 || res.status >= 500) && attempt < 5) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        return this.getJson<T>(path, attempt + 1);
      }
      if (!res.ok) {
        this.logger.warn(`OCL ${res.status} for ${path}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (e) {
      if (attempt < 5) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        return this.getJson<T>(path, attempt + 1);
      }
      this.logger.error(`OCL fetch failed for ${path}: ${(e as Error).message}`);
      return null;
    }
  }

  /** One page of concepts from a source (verbose = includes names/extras). */
  async concepts(
    org: string,
    source: string,
    page: number,
    limit: number,
  ): Promise<OclConcept[]> {
    const data = await this.getJson<OclConcept[]>(
      `/orgs/${encodeURIComponent(org)}/sources/${encodeURIComponent(source)}/concepts/` +
        `?page=${page}&limit=${limit}&verbose=true&includeRetired=false`,
    );
    return data ?? [];
  }

  /** Live search within a source — used as an online fallback / typeahead. */
  async search(org: string, source: string, q: string, limit: number): Promise<OclConcept[]> {
    const data = await this.getJson<OclConcept[]>(
      `/orgs/${encodeURIComponent(org)}/sources/${encodeURIComponent(source)}/concepts/` +
        `?q=${encodeURIComponent(q)}&limit=${limit}&verbose=true`,
    );
    return data ?? [];
  }

  /** A concept's outbound mappings (e.g. LOINC panel → its members). */
  async mappings(org: string, source: string, code: string): Promise<OclMapping[]> {
    const data = await this.getJson<OclMapping[]>(
      `/orgs/${encodeURIComponent(org)}/sources/${encodeURIComponent(source)}/concepts/${encodeURIComponent(
        code,
      )}/mappings/?limit=200`,
    );
    return data ?? [];
  }

  /** Fetch one concept by code, or null if not found. */
  async lookup(org: string, source: string, code: string): Promise<OclConcept | null> {
    return this.getJson<OclConcept>(
      `/orgs/${encodeURIComponent(org)}/sources/${encodeURIComponent(source)}/concepts/${encodeURIComponent(
        code,
      )}/?verbose=true`,
    );
  }
}
