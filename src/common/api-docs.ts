/**
 * Whether to serve the OpenAPI (Swagger) documentation at /api/docs.
 *
 * On in development. Off in production unless API_DOCS=true is set on purpose:
 * a public map of every route and parameter is the first thing an attacker
 * reads, and the people who need it can run the API locally. Found by the
 * vulnerability assessment (V-07).
 */
export function apiDocsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.API_DOCS != null && env.API_DOCS !== '') return env.API_DOCS === 'true';
  return env.NODE_ENV !== 'production';
}
