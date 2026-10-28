/**
 * Whether a single path segment names a file that holds credentials, including the copies editors and Windows leave
 * behind: `.env~`, `id_rsa.bak`, `.id_rsa.swp`, `server.pem.old`, `.env:stream`, `.env.` (Windows drops trailing dots).
 * Names only; the caller decides what to do with a match. Every pattern is anchored and linear.
 */

const BASE_NAME = /^(?:\.env(?:\..*)?|\.git|\.ssh|\.aws|\.npmrc|\.pypirc|\.netrc|id_rsa|id_ed25519|id_ecdsa|id_dsa)$/;
const SECRET_EXTENSION = /\.(?:pem|key|pfx|p12|jks|keystore)$/;
const BACKUP_SUFFIX = /(?:\.(?:bak|swp|swo|orig|old|tmp|save|backup)|~)$/;

export function isCredentialFileName(segment: string): boolean {
  let value = segment.toLowerCase();
  const stream = value.indexOf(':');
  if (stream >= 0) value = value.slice(0, stream);
  let end = value.length;
  while (end > 0 && (value[end - 1] === '.' || value[end - 1] === ' ')) end -= 1;
  value = value.slice(0, end);
  for (let pass = 0; pass < 3; pass += 1) {
    const stripped = value.replace(BACKUP_SUFFIX, '');
    if (stripped === value) break;
    value = stripped;
  }
  return [value, value.replace(/^\./, '')].some(name => BASE_NAME.test(name) || SECRET_EXTENSION.test(name));
}
