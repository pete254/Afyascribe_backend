import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Client for Kenya's Shared Health Record.
 *
 * The SHR is not a plain FHIR server you may POST to. It is a four-stage
 * lifecycle — consent, visit, write, read — and the consent is bound to a
 * single visit:
 *
 *   1. `GET /shr/open-visits` for the patient at this facility. A visit that
 *      comes back already holds an open consent: carry on with it and refresh
 *      its token rather than putting the patient through another OTP.
 *   2. `POST /shr/consents` sends the patient an OTP and returns a
 *      `consent_id` and an `otp_record`. `POST .../verify` exchanges the
 *      `otp_record` and the code for a `consent_token` and a `visit_id`.
 *   3. `POST /shr/bundles` writes a FHIR collection Bundle. The Encounter must
 *      reference the visit's EpisodeOfCare, and every clinical resource must
 *      reference that Encounter.
 *   4. `GET /shr/patient-records` reads, carrying `X-Consent-Token`.
 *
 * Close the visit when the encounter ends. A closed visit's token cannot be
 * refreshed, and leaving visits open keeps a consent live for longer than the
 * encounter justifies.
 *
 * https://hie-docs.dha.go.ke/docs/sharedHealthRecord/gettingStarted/intro
 */
@Injectable()
export class HieFhirClient {
  private readonly logger = new Logger(HieFhirClient.name);
  readonly base: string;

  /** Cached client-credentials token, with the moment it stops being usable. */
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {
    this.base = (
      this.config.get<string>('HIE_BASE') ||
      this.config.get<string>('HIE_FHIR_BASE') ||
      'https://api.dha.go.ke'
    ).replace(/\/+$/, '');
  }

  /**
   * Whether the facility has been given credentials yet — either an OAuth 2.0
   * client pair, or a token pasted in for a one-off test.
   */
  get configured(): boolean {
    return !!(
      (this.config.get<string>('HIE_CLIENT_ID') && this.config.get<string>('HIE_CLIENT_SECRET')) ||
      this.config.get<string>('HIE_AUTH_TOKEN')
    );
  }

  /** How the credentials are supplied, for a status screen. */
  get authMode(): 'client_credentials' | 'static_token' | 'none' {
    if (this.config.get<string>('HIE_CLIENT_ID') && this.config.get<string>('HIE_CLIENT_SECRET')) {
      return 'client_credentials';
    }
    return this.config.get<string>('HIE_AUTH_TOKEN') ? 'static_token' : 'none';
  }

  /**
   * A usable bearer token.
   *
   * A static `HIE_AUTH_TOKEN` wins, because it exists to let someone paste a
   * token from Postman and try a call without setting up the client pair.
   * Otherwise fetch one with client credentials and keep it until a minute
   * before it expires — the margin is so a token cannot go stale mid-flight.
   */
  private async bearer(): Promise<string | null> {
    const stat = this.config.get<string>('HIE_AUTH_TOKEN');
    if (stat) return stat;

    const id = this.config.get<string>('HIE_CLIENT_ID');
    const secret = this.config.get<string>('HIE_CLIENT_SECRET');
    if (!id || !secret) return null;

    if (this.token && Date.now() < this.token.expiresAt) return this.token.value;

    const url = this.config.get<string>('HIE_TOKEN_URL') || `${this.base}/oauth2/token`;
    const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret });
    const scope = this.config.get<string>('HIE_SCOPE');
    if (scope) body.set('scope', scope);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString(),
    });
    const payload = (await res.json().catch(() => null)) as Record<string, any> | null;
    if (!res.ok || !payload?.access_token) {
      this.logger.error(`Token request to ${url} failed with ${res.status}`);
      return null;
    }

    const lifetime = Number(payload.expires_in) || 3600;
    this.token = {
      value: String(payload.access_token),
      expiresAt: Date.now() + Math.max(0, lifetime - 60) * 1000,
    };
    this.logger.log(`Got an HIE access token, good for ${lifetime}s`);
    return this.token.value;
  }

  private async call(
    method: string,
    path: string,
    opts: { body?: unknown; headers?: Record<string, string>; query?: Record<string, string | undefined> } = {},
  ): Promise<{ status: number; body: unknown }> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    }
    const url = `${this.base}${path}${qs.toString() ? `?${qs}` : ''}`;
    const token = await this.bearer();

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.headers ?? {}),
      },
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

  // ── Stage 1: consent ──────────────────────────────────────────────────────

  /**
   * Visits at this facility that still hold an open consent for a patient.
   * Both identifiers are required: the patient's Client Registry id and the
   * facility's Facility Registry code.
   */
  openVisits(patientId: string, facilityId: string): Promise<{ status: number; body: unknown }> {
    return this.call('GET', '/shr/open-visits', {
      query: { patient_id: patientId, facility_id: facilityId },
    });
  }

  /**
   * Start a consent request — standard, emergency or dependant.
   *
   * The body is passed through rather than narrowed, because the same endpoint
   * covers three shapes: a standard request that sends an OTP; an emergency one
   * (`emergency: 1` with an `incapacity_reason`) which is approved on the spot
   * and returns the token directly; and a dependant one, which routes the OTP
   * to a representative given by `representative_cr_id`.
   */
  requestConsent(payload: unknown): Promise<{ status: number; body: unknown }> {
    return this.call('POST', '/shr/consents', { body: payload });
  }

  /** Where a consent request has got to. */
  consentStatus(consentId: string): Promise<{ status: number; body: unknown }> {
    return this.call('GET', `/shr/consents/${encodeURIComponent(consentId)}/status`);
  }

  /**
   * Send the OTP again. The response carries a *new* `otp_record`, and it is
   * that one the verify call must use — not the record from the original
   * request.
   */
  resendOtp(consentId: string): Promise<{ status: number; body: unknown }> {
    return this.call('POST', `/shr/consents/${encodeURIComponent(consentId)}/resend-otp`);
  }

  /**
   * Record the patient's decision.
   *
   * Approving returns the `consent_token` and `visit_id`. A refusal goes
   * through this same call with `consent_decision: 'Reject'` and a reason —
   * abandoning the request instead leaves it sitting as Pending, and records
   * no refusal, which is the thing an audit would want to see.
   *
   * The same call also completes an OTP-gated visit closure.
   */
  verifyConsent(
    consentId: string,
    input: {
      otpRecord: string;
      otp?: string;
      decision?: 'Approve' | 'Reject';
      rejectionReason?: string;
    },
  ): Promise<{ status: number; body: unknown }> {
    const body: Record<string, unknown> = { otp_record: input.otpRecord };
    if (input.otp) body.otp = input.otp;
    if (input.decision) body.consent_decision = input.decision;
    if (input.rejectionReason) body.rejection_reason = input.rejectionReason;
    return this.call('POST', `/shr/consents/${encodeURIComponent(consentId)}/verify`, { body });
  }

  // ── Stage 2: the visit ────────────────────────────────────────────────────

  /** A fresh consent token for a visit that is still open. */
  refreshVisit(visitId: string): Promise<{ status: number; body: unknown }> {
    return this.call('POST', `/shr/visits/${encodeURIComponent(visitId)}/refresh`);
  }

  /**
   * Close the visit at the end of the encounter.
   *
   * Usually a two-step: this dispatches a one-time password to whoever gave
   * consent and returns an `otp_record`, and the visit stays open until that
   * is verified. Read the response rather than assuming — an `end_date` coming
   * back instead means it is already closed, which happens where OTP-gated
   * closure is off or consent came from a healthcare proxy.
   *
   * For a patient who cannot consent to the closure, pass `patientIncapable`
   * with a reason and it closes immediately with no password sent.
   */
  closeVisit(
    visitId: string,
    opts: { patientIncapable?: boolean; incapacityReason?: string } = {},
  ): Promise<{ status: number; body: unknown }> {
    const body = opts.patientIncapable
      ? { patient_incapable: 1, incapacity_reason: opts.incapacityReason }
      : undefined;
    return this.call('POST', `/shr/visits/${encodeURIComponent(visitId)}/close`, { body });
  }

  // ── Stage 3: write ────────────────────────────────────────────────────────

  /**
   * Write a visit's clinical record. The bundle must be a collection, its
   * Encounter must reference the visit's EpisodeOfCare, and every clinical
   * resource must reference that Encounter.
   *
   * The middleware only checks that the body is a Bundle; the contents are
   * validated upstream, so a structurally valid bundle can still be rejected.
   */
  submitBundle(bundle: unknown, consentToken?: string): Promise<{ status: number; body: unknown }> {
    this.logger.log(`Submitting a collection Bundle to ${this.base}/shr/bundles`);
    return this.call('POST', '/shr/bundles', {
      body: bundle,
      headers: consentToken ? { 'X-Consent-Token': consentToken } : {},
    });
  }

  // ── Stage 4: read ─────────────────────────────────────────────────────────

  /**
   * Read a patient's national record.
   *
   * Every read is attributed: `practitioner_id` identifies the clinician from
   * the Health Worker Registry and is mandatory. `resources` narrows what
   * comes back, and `page_token` walks a large result set.
   */
  patientRecords(
    consentToken: string,
    params: { crId: string; practitionerId: string; resources?: string; pageToken?: string },
  ): Promise<{ status: number; body: unknown }> {
    return this.call('GET', '/shr/patient-records', {
      headers: { 'X-Consent-Token': consentToken },
      query: {
        cr_id: params.crId,
        practitioner_id: params.practitionerId,
        resources: params.resources,
        page_token: params.pageToken,
      },
    });
  }

  /**
   * One patient's observations as a FHIR searchset. Consent-scoped like
   * patient-records, and additionally identifies the clinician through X-PUID.
   */
  observations(
    consentToken: string,
    puid: string,
    query: Record<string, string | undefined> = {},
  ): Promise<{ status: number; body: unknown }> {
    return this.call('GET', '/shr/Observation', {
      headers: { 'X-Consent-Token': consentToken, 'X-PUID': puid },
      query,
    });
  }

  /**
   * Referrals. A query over referrals directed at an organisation rather than
   * a read of one patient's record, so it carries no consent token: filter by
   * `performer:Organization` for referrals addressed to this facility, or
   * `requester:Organization` for the ones raised here.
   */
  serviceRequests(query: Record<string, string | undefined>): Promise<{ status: number; body: unknown }> {
    return this.call('GET', '/shr/ServiceRequest', { query });
  }

  // ── Security labels ───────────────────────────────────────────────────────

  /**
   * The full catalogue — N and R for confidentiality, plus sensitivity codes
   * such as HIV, PSY and SUD. Read it before interpreting a response, and
   * before deciding what labels to attach to a bundle being written.
   */
  securityLabels(): Promise<{ status: number; body: unknown }> {
    return this.call('GET', '/shr/security-labels');
  }

  /** Which label applies to a particular resource type or code. */
  resourceLabels(query: Record<string, string | undefined> = {}): Promise<{ status: number; body: unknown }> {
    return this.call('GET', '/shr/resource-labels', { query });
  }
}
