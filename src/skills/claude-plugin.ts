import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { oneLineLabel } from '../security/untrusted-text.js';

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
  /** Facts about the body that the adapter reports but never acts on (plugin-root variable, links leaving the skill). */
  notes: string[];
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
  /** Commands only: how many look like skill candidates (they have a description). Never activated. */
  candidates?: number;
}
export interface ClaudeMarketplace {
  name?: string;
  plugins: Array<{ name: string; source: 'local' | 'remote' | 'unknown'; path?: string }>;
  pluginsTruncated?: boolean;
  /** A marketplace lists plugins; it is not one. Validate each plugin folder instead. */
  hint: 'MARKETPLACE_ROOT_VALIDATE_EACH_PLUGIN_FOLDER';
}
export interface ClaudeDeclaredComponent {
  key: string;
  status: 'not-scanned';
  paths: string[];
  invalid?: string[];
}
export interface ClaudePluginSkillComponent {
  type: 'skill';
  path: string;
  directory: string;
  status: ClaudeSkillStatus;
  reason?: string;
  mappedName?: string;
  /** License the skill itself declares (frontmatter), after adaptation. */
  license?: string;
  changes: SkillAdaptationChange[];
  missingReferences: string[];
  notes?: string[];
  fileCount?: number;
  digestBefore?: string;
  digestAfter?: string;
  catalog?: 'absent' | 'same-digest' | 'different-digest';
  /**
   * Who wrote the active skill that has this identifier. `same-plugin` and `other-plugin` come from the
   * `source-plugin` provenance key the adapter writes; `unverified` means the active skill has no such key
   * (it was not adapted, so nothing records its origin).
   */
  origin?: 'same-plugin' | 'other-plugin' | 'unverified';
  /** True when an active skill with this identifier exists, differs, and is not known to come from another plugin. */
  stageable?: boolean;
}
export interface ClaudePluginPreview {
  kind: 'claude-plugin-preview';
  readOnly: true;
  executionAuthority: false;
  plugin: PluginInventory['plugin'];
  marketplace?: ClaudeMarketplace;
  /** Component paths a manifest declares: validated and listed, never followed. */
  declared: ClaudeDeclaredComponent[];
  warnings: string[];
  components: Array<ClaudePluginSkillComponent | ClaudePluginOtherComponent>;
  collisions: Array<{ name: string; kind: 'mapping' | 'catalog'; blocking: boolean; sources: string[]; reason?: 'name-conflict-other-origin' }>;
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
  plugin: {
    name?: string; version?: string; manifest: 'absent' | 'present' | 'invalid'; declares: string[];
    /** License string the manifest declares, and what a root LICENSE file looks like (`proprietary-markers` is a heuristic). */
    license?: { manifest?: string; file: 'absent' | 'present' | 'proprietary-markers' };
  };
  marketplace?: ClaudeMarketplace;
  declared: ClaudeDeclaredComponent[];
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

// SKILL.md comes from a third-party plugin and the service accepts up to 2 MiB. Unbounded link quantifiers
// backtrack quadratically on repeated `](`, so both the scanned text and every quantifier are capped.
// shortcut: links after the first 256 KiB or with a target over 256 chars are not checked, raise if a real pack needs it.
const MAX_LINK_SCAN_CHARS = 256 * 1024;

/** Relative targets (markdown links and `references/`-style code spans) that do not resolve inside the skill tree. */
export function findMissingReferences(markdown: string, relatives: string[]): string[] {
  const known = new Set(relatives);
  const directories = new Set<string>();
  for (const relative of relatives) {
    const parts = relative.split('/');
    for (let size = 1; size < parts.length; size++) directories.add(parts.slice(0, size).join('/'));
  }
  const text = markdown.slice(0, MAX_LINK_SCAN_CHARS).replace(/^(```|~~~)[\s\S]*?^\1/gm, '');
  const targets = new Set<string>();
  for (const match of text.matchAll(/\]\(\s{0,16}<?([^)\s>]{1,256})>?(?:\s{1,16}["'][^)]{0,256}["'])?\s{0,16}\)/g)) targets.add(match[1]!);
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

/**
 * A UTF-8 BOM is stripped and reported; UTF-16 and invalid UTF-8 are named as such instead of surfacing as a
 * misleading "frontmatter missing". The untouched bytes are preserved in the original copy either way.
 */
function decodeSkill(buffer: Buffer, changes: SkillAdaptationChange[]): string {
  if ((buffer[0] === 0xff && buffer[1] === 0xfe) || (buffer[0] === 0xfe && buffer[1] === 0xff)) fail('SKILL_PLUGIN_ENCODING_UNSUPPORTED', 'utf-16');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer); }
  catch { return fail('SKILL_PLUGIN_ENCODING_UNSUPPORTED', 'not valid utf-8'); }
  if (text.startsWith('﻿')) { changes.push({ field: 'SKILL.md', action: 'bom-stripped' }); return text.slice(1); }
  return text;
}

/** Facts about the body that are reported but never acted on. Bounded like the link scan. */
function skillNotes(markdown: string): string[] {
  const text = markdown.slice(0, MAX_LINK_SCAN_CHARS);
  const notes: string[] = [];
  if (text.includes('${CLAUDE_PLUGIN_ROOT}')) notes.push('uses-CLAUDE_PLUGIN_ROOT');
  if (/(?:\]\(|`)(?:\.\.\/){1,3}[A-Za-z0-9._-]+\//.test(text)) notes.push('references-outside-skill-directory');
  return notes;
}

/** True when cleaning would remove more than whitespace differences. */
function hasHiddenText(value: string): boolean {
  return oneLineLabel(value, Infinity) !== value.replace(/\s+/g, ' ').trim();
}

function adaptFrontmatter(skill: PluginFile, files: PluginFile[], directory: string, parse: StrictSkillParser, pluginName?: string) {
  const changes: SkillAdaptationChange[] = [];
  const original = decodeSkill(skill.content, changes);
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(original);
  if (!match) fail('SKILL_FRONTMATTER_MISSING');
  const fields = readFields(match![1]!);
  const body = original.slice(match![0].length);
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
  let description = text('description');
  if (!description) fail('SKILL_PLUGIN_DESCRIPTION_MISSING');
  // The strict parser rejects `<` and `>` in a description (it stays strict); the adapter swaps look-alike single quotation marks.
  if (/[<>]/.test(description!)) {
    description = description!.replaceAll('<', '‹').replaceAll('>', '›');
    changes.push({ field: 'description', action: 'angle-brackets-normalized' });
  }
  // The description reaches the model through the Skill index: invisible characters and bidi overrides stay out of it.
  const visibleDescription = oneLineLabel(description, 4_000);
  if (visibleDescription !== description) {
    description = visibleDescription;
    changes.push({ field: 'description', action: 'invisible-characters-removed' });
  }
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
  if (pluginName) put('source-plugin', pluginName);
  changes.push({ field: 'metadata', action: 'provenance-added', to: 'source-format, source-sha256'
    + (metadata.has('source-name') ? ', source-name' : '') + (pluginName ? ', source-plugin' : '') });
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
export function adaptClaudeSkill(
  files: PluginFile[], directory: string, parse: StrictSkillParser, options: { pluginName?: string } = {},
): ClaudeSkillAnalysis {
  const skill = files.find(file => file.relative === 'SKILL.md');
  const failed = (error: unknown): ClaudeSkillAnalysis => ({
    status: 'unsupported', reason: reasonCode(error), changes: [], missingReferences: [], notes: [], files,
  });
  if (!skill) return failed(new Error('SKILL_MD_NOT_FOUND'));
  const markdown = skill.content.toString('utf8');
  const missingReferences = findMissingReferences(markdown, files.map(file => file.relative));
  const notes = skillNotes(markdown);
  try {
    const strict = parse(markdown);
    // A strict-valid skill is installed as is, unless its description hides characters the adapter would remove.
    if (!hasHiddenText(strict.description)) {
      return { status: 'compatible', sourceName: strict.name, mappedName: strict.name, changes: [], missingReferences, notes, files };
    }
  } catch { /* not strict-valid: try the adapter below */ }
  try {
    const adapted = adaptFrontmatter(skill, files, directory, parse, options.pluginName);
    const output = files.map(file => file.relative === 'SKILL.md'
      ? { relative: 'SKILL.md', content: Buffer.from(adapted.rewritten, 'utf8') } : file);
    output.push({ relative: ORIGINAL_PATH, content: skill.content });
    output.sort((a, b) => walkOrder(a.relative, b.relative));
    return { status: 'adaptable', sourceName: adapted.sourceName, mappedName: adapted.mappedName,
      changes: adapted.changes, missingReferences, notes, files: output, originalSha256: adapted.originalSha256 };
  } catch (error) { return { ...failed(error), missingReferences, notes }; }
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

// Heuristic only: "All rights reserved" is deliberately absent because MIT and Apache copyright lines carry it.
const PROPRIETARY_LICENSE = /\bproprietary\b|\bnon-?commercial\b|\bmay not be (?:used|copied|redistributed|reproduced)\b|\bcommercial terms\b/i;
async function licenseFileState(root: string): Promise<'absent' | 'present' | 'proprietary-markers'> {
  for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt']) {
    const info = await entryInfo(path.join(root, name));
    if (!info) continue;
    if (info.isSymbolicLink() || !info.isFile() || info.size > MAX_CONFIG_BYTES) return 'present';
    const text = await readFile(path.join(root, name), 'utf8');
    return PROPRIETARY_LICENSE.test(text.slice(0, 64 * 1024)) ? 'proprietary-markers' : 'present';
  }
  return 'absent';
}
function unsafeDeclaredPath(value: string): boolean {
  return path.isAbsolute(value) || /^[A-Za-z]:/.test(value) || value.replaceAll('\\', '/').split('/').includes('..');
}
function declaredComponents(keys: string[], data: Record<string, unknown>): ClaudeDeclaredComponent[] {
  return keys.map(key => {
    const raw = data[key];
    const paths = (typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : []).slice(0, 16);
    const invalid = paths.filter(unsafeDeclaredPath);
    return { key, status: 'not-scanned' as const, paths: paths.map(item => reportLabel(item, 120)),
      ...(invalid.length ? { invalid: invalid.map(item => reportLabel(item, 120)) } : {}) };
  });
}
/** A marketplace root lists plugins and has no plugin manifest of its own; entries are reported, never followed. */
async function readMarketplace(root: string): Promise<ClaudeMarketplace | undefined> {
  const file = await readJson(path.join(root, '.claude-plugin', 'marketplace.json'));
  if (!file || file.error) return undefined;
  const data = record(file.value);
  const entries = Array.isArray(data.plugins) ? data.plugins : [];
  return {
    ...(typeof data.name === 'string' ? { name: reportLabel(data.name, 64) } : {}),
    plugins: entries.slice(0, MAX_ITEMS).map(entry => {
      const item = record(entry), source = item.source;
      const name = reportLabel(typeof item.name === 'string' ? item.name : '?', 64);
      if (typeof source === 'string') {
        return source.startsWith('./') && !unsafeDeclaredPath(source)
          ? { name, source: 'local' as const, path: reportLabel(source, 120) } : { name, source: 'unknown' as const };
      }
      return { name, source: source && typeof source === 'object' ? 'remote' as const : 'unknown' as const };
    }),
    ...(entries.length > MAX_ITEMS ? { pluginsTruncated: true } : {}),
    hint: 'MARKETPLACE_ROOT_VALIDATE_EACH_PLUGIN_FOLDER',
  };
}
async function commandFacts(file: string): Promise<{ hasDescription: boolean; placeholders: boolean }> {
  const info = await entryInfo(file);
  if (!info || info.isSymbolicLink() || !info.isFile() || info.size > MAX_CONFIG_BYTES) return { hasDescription: false, placeholders: false };
  const text = (await readFile(file, 'utf8')).slice(0, 64 * 1024);
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text.slice(0, 8000));
  return {
    hasDescription: Boolean(frontmatter && /^description:[ \t]*\S/m.test(frontmatter[1]!)),
    placeholders: /\$ARGUMENTS\b|\$[1-9]\b/.test(text),
  };
}
/** Handler kinds per event, never the commands themselves. */
function hookSummary(event: string, handlers: unknown): string {
  const kinds = new Map<string, number>();
  if (Array.isArray(handlers)) {
    for (const item of handlers) {
      const inner = record(item).hooks;
      for (const hook of Array.isArray(inner) ? inner : [item]) {
        const kind = reportLabel(record(hook).type ?? 'unknown', 16);
        kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
      }
    }
  }
  const total = [...kinds.values()].reduce((sum, count) => sum + count, 0);
  return `${event} (${total}${total ? ': ' + [...kinds].map(([kind, count]) => `${kind} ${count}`).join(', ') : ''})`;
}
function mcpTransport(definition: unknown): string {
  const item = record(definition);
  if (!Object.keys(item).length) return 'not-a-server';
  if (typeof item.type === 'string') return reportLabel(item.type, 12);
  return item.url ? 'http' : item.command ? 'stdio' : 'unknown';
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
  plugin.license = {
    ...(typeof data.license === 'string' ? { manifest: reportLabel(data.license, 64) } : {}),
    file: await licenseFileState(root),
  };
  const declared = declaredComponents(plugin.declares, data);
  const marketplace = await readMarketplace(root);

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
    if (type === 'command') {
      // Commands are skill candidates when they describe themselves; they are listed, never converted or activated.
      const labels: string[] = [];
      let candidates = 0;
      for (const name of names.slice(0, MAX_ITEMS)) {
        const facts = await commandFacts(path.join(root, folder, ...name.split('/')));
        if (facts.hasDescription) candidates++;
        labels.push(name + (facts.placeholders ? ' [args]' : '') + (facts.hasDescription ? '' : ' [no-description]'));
      }
      others.push({ ...other(type, folder, labels), candidates });
    } else others.push(other(type, folder, names));
  }
  const hooks = await readJson(path.join(root, 'hooks', 'hooks.json'));
  if (hooks || await entryInfo(path.join(root, 'hooks'))) {
    const config = record(hooks?.value);
    const events = Object.entries(record(config.hooks ?? config)).map(([event, handlers]) => hookSummary(event, handlers));
    others.push(other('hook', hooks ? 'hooks/hooks.json' : 'hooks', events, hooks?.error));
  }
  const mcp = await readJson(path.join(root, '.mcp.json'));
  if (mcp) {
    const config = record(mcp.value);
    const servers = Object.entries(record(config.mcpServers ?? config)).map(([name, definition]) => `${name} (${mcpTransport(definition)})`);
    others.push(other('mcp', '.mcp.json', servers, mcp.error));
  }
  return { plugin, ...(marketplace ? { marketplace } : {}), declared, skills, skillsOmitted, others };
}
