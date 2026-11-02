/**
 * When to try again after a case or a weekly return failed to send
 * (Disease Reporting Specification D-3, IDSR Reporting Specification I-6).
 *
 * Quickly at first, because a brief outage is the usual cause and an immediate
 * case is due within 24 hours; then every six hours, for about three days. By
 * then the facility has been emailed (after ESCALATE_AFTER failures) and told
 * to phone the case through, and trying for ever would only hide that nobody
 * did.
 */
export const RETRY_DELAYS_MINUTES = [5, 15, 60, 180, 360] as const;
export const MAX_SEND_ATTEMPTS = 16;
export const ESCALATE_AFTER = 3;

export interface SendOutcome {
  attempted: boolean;
  ok: boolean;
  detail: string;
}

/** The time of the next try after `attempts` failed ones, or null to stop. */
export function nextAttemptAt(
  attempts: number,
  now: Date = new Date(),
): Date | null {
  if (attempts < 1 || attempts >= MAX_SEND_ATTEMPTS) return null;
  const i = Math.min(attempts - 1, RETRY_DELAYS_MINUTES.length - 1);
  return new Date(now.getTime() + RETRY_DELAYS_MINUTES[i] * 60_000);
}

/**
 * The bookkeeping after one try. Only a real failure is retried: "nothing is
 * configured" or "the address is not HTTPS" will not mend itself in five
 * minutes, and the person was already told to send it another way.
 */
export function afterAttempt(
  attemptsBefore: number,
  outcome: SendOutcome,
  now: Date = new Date(),
): {
  status: 'sent' | 'failed' | 'not-configured';
  attempts: number;
  nextAt: Date | null;
  error: string | null;
} {
  if (!outcome.attempted) {
    return {
      status: 'not-configured',
      attempts: attemptsBefore,
      nextAt: null,
      error: outcome.detail,
    };
  }
  const attempts = attemptsBefore + 1;
  if (outcome.ok)
    return { status: 'sent', attempts, nextAt: null, error: null };
  return {
    status: 'failed',
    attempts,
    nextAt: nextAttemptAt(attempts, now),
    error: outcome.detail.slice(0, 2000),
  };
}

/** POST a JSON payload with a timeout, so one dead endpoint cannot hang a job. */
export async function postJson(
  url: string,
  payload: unknown,
  token?: string | null,
  timeoutMs = 20_000,
): Promise<SendOutcome> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return {
      attempted: true,
      ok: res.ok,
      detail: res.ok ? `Sent to ${url}` : `${url} responded ${res.status}`,
    };
  } catch (err) {
    return { attempted: true, ok: false, detail: (err as Error).message };
  }
}
