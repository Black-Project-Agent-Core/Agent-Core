import type { MemoryIndex } from './index.js';
import { buildSemanticDocument, tokenizeMemoryText } from './semantic-document.js';
import type { MemoryRecord } from './types.js';

export interface ConsolidationCandidate {
  leftId: string;
  rightId: string;
  semanticSimilarity: number;
  lexicalJaccard: number;
  combinedScore: number;
  recommendation: 'review-merge' | 'review-overlap';
}

export interface ConsolidationOptions {
  semanticThreshold?: number;
  lexicalThreshold?: number;
  limit?: number;
}

function jaccard(left: string, right: string): number {
  const a = new Set(tokenizeMemoryText(left));
  const b = new Set(tokenizeMemoryText(right));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  const union = a.size + b.size - intersection;
  return union ? intersection / union : 0;
}
export async function findConsolidationCandidates(
  records: MemoryRecord[],
  index: MemoryIndex,
  options: ConsolidationOptions = {},
): Promise<ConsolidationCandidate[]> {
  const semanticThreshold = Math.max(0, Math.min(1, options.semanticThreshold ?? 0.82));
  const lexicalThreshold = Math.max(0, Math.min(1, options.lexicalThreshold ?? 0.62));
  const limit = Math.max(1, Math.min(100, options.limit ?? 20));
  const candidates = records.filter((record) => !record.pinned);
  const byId = new Map(candidates.map((record) => [record.id, record]));
  const pairScores = new Map<string, { leftId: string; rightId: string; semantic: number; lexical: number }>();

  try {
    for (const pair of await index.similarPairs(records, semanticThreshold, limit * 5)) {
      if (!byId.has(pair.leftId) || !byId.has(pair.rightId)) continue;
      const key = [pair.leftId, pair.rightId].sort().join('\u0000');
      pairScores.set(key, { leftId: pair.leftId, rightId: pair.rightId, semantic: pair.similarity, lexical: 0 });
    }
  } catch {
    // Lexical comparison remains available when semantic index state is unavailable.
  }

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const left = candidates[i];
      const right = candidates[j];
      const lexical = jaccard(buildSemanticDocument(left), buildSemanticDocument(right));
      if (lexical < lexicalThreshold) continue;
      const key = [left.id, right.id].sort().join('\u0000');
      const existing = pairScores.get(key) ?? { leftId: left.id, rightId: right.id, semantic: 0, lexical: 0 };
      existing.lexical = lexical;
      pairScores.set(key, existing);
    }
  }
  return [...pairScores.values()]
    .map((pair) => {
      const combinedScore = pair.semantic > 0
        ? pair.semantic * 0.75 + pair.lexical * 0.25
        : pair.lexical;
      return {
        leftId: pair.leftId,
        rightId: pair.rightId,
        semanticSimilarity: Number(pair.semantic.toFixed(6)),
        lexicalJaccard: Number(pair.lexical.toFixed(6)),
        combinedScore: Number(combinedScore.toFixed(6)),
        recommendation: combinedScore >= 0.9 ? 'review-merge' as const : 'review-overlap' as const,
      };
    })
    .filter((item) => item.semanticSimilarity >= semanticThreshold || item.lexicalJaccard >= lexicalThreshold)
    .sort((a, b) => b.combinedScore - a.combinedScore || a.leftId.localeCompare(b.leftId))
    .slice(0, limit);
}
