/**
 * Facility isolation, checked centrally for every request (AccessGuard).
 *
 * Every service already takes the facility from the signed-in user's token,
 * never from the request. This is the second line: a request that names a
 * facility — in its path, query or body — must name the caller's own. Only
 * the platform super administrator, who belongs to no facility, may name
 * another. A route whose `facilityId` means something else must not call it
 * that.
 */
export function facilityScopeViolation(
  user: { role?: string; facilityId?: string | null } | undefined,
  req: {
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: unknown;
  },
): string | null {
  if (!user || user.role === 'super_admin') return null;
  const body =
    req.body && typeof req.body === 'object'
      ? (req.body as Record<string, unknown>)
      : {};
  for (const [where, value] of [
    ['path', req.params?.facilityId],
    ['query', req.query?.facilityId],
    ['body', body.facilityId],
  ] as const) {
    if (value === undefined || value === null || value === '') continue;
    if (value !== user.facilityId)
      return `facilityId in the ${where} is not your facility`;
  }
  return null;
}
