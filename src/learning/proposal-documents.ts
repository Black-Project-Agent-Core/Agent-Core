import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { proposalDigest, proposalWorkspaceSegment, renderSkillProposal, semanticSkillName } from './skill-proposal-files.js';
import type { SkillProposalRecord } from './skill-proposal-types.js';

const MAX_DOCUMENT_BYTES = 256 * 1024;
const MAX_SCAN_BYTES = 2 * 1024 * 1024;
const MAX_ITEMS = 100;
const MAX_ENTRIES = 512;
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const guideNames = new Set(['readme.md', 'review-guide.md']);
export interface ProposalDocumentItem {
  id: string; kind: 'skill' | 'skill-revision' | 'improvement' | 'guide'; title: string;
  path: string; status: string; revisionDigest: string; documentDigest?: string; updatedAt?: string;
  readStatus: 'available' | 'missing' | 'drift' | 'unavailable';
  projection: 'external-docs' | 'legacy-runtime' | 'document';
}
export interface ProposalDocumentList { items: ProposalDocumentItem[]; guides: ProposalDocumentItem[]; warnings: string[]; }
export interface ProposalDocumentReadInput { id: string; revisionDigest: string; documentDigest: string; }
export interface ProposalDocumentRead extends ProposalDocumentItem { text: string; decisionGuidance: string; }
export interface ProposalDocumentReader {
  list(): Promise<ProposalDocumentList>;
  read(input: ProposalDocumentReadInput): Promise<ProposalDocumentRead>;
}
/** Structured discovery for external bootstrap/facades; this is guidance, never decision authority. */
export function proposalReviewGuide(projectRoot: string) {
  return { version: 1 as const, directory: path.join(path.resolve(projectRoot), 'docs/proposals'),
    guidePath: path.join(path.resolve(projectRoot), 'docs/proposals/REVIEW-GUIDE.md'),
    dashboard: 'Dashboard → Proposals to review → Read proposal',
    instruction: 'Create and revise readable .md files in this directory; read the guide for the structured template. Use the existing skills proposal facade for Skill records and its external docs projection. Read back the exact path/revision and notify the user. Unknown, missing or drifted documents are not approval evidence. The dashboard never records approval, builds or activates.',
    authoring: { format: 'Markdown (.md)', semanticFilename: true, revisionHistory: true,
      sections: ['Problem and goal', 'Evidence and uncertainty', 'Proposed mechanism and existing owners', 'Scope and Native boundary', 'Expected benefit and limitations', 'Acceptance and rollback', 'Revision history', 'Exact user decision and scope'],
      decisions: ['APPROVE', 'REVISE', 'HOLD', 'REJECT'] },
    decisionAuthority: 'existing host-recorded user-decision workflow only' as const };
}
type Captured = { text: string; digest: string; updatedAt: string; bytes: number };
type Catalog = ProposalDocumentList & { documents: Map<string, Captured> };
function fail(code: string): never { throw new Error(code); }

/** Refuse every symlink component, including the authorized project root. GET never creates paths. */
export async function assertProposalDocumentPath(root: string, file: string): Promise<void> {
  const resolved = path.resolve(root), relative = path.relative(resolved, file);
  if (!relative || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) fail('PROPOSAL_DOCUMENT_PATH_INVALID');
  const rootStat = await lstat(resolved);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()
    || path.resolve(await realpath(resolved)).toLowerCase() !== resolved.toLowerCase()) fail('PROPOSAL_DOCUMENT_SYMLINK_REFUSED');
  let current = resolved;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    const stat = await lstat(current);
    if (stat.isSymbolicLink()) fail('PROPOSAL_DOCUMENT_SYMLINK_REFUSED');
  }
}

async function capture(root: string, file: string, remainingBytes: number, charge: (bytes: number) => void): Promise<Captured> {
  await assertProposalDocumentPath(root, file);
  const before = await lstat(file);
  if (!before.isFile()) fail('PROPOSAL_DOCUMENT_UNAVAILABLE');
  if (before.size > MAX_DOCUMENT_BYTES) fail('PROPOSAL_DOCUMENT_SIZE_LIMIT');
  if (before.size > remainingBytes) fail('PROPOSAL_SCAN_BYTE_LIMIT');
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino || stat.size > MAX_DOCUMENT_BYTES) fail('PROPOSAL_DOCUMENT_CHANGED');
    if (stat.size > remainingBytes) fail('PROPOSAL_SCAN_BYTE_LIMIT');
    // Read one bounded buffer, never readFile an input whose size may grow after stat.
    const bytes = Buffer.alloc(Math.min(MAX_DOCUMENT_BYTES, remainingBytes));
    let length = 0;
    while (length < bytes.length) {
      const read = await handle.read(bytes, length, bytes.length - length, length);
      if (!read.bytesRead) break;
      length += read.bytesRead;
      charge(read.bytesRead); // Failed/changed captures also consume the physical read budget.
    }
    if (length > MAX_DOCUMENT_BYTES) fail('PROPOSAL_DOCUMENT_SIZE_LIMIT');
    const after = await handle.stat();
    await assertProposalDocumentPath(root, file);
    const leaf = await lstat(file);
    if (stat.dev !== leaf.dev || stat.ino !== leaf.ino || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || length !== stat.size) fail('PROPOSAL_DOCUMENT_CHANGED');
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, length));
    if (text.includes('\0')) fail('PROPOSAL_DOCUMENT_UNAVAILABLE');
    return { text, digest: proposalDigest(text), bytes: length, updatedAt: after.mtime.toISOString() };
  } finally { await handle.close(); }
}

function warning(error: unknown): string {
  const code = (error as NodeJS.ErrnoException)?.code;
  const message = error instanceof Error ? error.message : '';
  if (message === 'PROPOSAL_DOCUMENT_SYMLINK_REFUSED' || code === 'ELOOP') return 'proposal-document-symlink-refused';
  if (message === 'PROPOSAL_DOCUMENT_SIZE_LIMIT') return 'proposal-document-size-limit';
  if (message === 'PROPOSAL_SCAN_BYTE_LIMIT') return 'proposal-scan-byte-limit';
  return 'proposal-document-unavailable';
}
function metadata(text: string): { title: string; status: string } {
  const lines = text.split(/\r?\n/, 30);
  const title = lines.find(line => /^#\s+\S/.test(line))?.replace(/^#\s+/, '').trim().slice(0, 160) ?? 'Untitled proposal';
  // Accept explicit line metadata or a bold metadata field in an introductory line.
  // An unformatted mention of "Status:" in prose is not an authoritative status.
  const value = lines.map(line => line.match(/\*\*Status\s*:\s*([^\r\n]*?)\*\*/i)?.[1]
    ?? line.trim().match(/^Status\s*:\s*(.*)$/i)?.[1]).find(value => value !== undefined)?.trim();
  const status = value && /^(?:PROPOSED|HOLD|APPROVED|APPROVE|REVISE|REJECTED|REJECT|DEFERRED|IMPLEMENTED|COMPLETED|DRAFT|AWAITING)\b/i.test(value)
    ? value.slice(0, 160) : 'unknown';
  return { title, status };
}

/** Read-only bounded catalog. Learning state remains authority for registered Skill proposals. */
export function createProposalDocuments(projectRoot: string, options: { listSkills: () => Promise<SkillProposalRecord[]> }): ProposalDocumentReader {
  const root = path.resolve(projectRoot), docsRoot = path.join(root, 'docs/proposals');
  async function catalog(): Promise<Catalog> {
    const result: Catalog = { items: [], guides: [], warnings: [], documents: new Map() };
    let bytes = 0, entries = 0;
    const warnings = new Set<string>(), ownedPaths = new Set<string>();
    const load = async (file: string): Promise<Captured | undefined> => {
      if (bytes >= MAX_SCAN_BYTES) { warnings.add('proposal-scan-byte-limit'); return; }
      try {
        return await capture(root, file, MAX_SCAN_BYTES - bytes, count => { bytes += count; });
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') warnings.add(warning(error)); return; }
    };
    let skills: SkillProposalRecord[] = [];
    try { skills = await options.listSkills(); }
    catch { warnings.add('skill-proposal-state-unavailable'); }
    for (const record of skills.slice(0, MAX_ITEMS)) {
      let externalPath: string, legacyPath: string;
      try {
        const segment = proposalWorkspaceSegment(record.workspace), name = semanticSkillName(record.name) + '.md';
        externalPath = path.join(docsRoot, 'skills', segment, name);
        legacyPath = path.join(root, 'runtime/skills/proposals', segment, name);
      } catch { warnings.add('skill-proposal-record-invalid'); continue; }
      ownedPaths.add(externalPath.toLowerCase());
      let file = externalPath, projection: ProposalDocumentItem['projection'] = 'external-docs';
      // Existing native/runtime artifacts are viewable, never silently migrated on GET.
      try { await lstat(externalPath); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') { file = legacyPath; projection = 'legacy-runtime'; } }
      const data = await load(file);
      const item: ProposalDocumentItem = { id: record.id, kind: record.action === 'revise' ? 'skill-revision' : 'skill', title: record.name,
        path: file, status: record.status, revisionDigest: record.revisionDigest, updatedAt: record.updatedAt,
        readStatus: data ? data.text === renderSkillProposal(record) ? 'available' : 'drift' : 'unavailable', projection,
        ...(data ? { documentDigest: data.digest } : {}) };
      result.items.push(item); if (data) result.documents.set(item.id, data);
    }
    if (skills.length > MAX_ITEMS) warnings.add('proposal-item-limit');
    async function scan(directory: string, depth: number): Promise<void> {
      try {
        await assertProposalDocumentPath(root, directory);
        const directoryEntries = await readdir(directory, { withFileTypes: true });
        for (const entry of directoryEntries.sort((a, b) => a.name.localeCompare(b.name))) {
          if (++entries > MAX_ENTRIES) { warnings.add('proposal-entry-limit'); return; }
          if (result.items.length >= MAX_ITEMS) { warnings.add('proposal-item-limit'); return; }
          const file = path.join(directory, entry.name);
          if (entry.isSymbolicLink()) { warnings.add('proposal-document-symlink-refused'); continue; }
          if (entry.isDirectory()) {
            if (depth === 0) await scan(file, entry.name === 'skills' ? 1 : 2);
            else if (depth === 1) await scan(file, 2);
            continue;
          }
          if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md') || ownedPaths.has(file.toLowerCase())) continue;
          const data = await load(file); if (!data) continue;
          const isGuide = guideNames.has(entry.name.toLowerCase()) || /(?:^|[-_])guide\.md$/i.test(entry.name);
          const relative = path.relative(docsRoot, file).split(path.sep).join('/');
          const item: ProposalDocumentItem = { id: 'doc:' + proposalDigest(relative).slice(7, 39), kind: isGuide ? 'guide' : 'improvement',
            ...metadata(data.text), path: file, revisionDigest: data.digest, documentDigest: data.digest,
            updatedAt: data.updatedAt, readStatus: 'available', projection: 'document' };
          (isGuide ? result.guides : result.items).push(item); result.documents.set(item.id, data);
        }
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') warnings.add(warning(error)); }
    }
    await scan(docsRoot, 0);
    result.warnings = [...warnings];
    return result;
  }
  return {
    async list() { const { documents: _documents, ...result } = await catalog(); return result; },
    async read(input) {
      if (!input || !/^(?:doc|skill-proposal):[a-f0-9]{32}$/.test(input.id)
        || !digestPattern.test(input.revisionDigest) || !digestPattern.test(input.documentDigest)
        || Object.keys(input).some(key => !['id', 'revisionDigest', 'documentDigest'].includes(key))) fail('PROPOSAL_DOCUMENT_INPUT_INVALID');
      const found = await catalog(), item = [...found.items, ...found.guides].find(candidate => candidate.id === input.id);
      if (!item) fail('PROPOSAL_DOCUMENT_NOT_FOUND');
      if (item.readStatus === 'drift') fail('PROPOSAL_DOCUMENT_DRIFT');
      if (item.revisionDigest !== input.revisionDigest || item.documentDigest !== input.documentDigest) fail('PROPOSAL_DOCUMENT_CHANGED');
      const data = found.documents.get(item.id); if (!data || item.readStatus !== 'available') fail('PROPOSAL_DOCUMENT_UNAVAILABLE');
      return { ...item, text: data.text, decisionGuidance: item.kind === 'guide'
        ? 'This guide explains the review workflow. Reading it records no decision.'
        : `Decision guidance: review this exact revision with your external controller (${item.revisionDigest}). No approval, build or activation is recorded by this reader.` };
    },
  };
}
