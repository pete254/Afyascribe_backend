/**
 * Which origins a browser may call this API from.
 *
 * `origin: '*'` with `credentials: true` is not merely loose — it is invalid
 * per the CORS specification, and browsers refuse the pair outright. DHA's
 * Technical Specifications (§3.4) call for a restrictive allow-list, so that is
 * what this builds.
 *
 * Lives here rather than in main.ts so the rules can be tested. Getting an
 * allow-list wrong takes a live application off the air, and that is not
 * something to discover in production.
 */

export interface CorsOriginsEnv {
  /** Comma-separated and authoritative when present. */
  CORS_ORIGINS?: string;
  /** The web app's address. May carry a path; only its origin matters here. */
  FRONTEND_URL?: string;
  /** Other variables are ignored; this keeps `process.env` assignable. */
  [key: string]: string | undefined;
}

/** Local development servers, always permitted. */
const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'];

/** Normalise to a bare origin, or null if it is not a usable URL. */
export function toOrigin(value: string): string | null {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

/**
 * The `www.` counterpart of an origin, or null when there isn't a sensible one.
 *
 * A site reachable at both the apex and `www` is one site, and a person who
 * types the other one should not be met with a failure nobody can read. Only
 * applied to the derived list — an explicit CORS_ORIGINS means exactly what it
 * says.
 */
export function wwwVariant(origin: string): string | null {
  try {
    const u = new URL(origin);
    if (u.hostname.startsWith('www.')) {
      u.hostname = u.hostname.slice(4);
    } else if (u.hostname.split('.').length >= 2 && !/^\d+(\.\d+){3}$/.test(u.hostname)) {
      u.hostname = `www.${u.hostname}`;
    } else {
      return null;
    }
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * The allow-list.
 *
 * `CORS_ORIGINS` wins when set, so a deployment can state its own list exactly.
 * Otherwise the list is the development servers plus whatever `FRONTEND_URL`
 * points at and its `www.` counterpart.
 *
 * A warning from experience: `FRONTEND_URL` is where people are *sent* — in
 * password-reset emails and the like — which is not necessarily where the
 * application is *served from*. A web app on a hosting platform answers on
 * that platform's domain, and deriving the allow-list from FRONTEND_URL alone
 * will refuse it. Set CORS_ORIGINS explicitly in any real deployment.
 */
export function corsOrigins(env: CorsOriginsEnv = process.env): string[] {
  const explicit = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map(toOrigin)
    .filter((o): o is string => !!o);
  if (explicit.length) return [...new Set(explicit)];

  const list = new Set(DEV_ORIGINS);
  if (env.FRONTEND_URL) {
    const origin = toOrigin(env.FRONTEND_URL);
    if (origin) {
      list.add(origin);
      const www = wwwVariant(origin);
      if (www) list.add(www);
    }
  }
  return [...list];
}

/**
 * Whether a given Origin header may proceed.
 *
 * A request with no Origin is allowed: that is a server-to-server call, a
 * health check or a native app, and CORS simply does not apply to those. The
 * browser is the thing being protected here, and a browser always sends one.
 */
export function isOriginAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (!origin) return true;
  return allowed.includes(origin);
}
