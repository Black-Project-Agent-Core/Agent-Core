import fs from 'node:fs/promises';
import path from 'node:path';

/** The shipped bootstrap is product text, never a copy of a user's canonical memory. */
export const PACKAGED_FOUNDATION = '# Agent Core Foundational Memory\n\nRead AGENTS.md and canonical local memory before machine work. Exact current source and observed runtime evidence outrank documentation. Keep Memory, Learning, Code Intelligence and machine control as sibling capabilities. Record only verified durable facts.\n';
export function isPackagePathAllowed(relative) {
  const rel = relative.replaceAll('\\', '/').toLowerCase();
  const segments = rel.split('/');
  if (segments.some(part => ['.git','.desktop-commander','.rdc-standalone','do not touch without instruction explicit'].includes(part))) return false;
  if (segments.some(part => part === '.env' || (part.startsWith('.env.') && part !== '.env.example'))) return false;
  // Memory v1/v2, candidate/restore roots, activation markers and migration temp are private operational state.
  if (/^(?:secrets|runtime\/(?:memory(?:-[^/]*)?|memory-v2-activation\.json|tmp|bridge-auth|tracker|webview2|backups|partner|learning|phone|rdc))(?:\/|$)/.test(rel)) return false;
  return true;
}
export async function packageCopyAllowed(root, source) {
  const rel = path.relative(root, source);
  if (rel.startsWith('..') || path.isAbsolute(rel) || !isPackagePathAllowed(rel)) return false;
  return !(await fs.lstat(source)).isSymbolicLink();
}
export async function writePackagedFoundation(packageRoot) {
  const dir = path.join(packageRoot,'runtime','memory');
  await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,'00-agent-core-memory.md'),PACKAGED_FOUNDATION,{encoding:'utf8',flag:'wx'});
}
