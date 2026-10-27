import { lstat, open, readdir } from 'node:fs/promises';
import path from 'node:path';
import { PARALLEL_SKILL_HOMES } from './project-structure.mjs';

const runtimeRoles = new Set(['capability-packs', 'catalog', 'revisions', '.staging', 'packages', 'exports', 'proposals', 'tooling']);
const revisionRoles = new Set(['staged', 'history']);
const exportProfiles = new Set(['claude', 'codex']);
const skillName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Read-only ownership checks. SkillService still owns artifact validation and writes.
// Inspect declared homes only; never crawl unrelated runtime data or follow links.
export async function inspectSkillStorageLayout(projectRoot) {
  const root = path.resolve(projectRoot);
  const issues = [];
  const issue = (relative, message) => {
    if (!issues.some(item => item.path === relative)) issues.push({ path: relative, message });
  };
  async function info(relative) {
    const parts = relative.split('/');
    let target = root, value;
    for (let index = 0; index < parts.length; index++) {
      target = path.join(target, parts[index]);
      try { value = await lstat(target); }
      catch (error) {
        if (error.code === 'ENOENT') return null;
        if (error.code === 'ENOTDIR') { issue(parts.slice(0, index).join('/'), 'The declared storage home must be a directory.'); return null; }
        throw error;
      }
      if (index < parts.length - 1 && value.isSymbolicLink()) {
        issue(parts.slice(0, index + 1).join('/'), 'Storage ownership forbids symbolic links/junctions.');
        return null;
      }
    }
    return value;
  }
  async function entries(relative) {
    const value = await info(relative);
    if (!value) return [];
    if (value.isSymbolicLink()) { issue(relative, 'Storage ownership forbids symbolic links/junctions.'); return []; }
    if (!value.isDirectory()) { issue(relative, 'The declared storage home must be a directory.'); return []; }
    return readdir(path.join(root, relative), { withFileTypes: true });
  }
  async function children(relative, allowed) {
    const found = await entries(relative);
    for (const entry of found) {
      const child = relative + '/' + entry.name;
      if (entry.isSymbolicLink()) issue(child, 'Storage ownership forbids symbolic links/junctions.');
      else if (entry.isDirectory() && !allowed.has(entry.name))
        issue(child, 'Unregistered storage role; reuse the existing home for this purpose.');
      else if (entry.isDirectory()) await entries(child);
      else if (allowed.has(entry.name)) issue(child, 'The declared storage role must be a directory.');
      else if (entry.name === 'SKILL.md') issue(child, 'Skill sources belong in runtime/skills/capability-packs; active artifacts belong in catalog.');
    }
    return found.filter(entry => entry.isDirectory() && allowed.has(entry.name));
  }
  async function declaredOwner(relative) {
    const file = await open(path.join(root, relative, 'SKILL.md'), 'r');
    try {
      const buffer = Buffer.alloc(64 * 1024); // Native metadata validation remains SkillService's responsibility.
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      const text = buffer.subarray(0, bytesRead).toString('utf8').replace(/^\uFEFF/, '');
      if (!/^---\r?\n/.test(text)) return null;
      const header = text.replace(/^---\r?\n/, '').split(/\r?\n---(?:\r?\n|$)/, 1)[0];
      const names = header.split(/\r?\n/).filter(line => line.startsWith('name:'));
      if (names.length !== 1) return null;
      const value = names[0].slice(5).trim();
      if (value.startsWith('"')) { try { return JSON.parse(value); } catch { return null; } }
      if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'");
      return value;
    } finally { await file.close(); }
  }
  async function artifacts(relative) {
    let count = 0;
    for (const entry of await entries(relative)) {
      const child = relative + '/' + entry.name;
      if (entry.isSymbolicLink()) { issue(child, 'Skill roots must not be symbolic links/junctions.'); continue; }
      if (!entry.isDirectory()) {
        if (entry.name === 'SKILL.md') issue(child, 'A Skill entrypoint belongs in its canonical Skill directory, not the collection root.');
        continue; // Root README is documentation, not an artifact.
      }
      if (!skillName.test(entry.name) || entry.name.length > 64) {
        issue(child, 'Use one canonical Skill name per directory.'); continue;
      }
      const entrypoint = await info(child + '/SKILL.md');
      if (!entrypoint || entrypoint.isSymbolicLink() || !entrypoint.isFile())
        issue(child, 'A Skill directory must contain its own regular SKILL.md; no nested alternate home.');
      else if (await declaredOwner(child) !== entry.name)
        issue(child, 'Directory name must match the declared Skill name; do not create a renamed source/catalog copy.');
      else count++;
    }
    return count;
  }

  // These are parallel project homes, not external user-selected import/install paths.
  for (const relative of PARALLEL_SKILL_HOMES) {
    const value = await info(relative);
    if (value && (value.isDirectory() || value.isSymbolicLink()))
      issue(relative, 'Respect the existing runtime/skills home; parallel Skill storage outside it is forbidden.');
  }
  await children('runtime/skills', runtimeRoles);
  const sourceSkillCount = await artifacts('runtime/skills/capability-packs');
  const catalogSkillCount = await artifacts('runtime/skills/catalog');
  await children('runtime/skills/exports', exportProfiles);
  for (const entry of await entries('runtime/skills/revisions')) {
    const relative = 'runtime/skills/revisions/' + entry.name;
    if (entry.isSymbolicLink()) { issue(relative, 'Revision roots must not be symbolic links/junctions.'); continue; }
    if (!entry.isDirectory()) continue;
    if (!skillName.test(entry.name) || entry.name.length > 64) issue(relative, 'Revision ownership must use the canonical Skill name.');
    for (const role of await children(relative, revisionRoles)) {
      for (const revision of await entries(relative + '/' + role.name)) {
        const target = relative + '/' + role.name + '/' + revision.name;
        if (revision.isSymbolicLink()) issue(target, 'Revision snapshots must not be symbolic links/junctions.');
        else if (revision.isDirectory() && !/^[a-f0-9]{64}$/.test(revision.name))
          issue(target, 'Use digest-addressed snapshots under staged/history; do not create alternate revision folders.');
        else if (!revision.isDirectory()) issue(target, 'Revision entries must be digest-addressed directories, not files.');
      }
    }
  }
  return { sourceSkillCount, catalogSkillCount, issues: issues.sort((a, b) => a.path.localeCompare(b.path)) };
}
