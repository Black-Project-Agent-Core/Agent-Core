import { createHash } from 'node:crypto';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const manifestSchema = z.object({
  version: z.literal(1),
  files: z.record(z.string(), digest).refine(value => Object.keys(value).length > 0),
  sections: z.record(z.string(), z.array(z.object({
    start: z.string().min(1), end: z.string().min(1), sha256: digest,
  })).min(1)),
});
type Manifest = z.infer<typeof manifestSchema>;
const policyPath = 'scripts/governance/native-freeze.json';
const policyOwners = [policyPath, 'scripts/governance', 'src/native-development-freeze.ts',
  'dist/native-development-freeze.js', 'src/rdc/mutation-coordinator.ts', 'dist/rdc/mutation-coordinator.js'];
const normalize = (text: string) => text.replace(/\r\n/g, '\n');
const hash = (text: string) => createHash('sha256').update(normalize(text)).digest('hex');
const key = (value: string) => {
  const normalized = path.resolve(value).replaceAll('\\', '/');
  return process.platform === 'win32' ? normalized.toLowerCase().replace(/:(?!\/)[^/]*$/, '') : normalized;
};
const contains = (parent: string, child: string) => child === parent || child.startsWith(parent + '/');
const sharedAgentFiles = ['agent-knowledge-synthesis.ts', 'agent-learning-loop.ts'];
function blocked(detail: string): never {
  throw new Error(`NATIVE_AGENT_FROZEN: ${detail}. Development targets EXTERNAL AI controlling Agent Core. Do not modify Native paths or refresh the baseline without an explicit human request for Native development.`);
}

async function canonical(input: string): Promise<string> {
  const absolute = path.resolve(input);
  try { return await realpath(absolute); }
  catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
    const parent = path.dirname(absolute);
    if (parent === absolute) return absolute;
    return path.join(await canonical(parent), path.basename(absolute));
  }
}

async function loadManifest(root: string): Promise<Manifest> {
  try {
    const manifest = manifestSchema.parse(JSON.parse(await readFile(path.join(root, policyPath), 'utf8')));
    for (const file of [...Object.keys(manifest.files), ...Object.keys(manifest.sections)]) {
      if (file.includes('\\') || file.split('/').some(part => !part || part === '..' || part === '.') || path.isAbsolute(file)) {
        blocked('invalid baseline path');
      }
    }
    return manifest;
  } catch { return blocked('baseline missing or invalid'); }
}

function assertSections(file: string, text: string, sections: Manifest['sections'][string]): void {
  const content = normalize(text);
  for (const section of sections) {
    const start = content.indexOf(section.start), end = content.indexOf(section.end);
    if (start < 0 || end < start || content.indexOf(section.start, start + 1) >= 0
      || content.indexOf(section.end, end + 1) >= 0
      || hash(content.slice(start, end + section.end.length)) !== section.sha256) blocked(file + ' protected section changed');
  }
}

/** shortcut: fingerprints protect known Native sections; use OS isolation to constrain unrestricted external shells. */
export class NativeDevelopmentFreeze {
  private manifest?: Promise<Manifest>;
  private readonly root: string;
  constructor(root: string) { this.root = path.resolve(root); }

  async assertWritable(target: string, nextText?: string | (() => Promise<string>)): Promise<void> {
    const root = key(await canonical(this.root));
    const candidates = [...new Set([key(target), key(await canonical(target))])];
    const identity = await stat(target).catch(error => {
      if (['ENOENT', 'ENOTDIR'].includes(error.code)) return undefined;
      throw error;
    });
    const hardLinked = identity?.isFile() && identity.nlink > 1;
    if (!hardLinked && !candidates.some(candidate => contains(root, candidate) || contains(candidate, root))) return;
    const manifest = await (this.manifest ??= loadManifest(this.root));
    const full = [...Object.keys(manifest.files), ...policyOwners];
    const shared = Object.keys(manifest.sections);
    // Compiled Native files are protected too; compilation itself is checked before tsc.
    const compiled = [...full, ...shared].filter(file => file.startsWith('src/') && file.endsWith('.ts'))
      .map(file => 'dist/' + file.slice(4, -3) + '.js');
    if (hardLinked && identity) {
      for (const relative of [...full, ...shared, ...compiled]) {
        const owned = path.join(root, relative);
        const other = await stat(owned).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
        if (other?.isFile() && other.dev === identity.dev && other.ino === identity.ino) candidates.push(key(owned));
      }
    }
    for (const candidate of candidates) {
      const relative = path.relative(root, candidate).replaceAll('\\', '/');
      if (/^(src|dist)\/agent-/.test(relative)
        && !sharedAgentFiles.some(file => relative === 'src/' + file || relative === 'dist/' + file.replace(/\.ts$/, '.js'))) {
        blocked(relative);
      }
      for (const relative of [...full, ...compiled]) {
        const owned = key(path.join(root, relative));
        if (contains(candidate, owned) || contains(owned, candidate)) blocked(relative);
      }
      for (const relative of shared) {
        const owned = key(path.join(root, relative));
        if (candidate === owned && nextText !== undefined) assertSections(relative,
          typeof nextText === 'function' ? await nextText() : nextText, manifest.sections[relative]);
        else if (contains(candidate, owned) || contains(owned, candidate)) blocked(relative);
      }
    }
  }

  async verify(): Promise<{ files: number; sections: number }> {
    const manifest = await loadManifest(this.root);
    for (const name of await readdir(path.join(this.root, 'src'))) {
      if (name.toLowerCase().startsWith('agent-') && !sharedAgentFiles.includes(name) && !manifest.files['src/' + name]) {
        blocked('new Native owner src/' + name);
      }
    }
    for (const [file, expected] of Object.entries(manifest.files)) {
      const content = await readFile(path.join(this.root, file), 'utf8').catch(() => blocked(file + ' missing'));
      if (hash(content) !== expected) blocked(file + ' changed');
    }
    for (const [file, sections] of Object.entries(manifest.sections)) {
      const content = await readFile(path.join(this.root, file), 'utf8').catch(() => blocked(file + ' missing'));
      assertSections(file, content, sections);
    }
    return { files: Object.keys(manifest.files).length,
      sections: Object.values(manifest.sections).reduce((sum, sections) => sum + sections.length, 0) };
  }
}
