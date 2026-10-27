import { buildBm25Profile } from '../memory/bm25.js';
import type { MemoryRecord } from '../memory/types.js';
import type { SkillArtifactSummary, SkillMetadata } from './service.js';

export type SkillSearchMode = 'lexical' | 'hybrid';
export interface SkillDiscoveryDescriptor {
  name: string;
  description: string;
  digest: string;
  allowedTools: string[];
  compatibility?: string;
  triggers: string[];
  nonTriggers: string[];
  applicability: 'declared' | 'missing' | 'ambiguous';
  descriptorTruncated: boolean;
}
export interface SkillSearchHit extends SkillDiscoveryDescriptor {
  rank: number;
  channels: ('lexical' | 'semantic')[];
  lexicalScore: number;
  semanticScore?: number;
  scoreKind: 'rank-fusion';
  executionAuthority: false;
}
export interface SkillCatalogCoverage {
  scanned: number;
  valid: number;
  invalid: number;
  omitted: number;
  complete: boolean;
}
export interface SkillSemanticCoverage {
  providerAvailable: boolean;
  status: 'not-requested' | 'unavailable' | 'complete' | 'partial' | 'fallback';
  embeddedDescriptors: number;
  validDescriptors: number;
  sentDescriptors: number;
  queryTruncated: boolean;
  descriptorTruncated: number;
  reason?: 'no-provider' | 'empty-catalog' | 'batch-limit' | 'sensitive-input' | 'busy'
    | 'timeout' | 'cancelled' | 'provider-failure' | 'invalid-vector';
}
export interface SkillSearchResult {
  version: 1;
  requestedMode: SkillSearchMode;
  effectiveMode: SkillSearchMode;
  hits: SkillSearchHit[];
  catalog: SkillCatalogCoverage;
  semantic: SkillSemanticCoverage;
  truncated: boolean;
  emptyReason?: 'empty-catalog' | 'no-valid-descriptors' | 'no-match';
}
export interface SkillDiscoverySnapshot {
  artifacts: SkillArtifactSummary[];
  search: SkillSearchResult;
}
export interface SkillDiscoverInput {
  query: string;
  limit?: number;
  mode?: SkillSearchMode;
  signal?: AbortSignal;
}
export interface SkillReadResult {
  name: string;
  digest: string;
  source: string; // 'SKILL.md' or a bounded packaged references/... resource
  content: string;
  offset: number;
  nextOffset: number | null;
  totalContentBytes: number;
  truncated: boolean;
  delivery: 'instruction-fragment';
  executionAuthority: false;
}

export const SKILL_DESCRIPTOR_VERSION = 1;
export const MAX_SKILL_SEARCH_BYTES = 32 * 1024;
export const MAX_SKILL_EMBEDDING_UNITS = 1_200;

export function truncateSkillEmbeddingText(text: string): string {
  let end = Math.min(text.length, MAX_SKILL_EMBEDDING_UNITS);
  if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]!) && /[\uDC00-\uDFFF]/.test(text[end]!)) end--;
  return text.slice(0, end);
}

/** Applicability is only declared text, never an inferred policy or permission. */
export function describeSkill(metadata: SkillMetadata, skillMarkdown: string, digest: string): SkillDiscoveryDescriptor {
  const sections = { triggers: [] as string[], nonTriggers: [] as string[] };
  const headings = { triggers: 0, nonTriggers: 0 };
  let section: keyof typeof sections | undefined;
  let fence: { character: string; length: number } | undefined;
  let descriptorTruncated = false;
  // The strict native frontmatter parser already validated the leading block.
  const normalized = skillMarkdown.replace(/\r\n/g, '\n');
  const body = normalized.slice(normalized.indexOf('\n---\n', 4) + 5);
  for (const line of body.split('\n')) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1]![0] === fence.character && marker[1]!.length >= fence.length && !marker[2]!.trim()) fence = undefined;
      continue;
    }
    if (marker) { fence = { character: marker[1]![0]!, length: marker[1]!.length }; continue; }
    const heading = /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      if (heading[1]!.length <= 2) section = undefined;
      if (heading[1]!.length === 2) {
        const title = heading[2]!.toLowerCase();
        section = /^triggers?$/.test(title) ? 'triggers' : /^non-triggers?$/.test(title) ? 'nonTriggers' : undefined;
        if (section) headings[section]++;
      }
      continue;
    }
    const value = line.trim().replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, '').trim();
    if (!section || !value) continue;
    if (sections[section].length >= 8) { descriptorTruncated = true; continue; }
    const points = Array.from(value);
    if (points.length > 240) descriptorTruncated = true;
    sections[section].push(points.slice(0, 240).join(''));
  }
  const allowedTools = metadata.allowedTools.slice(0, 64).map(tool => {
    const points = Array.from(tool);
    if (points.length > 240) descriptorTruncated = true;
    return points.slice(0, 240).join('');
  });
  if (metadata.allowedTools.length > 64) descriptorTruncated = true;
  return {
    name: metadata.name, description: metadata.description, digest, allowedTools,
    ...(metadata.compatibility ? { compatibility: metadata.compatibility } : {}),
    ...sections,
    applicability: headings.triggers > 1 || headings.nonTriggers > 1 ? 'ambiguous'
      : sections.triggers.length && sections.nonTriggers.length ? 'declared' : 'missing',
    descriptorTruncated,
  };
}

export function positiveSkillDescriptor(descriptor: SkillDiscoveryDescriptor): string {
  return [descriptor.name, descriptor.description, ...descriptor.triggers,
    descriptor.compatibility ?? '', ...descriptor.allowedTools].filter(Boolean).join('\n');
}

/** Standard reciprocal rank fusion; raw cosine and BM25 scores have different scales. */
export function rankSkillDescriptors(
  descriptors: SkillDiscoveryDescriptor[], query: string, semanticScores = new Map<string, number>(),
): SkillSearchHit[] {
  const records = descriptors.map(item => ({ id: item.name, content: positiveSkillDescriptor(item),
    keywords: [], tags: [], context: '', category: '' } as unknown as MemoryRecord));
  const lexicalScores = buildBm25Profile(records, query).scores;
  const exact = (item: SkillDiscoveryDescriptor) => item.name === query.trim().toLowerCase();
  const lexical = descriptors.filter(item => exact(item) || (lexicalScores.get(item.name) ?? 0) > 0)
    .sort((a, b) => Number(exact(b)) - Number(exact(a))
      || (lexicalScores.get(b.name) ?? 0) - (lexicalScores.get(a.name) ?? 0) || a.name.localeCompare(b.name));
  const semantic = descriptors.filter(item => (semanticScores.get(item.name) ?? 0) > 0)
    .sort((a, b) => semanticScores.get(b.name)! - semanticScores.get(a.name)! || a.name.localeCompare(b.name));
  const lexicalRank = new Map(lexical.map((item, index) => [item.name, index + 1]));
  const semanticRank = new Map(semantic.map((item, index) => [item.name, index + 1]));
  const fusion = (item: SkillDiscoveryDescriptor) =>
    (lexicalRank.has(item.name) ? 1 / (60 + lexicalRank.get(item.name)!) : 0)
    + (semanticRank.has(item.name) ? 1 / (60 + semanticRank.get(item.name)!) : 0);
  return descriptors.filter(item => lexicalRank.has(item.name) || semanticRank.has(item.name))
    .sort((a, b) => Number(exact(b)) - Number(exact(a)) || fusion(b) - fusion(a)
      || (lexicalScores.get(b.name) ?? 0) - (lexicalScores.get(a.name) ?? 0) || a.name.localeCompare(b.name))
    .map((item, index) => ({ ...item, rank: index + 1,
      channels: [...(lexicalRank.has(item.name) ? ['lexical' as const] : []), ...(semanticRank.has(item.name) ? ['semantic' as const] : [])],
      lexicalScore: lexicalScores.get(item.name) ?? 0,
      ...(semanticRank.has(item.name) ? { semanticScore: semanticScores.get(item.name)! } : {}),
      scoreKind: 'rank-fusion', executionAuthority: false,
    }));
}

export function boundSkillSearchResult(result: SkillSearchResult, limit: number): SkillSearchResult {
  const bounded = { ...result, hits: result.hits.slice(0, limit),
    truncated: result.truncated || result.hits.length > limit };
  while (Buffer.byteLength(JSON.stringify(bounded), 'utf8') > MAX_SKILL_SEARCH_BYTES && bounded.hits.length) {
    bounded.hits.pop(); bounded.truncated = true;
  }
  return bounded;
}
