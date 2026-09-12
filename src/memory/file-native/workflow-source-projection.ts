import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import * as z from 'zod/v4';
import { SyntaxKind } from 'typescript/unstable/ast';
import { createScanner } from 'typescript/unstable/ast/scanner';
import type { WorkflowRecord } from '../../workflow/types.js';
import { sanitizeStructured, stableJson } from '../record-types.js';
import { atomicReplaceValidated } from './atomic-writer.js';
import type { FileNativeMemoryPaths } from './paths.js';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const engineeringSourceBlobSchema = z.strictObject({
  kind: z.literal('engineering-source-v1'), schemaVersion: z.literal(1), version: z.literal(1),
  principalId: z.string().min(1).max(1000), projectId: z.string().max(4096), taskId: z.string().min(1).max(200),
  sourceHash: digest, bytes: z.number().int().min(0).max(2 * 1024 * 1024), content: z.string().max(2 * 1024 * 1024),
});
export type EngineeringSourceBlob = z.infer<typeof engineeringSourceBlobSchema>;
export interface EngineeringSourceReference { sourceHash: string; bytes: number }
const fail = (code: string): never => { throw Object.assign(new Error(code), { code }); };
const byteHash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
export const isEngineeringSourceBlob = (value: unknown): value is EngineeringSourceBlob => Boolean(value && typeof value === 'object'
  && (value as { kind?: unknown }).kind === 'engineering-source-v1');

interface SourceToken { kind: SyntaxKind; start: number; end: number; text: string }

/** A narrow lexical proof for computed labels, never a general secret classifier or source rewrite. */
function sourceCredentialDetectionText(content: string): string {
  const scanner = createScanner(false, undefined, content), tokens: SourceToken[] = [], templates: number[] = [];
  try {
    for (;;) {
      let kind = scanner.scan();
      if (kind === SyntaxKind.CloseBraceToken && templates.length) {
        if (templates.at(-1) === 0) {
          kind = scanner.reScanTemplateToken(false);
          if (kind === SyntaxKind.TemplateTail) templates.pop();
        } else templates[templates.length - 1]!--;
      } else if (kind === SyntaxKind.OpenBraceToken && templates.length) templates[templates.length - 1]!++;
      if (kind === SyntaxKind.TemplateHead) templates.push(0);
      // Scanner-only analysis cannot disambiguate regular expressions, division, or JSX.
      // Ambiguity leaves the original conservative detector in force for the entire source.
      if (scanner.isUnterminated() || [SyntaxKind.Unknown, SyntaxKind.SlashToken, SyntaxKind.SlashEqualsToken,
        SyntaxKind.LessThanToken, SyntaxKind.ConflictMarkerTrivia, SyntaxKind.BacktickToken].includes(kind)
        || templates.length > 128 || tokens.length > 200_000) return content;
      if (kind === SyntaxKind.EndOfFile) break;
      if ([SyntaxKind.WhitespaceTrivia, SyntaxKind.NewLineTrivia, SyntaxKind.SingleLineCommentTrivia,
        SyntaxKind.MultiLineCommentTrivia].includes(kind)) continue;
      tokens.push({ kind, start: scanner.getTokenStart(), end: scanner.getTokenEnd(), text: scanner.getTokenText() });
    }
  } catch { return content; }
  if (templates.length) return content;

  const replacements: SourceToken[] = [];
  for (let index = 0; index < tokens.length; index++) {
    if (![SyntaxKind.ConstKeyword, SyntaxKind.LetKeyword, SyntaxKind.VarKeyword].includes(tokens[index]!.kind)) continue;
    const name = tokens[index + 1];
    if (name?.kind !== SyntaxKind.Identifier || !/^(?:token|refresh_token|access_token)$/i.test(name.text)
      || tokens[index + 2]?.kind !== SyntaxKind.EqualsToken || tokens[index + 3]?.kind !== SyntaxKind.TemplateHead) continue;
    let cursor = index + 3, complete = false;
    while (cursor < tokens.length) {
      const span = tokens[cursor]!;
      const staticText = span.kind === SyntaxKind.TemplateTail ? span.text.slice(1, -1) : span.text.slice(1, -2);
      // Escapes and static words are not proven labels. Their original credential detection remains mandatory.
      if (!/^[ _.:/\-]*$/.test(staticText)) break;
      if (span.kind === SyntaxKind.TemplateTail) { complete = tokens[cursor + 1]?.kind === SyntaxKind.SemicolonToken; break; }
      cursor++;
      if (tokens[cursor]?.kind !== SyntaxKind.Identifier) break;
      cursor++;
      for (;;) {
        if (tokens[cursor]?.kind === SyntaxKind.DotToken && tokens[cursor + 1]?.kind === SyntaxKind.Identifier) cursor += 2;
        else if (tokens[cursor]?.kind === SyntaxKind.OpenParenToken && tokens[cursor + 1]?.kind === SyntaxKind.CloseParenToken) cursor += 2;
        else break;
      }
      if (![SyntaxKind.TemplateMiddle, SyntaxKind.TemplateTail].includes(tokens[cursor]?.kind as SyntaxKind)) break;
    }
    if (complete) replacements.push(name);
  }
  let detection = content;
  for (const name of replacements.reverse()) detection = detection.slice(0, name.start) + 'computedSourceLabel' + detection.slice(name.end);
  return detection;
}

export function validateEngineeringSourceBlob(raw: unknown): EngineeringSourceBlob {
  const result = engineeringSourceBlobSchema.safeParse(raw);
  if (!result.success) return fail('WORKFLOW_SOURCE_PROJECTION_INVALID');
  const record = result.data, bytes = Buffer.from(record.content, 'utf8');
  if (record.content.includes('\0') || bytes.toString('utf8') !== record.content || bytes.length !== record.bytes
    || byteHash(bytes) !== record.sourceHash) return fail('WORKFLOW_SOURCE_PROJECTION_HASH_INVALID');
  const { content, ...metadata } = record;
  const detectionContent = sourceCredentialDetectionText(content);
  if (stableJson(sanitizeStructured(metadata)) !== stableJson(metadata)
    || JSON.stringify(sanitizeStructured({ content: detectionContent })) !== JSON.stringify({ content: detectionContent })) {
    return fail('WORKFLOW_PROJECTION_SECRET_DETECTED');
  }
  return record;
}

export function engineeringSourceRecordId(scope: { principalId: string; projectId: string; taskId: string }, sourceHash: string): string {
  return 'engineering-' + byteHash(JSON.stringify([scope.principalId, scope.projectId, scope.taskId, sourceHash]));
}

export function engineeringSourceReferences(record: WorkflowRecord): EngineeringSourceReference[] {
  const references = new Map<string, EngineeringSourceReference>();
  for (const evidence of record.engineering?.evidence ?? []) for (const entry of evidence.data.inventory.entries) {
    const prior = references.get(entry.hash);
    if (prior && prior.bytes !== entry.bytes) return fail('WORKFLOW_SOURCE_PROJECTION_REFERENCE_INVALID');
    references.set(entry.hash, { sourceHash: entry.hash, bytes: entry.bytes });
  }
  return [...references.values()].sort((a, b) => a.sourceHash.localeCompare(b.sourceHash));
}

/** Only this fixed content-addressed cache is consulted; source paths in inventories are never opened here. */
async function sourceCacheRoot(paths: FileNativeMemoryPaths, create: boolean): Promise<string> {
  let directory = paths.projectRoot;
  for (const component of ['runtime', 'craft', 'sources', 'blobs']) {
    directory = path.join(directory, component);
    let info;
    try { info = await lstat(directory); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !create) throw error;
      await mkdir(directory); info = await lstat(directory);
    }
    if (!info.isDirectory() || info.isSymbolicLink()) return fail('WORKFLOW_SOURCE_PROJECTION_PATH_INVALID');
  }
  return directory;
}

export async function readEngineeringSourceBlob(paths: FileNativeMemoryPaths, scope: WorkflowRecord, reference: EngineeringSourceReference): Promise<EngineeringSourceBlob> {
  try {
    const root = await sourceCacheRoot(paths, false), file = path.join(root, `${reference.sourceHash}.txt`), info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 2 * 1024 * 1024) return fail('WORKFLOW_SOURCE_PROJECTION_PATH_INVALID');
    const bytes = await readFile(file);
    return validateEngineeringSourceBlob({ kind: 'engineering-source-v1', schemaVersion: 1, version: 1,
      principalId: scope.principalId, projectId: scope.projectId, taskId: scope.taskId,
      sourceHash: reference.sourceHash, bytes: reference.bytes, content: bytes.toString('utf8') });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fail('WORKFLOW_SOURCE_PROJECTION_MISSING');
    throw error;
  }
}

/** Recovery publishes the authoritative Vault first and retains its journal until cache hydration succeeds. */
export async function hydrateEngineeringSourceBlobs(paths: FileNativeMemoryPaths, values: readonly unknown[]): Promise<void> {
  const blobs = values.filter(isEngineeringSourceBlob).map(validateEngineeringSourceBlob);
  if (!blobs.length) return;
  const root = await sourceCacheRoot(paths, true);
  for (const blob of blobs) {
    const file = path.join(root, `${blob.sourceHash}.txt`);
    let existing: Buffer | undefined;
    try {
      const info = await lstat(file);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 2 * 1024 * 1024) return fail('WORKFLOW_SOURCE_PROJECTION_PATH_INVALID');
      existing = await readFile(file);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (existing) {
      if (byteHash(existing) !== blob.sourceHash || existing.length !== blob.bytes) return fail('MEMORY_RECOVERY_SOURCE_CONFLICT');
      continue;
    }
    await atomicReplaceValidated(file, blob.content, text => {
      if (byteHash(text) !== blob.sourceHash || Buffer.byteLength(text, 'utf8') !== blob.bytes) return fail('WORKFLOW_SOURCE_PROJECTION_HASH_INVALID');
    });
  }
}
