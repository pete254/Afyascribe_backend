/**
 * Who is calling — for the audit trail and for rate limiting.
 *
 * Behind a reverse proxy every request arrives from the proxy, so the caller's
 * address has to come from X-Forwarded-For. But that header is written by
 * whoever sends the request: a client can put any address it likes at the
 * front of it. Taking the first entry, as this code once did, let a caller
 * choose the address the audit trail records against them.
 *
 * So the header is read by Express, not by us, and only as far back as the
 * proxies we actually run. `trust proxy` (set from TRUST_PROXY in main.ts)
 * says how many hops to believe; `req.ip` is then the address the outermost
 * trusted proxy saw. With nginx alone in front of the API, that is one hop,
 * and `req.ip` is the real client — whatever the client wrote in the header.
 */
export const clientIp = (req: any): string | null => req?.ip ?? null;

/**
 * Parse TRUST_PROXY into what Express's `trust proxy` setting takes.
 *
 *   "1", "2" …        trust that many hops (nginx in front of the app: "1")
 *   "true"            trust every hop — only where the platform strips the
 *                     header itself
 *   "false" / unset   trust none; req.ip is the TCP peer
 *   anything else     a comma list of addresses or subnets to trust
 *
 * Unset on Render keeps the behaviour it has always had there (its edge sets
 * the header); unset anywhere else trusts nothing.
 */
export function trustProxySetting(env: NodeJS.ProcessEnv = process.env): boolean | number | string {
  const raw = env.TRUST_PROXY?.trim();
  if (!raw) return env.RENDER ? true : false;
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return raw;
}
