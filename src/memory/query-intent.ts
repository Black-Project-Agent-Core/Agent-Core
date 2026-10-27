/**
 * Deterministic query intent classification for adaptive fusion weighting.
 *
 * The classifier only inspects the query text (and an optional source-file hint),
 * so it is cheap, reproducible and needs no model. Weights multiply the reciprocal
 * rank contribution of each fusion channel; all-ones weights are the legacy behavior.
 */

export type FusionChannelName = 'lexical' | 'metadata' | 'semantic' | 'source';
export type FusionChannelWeights = Record<FusionChannelName, number>;
export type QueryIntent = 'exact' | 'identifier' | 'source' | 'conceptual' | 'keyword' | 'balanced';

export interface QueryIntentResult {
  intent: QueryIntent;
  weights: FusionChannelWeights;
  signals: string[];
}

export const NEUTRAL_FUSION_WEIGHTS: Readonly<FusionChannelWeights> = Object.freeze({
  lexical: 1, metadata: 1, semantic: 1, source: 1,
});
export const QUERY_INTENT_VERSION = 'query-intent/v1';

const WEIGHTS: Record<QueryIntent, FusionChannelWeights> = {
  exact: { lexical: 1.5, metadata: 0.9, semantic: 0.6, source: 1 },
  identifier: { lexical: 1.6, metadata: 1.1, semantic: 0.5, source: 1.2 },
  source: { lexical: 1.2, metadata: 1, semantic: 0.7, source: 1.8 },
  conceptual: { lexical: 0.8, metadata: 0.9, semantic: 1.6, source: 0.8 },
  keyword: { lexical: 1.1, metadata: 1.4, semantic: 0.8, source: 1 },
  balanced: { ...NEUTRAL_FUSION_WEIGHTS },
};

const QUESTION_WORD = /^(?:apa|apakah|bagaimana|mengapa|kenapa|kapan|siapa|dimana|di mana|mana|jelaskan|why|how|what|when|where|which|who|explain|describe)\b/i;

/** Concrete identifiers: long path/id-like tokens containing a digit or a separator. */
export function concreteIdentifiers(query: string): string[] {
  const matches = query.match(/[A-Za-z0-9][A-Za-z0-9_.:/\\-]{7,}/g) ?? [];
  return [...new Set(matches
    .map((value) => value.toLowerCase().replaceAll('\\', '/').replace(/\.+$/, ''))
    .filter((value) => /[0-9_.:/-]/.test(value)))]
    .slice(0, 16);
}

function pathLike(query: string): boolean {
  return /(?:^|\s)(?:[A-Za-z]:[\\/]|\.{0,2}[\\/])?[\w.-]+(?:[\\/][\w.-]+)+(?:\s|$)/.test(query)
    || /\.(?:ts|tsx|js|mjs|json|md|py|ps1|cmd)\b/i.test(query);
}

export function classifyQueryIntent(query: string, options: { sourceFiles?: string[] } = {}): QueryIntentResult {
  const text = query.trim();
  const words = text.split(/\s+/).filter(Boolean);
  const signals: string[] = [];
  const done = (intent: QueryIntent): QueryIntentResult =>
    ({ intent, weights: { ...WEIGHTS[intent] }, signals });

  if (/"[^"]{3,}"|`[^`]{3,}`/.test(text)) { signals.push('quoted-phrase'); return done('exact'); }
  if (options.sourceFiles?.length || pathLike(text)) {
    signals.push(options.sourceFiles?.length ? 'source-files' : 'path-like');
    return done('source');
  }
  if (concreteIdentifiers(text).length > 0) { signals.push('concrete-identifier'); return done('identifier'); }
  if (QUESTION_WORD.test(text) || words.length >= 7) {
    signals.push(QUESTION_WORD.test(text) ? 'question-word' : 'long-natural-language');
    return done('conceptual');
  }
  if (words.length > 0 && words.length <= 3) { signals.push('short-keyword'); return done('keyword'); }
  signals.push('no-dominant-signal');
  return done('balanced');
}

/** Clamp externally supplied weights so a single channel can never dominate or vanish. */
export function normalizeFusionWeights(weights?: Partial<FusionChannelWeights>): FusionChannelWeights {
  const output = { ...NEUTRAL_FUSION_WEIGHTS } as FusionChannelWeights;
  for (const channel of Object.keys(output) as FusionChannelName[]) {
    const value = weights?.[channel];
    if (typeof value === 'number' && Number.isFinite(value)) output[channel] = Math.max(0.25, Math.min(2, value));
  }
  return output;
}
