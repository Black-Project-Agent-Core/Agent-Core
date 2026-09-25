const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function assertCredentialBearingUrl(value: string, label = 'URL'): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label}_INVALID_URL`);
  }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol === 'https:') return parsed;
  if (parsed.protocol === 'http:' && LOOPBACK_HOSTS.has(host)) return parsed;
  throw new Error(`${label}_INSECURE_CREDENTIAL_ENDPOINT`);
}
