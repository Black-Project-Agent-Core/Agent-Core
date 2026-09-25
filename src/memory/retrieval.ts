import { cosineSimilarity } from './embedder.js';
import { buildSemanticDocument, tokenizeMemoryText } from './semantic-document.js';
import { normalizeMemorySourceFile } from './provenance.js';
import type { SemanticSearchContext } from './index.js';
import type { MemoryRecord } from './types.js';

export interface RetrievalComponents {
  exactPhrase: number;
  tokenOverlap: number;
  keywordMatch: number;
  tagMatch: number;
  contextMatch: number;
  categoryMatch: number;
  semanticSimilarity: number;
  sourceFileMatch: number;
  recency: number;
  linkBoost: number;
}

export interface MemorySearchResult {
  record: MemoryRecord;
  score: number;
  components: RetrievalComponents;
  matchType: 'direct' | 'linked';
  viaMemoryId?: string;
  viaLinkType?: string;
}

export interface MemorySearchOptions {
  limit?: number;
  maxNeighbors?: number;
  budgetChars?: number;
  sourceFiles?: string[];
}

const zero = (): RetrievalComponents => ({
  exactPhrase: 0, tokenOverlap: 0, keywordMatch: 0, tagMatch: 0,
  contextMatch: 0, categoryMatch: 0, semanticSimilarity: 0, sourceFileMatch: 0, recency: 0, linkBoost: 0,
});
function countMatches(queryTokens: Set<string>, values: string[]): number {
  let matches = 0;
  for (const value of values) {
    const tokens = tokenizeMemoryText(value);
    if (tokens.some((token) => queryTokens.has(token))) matches++;
  }
  return matches;
}

function scoreRecord(
  record: MemoryRecord,
  query: string,
  semantic?: SemanticSearchContext,
  sourceFiles: string[] = [],
): { score: number; components: RetrievalComponents } {
  const normalizedQuery = query.trim().toLowerCase();
  const queryTokens = new Set(tokenizeMemoryText(normalizedQuery));
  const document = buildSemanticDocument(record).toLowerCase();
  const documentSet = new Set(tokenizeMemoryText(document));
  const components = zero();

  components.exactPhrase = normalizedQuery && document.includes(normalizedQuery) ? 4 : 0;
  let overlap = 0;
  for (const token of queryTokens) if (documentSet.has(token)) overlap++;
  components.tokenOverlap = queryTokens.size ? (overlap / queryTokens.size) * 3 : 0;
  components.keywordMatch = countMatches(queryTokens, record.keywords) * 0.8;
  components.tagMatch = countMatches(queryTokens, record.tags) * 0.7;
  components.contextMatch = countMatches(queryTokens, [record.context]) * 0.6;
  components.categoryMatch = countMatches(queryTokens, [record.category]) * 0.5;

  if (sourceFiles.length && record.provenance?.files.length) {
    const sourceSet = new Set(sourceFiles);
    let sourceMatches = 0;
    for (const file of record.provenance.files) {
      if (sourceSet.has(file)) sourceMatches += 1;
    }
    components.sourceFileMatch = sourceMatches
      ? 1.25 * Math.min(1, sourceMatches / Math.max(1, sourceSet.size))
      : 0;
  }

  const vector = semantic?.vectors.get(record.id);
  if (vector && semantic) {
    components.semanticSimilarity = Math.max(0, Math.min(1, cosineSimilarity(semantic.queryVector, vector)));
  }
  const ageMs = Math.max(0, Date.now() - Date.parse(record.updatedAt));
  components.recency = Math.max(
    0,
    0.05 - Math.min(0.05, ageMs / (365 * 24 * 60 * 60 * 1000) * 0.05),
  );
  const score = components.exactPhrase
    + components.tokenOverlap
    + components.keywordMatch
    + components.tagMatch
    + components.contextMatch
    + components.categoryMatch
    + components.semanticSimilarity * 4
    + components.sourceFileMatch
    + components.recency
    + components.linkBoost;
  return { score, components };
}

export function searchMemories(
  records: MemoryRecord[],
  query: string,
  options: MemorySearchOptions = {},
  semantic?: SemanticSearchContext,
): MemorySearchResult[] {
  const limit = Math.max(1, Math.min(50, options.limit ?? 5));
  const maxNeighbors = Math.max(0, Math.min(10, options.maxNeighbors ?? 2));
  const budgetChars = Math.max(500, Math.min(100_000, options.budgetChars ?? 20_000));
  const sourceFiles = [...new Set((options.sourceFiles ?? []).map(normalizeMemorySourceFile))].slice(0, 32);
  const byId = new Map(records.map((record) => [record.id, record]));
  const direct = records
    .map((record) => ({ record, ...scoreRecord(record, query, semantic, sourceFiles) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id))
    .slice(0, limit);
  const output: MemorySearchResult[] = direct.map((item) => ({
    record: item.record,
    score: item.score,
    components: item.components,
    matchType: 'direct',
  }));
  const seen = new Set(output.map((item) => item.record.id));

  for (const item of direct) {
    let expanded = 0;
    for (const link of item.record.links.slice().sort((a, b) => b.strength - a.strength)) {
      if (expanded >= maxNeighbors || output.length >= limit + maxNeighbors * limit) break;
      if (seen.has(link.targetId)) continue;
      const neighbor = byId.get(link.targetId);
      if (!neighbor) continue;
      const components = zero();
      components.linkBoost = 0.5 + link.strength;
      output.push({
        record: neighbor,
        score: Math.max(0.01, item.score * 0.35 + components.linkBoost),
        components,
        matchType: 'linked',
        viaMemoryId: item.record.id,
        viaLinkType: link.type,
      });
      seen.add(neighbor.id);
      expanded++;
    }
  }

  output.sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id));
  const budgeted: MemorySearchResult[] = [];
  let used = 0;
  for (const item of output) {
    const size = item.record.content.length + JSON.stringify(item.record).length;
    if (used + size > budgetChars) continue;
    budgeted.push(item);
    used += size;
    if (budgeted.length >= limit + maxNeighbors * limit) break;
  }
  return budgeted;
}
