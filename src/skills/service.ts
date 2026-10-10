import { createHash, randomUUID } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import PizZip from 'pizzip';
import * as yauzl from 'yauzl';
import { writeOwnedFileAtomic } from '../persistence/atomic-file.js';
import { validatePath } from '../rdc/tools/filesystem.js';
import { captureRepositoryIdentity } from '../memory/repository-identity.js';
import { normalizeRepositoryIdentity } from '../memory/provenance.js';
import type { MemoryRepositoryIdentity } from '../memory/types.js';
import type { SkillProposalRecord, SkillProposalDecision } from '../learning/skill-proposal-types.js';

const MAX_FILES = 256;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 16 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
const MAX_FRONTMATTER_BYTES = 64 * 1024;
const INTERNAL_META = '.agent-core-skill.json';
const REVISION_META = '.agent-core-revision.json';
const EXPORT_MANIFEST = 'manifest.json';
const MAX_SKILL_REVISIONS = 8;
const SKILL_EXPORT_PROFILES = {
  claude: '.claude/skills',
  codex: '.agents/skills',
} as const;

export type SkillExportProfile = keyof typeof SKILL_EXPORT_PROFILES;

export interface SkillMetadata {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  allowedTools: string[];
  metadata: Record<string, string>;
  parserProfile: 'strict-subset-v1';
}
export interface SkillSourceProvenance {
  version: 1;
  sourceKind: 'directory' | 'archive';
  contentDigest: string;
  declaredLicense?: string;
  identity?: MemoryRepositoryIdentity;
}

export interface SkillArtifactSummary {
  name: string;
  description: string;
  digest: string;
  fileCount: number;
  totalBytes: number;
  license?: string;
  compatibility?: string;
  allowedTools: string[];
  sourceProvenance?: SkillSourceProvenance;
}

export interface SkillExportResult extends SkillArtifactSummary {
  profile: SkillExportProfile;
  exportPath: string;
  targetRelativeRoot: string;
  manifestPath: string;
  manifestDigest: string;
}

interface ScannedFile {
  relative: string;
  absolute?: string;
  content?: Buffer;
  size: number;
}
interface ScannedSkill {
  metadata: SkillMetadata;
  files: ScannedFile[];
  digest: string;
  totalBytes: number;
}
const TOP_LEVEL_KEYS = new Set([
  'name','description','license','compatibility','allowed-tools','metadata',
]);

function validateName(raw: string): string {
  const value = raw.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || value.length > 64) {
    throw new Error('SKILL_NAME_INVALID');
  }
  return value;
}
function scalar(raw: string): string {
  const value = raw.trim();
  if (value === '|' || value === '>') throw new Error('SKILL_FRONTMATTER_MULTILINE_UNSUPPORTED');
  if (value.startsWith('"')) {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== 'string') throw new Error();
      return parsed;
    } catch {
      throw new Error('SKILL_FRONTMATTER_QUOTED_VALUE_INVALID');
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'");
  return value;
}
function parseInlineList(raw: string): string[] {
  const value = raw.trim();
  if (!value) return [];
  if (value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value.replaceAll("'", '"'));
      if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string')) throw new Error();
      return parsed.map(item => item.trim()).filter(Boolean);
    } catch {
      throw new Error('SKILL_ALLOWED_TOOLS_INVALID');
    }
  }
  return value.split(',').map(item => scalar(item)).filter(Boolean);
}
export function parseSkillMarkdown(raw: string): SkillMetadata {
  if (Buffer.byteLength(raw, 'utf8') > MAX_FILE_BYTES) throw new Error('SKILL_MD_TOO_LARGE');
  const normalized = raw.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) throw new Error('SKILL_FRONTMATTER_MISSING');
  const end = normalized.indexOf('\n---\n', 4);
  if (end < 0 || end > MAX_FRONTMATTER_BYTES) throw new Error('SKILL_FRONTMATTER_INVALID');
  const lines = normalized.slice(4, end).split('\n');
  const values = new Map<string, string>();
  const allowedTools: string[] = [];
  const metadata: Record<string, string> = {};
  let section: 'allowed-tools' | 'metadata' | null = null;

  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue;
    const indent = rawLine.length - rawLine.trimStart().length;
    const line = rawLine.trim();
    if (indent > 0) {
      if (section === 'allowed-tools' && line.startsWith('- ')) {
        const item = scalar(line.slice(2));
        if (item) allowedTools.push(item);
        continue;
      }
      if (section === 'metadata') {
        const colon = line.indexOf(':');
        if (colon <= 0) throw new Error('SKILL_METADATA_INVALID');
        const key = line.slice(0, colon).trim();
        if (!/^[A-Za-z0-9._-]{1,64}$/.test(key)) throw new Error('SKILL_METADATA_KEY_INVALID');
        metadata[key] = scalar(line.slice(colon + 1)).slice(0, 500);
        continue;
      }
      throw new Error('SKILL_FRONTMATTER_INDENT_INVALID');
    }
    const colon = line.indexOf(':');
    if (colon <= 0) throw new Error('SKILL_FRONTMATTER_LINE_INVALID');
    const key = line.slice(0, colon).trim();
    if (!TOP_LEVEL_KEYS.has(key)) throw new Error(`SKILL_FRONTMATTER_KEY_UNSUPPORTED: ${key}`);
    const value = line.slice(colon + 1);
    section = null;
    if (key === 'allowed-tools') {
      section = 'allowed-tools';
      allowedTools.push(...parseInlineList(value));
      continue;
    }
    if (key === 'metadata') {
      if (value.trim()) throw new Error('SKILL_METADATA_INLINE_UNSUPPORTED');
      section = 'metadata';
      continue;
    }
    values.set(key, scalar(value));
  }
  const name = validateName(values.get('name') ?? '');
  const description = (values.get('description') ?? '').trim();
  if (!description || description.length > 1024 || /[<>]/.test(description)) {
    throw new Error('SKILL_DESCRIPTION_INVALID');
  }
  const compatibility = values.get('compatibility')?.trim();
  if (compatibility && compatibility.length > 500) throw new Error('SKILL_COMPATIBILITY_INVALID');
  const license = values.get('license')?.trim();
  if (license && license.length > 200) throw new Error('SKILL_LICENSE_INVALID');
  return {
    name,
    description,
    ...(license ? { license } : {}),
    ...(compatibility ? { compatibility } : {}),
    allowedTools: [...new Set(allowedTools.map(item => item.trim()).filter(Boolean))].slice(0, 64),
    metadata,
    parserProfile: 'strict-subset-v1',
  };
}

function excluded(relative: string): boolean {
  const parts = relative.replaceAll('\\', '/').split('/');
  if (parts.includes('node_modules') || parts.includes('__pycache__') || parts.includes('.git')) return true;
  if (parts.length > 1 && parts[0] === 'evals') return true;
  const name = parts.at(-1) ?? '';
  return name === '.DS_Store' || name === INTERNAL_META || name === REVISION_META || name.endsWith('.pyc');
}
function updateDigest(hash: ReturnType<typeof createHash>, relative: string, content: Uint8Array): void {
  hash.update(relative.replaceAll('\\', '/'));
  hash.update('\0');
  hash.update(content);
  hash.update('\0');
}
async function scanDirectory(sourceRoot: string): Promise<ScannedSkill> {
  const root = await realpath(sourceRoot);
  const files: ScannedFile[] = [];
  let totalBytes = 0;
  const walk = async (directory: string, prefix = ''): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (excluded(relative)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('SKILL_SYMLINK_REFUSED');
      if (entry.isDirectory()) { await walk(absolute, relative); continue; }
      if (!entry.isFile()) throw new Error('SKILL_NON_REGULAR_ENTRY_REFUSED');
      const info = await lstat(absolute);
      if (info.size > MAX_FILE_BYTES) throw new Error('SKILL_FILE_TOO_LARGE');
      totalBytes += info.size;
      if (totalBytes > MAX_TOTAL_BYTES) throw new Error('SKILL_TOTAL_BYTES_LIMIT');
      files.push({ relative, absolute, size: info.size });
      if (files.length > MAX_FILES) throw new Error('SKILL_FILE_COUNT_LIMIT');
    }
  };
  await walk(root);
  const skillFile = files.find(file => file.relative === 'SKILL.md');
  if (!skillFile?.absolute) throw new Error('SKILL_MD_NOT_FOUND');
  const metadata = parseSkillMarkdown(await readFile(skillFile.absolute, 'utf8'));
  const hash = createHash('sha256');
  for (const file of files) updateDigest(hash, file.relative, await readFile(file.absolute!));
  return { metadata, files, digest: 'sha256:' + hash.digest('hex'), totalBytes };
}

export function sanitizeSkillArchivePath(raw: string): string {
  if (!raw || raw.includes('\0') || raw.includes('\\') || raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) {
    throw new Error('SKILL_ARCHIVE_PATH_INVALID');
  }
  const normalized = path.posix.normalize(raw);
  if (normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
    throw new Error('SKILL_ARCHIVE_PATH_ESCAPES_ROOT');
  }
  return normalized;
}
function zipSymlink(entry: yauzl.Entry): boolean {
  return ((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000;
}
function openZip(filePath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, decodeStrings: true }, (error, zip) => {
      if (error || !zip) reject(error ?? new Error('SKILL_ARCHIVE_OPEN_FAILED'));
      else resolve(zip);
    });
  });
}
function readZipEntry(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) return reject(error ?? new Error('SKILL_ARCHIVE_ENTRY_OPEN_FAILED'));
      const chunks: Buffer[] = [];
      let bytes = 0;
      stream.on('data', chunk => {
        const part = Buffer.from(chunk);
        bytes += part.length;
        if (bytes > MAX_FILE_BYTES) stream.destroy(new Error('SKILL_FILE_TOO_LARGE'));
        else chunks.push(part);
      });
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  });
}
async function scanArchive(filePath: string): Promise<ScannedSkill> {
  const info = await stat(filePath);
  if (!info.isFile() || info.size > MAX_ARCHIVE_BYTES) throw new Error('SKILL_ARCHIVE_SIZE_INVALID');
  const zip = await openZip(filePath);
  const rawFiles: Array<{ name: string; content: Buffer }> = [];
  let expanded = 0;
  await new Promise<void>((resolve, reject) => {
    let failed = false;
    const fail = (error: unknown) => {
      if (failed) return;
      failed = true;
      try { zip.close(); } catch {}
      reject(error);
    };
    zip.on('error', fail);
    zip.on('entry', entry => {
      void (async () => {
        try {
          const name = sanitizeSkillArchivePath(entry.fileName);
          if ((entry.generalPurposeBitFlag & 0x1) !== 0) throw new Error('SKILL_ARCHIVE_ENCRYPTED');
          if (![0, 8].includes(entry.compressionMethod)) throw new Error('SKILL_ARCHIVE_COMPRESSION_REFUSED');
          if (zipSymlink(entry)) throw new Error('SKILL_ARCHIVE_SYMLINK_REFUSED');
          if (name.endsWith('/')) return zip.readEntry();
          if (entry.uncompressedSize > MAX_FILE_BYTES) throw new Error('SKILL_FILE_TOO_LARGE');
          expanded += entry.uncompressedSize;
          if (expanded > MAX_TOTAL_BYTES) throw new Error('SKILL_TOTAL_BYTES_LIMIT');
          const content = await readZipEntry(zip, entry);
          rawFiles.push({ name, content });
          if (rawFiles.length > MAX_FILES) throw new Error('SKILL_FILE_COUNT_LIMIT');
          zip.readEntry();
        } catch (error) { fail(error); }
      })();
    });
    zip.on('end', () => { if (!failed) resolve(); });
    zip.readEntry();
  });
  const skillNames = rawFiles.map(file => file.name)
    .filter(name => name === 'SKILL.md' || name.endsWith('/SKILL.md'));
  if (skillNames.length !== 1) throw new Error('SKILL_ARCHIVE_SKILL_MD_AMBIGUOUS');
  const skillName = skillNames[0]!;
  const prefix = skillName === 'SKILL.md' ? '' : skillName.slice(0, -'SKILL.md'.length);
  const files: ScannedFile[] = [];
  const destinations = new Set<string>();
  let totalBytes = 0;
  for (const raw of rawFiles) {
    if (prefix && !raw.name.startsWith(prefix)) throw new Error('SKILL_ARCHIVE_MULTIPLE_ROOTS');
    const relative = prefix ? raw.name.slice(prefix.length) : raw.name;
    if (!relative || excluded(relative)) continue;
    const key = process.platform === 'win32' ? relative.toLowerCase() : relative;
    if (destinations.has(key)) throw new Error('SKILL_ARCHIVE_DUPLICATE_PATH');
    destinations.add(key);
    totalBytes += raw.content.length;
    files.push({ relative, content: raw.content, size: raw.content.length });
  }
  const skillFile = files.find(file => file.relative === 'SKILL.md');
  if (!skillFile?.content) throw new Error('SKILL_MD_NOT_FOUND');
  const metadata = parseSkillMarkdown(skillFile.content.toString('utf8'));
  const hash = createHash('sha256');
  for (const file of files.sort((a, b) => a.relative.localeCompare(b.relative))) {
    updateDigest(hash, file.relative, file.content!);
  }
  return { metadata, files, digest: 'sha256:' + hash.digest('hex'), totalBytes };
}
function normalizeSkillSourceProvenance(raw: unknown): SkillSourceProvenance | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const value = raw as Partial<SkillSourceProvenance>;
  if (value.version !== 1 || (value.sourceKind !== 'directory' && value.sourceKind !== 'archive')
    || typeof value.contentDigest !== 'string' || !/^sha256:[0-9a-f]{64}$/i.test(value.contentDigest)) {
    return undefined;
  }
  const identity = value.identity ? normalizeRepositoryIdentity(value.identity) : undefined;
  return {
    version: 1,
    sourceKind: value.sourceKind,
    contentDigest: value.contentDigest.toLowerCase(),
    ...(typeof value.declaredLicense === 'string' && value.declaredLicense.trim()
      ? { declaredLicense: value.declaredLicense.trim().slice(0, 200) }
      : {}),
    ...(identity ? { identity } : {}),
  };
}

async function captureSkillSourceProvenance(
  sourcePath: string,
  sourceKind: SkillSourceProvenance['sourceKind'],
  scanned: ScannedSkill,
): Promise<SkillSourceProvenance> {
  const identityRoot = sourceKind === 'directory' ? sourcePath : path.dirname(sourcePath);
  const identity = await captureRepositoryIdentity(identityRoot).catch(() => undefined);
  return {
    version: 1,
    sourceKind,
    contentDigest: scanned.digest,
    ...(scanned.metadata.license ? { declaredLicense: scanned.metadata.license.slice(0, 200) } : {}),
    ...(identity ? { identity } : {}),
  };
}

async function readSkillSourceProvenance(directory: string): Promise<SkillSourceProvenance | undefined> {
  try {
    const raw = JSON.parse(await readFile(path.join(directory, INTERNAL_META), 'utf8')) as {
      sourceProvenance?: unknown;
    };
    return normalizeSkillSourceProvenance(raw.sourceProvenance);
  } catch {
    return undefined;
  }
}

function sameSkillSourceLineage(
  left: SkillSourceProvenance | undefined,
  right: SkillSourceProvenance | undefined,
): boolean {
  if (!left || !right) return true;
  if (left.sourceKind !== right.sourceKind) return false;
  if (left.identity && right.identity) {
    return left.identity.repositoryId === right.identity.repositoryId
      && left.identity.worktreeId === right.identity.worktreeId;
  }
  return true;
}

function summary(scanned: ScannedSkill, sourceProvenance?: SkillSourceProvenance): SkillArtifactSummary {
  return {
    name: scanned.metadata.name,
    description: scanned.metadata.description,
    digest: scanned.digest,
    fileCount: scanned.files.length,
    totalBytes: scanned.totalBytes,
    ...(scanned.metadata.license ? { license: scanned.metadata.license } : {}),
    ...(scanned.metadata.compatibility ? { compatibility: scanned.metadata.compatibility } : {}),
    allowedTools: scanned.metadata.allowedTools,
    ...(sourceProvenance ? { sourceProvenance } : {}),
  };
}

interface SkillRevisionMetadata {
  version: 1;
  name: string;
  digest: string;
  kind: 'staged' | 'history';
  createdAt: string;
  evidenceRefs: string[];
  previousDigest?: string;
}
function normalizeSkillDigest(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) throw new Error('SKILL_REVISION_DIGEST_INVALID');
  return value;
}
function digestSegment(digest: string): string {
  return normalizeSkillDigest(digest).slice('sha256:'.length);
}
function normalizeEvidenceRefs(values: string[]): string[] {
  if (!Array.isArray(values) || values.length < 1 || values.length > 32) {
    throw new Error('SKILL_REVISION_EVIDENCE_REQUIRED');
  }
  const output = [...new Set(values.map(value => String(value).trim()).filter(Boolean))];
  if (!output.length || output.some(value => value.length > 500 || /[\0\r\n]/.test(value))) {
    throw new Error('SKILL_REVISION_EVIDENCE_INVALID');
  }
  return output;
}
async function writeScannedSkillTree(
  scanned: ScannedSkill,
  destination: string,
  revision?: SkillRevisionMetadata,
  sourceProvenance?: SkillSourceProvenance,
): Promise<void> {
  await mkdir(destination, { recursive: true, mode: 0o700 });
  for (const file of scanned.files) {
    const target = path.join(destination, ...file.relative.split('/'));
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    if (file.content) await writeOwnedFileAtomic(target, file.content, { mode: 0o600 });
    else if (file.absolute) await copyFile(file.absolute, target);
  }
  await writeOwnedFileAtomic(
    path.join(destination, INTERNAL_META),
    JSON.stringify({
      version: 1,
      digest: scanned.digest,
      importedAt: new Date().toISOString(),
      parserProfile: scanned.metadata.parserProfile,
      ...(sourceProvenance ? { sourceProvenance } : {}),
    }, null, 2) + '\n',
    { mode: 0o600 },
  );
  if (revision) {
    await writeOwnedFileAtomic(
      path.join(destination, REVISION_META),
      JSON.stringify(revision, null, 2) + '\n',
      { mode: 0o600 },
    );
  }
}
async function readRevisionMetadata(directory: string): Promise<SkillRevisionMetadata | null> {
  try {
    const raw = JSON.parse(await readFile(path.join(directory, REVISION_META), 'utf8')) as Partial<SkillRevisionMetadata>;
    if (raw.version !== 1 || typeof raw.name !== 'string' || typeof raw.digest !== 'string'
      || (raw.kind !== 'staged' && raw.kind !== 'history')
      || typeof raw.createdAt !== 'string' || !Number.isFinite(Date.parse(raw.createdAt))
      || !Array.isArray(raw.evidenceRefs)) {
      return null;
    }
    return {
      version: 1,
      name: validateName(raw.name),
      digest: normalizeSkillDigest(raw.digest),
      kind: raw.kind,
      createdAt: new Date(raw.createdAt).toISOString(),
      evidenceRefs: raw.evidenceRefs.map(String).slice(0, 32),
      ...(typeof raw.previousDigest === 'string' ? { previousDigest: normalizeSkillDigest(raw.previousDigest) } : {}),
    };
  } catch {
    return null;
  }
}

export class SkillService {
  private readonly root: string;
  private readonly catalogRoot: string;
  private readonly packageRoot: string;
  private readonly exportRoot: string;
  private readonly stagingRoot: string;
  private readonly revisionRoot: string;
  private readonly revisionTails = new Map<string, Promise<void>>();
  private constructor(
    projectRoot: string,
    private readonly sourceValidator: (sourcePath: string) => Promise<string>,
  ) {
    this.root = path.join(projectRoot, 'runtime', 'skills');
    this.catalogRoot = path.join(this.root, 'catalog');
    this.packageRoot = path.join(this.root, 'packages');
    this.exportRoot = path.join(this.root, 'exports');
    this.stagingRoot = path.join(this.root, '.staging');
    this.revisionRoot = path.join(this.root, 'revisions');
  }
  static async initialize(
    projectRoot: string,
    sourceValidator: (sourcePath: string) => Promise<string> = validatePath,
  ): Promise<SkillService> {
    const service = new SkillService(path.resolve(projectRoot), sourceValidator);
    await Promise.all([
      mkdir(service.catalogRoot, { recursive: true, mode: 0o700 }),
      mkdir(service.packageRoot, { recursive: true, mode: 0o700 }),
      mkdir(service.exportRoot, { recursive: true, mode: 0o700 }),
      mkdir(service.stagingRoot, { recursive: true, mode: 0o700 }),
      mkdir(service.revisionRoot, { recursive: true, mode: 0o700 }),
    ]);
    return service;
  }
  proposalDirectory(): string { return path.join(this.root, 'proposals'); }

  private proposalBuildDirectory(item: SkillProposalRecord): string {
    return path.join(this.stagingRoot, 'proposals', item.id.replace(/[^a-z0-9-]/gi, '-'), digestSegment(item.revisionDigest));
  }
  private async checkProposalBuildDirectory(directory: string, create = false): Promise<void> {
    if (path.resolve(await realpath(this.root)).toLowerCase() !== path.resolve(this.root).toLowerCase()) throw new Error('SKILL_PROPOSAL_PATH_DRIFT');
    for (const target of [this.stagingRoot, path.join(this.stagingRoot, 'proposals'), path.dirname(directory), directory]) {
      try { if ((await lstat(target)).isSymbolicLink()) throw new Error('SKILL_PROPOSAL_PATH_DRIFT'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    if (create) await mkdir(directory, { recursive: true, mode: 0o700 });
  }
  private proposalSkillText(item: SkillProposalRecord): string {
    const name = validateName(item.targetSkillName);
    return ['---', 'name: ' + name, 'description: ' + JSON.stringify(item.input.purpose),
      'allowed-tools: ' + JSON.stringify(item.input.allowedTools), 'metadata:',
      '  proposal-id: ' + JSON.stringify(item.id), '  proposal-revision: ' + JSON.stringify(item.revisionDigest),
      '---', '', '# ' + name, '', '## Purpose', item.input.purpose, '', '## Trigger', ...item.input.triggers,
      '', '## Non-trigger', ...item.input.nonTriggers, '', '## Workflow', ...item.input.steps.map((s, i) => (i + 1) + '. ' + s),
      '', '## Limitations', ...item.input.limitations, '', '## Output contract', ...item.input.acceptance,
      '', 'This artifact does not grant execution authority. Benefits remain unmeasured.', '',
    ].join('\n');
  }
  async inspectBuiltProposal(item: SkillProposalRecord, decision: SkillProposalDecision): Promise<{
    artifactStatus: 'validated' | 'catalog-active'; artifactPath: string; artifactDigest: string;
  }> {
    const directory = this.proposalBuildDirectory(item);
    await this.checkProposalBuildDirectory(directory);
    if (await readFile(path.join(directory, 'SKILL.md'), 'utf8') !== this.proposalSkillText(item)) throw new Error('SKILL_PROPOSAL_BUILD_DRIFT');
    const artifact = await this.validate(directory);
    if (artifact.fileCount !== 1 || item.artifactDigest && artifact.digest !== item.artifactDigest) throw new Error('SKILL_PROPOSAL_BUILD_DRIFT');
    if (decision.scope === 'build-and-activate') {
      if ((await this.inspect(item.targetSkillName)).digest !== artifact.digest) throw new Error('SKILL_PROPOSAL_ACTIVE_DRIFT');
      return { artifactStatus: 'catalog-active', artifactPath: directory, artifactDigest: artifact.digest };
    }
    return { artifactStatus: 'validated', artifactPath: directory, artifactDigest: artifact.digest };
  }

  /** Internal Learning/host path; no public tool may supply the approval argument. */
  async buildApprovedProposal(item: SkillProposalRecord, decision: SkillProposalDecision): Promise<{
    artifactStatus: 'validated' | 'catalog-active'; artifactPath: string; artifactDigest: string;
  }> {
    if (item.status !== 'approved' || decision.decision !== 'approve' || decision.revisionDigest !== item.revisionDigest
      || !item.decisions.some(d => d.userEvidenceRef === decision.userEvidenceRef && d.revisionDigest === item.revisionDigest)) throw new Error('SKILL_PROPOSAL_APPROVAL_REQUIRED');
    const name = validateName(item.targetSkillName);
    const directory = this.proposalBuildDirectory(item);
    await this.checkProposalBuildDirectory(directory, true);
    if (path.resolve(await realpath(directory)).toLowerCase() !== path.resolve(directory).toLowerCase()) throw new Error('SKILL_PROPOSAL_PATH_DRIFT');
    const text = this.proposalSkillText(item);
    const file = path.join(directory, 'SKILL.md');
    try { if (await readFile(file, 'utf8') !== text) throw new Error('SKILL_PROPOSAL_BUILD_DRIFT'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; await writeOwnedFileAtomic(file, text); }
    const validated = await this.validate(directory);
    if (item.artifactDigest && item.artifactDigest !== validated.digest) throw new Error('SKILL_PROPOSAL_BUILD_DRIFT');
    if (decision.scope === 'build') return { artifactStatus: 'validated', artifactPath: directory, artifactDigest: validated.digest };
    const current = (await this.list()).find(s => s.name === name);
    // Idempotent recovery after successful catalog write but failed Learning-state persistence.
    if (current?.digest === validated.digest) return { artifactStatus: 'catalog-active', artifactPath: directory, artifactDigest: current.digest };
    if (item.action === 'revise') {
      if (!current || current.digest !== item.expectedActiveDigest) throw new Error('SKILL_PROPOSAL_ACTIVE_DRIFT');
      const staged = await this.stageRevision(directory, item.evidenceRefs.length ? item.evidenceRefs.slice(0, 32) : [decision.userEvidenceRef], item.revisionDigest);
      await this.promoteRevision(name, staged.digest, current.digest, 'PROMOTE_SKILL_REVISION', 'CONFIRM_SKILL_SOURCE_CHANGE', item.revisionDigest);
    } else {
      if (current) throw new Error('SKILL_PROPOSAL_ACTIVE_DRIFT');
      await this.import(directory, item.revisionDigest);
    }
    const active = await this.inspect(name);
    if (active.digest !== validated.digest) throw new Error('SKILL_PROPOSAL_ACTIVATION_READBACK_FAILED');
    return { artifactStatus: 'catalog-active', artifactPath: directory, artifactDigest: active.digest };
  }

  async status() {
    const skills = await this.list();
    return {
      status: 'available' as const,
      mode: 'artifact-only' as const,
      skillCount: skills.length,
      root: this.root,
      executionAuthority: false,
      parserProfile: 'strict-subset-v1' as const,
      exportProfiles: Object.keys(SKILL_EXPORT_PROFILES) as SkillExportProfile[],
    };
  }
  async list(): Promise<SkillArtifactSummary[]> {
    const entries = await readdir(this.catalogRoot, { withFileTypes: true });
    const output: SkillArtifactSummary[] = [];
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 500)) {
      if (!entry.isDirectory()) continue;
      try {
        const directory = path.join(this.catalogRoot, entry.name);
        const scanned = await scanDirectory(directory);
        output.push(summary(scanned, await readSkillSourceProvenance(directory)));
      } catch { /* invalid catalog entry stays invisible */ }
    }
    return output;
  }
  async inspect(name: string): Promise<SkillArtifactSummary & { metadata: SkillMetadata }> {
    const directory = path.join(this.catalogRoot, validateName(name));
    const scanned = await scanDirectory(directory);
    return { ...summary(scanned, await readSkillSourceProvenance(directory)), metadata: scanned.metadata };
  }
  async validate(sourcePath: string): Promise<SkillArtifactSummary> {
    const validated = await this.sourceValidator(sourcePath);
    const info = await stat(validated);
    const sourceKind: SkillSourceProvenance['sourceKind'] = info.isDirectory() ? 'directory' : 'archive';
    const scanned = sourceKind === 'directory' ? await scanDirectory(validated) : await scanArchive(validated);
    const sourceProvenance = await captureSkillSourceProvenance(validated, sourceKind, scanned);
    return summary(scanned, sourceProvenance);
  }
  async import(sourcePath: string, approvedProposalRevision?: string): Promise<SkillArtifactSummary & { status: 'imported' | 'duplicate' }> {
    const validated = await this.sourceValidator(sourcePath);
    const info = await stat(validated);
    const sourceKind: SkillSourceProvenance['sourceKind'] = info.isDirectory() ? 'directory' : 'archive';
    const scanned = sourceKind === 'directory' ? await scanDirectory(validated) : await scanArchive(validated);
    const sourceProvenance = await captureSkillSourceProvenance(validated, sourceKind, scanned);
    if (scanned.metadata.metadata['proposal-id'] && scanned.metadata.metadata['proposal-revision'] !== approvedProposalRevision) throw new Error('SKILL_PROPOSAL_APPROVAL_REQUIRED');
    const destination = path.join(this.catalogRoot, scanned.metadata.name);
    try {
      const existing = await scanDirectory(destination);
      if (existing.digest === scanned.digest) {
        return { ...summary(existing, await readSkillSourceProvenance(destination)), status: 'duplicate' };
      }
      throw new Error('SKILL_NAME_COLLISION');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT'
        && !(error instanceof Error && /ENOENT/.test(error.message))) throw error;
    }

    const staging = path.join(this.stagingRoot, `${scanned.metadata.name}-${randomUUID()}`);
    try {
      await writeScannedSkillTree(scanned, staging, undefined, sourceProvenance);
      await rename(staging, destination);
    } finally {
      await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    }
    return { ...summary(scanned, sourceProvenance), status: 'imported' };
  }



  private async withRevisionLock<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const normalized = validateName(name);
    const previous = this.revisionTails.get(normalized) ?? Promise.resolve();
    let release!: () => void;
    const tail = new Promise<void>(resolve => { release = resolve; });
    this.revisionTails.set(normalized, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.revisionTails.get(normalized) === tail) this.revisionTails.delete(normalized);
    }
  }

  private revisionPaths(name: string) {
    const normalized = validateName(name);
    const root = path.join(this.revisionRoot, normalized);
    return {
      normalized,
      root,
      staged: path.join(root, 'staged'),
      history: path.join(root, 'history'),
      active: path.join(this.catalogRoot, normalized),
    };
  }

  private async directoryExists(value: string): Promise<boolean> {
    try { return (await stat(value)).isDirectory(); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  private async pruneRevisionHistory(name: string): Promise<void> {
    const paths = this.revisionPaths(name);
    await mkdir(paths.history, { recursive: true, mode: 0o700 });
    const entries = await readdir(paths.history, { withFileTypes: true });
    const revisions: Array<{ path: string; at: number }> = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const directory = path.join(paths.history, entry.name);
      const metadata = await readRevisionMetadata(directory);
      const info = await stat(directory);
      revisions.push({
        path: directory,
        at: metadata ? Date.parse(metadata.createdAt) : info.mtimeMs,
      });
    }
    revisions.sort((a, b) => b.at - a.at || b.path.localeCompare(a.path));
    await Promise.all(revisions.slice(MAX_SKILL_REVISIONS).map(item =>
      rm(item.path, { recursive: true, force: true })));
  }

  private async archiveActive(name: string, evidenceRefs: string[]): Promise<SkillArtifactSummary> {
    const paths = this.revisionPaths(name);
    const active = await scanDirectory(paths.active);
    const activeSourceProvenance = await readSkillSourceProvenance(paths.active);
    await mkdir(paths.history, { recursive: true, mode: 0o700 });
    const destination = path.join(paths.history, digestSegment(active.digest));
    if (!await this.directoryExists(destination)) {
      const temporary = path.join(this.stagingRoot, `history-${paths.normalized}-${randomUUID()}`);
      try {
        await writeScannedSkillTree(active, temporary, {
          version: 1,
          name: paths.normalized,
          digest: active.digest,
          kind: 'history',
          createdAt: new Date().toISOString(),
          evidenceRefs: evidenceRefs.slice(0, 32),
        }, activeSourceProvenance);
        await rename(temporary, destination);
      } finally {
        await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
      }
    }
    await this.pruneRevisionHistory(paths.normalized);
    return summary(active, activeSourceProvenance);
  }

  async stageRevision(
    sourcePath: string,
    evidenceRefs: string[],
    approvedProposalRevision?: string,
  ): Promise<SkillArtifactSummary & { status: 'staged' | 'duplicate-staged'; evidenceRefs: string[] }> {
    const validated = await this.sourceValidator(sourcePath);
    const info = await stat(validated);
    const sourceKind: SkillSourceProvenance['sourceKind'] = info.isDirectory() ? 'directory' : 'archive';
    const scanned = sourceKind === 'directory' ? await scanDirectory(validated) : await scanArchive(validated);
    const sourceProvenance = await captureSkillSourceProvenance(validated, sourceKind, scanned);
    if (scanned.metadata.metadata['proposal-id'] && scanned.metadata.metadata['proposal-revision'] !== approvedProposalRevision) throw new Error('SKILL_PROPOSAL_APPROVAL_REQUIRED');
    const paths = this.revisionPaths(scanned.metadata.name);
    const active = await scanDirectory(paths.active);
    if (active.digest === scanned.digest) throw new Error('SKILL_REVISION_MATCHES_ACTIVE');
    const evidence = normalizeEvidenceRefs(evidenceRefs);
    await mkdir(paths.staged, { recursive: true, mode: 0o700 });
    const destination = path.join(paths.staged, digestSegment(scanned.digest));
    if (await this.directoryExists(destination)) {
      const existing = await scanDirectory(destination);
      if (existing.digest !== scanned.digest) throw new Error('SKILL_REVISION_STAGE_COLLISION');
      return { ...summary(existing, await readSkillSourceProvenance(destination)), status: 'duplicate-staged', evidenceRefs: evidence };
    }

    const temporary = path.join(this.stagingRoot, `revision-${paths.normalized}-${randomUUID()}`);
    try {
      await writeScannedSkillTree(scanned, temporary, {
        version: 1,
        name: paths.normalized,
        digest: scanned.digest,
        kind: 'staged',
        createdAt: new Date().toISOString(),
        evidenceRefs: evidence,
        previousDigest: active.digest,
      }, sourceProvenance);
      await rename(temporary, destination);
    } finally {
      await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
    }
    return { ...summary(scanned, sourceProvenance), status: 'staged', evidenceRefs: evidence };
  }

  async listRevisions(name: string): Promise<{
    active: SkillArtifactSummary;
    staged: Array<SkillArtifactSummary & { createdAt?: string; evidenceRefs: string[] }>;
    history: Array<SkillArtifactSummary & { createdAt?: string; evidenceRefs: string[] }>;
  }> {
    const paths = this.revisionPaths(name);
    const activeScanned = await scanDirectory(paths.active);
    const active = summary(activeScanned, await readSkillSourceProvenance(paths.active));
    const collect = async (root: string) => {
      if (!await this.directoryExists(root)) return [];
      const entries = await readdir(root, { withFileTypes: true });
      const output: Array<SkillArtifactSummary & { createdAt?: string; evidenceRefs: string[] }> = [];
      for (const entry of entries.filter(item => item.isDirectory()).slice(0, 64)) {
        const directory = path.join(root, entry.name);
        try {
          const scanned = await scanDirectory(directory);
          const metadata = await readRevisionMetadata(directory);
          output.push({
            ...summary(scanned, await readSkillSourceProvenance(directory)),
            ...(metadata ? { createdAt: metadata.createdAt } : {}),
            evidenceRefs: metadata?.evidenceRefs ?? [],
          });
        } catch {
          // Invalid staged/history artifact remains invisible like invalid catalog entries.
        }
      }
      return output.sort((a, b) =>
        String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')) || a.digest.localeCompare(b.digest));
    };
    return {
      active,
      staged: await collect(paths.staged),
      history: await collect(paths.history),
    };
  }

  private async activateRevision(
    name: string,
    sourceDirectory: string,
    candidateDigest: string,
    expectedActiveDigest: string,
    evidenceRefs: string[],
    removeSource: boolean,
  ): Promise<{ active: SkillArtifactSummary; previousDigest: string; evidenceRefs: string[]; sourceLineageChanged: boolean }> {
    const paths = this.revisionPaths(name);
    const expected = normalizeSkillDigest(expectedActiveDigest);
    const candidateExpected = normalizeSkillDigest(candidateDigest);
    const current = await scanDirectory(paths.active);
    const currentSourceProvenance = await readSkillSourceProvenance(paths.active);
    if (current.digest !== expected) throw new Error('SKILL_REVISION_ACTIVE_DIGEST_MISMATCH');
    const candidate = await scanDirectory(sourceDirectory);
    const candidateSourceProvenance = await readSkillSourceProvenance(sourceDirectory);
    if (candidate.metadata.name !== paths.normalized || candidate.digest !== candidateExpected) {
      throw new Error('SKILL_REVISION_CANDIDATE_MISMATCH');
    }
    if (candidate.digest === current.digest) throw new Error('SKILL_REVISION_MATCHES_ACTIVE');

    await this.archiveActive(paths.normalized, evidenceRefs);
    const activation = path.join(this.stagingRoot, `activate-${paths.normalized}-${randomUUID()}`);
    const backup = path.join(this.stagingRoot, `active-backup-${paths.normalized}-${randomUUID()}`);
    await writeScannedSkillTree(candidate, activation, undefined, candidateSourceProvenance);
    let activeMoved = false;
    try {
      await rename(paths.active, backup);
      activeMoved = true;
      try {
        await rename(activation, paths.active);
      } catch (error) {
        await rename(backup, paths.active).catch(() => undefined);
        activeMoved = false;
        throw error;
      }
      activeMoved = false;
      await rm(backup, { recursive: true, force: true });
      if (removeSource) await rm(sourceDirectory, { recursive: true, force: true });
      await this.pruneRevisionHistory(paths.normalized);
      return {
        active: summary(candidate, candidateSourceProvenance),
        previousDigest: current.digest,
        evidenceRefs,
        sourceLineageChanged: !sameSkillSourceLineage(currentSourceProvenance, candidateSourceProvenance),
      };
    } finally {
      await rm(activation, { recursive: true, force: true }).catch(() => undefined);
      if (activeMoved) {
        await rename(backup, paths.active).catch(() => undefined);
      }
      await rm(backup, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async promoteRevision(
    name: string,
    candidateDigest: string,
    expectedActiveDigest: string,
    confirmation: string,
    sourceChangeConfirmation?: string,
    approvedProposalRevision?: string,
  ) {
    return this.withRevisionLock(name, async () => {
      if (confirmation !== 'PROMOTE_SKILL_REVISION') throw new Error('SKILL_REVISION_PROMOTION_CONFIRMATION_REQUIRED');
      const paths = this.revisionPaths(name);
      const candidate = normalizeSkillDigest(candidateDigest);
      const sourceDirectory = path.join(paths.staged, digestSegment(candidate));
      const metadata = await readRevisionMetadata(sourceDirectory);
      if (!metadata || metadata.kind !== 'staged' || metadata.digest !== candidate || !metadata.evidenceRefs.length) {
        throw new Error('SKILL_REVISION_STAGE_EVIDENCE_INVALID');
      }
      const proposed = await scanDirectory(sourceDirectory);
      if (proposed.metadata.metadata['proposal-id'] && proposed.metadata.metadata['proposal-revision'] !== approvedProposalRevision) throw new Error('SKILL_PROPOSAL_APPROVAL_REQUIRED');
      const currentActive = await scanDirectory(paths.active);
      if (currentActive.digest !== normalizeSkillDigest(expectedActiveDigest)) {
        throw new Error('SKILL_REVISION_ACTIVE_DIGEST_MISMATCH');
      }
      const activeSourceProvenance = await readSkillSourceProvenance(paths.active);
      const candidateSourceProvenance = await readSkillSourceProvenance(sourceDirectory);
      if (!sameSkillSourceLineage(activeSourceProvenance, candidateSourceProvenance)
        && sourceChangeConfirmation !== 'CONFIRM_SKILL_SOURCE_CHANGE') {
        throw new Error('SKILL_REVISION_SOURCE_CHANGE_CONFIRMATION_REQUIRED');
      }
      return {
        status: 'promoted' as const,
        ...(await this.activateRevision(
          paths.normalized,
          sourceDirectory,
          candidate,
          expectedActiveDigest,
          metadata.evidenceRefs,
          true,
        )),
      };
    });
  }

  async rollbackRevision(
    name: string,
    targetDigest: string,
    expectedActiveDigest: string,
    confirmation: string,
  ) {
    return this.withRevisionLock(name, async () => {
      if (confirmation !== 'ROLLBACK_SKILL_REVISION') throw new Error('SKILL_REVISION_ROLLBACK_CONFIRMATION_REQUIRED');
      const paths = this.revisionPaths(name);
      const target = normalizeSkillDigest(targetDigest);
      const sourceDirectory = path.join(paths.history, digestSegment(target));
      const metadata = await readRevisionMetadata(sourceDirectory);
      if (!metadata || metadata.kind !== 'history' || metadata.digest !== target) {
        throw new Error('SKILL_REVISION_HISTORY_NOT_FOUND');
      }
      return {
        status: 'rolled-back' as const,
        targetDigest: target,
        ...(await this.activateRevision(
          paths.normalized,
          sourceDirectory,
          target,
          expectedActiveDigest,
          metadata.evidenceRefs.length ? metadata.evidenceRefs : ['rollback-history'],
          false,
        )),
      };
    });
  }

  async renderExport(name: string, profile: SkillExportProfile): Promise<SkillExportResult> {
    const normalized = validateName(name);
    const profileRoot = SKILL_EXPORT_PROFILES[profile];
    if (!profileRoot) throw new Error('SKILL_EXPORT_PROFILE_INVALID');

    const activeRoot = path.join(this.catalogRoot, normalized);
    const scanned = await scanDirectory(activeRoot);
    const sourceProvenance = await readSkillSourceProvenance(activeRoot);
    const targetRelativeRoot = `${profileRoot}/${normalized}`;
    const destination = path.join(this.exportRoot, profile, normalized);
    const staging = path.join(this.stagingRoot, `export-${profile}-${normalized}-${randomUUID()}`);
    const backup = path.join(this.stagingRoot, `export-backup-${profile}-${normalized}-${randomUUID()}`);
    const fileRecords: Array<{ path: string; sha256: string; size: number }> = [];
    let backupActive = false;

    try {
      const payloadRoot = path.join(staging, ...targetRelativeRoot.split('/'));
      await mkdir(payloadRoot, { recursive: true, mode: 0o700 });
      for (const file of [...scanned.files].sort((a, b) => a.relative.localeCompare(b.relative))) {
        const bytes = await readFile(file.absolute!);
        const target = path.join(payloadRoot, ...file.relative.split('/'));
        await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
        await writeOwnedFileAtomic(target, bytes, { mode: 0o600 });
        fileRecords.push({
          path: `${targetRelativeRoot}/${file.relative}`,
          sha256: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
          size: bytes.length,
        });
      }

      const manifest = {
        version: 1,
        profile,
        targetRelativeRoot,
        source: {
          name: normalized,
          digest: scanned.digest,
          ...(sourceProvenance ? { provenance: sourceProvenance } : {}),
        },
        files: fileRecords,
      };
      const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8');
      await writeOwnedFileAtomic(path.join(staging, EXPORT_MANIFEST), manifestBytes, { mode: 0o600 });
      const manifestDigest = 'sha256:' + createHash('sha256').update(manifestBytes).digest('hex');

      await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      if (await this.directoryExists(destination)) {
        await rename(destination, backup);
        backupActive = true;
      }
      try {
        await rename(staging, destination);
      } catch (error) {
        if (backupActive) {
          await rename(backup, destination).catch(() => undefined);
          backupActive = false;
        }
        throw error;
      }
      if (backupActive) {
        await rm(backup, { recursive: true, force: true }).catch(() => undefined);
        backupActive = false;
      }

      return {
        ...summary(scanned, sourceProvenance),
        profile,
        exportPath: destination,
        targetRelativeRoot,
        manifestPath: path.join(destination, EXPORT_MANIFEST),
        manifestDigest,
      };
    } finally {
      await rm(staging, { recursive: true, force: true }).catch(() => undefined);
      if (backupActive) {
        await rename(backup, destination).catch(() => undefined);
        backupActive = false;
      }
      await rm(backup, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async package(name: string): Promise<SkillArtifactSummary & { packagePath: string; packageDigest: string }> {
    const normalized = validateName(name);
    const scanned = await scanDirectory(path.join(this.catalogRoot, normalized));
    const zip = new PizZip();
    const stableZipDate = new Date('1980-01-01T00:00:00.000Z');
    for (const file of scanned.files.sort((a, b) => a.relative.localeCompare(b.relative))) {
      zip.file(
        `${normalized}/${file.relative}`,
        await readFile(file.absolute!),
        { date: stableZipDate },
      );
    }
    const bytes = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    if (bytes.length > MAX_ARCHIVE_BYTES) throw new Error('SKILL_ARCHIVE_SIZE_INVALID');
    const packagePath = path.join(this.packageRoot, `${normalized}.skill`);
    await writeOwnedFileAtomic(packagePath, bytes, { mode: 0o600 });
    const packageDigest = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
    return { ...summary(scanned), packagePath, packageDigest };
  }
}
