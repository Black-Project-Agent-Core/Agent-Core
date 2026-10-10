import * as z from 'zod/v4';
import type { MemoryIndex } from './index.js';
import { tokenizeMemoryText } from './semantic-document.js';
import type { MemoryLink, MemoryRecord } from './types.js';

const STOPWORDS = new Set([
  'yang','dan','atau','untuk','dari','dengan','pada','dalam','adalah','ini','itu','ke','di','sebagai','agar','jika','karena','tidak','akan','sudah','juga','lebih','bisa','dapat','oleh','the','and','or','for','from','with','this','that','into','are','was','were','will','not','can','could','should','would','has','have','had','its','use','using','used','than','then','when','where','what','which','who','how','about','over','under','your','our','their','they','them','you','we','a','an','of','to','in','on','is','be','as','at','it','by'
]);

const linkProposalSchema = z.object({
  targetId: z.string().min(3).max(128),
  type: z.literal('related'),
  strength: z.number().min(0).max(1),
  reason: z.string().min(1).max(500),
});

const evolutionProposalSchema = z.object({
  memoryId: z.string().min(3).max(128),
  provider: z.literal('embedding-deterministic'),
  metadata: z.object({
    keywords: z.array(z.string()).max(32).optional(),
    context: z.string().max(500).optional(),
    tags: z.array(z.string()).max(32).optional(),
    category: z.string().max(200).optional(),
  }),
  links: z.array(linkProposalSchema).max(8),
});

export type MemoryEvolutionProposal = z.infer<typeof evolutionProposalSchema>;

export interface MemoryEvolutionPreview {
  proposal: MemoryEvolutionProposal;
  neighbors: Array<{id: string; title?: string; similarity: number; proposedLink: boolean; proposedStrength?: number; proposedReason?: string; keywords: string[]; context: string; tags: string[]; category: string; pinned: boolean}>;
}

export interface MemoryIntelligence {
  readonly provider: string;
  enrich(content: string): Promise<{ keywords: string[]; context: string; tags: string[]; category: string }>;
  propose(record: MemoryRecord, allRecords: MemoryRecord[]): Promise<MemoryEvolutionProposal>;
  preview(record: MemoryRecord, allRecords: MemoryRecord[], neighborLimit?: number): Promise<MemoryEvolutionPreview>;
}
function topKeywords(content: string, limit = 12): string[] {
  const counts = new Map<string, number>();
  for (const token of tokenizeMemoryText(content)) {
    if (token.length < 3 || STOPWORDS.has(token) || /^\d+$/.test(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([token]) => token);
}

function contextFromContent(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'General';
  const sentenceEnd = normalized.search(/[.!?](?:\s|$)/);
  const first = sentenceEnd >= 0 ? normalized.slice(0, sentenceEnd + 1) : normalized;
  return first.slice(0, 320);
}

export function enrichMemoryMetadata(content: string): {
  keywords: string[];
  context: string;
  tags: string[];
  category: string;
} {
  const keywords = topKeywords(content);
  return {
    keywords,
    context: contextFromContent(content),
    tags: keywords.slice(0, 6),
    category: 'Uncategorized',
  };
}

export class EmbeddingMemoryIntelligence implements MemoryIntelligence {
  readonly provider = 'embedding-deterministic';

  constructor(
    private readonly index: MemoryIndex,
    private readonly relationThreshold = 0.74,
  ) {}

  async enrich(content: string) {
    return enrichMemoryMetadata(content);
  }
  async preview(record: MemoryRecord, allRecords: MemoryRecord[], neighborLimit = 5): Promise<MemoryEvolutionPreview> {
        const metadata: MemoryEvolutionProposal['metadata'] = {};
        const enriched = await this.enrich(record.content);
        if (!record.keywords.length)
            metadata.keywords = enriched.keywords;
        if (!record.tags.length)
            metadata.tags = enriched.tags;
        if (!record.context || record.context === 'General')
            metadata.context = enriched.context;
        if (!record.category || record.category === 'Uncategorized')
            metadata.category = enriched.category;
        const byId = new Map(allRecords.map((item) => [item.id, item]));
        const nearest = await this.index.nearest(record.id, allRecords, 8);
        const links = nearest
            .filter((neighbor) => neighbor.similarity >= this.relationThreshold)
            .filter((neighbor) => byId.has(neighbor.id))
            .slice(0, 5)
            .map((neighbor) => ({
            targetId: neighbor.id,
            type: 'related' as const,
            strength: Math.max(0, Math.min(1, Number(neighbor.similarity.toFixed(6)))),
            reason: `embedding cosine similarity ${neighbor.similarity.toFixed(4)}`,
        }));
        const proposal = evolutionProposalSchema.parse({
            memoryId: record.id,
            provider: 'embedding-deterministic',
            metadata,
            links,
        });
        const proposedById = new Map(proposal.links.map((link) => [link.targetId, link]));
        const boundedLimit = Math.max(1, Math.min(8, neighborLimit));
        const neighbors = nearest
            .filter((neighbor) => byId.has(neighbor.id))
            .slice(0, boundedLimit)
            .map((neighbor) => {
            const target = byId.get(neighbor.id)!;
            const proposed = proposedById.get(neighbor.id);
            return {
                id: target.id,
                ...(target.title ? { title: target.title } : {}),
                similarity: Math.max(0, Math.min(1, Number(neighbor.similarity.toFixed(6)))),
                proposedLink: Boolean(proposed),
                ...(proposed ? {
                    proposedStrength: proposed.strength,
                    proposedReason: proposed.reason,
                } : {}),
                keywords: [...target.keywords],
                context: target.context,
                tags: [...target.tags],
                category: target.category,
                pinned: target.pinned,
            };
        });
        return { proposal, neighbors };
    }
  async propose(record: MemoryRecord, allRecords: MemoryRecord[]): Promise<MemoryEvolutionProposal> {
        return (await this.preview(record, allRecords)).proposal;
    }
}

export function proposalLinks(proposal: MemoryEvolutionProposal): Array<Omit<MemoryLink, 'createdAt'>> {
  return proposal.links.map((link) => ({
    targetId: link.targetId,
    type: link.type,
    strength: link.strength,
    reason: link.reason,
  }));
}
