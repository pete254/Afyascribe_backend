import { corsOrigins, isOriginAllowed, toOrigin } from './cors-origins';

describe('toOrigin', () => {
  it('strips a path, which CORS does not match on', () => {
    // FRONTEND_URL is https://afyascribe.co.ke/app — the /app must not survive.
    expect(toOrigin('https://afyascribe.co.ke/app')).toBe('https://afyascribe.co.ke');
  });

  it('strips a trailing slash', () => {
    expect(toOrigin('https://afyascribe.co.ke/')).toBe('https://afyascribe.co.ke');
  });

  it('keeps a non-default port, which is part of the origin', () => {
    expect(toOrigin('http://localhost:5173')).toBe('http://localhost:5173');
  });

  it('returns null for something that is not a URL rather than throwing', () => {
    expect(toOrigin('afyascribe.co.ke')).toBeNull();
    expect(toOrigin('')).toBeNull();
  });
});

describe('corsOrigins', () => {
  it('derives the production origin from FRONTEND_URL', () => {
    const list = corsOrigins({ FRONTEND_URL: 'https://afyascribe.co.ke/app' });
    expect(list).toContain('https://afyascribe.co.ke');
  });

  it('always allows the local development servers', () => {
    const list = corsOrigins({ FRONTEND_URL: 'https://afyascribe.co.ke/app' });
    expect(list).toContain('http://localhost:5173');
  });

  it('lets CORS_ORIGINS override everything, including the dev servers', () => {
    // A deployment that states its list means that list exactly.
    const list = corsOrigins({
      CORS_ORIGINS: 'https://a.example, https://b.example',
      FRONTEND_URL: 'https://afyascribe.co.ke',
    });
    expect(list).toEqual(['https://a.example', 'https://b.example']);
    expect(list).not.toContain('http://localhost:5173');
  });

  it('tolerates spaces and trailing slashes in CORS_ORIGINS', () => {
    expect(corsOrigins({ CORS_ORIGINS: ' https://a.example/ ,https://b.example ' })).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });

  it('drops an unparseable entry instead of poisoning the list', () => {
    expect(corsOrigins({ CORS_ORIGINS: 'https://good.example,not a url' })).toEqual([
      'https://good.example',
    ]);
  });

  it('does not duplicate when FRONTEND_URL repeats a dev origin', () => {
    const list = corsOrigins({ FRONTEND_URL: 'http://localhost:5173/app' });
    expect(list.filter((o) => o === 'http://localhost:5173')).toHaveLength(1);
  });

  it('falls back to dev origins alone when nothing is configured', () => {
    expect(corsOrigins({})).toContain('http://localhost:5173');
  });
});

describe('isOriginAllowed', () => {
  const allowed = ['https://afyascribe.co.ke'];

  it('admits an origin on the list', () => {
    expect(isOriginAllowed('https://afyascribe.co.ke', allowed)).toBe(true);
  });

  it('refuses one that is not', () => {
    expect(isOriginAllowed('https://evil.example', allowed)).toBe(false);
  });

  it('refuses a lookalike subdomain', () => {
    expect(isOriginAllowed('https://afyascribe.co.ke.evil.example', allowed)).toBe(false);
  });

  it('refuses the same host over plain http', () => {
    // Scheme is part of the origin; downgrading must not slip through.
    expect(isOriginAllowed('http://afyascribe.co.ke', allowed)).toBe(false);
  });

  it('allows a request with no Origin at all', () => {
    // Server-to-server, a health check, or a native app — CORS does not apply.
    expect(isOriginAllowed(undefined, allowed)).toBe(true);
  });
});
