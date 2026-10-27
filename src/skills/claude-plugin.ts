import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Claude plugin compatibility layer: a read-only component inventory and a SKILL.md frontmatter adapter.
 * The strict SkillService parser is never loosened. Claude-flavoured input is converted into the strict
 * subset and must then pass that same parser, with identical field values, before it is accepted.
 * Only the default component locations are scanned; paths declared in a plugin manifest are reported, not followed.
 */

export interface PluginFile { relative: string; content: Buffer }
export interface SkillAdaptationChange { field: string; action: string; from?: string; to?: string }
export type ClaudeSkillStatus = 'compatible' | 'adaptable' | 'unsupported';
interface StrictFields {
  name: string; description: string; license?: string; compatibility?: string;
  allowedTools: string[]; metadata: Record<string, string>;
}
/** Injected so this module never imports (and never duplicates) the SkillService parser. */
export type StrictSkillParser = (raw: string) => StrictFields;

export interface ClaudeSkillAnalysis {
  status: ClaudeSkillStatus;
  reason?: string;
  sourceName?: string;
  mappedName?: string;
  changes: SkillAdaptationChange[];
  missingReferences: string[];
  /** Adapted tree in directory-walk order; the unchanged input when the skill is already compatible. */
  files: PluginFile[];
  originalSha256?: string;
}
export interface ClaudePluginOtherComponent {
  type: 'command' | 'agent' | 'hook' | 'mcp';
  path: string;
  status: 'unsupported';
  reason: string;
  items: string[];
  itemsTruncated?: boolean;
}
export interface ClaudePluginSkillComponent {
  type: 'skill';
  path: string;
  directory: string;
  status: ClaudeSkillStatus;
  reason?: string;
  mappedName?: string;
  changes: SkillAdaptationChange[];
  missingReferences: string[];
  fileCount?: number;
  digestBefore?: string;
  digestAfter?: string;
  catalog?: 'absent' | 'same-digest' | 'different-digest';
  /** True when an active skill with this identifier exists and differs, i.e. stage_revision can take it. */
  stageable?: boolean;
}
export interface ClaudePluginPreview {
  kind: 'claude-plugin-preview';
  readOnly: true;
  executionAuthority: false;
  plugin: PluginInventory['plugin'];
  components: Array<ClaudePluginSkillComponent | ClaudePluginOtherComponent>;
  collisions: Array<{ name: string; kind: 'mapping' | 'catalog'; blocking: boolean; sources: string[] }>;
  summary: Record<ClaudeSkillStatus, number>;
  omitted: { skills: number };
}
export interface SkillAdaptationReport {
  version: 1;
  source: { kind: 'claude-plugin-skill'; path: string; originalName?: string; originalSkillMdSha256?: string };
  mappedName: string;
  changes: SkillAdaptationChange[];
  missingReferences: string[];
  digestBefore: string;
  digestAfter: string;
  filesBefore: Array<{ path: string; sha256: string; size: number }>;
  filesAfter: Array<{ path: string; sha256: string; size: number }>;
}
export interface PluginInventory {
  plugin: { name?: string; version?: string; manifest: 'absent' | 'present' | 'invalid'; declares: string[] };
  skills: Array<{ directory: string; path: string; error?: string }>;
  skillsOmitted: number;
  others: ClaudePluginOtherComponent[];
}

const MAX_SKILL_DIRS = 128;
const MAX_ITEMS = 64;
const MAX_CONFIG_BYTES = 256 * 1024;
const MAX_REFERENCES = 64;
const ORIGINAL_PATH = 'references/claude-original-skill.md';
const STRICT_KEYS = new Set(['name', 'description', 'license', 'compatibility', 'allowed-tools', 'metadata']);
const REPORT_ONLY = 'REPORTED_ONLY_NOT_INSTALLED';

/** Plugin text is untrusted: keep reports printable, bounded and free of control characters. */
export function reportLabel(value: unknown, max = 120): string {
  return String(value).replace(/[^\x20-\x7e]/g, '?').slice(0, max);
}
/** Error code only: never echo raw messages (they may carry paths or plugin text). */
export function reasonCode(error: unknown): string {
  const match = /^SKILL_[A-Z0-9_]+(?:: [^\n]{0,80})?/.exec(error instanceof Error ? error.message : '');
  return reportLabel(match ? match[0] : 'SKILL_PLUGIN_UNREADABLE', 100);
}
const sha256 = (bytes: Uint8Array) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
function fail(code: string, detail?: string): never {
  throw new Error(detail ? `${code}: ${reportLabel(detail, 80)}` : code);
}

/** Deterministic display-name to identifier mapping: lowercase ASCII words joined by single hyphens, 64 max. */
export function skillIdentifier(display: string): string {
  return display.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64).replace(/-+$/g, '');
}
/** Same order as the guarded directory walk: per-directory localeCompare, depth first. */
export function walkOrder(a: string, b: string): number {
  const left = a.split('/'), right = b.split('/');
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    const order = left[index]!.localeCompare(right[index]!);
    if (order) return order;
  }
  return left.length - right.length;
}

interface FieldValue { kind: 'scalar' | 'folded' | 'list' | 'map'; text: string; items: string[]; map: Array<[string, string]> }
const field = (kind: FieldValue['kind'], text = '', items: string[] = [], map: Array<[string, string]> = []): FieldValue =>
  ({ kind, text, items, map });

function scalarText(raw: string): string {
  const value = raw.trim();
  if (value.startsWith('"')) {
    let parsed: unknown;
    try { parsed = JSON.parse(value); } catch { return fail('SKILL_PLUGIN_FRONTMATTER_UNPARSEABLE'); }
    return typeof parsed === 'string' ? parsed : fail('SKILL_PLUGIN_FRONTMATTER_UNPARSEABLE');
  }
  if (value.startsWith("'")) {
    return value.length > 1 && value.endsWith("'")
      ? value.slice(1, -1).replaceAll("''", "'") : fail('SKILL_PLUGIN_FRONTMATTER_UNPARSEABLE');
  }
  if (/^[&*!{]/.test(value)) fail('SKILL_PLUGIN_FRONTMATTER_UNPARSEABLE');
  return value.replace(/\s+#.*$/, '');
}
const folded = (lines: string[]) => field('folded', lines.map(line => line.trim()).join(' '));

/** Small YAML subset: flat keys with scalars, block scalars, `- item` lists and one-level maps. */
function readFields(frontmatter: string): Map<string, FieldValue> {
  const lines = frontmatter.split(/\r?\n/);
  const fields = new Map<string, FieldValue>();
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const head = /^([A-Za-z0-9_.-]+):(?:[ \t]+(.*))?$/.exec(line);
    if (!head || fields.has(head[1]!)) fail('SKILL_PLUGIN_FRONTMATTER_UNPARSEABLE');
    const rest = (head![2] ?? '').trim();
    const block: string[] = [];
    while (index + 1 < lines.length && (!lines[index + 1]!.trim() || /^[ \t]/.test(lines[index + 1]!))) block.push(lines[++index]!);
    const body = block.filter(entry => entry.trim());
    let value: FieldValue;
    if (/^[>|][+-]?$/.test(rest)) value = folded(body);
    else if (rest && body.length) value = folded([rest, ...body]);
    else if (rest) value = field('scalar', scalarText(rest));
    else if (!body.length) value = field('scalar');
    else if (body.every(entry => /^\s*-\s+\S/.test(entry))) {
      value = field('list', '', body.map(entry => scalarText(entry.replace(/^\s*-\s+/, ''))));
    } else if (body.every(entry => /^\s+[A-Za-z0-9._-]+:[ \t]+\S/.test(entry))) {
      value = field('map', '', [], body.map(entry => {
        const pair = /^\s+([A-Za-z0-9._-]+):[ \t]+(.*)$/.exec(entry)!;
        return [pair[1]!, scalarText(pair[2]!)] as [string, string];
      }));
    } else return fail('SKILL_PLUGIN_FRONTMATTER_UNPARSEABLE');
    fields.set(head![1]!, value);
  }
  return fields;
}
/** Split a tool string on commas or whitespace outside parentheses, e.g. `Read Bash(git add:*)`. */
function toolTokens(text: string): string[] {
  const tokens: string[] = [];
  let current = '', depth = 0;
  for (const char of text) {
    if (char === '(') depth++;
    else if (char === ')') depth = Math.max(0, depth - 1);
    if (!depth && (char === ',' || /\s/.test(char))) { if (current) tokens.push(current); current = ''; } else current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

/** Relative targets (markdown links and `references/`-style code spans) that do not resolve inside the skill tree. */
export function findMissingReferences(markdown: string, relatives: string[]): string[] {
  const known = new Set(relatives);
  const directories = new Set<string>();
  for (const relative of relatives) {
    const parts = relative.split('/');
    for (let size = 1; size < parts.length; size++) directories.add(parts.slice(0, size).join('/'));
  }
  const text = markdown.replace(/^(```|~~~)[\s\S]*?^\1/gm, '');
  const targets = new Set<string>();
  for (const match of text.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^)]*["'])?\s*\)/g)) targets.add(match[1]!);
  for (const match of text.matchAll(/`((?:references|examples|scripts|assets)\/[^`\s]+)`/g)) targets.add(match[1]!);
  const missing = new Set<string>();
  for (const target of targets) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || /^[#/]/.test(target) || /[\\*<>{}$|]/.test(target)) continue;
    const clean = target.split('#')[0]!.split('?')[0]!;
    if (!clean) continue;
    const resolved = path.posix.normalize(clean).replace(/\/$/, '');
    if (resolved === '.') continue;
    if (resolved === '..' || resolved.startsWith('../') || (!known.has(resolved) && !directories.has(resolved))) {
      missing.add(reportLabel(clean));
    }
  }
  return [...missing].sort().slice(0, MAX_REFERENCES);
}

function adaptFrontmatter(skill: PluginFile, files: PluginFile[], directory: string, parse: StrictSkillParser) {
  const original = skill.content.toString('utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(original);
  if (!match) fail('SKILL_FRONTMATTER_MISSING');
  const fields = readFields(match![1]!);
  const body = original.slice(match![0].length);
  const changes: SkillAdaptationChange[] = [];
  const text = (key: string): string | undefined => {
    const value = fields.get(key);
    if (!value) return undefined;
    if (value.kind === 'list' || value.kind === 'map') fail('SKILL_PLUGIN_KEY_UNMAPPABLE', key);
    if (value.kind === 'folded') changes.push({ field: key, action: 'multiline-folded' });
    return value.text.trim();
  };

  const sourceName = text('name') || undefined;
  const display = sourceName ?? directory;
  if (!sourceName) changes.push({ field: 'name', action: 'name-from-directory', to: reportLabel(directory) });
  const mappedName = skillIdentifier(display);
  if (!mappedName) fail('SKILL_PLUGIN_NAME_UNMAPPABLE');
  if (mappedName !== display) changes.push({ field: 'name', action: 'name-mapped', from: reportLabel(display), to: mappedName });
  const description = text('description');
  if (!description) fail('SKILL_PLUGIN_DESCRIPTION_MISSING');
  const license = text('license') || undefined, compatibility = text('compatibility') || undefined;

  let tools: string[] = [];
  const toolField = fields.get('allowed-tools');
  if (toolField?.kind === 'map') fail('SKILL_PLUGIN_KEY_UNMAPPABLE', 'allowed-tools');
  if (toolField?.kind === 'list') tools = toolField.items;
  else if (toolField) {
    const raw = text('allowed-tools')!;
    if (raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw.replaceAll("'", '"'));
        if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string')) throw new Error();
        tools = parsed.map(item => item.trim()).filter(Boolean);
      } catch { fail('SKILL_ALLOWED_TOOLS_INVALID'); }
    } else tools = toolTokens(raw);
    changes.push({ field: 'allowed-tools', action: 'converted-to-list' });
  }

  const metadata = new Map<string, string>();
  const put = (key: string, value: string) => {
    if (metadata.has(key)) fail('SKILL_PLUGIN_METADATA_CONFLICT', key);
    metadata.set(key, value);
  };
  const nested = fields.get('metadata');
  if (nested?.kind === 'map') for (const [key, value] of nested.map) put(key, value);
  else if (nested && (nested.kind !== 'scalar' || nested.text)) fail('SKILL_PLUGIN_KEY_UNMAPPABLE', 'metadata');
  for (const key of fields.keys()) {
    if (STRICT_KEYS.has(key)) continue;
    const target = key === 'version' ? 'version' : 'claude-' + key;
    put(target, text(key)!);
    changes.push({ field: key, action: 'moved-to-metadata', to: 'metadata.' + target });
  }
  const originalSha256 = sha256(skill.content);
  put('source-format', 'claude-plugin-skill');
  if (mappedName !== display && sourceName) put('source-name', sourceName);
  put('source-sha256', originalSha256.slice('sha256:'.length));
  changes.push({ field: 'metadata', action: 'provenance-added', to: 'source-format, source-sha256' + (metadata.has('source-name') ? ', source-name' : '') });
  if (files.some(file => file.relative === ORIGINAL_PATH)) fail('SKILL_PLUGIN_ORIGINAL_PATH_OCCUPIED');
  changes.push({ field: ORIGINAL_PATH, action: 'original-preserved' });

  const quote = JSON.stringify;
  const rewritten = [
    '---', `name: ${mappedName}`, `description: ${quote(description)}`,
    ...(license ? [`license: ${quote(license)}`] : []),
    ...(compatibility ? [`compatibility: ${quote(compatibility)}`] : []),
    ...(tools.length ? ['allowed-tools:', ...tools.map(tool => `  - ${quote(tool)}`)] : []),
    'metadata:', ...[...metadata].map(([key, value]) => `  ${key}: ${quote(value)}`),
    '---', '',
  ].join('\n') + body;

  // Round trip: the strict parser must accept the result and silently normalise nothing.
  const parsed = parse(rewritten);
  const same = parsed.name === mappedName && parsed.description === description
    && (parsed.license ?? '') === (license ?? '') && (parsed.compatibility ?? '') === (compatibility ?? '')
    && JSON.stringify(parsed.allowedTools) === JSON.stringify(tools)
    && JSON.stringify(Object.entries(parsed.metadata).sort()) === JSON.stringify([...metadata].sort());
  if (!same) fail('SKILL_PLUGIN_ROUNDTRIP_MISMATCH');
  return { rewritten, mappedName, sourceName: display, changes, originalSha256 };
}

/** Pure analysis of one skill directory (already read through the guarded walk). */
export function adaptClaudeSkill(files: PluginFile[], directory: string, parse: StrictSkillParser): ClaudeSkillAnalysis {
  const skill = files.find(file => file.relative === 'SKILL.md');
  const failed = (error: unknown): ClaudeSkillAnalysis => ({
    status: 'unsupported', reason: reasonCode(error), changes: [], missingReferences: [], files,
  });
  if (!skill) return failed(new Error('SKILL_MD_NOT_FOUND'));
  const missingReferences = findMissingReferences(skill.content.toString('utf8'), files.map(file => file.relative));
  try {
    const strict = parse(skill.content.toString('utf8'));
    return { status: 'compatible', sourceName: strict.name, mappedName: strict.name, changes: [], missingReferences, files };
  } catch { /* not strict-valid: try the adapter below */ }
  try {
    const adapted = adaptFrontmatter(skill, files, directory, parse);
    const output = files.map(file => file.relative === 'SKILL.md'
      ? { relative: 'SKILL.md', content: Buffer.from(adapted.rewritten, 'utf8') } : file);
    output.push({ relative: ORIGINAL_PATH, content: skill.content });
    output.sort((a, b) => walkOrder(a.relative, b.relative));
    return { status: 'adaptable', sourceName: adapted.sourceName, mappedName: adapted.mappedName,
      changes: adapted.changes, missingReferences, files: output, originalSha256: adapted.originalSha256 };
  } catch (error) { return { ...failed(error), missingReferences }; }
}

async function entryInfo(target: string) {
  try { return await lstat(target); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
/** `null` when absent; refuses symlinks and oversized files like the Skill guards do. */
async function readJson(file: string): Promise<{ value?: unknown; error?: string } | null> {
  const info = await entryInfo(file);
  if (!info) return null;
  if (info.isSymbolicLink() || !info.isFile()) return { error: 'SKILL_SYMLINK_REFUSED' };
  if (info.size > MAX_CONFIG_BYTES) return { error: 'SKILL_FILE_TOO_LARGE' };
  try { return { value: JSON.parse(await readFile(file, 'utf8')) }; } catch { return { error: 'INVALID_JSON' }; }
}
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const other = (type: ClaudePluginOtherComponent['type'], relative: string, items: string[], error?: string): ClaudePluginOtherComponent => ({
  type, path: relative, status: 'unsupported', reason: error ?? REPORT_ONLY,
  items: items.slice(0, MAX_ITEMS).map(item => reportLabel(item, 64)), ...(items.length > MAX_ITEMS ? { itemsTruncated: true } : {}),
});
async function collectMarkdown(directory: string, prefix: string, out: string[], depth = 0): Promise<void> {
  if (depth > 3) return;
  const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (out.length > MAX_ITEMS) return;
    if (entry.isSymbolicLink()) continue; // never followed
    const relative = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isDirectory()) await collectMarkdown(path.join(directory, entry.name), relative, out, depth + 1);
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(relative);
  }
}

export async function isClaudePluginRoot(directory: string): Promise<boolean> {
  const names = new Set(await readdir(directory));
  return !names.has('SKILL.md') && ['.claude-plugin', 'skills', 'commands', 'agents', 'hooks', '.mcp.json'].some(name => names.has(name));
}

/** Read-only inventory. Hook commands, MCP launch details and free-text descriptions are never echoed. */
export async function inventoryClaudePlugin(root: string): Promise<PluginInventory> {
  const manifest = await readJson(path.join(root, '.claude-plugin', 'plugin.json'));
  const data = record(manifest?.value);
  const plugin: PluginInventory['plugin'] = {
    manifest: !manifest ? 'absent' : manifest.error ? 'invalid' : 'present',
    declares: ['skills', 'commands', 'agents', 'hooks', 'mcpServers'].filter(key => key in data),
    ...(typeof data.name === 'string' ? { name: reportLabel(data.name, 64) } : {}),
    ...(typeof data.version === 'string' ? { version: reportLabel(data.version, 64) } : {}),
  };

  const skills: PluginInventory['skills'] = [];
  let skillsOmitted = 0;
  const skillsInfo = await entryInfo(path.join(root, 'skills'));
  if (skillsInfo && (skillsInfo.isSymbolicLink() || !skillsInfo.isDirectory())) {
    skills.push({ directory: 'skills', path: 'skills', error: 'SKILL_SYMLINK_REFUSED' });
  } else if (skillsInfo) {
    const entries = (await readdir(path.join(root, 'skills'), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue; // stray files (README, ...) are not skills
      if (skills.length >= MAX_SKILL_DIRS) { skillsOmitted++; continue; }
      skills.push({ directory: entry.name, path: 'skills/' + entry.name, ...(entry.isSymbolicLink() ? { error: 'SKILL_SYMLINK_REFUSED' } : {}) });
    }
  }

  const others: ClaudePluginOtherComponent[] = [];
  for (const [type, folder] of [['command', 'commands'], ['agent', 'agents']] as const) {
    const info = await entryInfo(path.join(root, folder));
    if (!info) continue;
    if (info.isSymbolicLink() || !info.isDirectory()) { others.push(other(type, folder, [], 'SKILL_SYMLINK_REFUSED')); continue; }
    const names: string[] = [];
    await collectMarkdown(path.join(root, folder), '', names);
    others.push(other(type, folder, names));
  }
  const hooks = await readJson(path.join(root, 'hooks', 'hooks.json'));
  if (hooks || await entryInfo(path.join(root, 'hooks'))) {
    const config = record(hooks?.value);
    const events = Object.entries(record(config.hooks ?? config)).map(([event, handlers]) =>
      `${event} (${Array.isArray(handlers) ? handlers.reduce((total, item) => total + (Array.isArray(record(item).hooks) ? (record(item).hooks as unknown[]).length : 1), 0) : 0})`);
    others.push(other('hook', hooks ? 'hooks/hooks.json' : 'hooks', events, hooks?.error));
  }
  const mcp = await readJson(path.join(root, '.mcp.json'));
  if (mcp) {
    const config = record(mcp.value);
    others.push(other('mcp', '.mcp.json', Object.keys(record(config.mcpServers ?? config)), mcp.error));
  }
  return { plugin, skills, skillsOmitted, others };
}
