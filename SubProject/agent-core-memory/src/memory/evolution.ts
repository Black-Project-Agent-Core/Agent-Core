import { boundedHistory } from './note-format.js';
import { normalizeLinks } from './relations.js';
import type { MemoryEvolutionProposal } from './intelligence.js';
import type { EvolutionEvent, MemoryLink, MemoryRecord } from './types.js';

function event(
  kind: EvolutionEvent['kind'],
  changedFields: string[],
  details?: Record<string, unknown>,
): EvolutionEvent {
  return {
    kind,
    source: 'intelligence',
    timestamp: new Date().toISOString(),
    ...(changedFields.length ? { changedFields } : {}),
    ...(details ? { details } : {}),
  };
}

export interface AppliedEvolution {
  record: MemoryRecord;
  changedFields: string[];
  addedLinks: string[];
  strengthenedLinks: string[];
}

export function applyEvolutionProposal(
  current: MemoryRecord,
  proposal: MemoryEvolutionProposal,
  validIds: Set<string>,
): AppliedEvolution {
  if (proposal.memoryId !== current.id) throw new Error('Evolution proposal target does not match memory id');
  const next: MemoryRecord = { ...current, links: [...current.links] };
  const changed = new Set<string>();
  const addedLinks: string[] = [];
  const strengthenedLinks: string[] = [];
  if (!next.keywords.length && proposal.metadata.keywords?.length) {
    next.keywords = [...new Set(proposal.metadata.keywords)];
    changed.add('keywords');
  }
  if (!next.tags.length && proposal.metadata.tags?.length) {
    next.tags = [...new Set(proposal.metadata.tags)];
    changed.add('tags');
  }
  if ((!next.context || next.context === 'General') && proposal.metadata.context) {
    next.context = proposal.metadata.context;
    changed.add('context');
  }
  if ((!next.category || next.category === 'Uncategorized')
    && proposal.metadata.category
    && proposal.metadata.category !== 'Uncategorized') {
    next.category = proposal.metadata.category;
    changed.add('category');
  }

  const now = new Date().toISOString();
  const candidateLinks: MemoryLink[] = proposal.links.map((link) => ({ ...link, createdAt: now }));
  const before = new Map(next.links.map((link) => [`${link.targetId}\u0000${link.type}`, link]));
  next.links = normalizeLinks(next.id, [...next.links, ...candidateLinks], validIds,next.version===2);
  for (const link of next.links) {
    const key = `${link.targetId}\u0000${link.type}`;
    const previous = before.get(key);
    if (!previous) {
      addedLinks.push(link.targetId);
    } else if (link.strength > previous.strength) {
      strengthenedLinks.push(link.targetId);
    }
  }
  if (addedLinks.length || strengthenedLinks.length) changed.add('links');

  if (!changed.size) {
    return { record: current, changedFields: [], addedLinks: [], strengthenedLinks: [] };
  }
  next.updatedAt = now;
  let history = next.evolutionHistory;
  const metadataFields = [...changed].filter((field) => field !== 'links');
  if (metadataFields.length) {
    history = boundedHistory(history, event('metadata_enriched', metadataFields, { provider: proposal.provider }));
  }
  if (addedLinks.length) {
    history = boundedHistory(history, event('link_added', ['links'], {
      targets: addedLinks,
      provider: proposal.provider,
    }));
  }
  if (strengthenedLinks.length) {
    history = boundedHistory(history, event('link_strengthened', ['links'], {
      targets: strengthenedLinks,
      provider: proposal.provider,
    }));
  }
  next.evolutionHistory = history;
  return {
    record: next,
    changedFields: [...changed],
    addedLinks,
    strengthenedLinks,
  };
}
