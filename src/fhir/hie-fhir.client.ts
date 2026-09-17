import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Client for the Kenya HIE FHIR server (HAPI, FHIR R4B) at
 * https://fhir.dha.go.ke/fhir. Posts a transaction Bundle. The base URL and an
 * optional bearer token come from the environment — no credentials are stored
 * in the repo, and submission is only performed when explicitly invoked.
 */
@Injectable()
export class HieFhirClient {
  private readonly logger = new Logger(HieFhirClient.name);
  readonly base: string;

  constructor(private readonly config: ConfigService) {
    this.base = (this.config.get<string>('HIE_FHIR_BASE') || 'https://fhir.dha.go.ke/fhir').replace(
      /\/+$/,
      '',
    );
  }

  /** POST a transaction Bundle to the HIE root. Returns the HTTP status + body. */
  async submit(bundle: unknown): Promise<{ status: number; body: unknown }> {
    const token = this.config.get<string>('HIE_AUTH_TOKEN');
    this.logger.log(`Submitting FHIR transaction to ${this.base}`);
    const res = await fetch(this.base, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/fhir+json',
        Accept: 'application/fhir+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(bundle),
    });
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    if (!res.ok) this.logger.warn(`HIE responded ${res.status}`);
    return { status: res.status, body };
  }
}
