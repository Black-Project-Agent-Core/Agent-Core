import type { MemoryRecord } from './types.js';

export const SEMANTIC_DOCUMENT_VERSION = 2 as const;

function normalizedValue(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}

export function buildSemanticDocument(record: MemoryRecord): string {
  const lines: string[] = [];
  const title = record.title ? normalizedValue(record.title) : '';
  if (title) lines.push(`title: ${title}`);
  lines.push(normalizedValue(record.content));
  const context = normalizedValue(record.context);
  if (context && context !== 'General') lines.push(`context: ${context}`);
  if (record.keywords.length) lines.push(`keywords: ${record.keywords.map(normalizedValue).join(', ')}`);
  if (record.tags.length) lines.push(`tags: ${record.tags.map(normalizedValue).join(', ')}`);
  const category = normalizedValue(record.category);
  if (category && category !== 'Uncategorized') lines.push(`category: ${category}`);
  return lines.join('\n');
}

export function tokenizeMemoryText(value: string): string[] {
  return (value.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? []).filter((token) => token.length > 1);
}
