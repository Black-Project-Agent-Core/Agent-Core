import { describe, expect, it } from 'vitest';
import { buildBm25Profile } from '../src/memory/bm25.js';
import { legacyExperience } from '../src/memory/experience-types.js';
import { searchMemories } from '../src/memory/retrieval.js';
import * as semanticDocument from '../src/memory/semantic-document.js';
import type { MemoryRecord } from '../src/memory/types.js';

const { buildSemanticDocument } = semanticDocument;
const NOW = '2026-10-09T12:00:00.000Z';
function record(patch: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    version: 1, id: 'contextual-note', title: 'Nebula Adapter',
    content: 'A durable connection rule.', keywords: ['penghubung-nebula'],
    context: 'General', tags: [], category: 'Uncategorized', links: [],
    createdAt: NOW, updatedAt: NOW, lastAccessedAt: null, retrievalCount: 0,
    evolutionHistory: [], pinned: false, ...patch,
  } as MemoryRecord;
}

describe('contextual semantic document', () => {
  it('renders the canonical title once and only the aliases actually stored on this record', () => {
    const neighbor = record({ id: 'neighbor', keywords: ['proposed-nebula-alias'] });
    const target = record({ links: [{ targetId: neighbor.id, type: 'related', strength: 1, createdAt: NOW }] });
    expect(buildSemanticDocument(target)).toBe('title: Nebula Adapter\nA durable connection rule.\nkeywords: penghubung-nebula');
    expect(buildSemanticDocument(target)).not.toContain(neighbor.keywords[0]);
  });

  it('makes title-only queries relevant in lexical and BM25 channels without inventing unrelated relevance', () => {
    // Keep this title-only oracle independent of identifier subwords in aliases.
    const target = record({ keywords: [] });
    const baseline = record({ title: undefined, keywords: [] });
    expect(buildSemanticDocument(baseline)).not.toMatch(/nebula|adapter/i);
    expect(target.content).not.toMatch(/nebula|adapter/i);
    expect(target.keywords).toEqual([]);
    expect(buildSemanticDocument(target)).toContain('title: Nebula Adapter');
    const distractor = record({ id: 'distractor', title: 'Lunar Archive', content: 'A separate durable archive rule.', keywords: [] });
    const before = searchMemories([baseline, distractor], 'Nebula Adapter', { maxNeighbors: 0 }, undefined, 50, Date.parse(NOW));
    const after = searchMemories([target, distractor], 'Nebula Adapter', { maxNeighbors: 0 }, undefined, 50, Date.parse(NOW));
    expect(after[0].record.id).toBe(target.id);
    expect(after[0].components.exactPhrase).toBe(4);
    expect(after[0].components.tokenOverlap).toBeGreaterThan(before.find(hit => hit.record.id === target.id)!.components.tokenOverlap);
    expect(buildBm25Profile([target, distractor], 'Nebula Adapter').scores.get(target.id)).toBeGreaterThan(buildBm25Profile([baseline, distractor], 'Nebula Adapter').scores.get(target.id)!);
    const irrelevant = searchMemories([target, distractor], 'nonexistent-pulsar', { maxNeighbors: 0, rankingProfile: 'bm25' }, undefined, 50, Date.parse(NOW));
    expect(irrelevant.every(hit => hit.components.exactPhrase === 0 && hit.components.tokenOverlap === 0 && hit.components.bm25Lexical === 0)).toBe(true);
  });

  it('preserves canonical keyword aliases for alias-only queries', () => {
    const target = record();
    const result = searchMemories([target], 'penghubung-nebula', { rankingProfile: 'bm25', maxNeighbors: 0 }, undefined, 50, Date.parse(NOW))[0];
    expect(result.components.keywordMatch).toBeGreaterThan(0);
    expect(result.components.bm25Lexical).toBeGreaterThan(0);
  });

  it('normalizes CRLF and outer whitespace on every rendered value while preserving Unicode and canonical order', () => {
    const target = record({ title: '  Jembatan \r\n Nusantara Ω  ', content: '  aturan\r\nberikutnya  ',
      context: '  Integrasi\r\nIndonesia  ', keywords: ['  sambungan Ω  ', '  alias\r\nbaru  ', '  sambungan Ω  '],
      tags: ['  koneksi\r\nstabil  '], category: '  Infrastruktur\r\nlokal  ' });
    expect(buildSemanticDocument(target)).toBe('title: Jembatan \n Nusantara Ω\naturan\nberikutnya\ncontext: Integrasi\nIndonesia\nkeywords: sambungan Ω, alias\nbaru, sambungan Ω\ntags: koneksi\nstabil\ncategory: Infrastruktur\nlokal');
    expect(target.keywords).toEqual(['  sambungan Ω  ', '  alias\r\nbaru  ', '  sambungan Ω  ']);
  });

  it('omits whitespace-only title and normalized default metadata without silently truncating content or long titles', () => {
    const content = `title: embedded label\n${'isi Ω '.repeat(2000)}`.trim();
    expect(buildSemanticDocument(record({ title: ' \r\n ', content, keywords: [], context: ' General ', category: ' Uncategorized ' }))).toBe(content);
    const title = 'Jembatan Ω '.repeat(1000).trim();
    expect(buildSemanticDocument(record({ title, content: 'title: content label', keywords: [] }))).toBe(`title: ${title}\ntitle: content label`);
  });

  it('never adds provenance, snapshots, source refs, identity or experience evidence to provider text', () => {
    const marker = 'PRIVATE_PATH_SENTINEL';
    const target: MemoryRecord = { ...record(), version: 2, experience: { ...legacyExperience(),
      verification: { status: 'unverified', evidence: [], method: marker },
      sourceRefs: [{ kind: 'artifact', id: marker, revision: `sha256:${'a'.repeat(64)}` }] },
      source: { type: marker, ref: `${marker}-credential-like` }, provenance: {
        workspace: marker, repo: marker, files: [marker], gitRef: marker, gitCommit: marker,
        identity: { kind: 'git', repositoryId: marker, worktreeId: marker },
        sourceSnapshot: { version: 1, observedAt: NOW, files: [{ path: marker, status: 'captured', digest: marker, bytes: 1 }] },
      } };
    expect(buildSemanticDocument(target)).not.toContain(marker);
    expect(buildSemanticDocument({ ...target, content: marker })).toContain(marker);
  });

  it('exports the concrete representation version without changing canonical record versions', () => {
    expect((semanticDocument as typeof semanticDocument & { SEMANTIC_DOCUMENT_VERSION?: number }).SEMANTIC_DOCUMENT_VERSION).toBe(2);
    expect(record().version).toBe(1);
  });
});
