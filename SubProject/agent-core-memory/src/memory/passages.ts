import { createHash } from 'node:crypto';
import { memorySemanticRevision } from './disclosure.js';
import type { Digest } from './experience-types.js';
import { buildSemanticDocument, SEMANTIC_DOCUMENT_VERSION } from './semantic-document.js';
import type { MemoryRecord } from './types.js';

export const PASSAGE_VERSION = 1 as const;
export const PASSAGE_WINDOW = 600;
export const PASSAGE_OVERLAP = 80;
export const MAX_MEMORY_PASSAGES = 128;
export const MAX_PASSAGE_INPUT_UNITS = 1600;

export interface PassageDescriptor {
  id: string;
  parentId: string;
  parentRevision: Digest;
  /** Half-open offsets in the original content's Unicode code points. */
  start: number;
  end: number;
  text: string;
  fingerprint: string;
}
export interface PassageProjection {
  version: typeof PASSAGE_VERSION;
  passages: PassageDescriptor[];
  coverage: 'complete' | 'partial';
  totalCodePoints: number;
  coveredThrough: number;
}
const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Derived only: children never acquire canonical identity, scope or trust. */
export function buildMemoryPassages(record: MemoryRecord): PassageProjection {
  const points = Array.from(record.content);
  const parentRevision = memorySemanticRevision(record);
  const passages: PassageDescriptor[] = [];
  let coveredThrough = 0;
  for (let start = 0; start < points.length && passages.length < MAX_MEMORY_PASSAGES; start += PASSAGE_WINDOW - PASSAGE_OVERLAP) {
    const end = Math.min(points.length, start + PASSAGE_WINDOW);
    const text = points.slice(start, end).join('');
    const id = hash([record.id, parentRevision, PASSAGE_VERSION, start, end]);
    const fingerprint = hash([id, text, SEMANTIC_DOCUMENT_VERSION,
      buildSemanticDocument({ ...record, content: text }), PASSAGE_WINDOW, PASSAGE_OVERLAP, MAX_MEMORY_PASSAGES]);
    passages.push({ id, parentId: record.id, parentRevision, start, end, text, fingerprint });
    coveredThrough = end;
    if (end === points.length) break;
  }
  return { version: PASSAGE_VERSION, passages, coverage: coveredThrough === points.length ? 'complete' : 'partial',
    totalCodePoints: points.length, coveredThrough };
}
