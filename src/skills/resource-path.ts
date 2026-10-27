/** Only active packaged references are valid Skill read resources. Never a filesystem path. */
const segment = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
export function normalizeSkillReadResource(raw?: string): string {
  if (raw === undefined || raw === 'SKILL.md') return 'SKILL.md';
  if (typeof raw !== 'string' || raw.length > 400 || raw.includes('\\') || raw.includes('\0')) {
    throw new Error('SKILL_READ_RESOURCE_INVALID');
  }
  const pieces = raw.split('/');
  if (pieces[0] !== 'references' || pieces.length < 2
    || pieces.slice(1).some(piece => !segment.test(piece) || piece === '.' || piece === '..')) {
    throw new Error('SKILL_READ_RESOURCE_INVALID');
  }
  return raw;
}
export function skillReadCoverageKey(name: string, source: string): string {
  return source === 'SKILL.md' ? name : name + '#' + source;
}
