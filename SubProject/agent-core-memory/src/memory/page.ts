import { createHash } from 'node:crypto';
import type { MemoryRecord } from './types.js';

const VERSION = 1 as const;
const MAX_CURSOR_BYTES = 2_048;
const MAX_PAGE = 100;

interface CursorPayload {
  version: typeof VERSION;
  snapshot: string;
  workspace: string;
  afterId: string;
  checksum: string;
}

function sha256(value: string): string {
  return 'sha256:' + createHash('sha256').update(value).digest('hex');
}

function snapshotDigest(records: MemoryRecord[]): string {
  return sha256(JSON.stringify(records.map(record => ({
    id: record.id,
    pinned: record.pinned,
    updatedAt: record.updatedAt,
    workspace: record.provenance?.workspace ?? '',
  }))));
}

function cursorChecksum(payload: Omit<CursorPayload, 'checksum'>): string {
  return sha256('agent-core-memory-page\0' + JSON.stringify(payload));
}

function encodeCursor(payload: Omit<CursorPayload, 'checksum'>): string {
  return Buffer.from(JSON.stringify({ ...payload, checksum: cursorChecksum(payload) }), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): CursorPayload {
  if (!raw || raw.length > MAX_CURSOR_BYTES * 2) throw new Error('MEMORY_PAGE_CURSOR_INVALID');
  let parsed: Partial<CursorPayload>;
  try {
    const decoded = Buffer.from(raw, 'base64url');
    if (decoded.length > MAX_CURSOR_BYTES) throw new Error();
    parsed = JSON.parse(decoded.toString('utf8')) as Partial<CursorPayload>;
  } catch {
    throw new Error('MEMORY_PAGE_CURSOR_INVALID');
  }
  if (parsed.version !== VERSION
    || typeof parsed.snapshot !== 'string'
    || typeof parsed.workspace !== 'string'
    || typeof parsed.afterId !== 'string'
    || typeof parsed.checksum !== 'string') {
    throw new Error('MEMORY_PAGE_CURSOR_INVALID');
  }
  const base = {
    version: VERSION,
    snapshot: parsed.snapshot,
    workspace: parsed.workspace,
    afterId: parsed.afterId,
  } as const;
  if (cursorChecksum(base) !== parsed.checksum) throw new Error('MEMORY_PAGE_CURSOR_INVALID');
  return { ...base, checksum: parsed.checksum };
}

export function pageMemoryRecords(
  records: MemoryRecord[],
  input: { workspace?: string; limit?: number; cursor?: string },
) {
  const limit = Math.max(1, Math.min(MAX_PAGE, input.limit ?? 50));
  const workspace = input.workspace?.trim().toLowerCase() ?? '';
  const snapshot = snapshotDigest(records);
  let start = 0;

  if (input.cursor) {
    const cursor = decodeCursor(input.cursor);
    if (cursor.workspace !== workspace || cursor.snapshot !== snapshot) {
      throw new Error('MEMORY_PAGE_CURSOR_STALE');
    }
    const index = records.findIndex(record => record.id === cursor.afterId);
    if (index < 0) throw new Error('MEMORY_PAGE_CURSOR_STALE');
    start = index + 1;
  }

  const items = records.slice(start, start + limit);
  const last = items.at(-1);
  const nextCursor = start + items.length < records.length && last
    ? encodeCursor({ version: VERSION, snapshot, workspace, afterId: last.id })
    : undefined;

  return {
    version: VERSION,
    snapshot,
    total: records.length,
    items,
    ...(nextCursor ? { nextCursor } : {}),
  };
}

// Controller cursors are bounded continuation hints, not authorization tokens.
// The host revalidates every binding against actual scoped source state.
interface DisclosureCursor { scope: string; request: string; snapshot: string; position: number; rankingTime: number }
function cursorHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('base64url');
}
export function encodeDisclosureCursor(value: DisclosureCursor): string {
  const parts = [1, value.scope, value.request, value.snapshot, value.position, value.rankingTime];
  return Buffer.from(JSON.stringify([...parts, cursorHash(parts)]), 'utf8').toString('base64url');
}
export function decodeDisclosureCursor(raw: string): DisclosureCursor {
  if (!/^[A-Za-z0-9_-]+$/.test(raw) || raw.length > 2048) throw new Error('MEMORY_CURSOR_INVALID');
  let parts: unknown;
  try {
    const bytes = Buffer.from(raw, 'base64url');
    if (bytes.length > 1536 || bytes.toString('base64url') !== raw) throw new Error();
    parts = JSON.parse(bytes.toString('utf8'));
  } catch { throw new Error('MEMORY_CURSOR_INVALID'); }
  if (!Array.isArray(parts) || parts.length !== 7 || parts[0] !== 1
    || !parts.slice(1,4).every(value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value))
    || !Number.isSafeInteger(parts[4]) || parts[4] < 0 || !Number.isSafeInteger(parts[5]) || parts[5] < 0 || cursorHash(parts.slice(0,6)) !== parts[6]) {
    throw new Error('MEMORY_CURSOR_INVALID');
  }
  return { scope: parts[1], request: parts[2], snapshot: parts[3], position: parts[4], rankingTime: parts[5] };
}
export function disclosureCursorBinding(digest: string): string {
  return Buffer.from(digest.slice('sha256:'.length), 'hex').toString('base64url');
}
