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
 * The allow-list.
 *
 * `CORS_ORIGINS` wins when set, so a deployment can state its own list exactly.
 * Otherwise the list is the development servers plus whatever `FRONTEND_URL`
 * points at, which means a fresh checkout works without configuration while a
 * real deployment is still explicit about who may call it.
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
    if (origin) list.add(origin);
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
