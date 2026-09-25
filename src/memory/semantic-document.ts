import type { MemoryRecord } from './types.js';

export function buildSemanticDocument(record: MemoryRecord): string {
  const lines = [record.content.trim()];
  if (record.context && record.context !== 'General') lines.push(`context: ${record.context}`);
  if (record.keywords.length) lines.push(`keywords: ${record.keywords.join(', ')}`);
  if (record.tags.length) lines.push(`tags: ${record.tags.join(', ')}`);
  if (record.category && record.category !== 'Uncategorized') lines.push(`category: ${record.category}`);
  return lines.join('\n');
}

export function tokenizeMemoryText(value: string): string[] {
  return (value.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? []).filter((token) => token.length > 1);
}
