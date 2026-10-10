import path from 'node:path';
import * as z from 'zod/v4';
import { decideToolEvidenceCapture } from '../security/evidence-capture-policy.js';
import { EVIDENCE_DOCUMENT_MAX, EVIDENCE_TOTAL_MAX, assertEvidenceLocalPath, readEvidenceSnapshot } from '../verification/evidence-snapshot.js';
import type { MemorySourceSnapshot, MemorySourceFileSnapshot } from './types.js';

const sourceFile = z.discriminatedUnion('status', [
  z.strictObject({ path: z.string().min(1).max(500), status: z.literal('captured'),
    digest: z.string().regex(/^sha256:[a-f0-9]{64}$/), bytes: z.number().int().min(0).max(EVIDENCE_DOCUMENT_MAX) }),
  z.strictObject({ path: z.string().min(1).max(500), status: z.literal('unavailable'),
    reason: z.enum(['excluded-path', 'evidence-policy', 'unreadable-or-unsupported', 'read-budget']) }),
]);
const snapshotSchema = z.strictObject({
  version: z.literal(1), observedAt: z.iso.datetime(), files: z.array(sourceFile).max(64),
});

export function normalizeMemorySourceSnapshot(value: unknown, files: string[]): MemorySourceSnapshot {
  const parsed = snapshotSchema.safeParse(value);
  if (!parsed.success) throw new Error('MEMORY_SOURCE_SNAPSHOT_INVALID');
  const result = parsed.data;
  const names = new Set(result.files.map(item => item.path));
  if (names.size !== result.files.length || names.size !== files.length || files.some(file => !names.has(file))) {
    throw new Error('MEMORY_SOURCE_SNAPSHOT_FILE_SET_MISMATCH');
  }
  const total = result.files.reduce((sum, file) => sum + (file.status === 'captured' ? file.bytes : 0), 0);
  if (total > EVIDENCE_TOTAL_MAX) throw new Error('MEMORY_SOURCE_SNAPSHOT_BYTE_LIMIT');
  return result;
}

/** Deliberately excludes private/runtime trees, even when named in provenance. */
export function memorySourcePathAllowed(file: string): boolean {
  const value = file.replaceAll('\\', '/');
  const parts = value.toLowerCase().split('/');
  if (path.posix.isAbsolute(value) || /[:\0\r\n]/.test(value)
    || parts.some(part => !part || part === '..' || part === '.')) return false;
  const excluded = new Set(['do not touch without instruction explicit', 'secrets', 'secret',
    '.git', 'node_modules', 'runtime', 'release', 'backups', '.ssh', '.aws']);
  if (parts.some(part => excluded.has(part) || part.startsWith('.env'))) return false;
  const name = parts.at(-1)!;
  if (/^(?:credentials?|tokens?|passwords?|id_rsa|id_ed25519)(?:\.|$)/i.test(name)) return false;
  return /\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|txt|py|ps1|cs|yaml|yml|toml|html|css|sql|xml|svg)$/i.test(name);
}

export async function captureMemorySourceSnapshot(root: string, files: string[]): Promise<MemorySourceSnapshot> {
  const output: MemorySourceFileSnapshot[] = [];
  let remaining = EVIDENCE_TOTAL_MAX;
  if (files.length > 64 || new Set(files).size !== files.length) throw new Error('MEMORY_SOURCE_FILE_LIMIT');
  for (const file of files) {
    const unavailable = (reason: Extract<MemorySourceFileSnapshot, { status: 'unavailable' }>['reason']) => {
      output.push({ path: file, status: 'unavailable', reason });
    };
    if (!memorySourcePathAllowed(file)) { unavailable('excluded-path'); continue; }
    const absolute = path.resolve(root, file);
    // Validate aliases before even consulting a nearby evidence-policy marker.
    try { await assertEvidenceLocalPath(absolute); }
    catch { unavailable('unreadable-or-unsupported'); continue; }
    const policy = decideToolEvidenceCapture('read_file', { path: absolute });
    if (policy.policyState === 'invalid' || policy.disposition !== 'full') { unavailable('evidence-policy'); continue; }
    if (remaining <= 0) { unavailable('read-budget'); continue; }
    const allowance = Math.min(EVIDENCE_DOCUMENT_MAX, remaining);
    // Reserve the entire allowance on failure so even failed reads stay bounded.
    remaining -= allowance;
    try {
      const snapshot = await readEvidenceSnapshot(absolute, allowance);
      remaining += allowance - snapshot.bytes.length;
      output.push({ path: file, status: 'captured', digest: snapshot.digest, bytes: snapshot.bytes.length });
    } catch {
      unavailable('unreadable-or-unsupported');
    }
  }
  return { version: 1, observedAt: new Date().toISOString(), files: output };
}

export async function compareMemorySourceSnapshot(root: string, snapshot: MemorySourceSnapshot) {
  const current = await captureMemorySourceSnapshot(root, snapshot.files.map(file => file.path));
  const changedFiles: string[] = [], unavailableFiles: string[] = [];
  for (let i = 0; i < snapshot.files.length; i += 1) {
    const before = snapshot.files[i]!, after = current.files[i]!;
    if (before.status !== 'captured' || after.status !== 'captured') unavailableFiles.push(before.path);
    else if (before.digest !== after.digest || before.bytes !== after.bytes) changedFiles.push(before.path);
  }
  const status = changedFiles.length ? 'changed' as const
    : unavailableFiles.length ? 'source-unavailable' as const : 'current' as const;
  return { status, changedFiles, unavailableFiles, basis: 'local-byte-snapshot' as const,
    capturedAt: snapshot.observedAt, observedAt: current.observedAt,
    ...(unavailableFiles.length ? { reason: 'Some selected source snapshots could not be compared; no full-current claim.' } : {}) };
}
