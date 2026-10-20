/**
 * Why an outbound submission address may not be used, or null if it may.
 *
 * Surveillance cases (MOH 502) name the patient, and quality submissions are
 * FHIR bundles of clinical data, so they go only over HTTPS. Plain HTTP is
 * allowed to this machine alone, for local testing. Found by the vulnerability
 * assessment (V-19): the addresses come from configuration, and nothing
 * stopped an `http://` one being set.
 */
export function insecureEndpointReason(url: string, setting: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `${setting} is not a valid address, so nothing was sent.`;
  }
  if (parsed.protocol === 'https:') return null;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol === 'http:' && local) return null;
  return `${setting} must be an https:// address — this data identifies patients and is never sent unencrypted. Nothing was sent.`;
}
