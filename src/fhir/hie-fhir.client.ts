import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Client for Kenya's Shared Health Record.
 *
 * The SHR is not a plain FHIR server you may POST to. A visit is opened against
 * a verified consent, which returns a consent token and the HIE's own visit id;
 * clinical data then goes to `POST /shr/bundles` as a collection Bundle, and
 * every read of a patient record carries the consent token in a header.
 *
 * Credentials are not in the repo and the facility does not have them yet, so
 * nothing here has been exercised against the live service. The call shapes
 * follow the published documentation; where a response field is not documented
 * the body is handed back whole rather than guessed at.
 *
 * https://hie-docs.dha.go.ke/docs/sharedHealthRecord/gettingStarted/intro
 */
@Injectable()
export class HieFhirClient {
  private readonly logger = new Logger(HieFhirClient.name);
  readonly base: string;

  constructor(private readonly config: ConfigService) {
    this.base = (this.config.get<string>('HIE_BASE') || this.config.get<string>('HIE_FHIR_BASE') || 'https://api.dha.go.ke')
      .replace(/\/+$/, '');
  }

  /** Whether the facility has been given credentials yet. */
  get configured(): boolean {
    return !!this.config.get<string>('HIE_AUTH_TOKEN');
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const token = this.config.get<string>('HIE_AUTH_TOKEN');
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    };
  }

  private async call(
    method: string,
    path: string,
    opts: { body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<{ status: number; body: unknown }> {
    const url = `${this.base}${path}`;
    const res = await fetch(url, {
      method,
      headers: this.headers(opts.headers),
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    if (!res.ok) this.logger.warn(`${method} ${path} → ${res.status}`);
    return { status: res.status, body };
  }

  /** Visits already open for this facility, with consent still valid. */
  openVisits(): Promise<{ status: number; body: unknown }> {
    return this.call('GET', '/shr/open-visits');
  }

  /** Ask the patient for consent; an OTP goes to them for verification. */
  requestConsent(payload: unknown): Promise<{ status: number; body: unknown }> {
    return this.call('POST', '/shr/consents', { body: payload });
  }

  /** Verify the OTP. The response carries the consent token and the visit id. */
  verifyConsent(consentId: string, otp: string): Promise<{ status: number; body: unknown }> {
    return this.call('POST', `/shr/consents/${encodeURIComponent(consentId)}/verify`, { body: { otp } });
  }

  /** Write a visit's clinical record. The bundle must be a collection. */
  submitBundle(bundle: unknown, consentToken?: string): Promise<{ status: number; body: unknown }> {
    this.logger.log(`Submitting a collection Bundle to ${this.base}/shr/bundles`);
    return this.call('POST', '/shr/bundles', {
      body: bundle,
      headers: consentToken ? { 'X-Consent-Token': consentToken } : {},
    });
  }

  /** Read a patient's national record. The consent token is required. */
  patientRecords(consentToken: string, params: Record<string, string> = {}): Promise<{ status: number; body: unknown }> {
    const qs = new URLSearchParams(params).toString();
    return this.call('GET', `/shr/patient-records${qs ? `?${qs}` : ''}`, {
      headers: { 'X-Consent-Token': consentToken },
    });
  }
}
