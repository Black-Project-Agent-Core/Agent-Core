import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SkillService } from '../src/skills/service.js';
import type { MemoryEmbedder } from '../src/memory/embedder.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(embedder?: MemoryEmbedder) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'skill-discovery-')); roots.push(root);
  const service = await SkillService.initialize(root, async value => value, { embedder });
  const add = async (name: string, body = '', description = 'Review source changes') => {
    const directory = path.join(root, 'runtime/skills/catalog', name);
    await mkdir(directory, { recursive: true });
    const content = `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\nallowed-tools: ["read_file"]\n---\n${body}`;
    await writeFile(path.join(directory, 'SKILL.md'), content);
    return { directory, content };
  };
  return { root, service, add };
}
describe('revision-bound Skill discovery', () => {
  it('discovers positive descriptors locally without treating non-triggers or body as matches', async () => {
    const { service, add } = await fixture();
    expect(service.discover).toBeTypeOf('function');
    await add('review-code', '## Trigger\n- Inspect patches\n## Non-trigger\n- horoscope\n## Workflow\nBODY_ONLY_TOKEN');
    const result = await service.discover({ query: 'patches' });
    expect(result.search.hits[0]).toMatchObject({ name: 'review-code', triggers: ['Inspect patches'], nonTriggers: ['horoscope'], applicability: 'declared', executionAuthority: false });
    expect(result.search.catalog).toEqual({ scanned: 1, valid: 1, invalid: 0, omitted: 0, complete: true });
    expect((await service.discover({ query: 'horoscope' })).search.hits).toEqual([]);
    expect((await service.discover({ query: 'BODY_ONLY_TOKEN' })).search.hits).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('BODY_ONLY_TOKEN');
  });
});

it('reports absent, invalid and partial catalogues instead of silently reporting empty', async () => {
  const { root, service, add } = await fixture();
  expect((await service.discover({ query: 'code' })).search.emptyReason).toBe('empty-catalog');
  const { directory } = await add('wrong-name');
  await writeFile(path.join(directory, 'SKILL.md'), '---\nname: different-name\ndescription: review code\n---\n');
  await writeFile(path.join(root, 'runtime/skills/catalog', 'not-a-directory'), 'invalid');
  expect((await service.discover({ query: 'code' })).search).toMatchObject({
    catalog: { scanned: 2, valid: 0, invalid: 2, omitted: 0, complete: false },
    emptyReason: 'no-valid-descriptors', truncated: true,
  });
});
it('ignores fenced headings, labels missing and duplicate applicability, bounds Unicode declarations', async () => {
  const { service, add } = await fixture();
  await add('legacy', '```md\n## Trigger\nforbiddenheading\n```\n## Workflow\nOther instructions');
  await add('ambiguous', `## Trigger\n${'😀'.repeat(250)}\n## TRIGGERS\n${Array(12).fill('- patches').join('\n')}\n## Non-triggers\n- horoscope`);
  const legacy = (await service.discover({ query: 'legacy' })).search.hits[0]!;
  expect(legacy.applicability).toBe('missing'); expect(legacy.triggers).toEqual([]);
  const ambiguous = (await service.discover({ query: 'ambiguous' })).search.hits[0]!;
  expect(ambiguous).toMatchObject({ applicability: 'ambiguous', descriptorTruncated: true });
  expect(ambiguous.triggers).toHaveLength(8); expect(Array.from(ambiguous.triggers[0]!)).toHaveLength(240);
  expect((await service.discover({ query: 'forbiddenheading' })).search.hits).toEqual([]);
});
it('prioritizes exact names, breaks ties stably and caps both hit count and serialized bytes', async () => {
  const { service, add } = await fixture();
  for (let index = 0; index < 10; index++) await add('review-' + index, '## Trigger\n- patches\n## Non-trigger\n- other', 'review-9 review code');
  const result = (await service.discover({ query: 'review-9', limit: 8 })).search;
  expect(result.hits).toHaveLength(8); expect(result.hits[0]!.name).toBe('review-9'); expect(result.truncated).toBe(true);
  expect(result.hits.slice(1).map(hit => hit.name)).toEqual(['review-0', 'review-1', 'review-2', 'review-3', 'review-4', 'review-5', 'review-6']);
  expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(32_768);
  for (let index = 0; index < 10; index++) await add('review-' + index, `## Trigger\n${Array(8).fill('😀'.repeat(240)).join('\n')}\n## Non-trigger\n${Array(8).fill('😀'.repeat(240)).join('\n')}`, 'review-9');
  const bounded = (await service.discover({ query: 'review-9', limit: 8 })).search;
  expect(bounded.hits.length).toBeLessThan(8); expect(bounded.hits.length).toBeGreaterThan(0);
  expect(bounded.truncated).toBe(true); expect(Buffer.byteLength(JSON.stringify(bounded))).toBeLessThanOrEqual(32_768);
});
it('bounds a catalogue at 500 entries, including invalid entries in the limit', async () => {
  const { root, service } = await fixture();
  await Promise.all(Array.from({ length: 501 }, (_, index) => writeFile(path.join(root, 'runtime/skills/catalog', `invalid-${index}`), 'x')));
  const result = (await service.discover({ query: 'anything' })).search;
  expect(result.catalog).toEqual({ scanned: 500, valid: 0, invalid: 500, omitted: 1, complete: false });
  expect(result.emptyReason).toBe('no-valid-descriptors');
});
it('keeps list, inspect, status, read and default discovery offline despite an injected provider', async () => {
  let calls = 0;
  const { service, add } = await fixture({ identity: { provider: 'test', model: 'test', dimensions: 2 }, embedDocuments: async () => { calls++; throw new Error('must not call'); } });
  await add('review-code');
  const item = await service.inspect('review-code');
  await service.list(); await service.status(); await service.read(item.name, { expectedActiveDigest: item.digest });
  expect((await service.discover({ query: 'code' })).search.semantic.status).toBe('not-requested');
  expect(calls).toBe(0);
});
it('allows semantic-only candidates, excludes body/non-trigger/private data and caches only active revisions', async () => {
  const calls: string[][] = [];
  const embedder: MemoryEmbedder = { identity: { provider: 'test', model: 'one', dimensions: 2 },
    embedDocuments: async texts => { calls.push(texts); return texts.map(() => [1, 0]); } };
  const { service, add } = await fixture(embedder);
  await add('review-code', '## Trigger\n- inspect patches\n## Non-trigger\n- NONTRIGGER_PRIVATE\n## Workflow\nBODY_PRIVATE');
  const first = (await service.discover({ query: 'unrelatedparaphrase', mode: 'hybrid' })).search;
  expect(first).toMatchObject({ effectiveMode: 'hybrid', semantic: { status: 'complete', embeddedDescriptors: 1, sentDescriptors: 1 } });
  expect(first.hits[0]).toMatchObject({ channels: ['semantic'], lexicalScore: 0, semanticScore: 1 });
  expect(calls[0]).toHaveLength(2); expect(JSON.stringify(calls)).not.toMatch(/BODY_PRIVATE|NONTRIGGER_PRIVATE|runtime\/skills|sourceProvenance/);
  await service.discover({ query: 'again', mode: 'hybrid' }); expect(calls[1]).toHaveLength(1);
  await add('review-code', '## Trigger\n- changed\n## Non-trigger\n- other');
  await service.discover({ query: 'again', mode: 'hybrid' }); expect(calls[2]).toHaveLength(2);
  embedder.identity.model = 'two';
  await service.discover({ query: 'again', mode: 'hybrid' }); expect(calls[3]).toHaveLength(2);
});
it('embeds up to 31 new descriptors by name across the full snapshot and reports partial coverage', async () => {
  const calls: string[][] = [];
  const { service, add } = await fixture({ identity: { provider: 'test', model: 'one', dimensions: 2 }, embedDocuments: async texts => { calls.push(texts); return texts.map(() => [1, 0]); } });
  for (let index = 0; index < 34; index++) await add('skill-' + String(index).padStart(2, '0'), '', index === 33 ? 'needle' : 'Different description');
  const first = (await service.discover({ query: 'needle', mode: 'hybrid' })).search;
  expect(calls[0]).toHaveLength(32); expect(calls[0]![1]).toMatch(/^skill-00\n/); expect(calls[0]![31]).toMatch(/^skill-30\n/);
  expect(first.semantic).toMatchObject({ status: 'partial', embeddedDescriptors: 31, validDescriptors: 34, sentDescriptors: 31, reason: 'batch-limit' });
  const second = (await service.discover({ query: 'needle', mode: 'hybrid' })).search;
  expect(calls[1]).toHaveLength(4); expect(second.semantic).toMatchObject({ status: 'complete', embeddedDescriptors: 34, sentDescriptors: 3 });
});
it('bounds embedding strings without splitting surrogate pairs and reports truncation', async () => {
  const calls: string[][] = [];
  const { service, add } = await fixture({ identity: { provider: 'test', model: 'one', dimensions: 2 }, embedDocuments: async texts => { calls.push(texts); return texts.map(() => [1, 0]); } });
  await add('review-code', '## Trigger\n' + Array(8).fill('😀'.repeat(200)).join('\n'));
  // Exercise the embedding boundary with valid bounded lexical tokens.
  const result = (await service.discover({ query: 'word '.repeat(239) + 'word😀more', mode: 'hybrid' })).search;
  expect(result.semantic).toMatchObject({ queryTruncated: true, descriptorTruncated: 1 });
  for (const text of calls[0]!) { expect(text.length).toBeLessThanOrEqual(1200); expect(text.isWellFormed()).toBe(true); }
});
it('blocks credential-like query text and skips unsafe descriptors before transmission', async () => {
  const calls: string[][] = [];
  const { service, add } = await fixture({ identity: { provider: 'test', model: 'one', dimensions: 2 }, embedDocuments: async texts => { calls.push(texts); return texts.map(() => [1, 0]); } });
  await add('safe'); await add('unsafe', '', 'password="SECRET_VALUE"');
  expect((await service.discover({ query: 'Bearer TOPSECRET', mode: 'hybrid' })).search.semantic.reason).toBe('sensitive-input');
  expect(calls).toHaveLength(0);
  const result = (await service.discover({ query: 'code', mode: 'hybrid' })).search;
  expect(result.semantic).toMatchObject({ status: 'partial', embeddedDescriptors: 1, validDescriptors: 2, reason: 'sensitive-input' });
  expect(calls[0]).toHaveLength(2); expect(JSON.stringify(calls)).not.toContain('SECRET_VALUE');
});
it.each([[0, 0], [NaN, 1], [Infinity, 1], [1], [1, 2, 3]].map(vector => ({ vector })))('falls back for invalid vectors $vector', async ({ vector }) => {
  const { service, add } = await fixture({ identity: { provider: 'test', model: 'one', dimensions: 2 }, embedDocuments: async texts => texts.map(() => vector) });
  await add('review-code');
  const result = (await service.discover({ query: 'review-code', mode: 'hybrid' })).search;
  expect(result).toMatchObject({ effectiveMode: 'lexical', semantic: { status: 'fallback', reason: 'invalid-vector' } });
  expect(result.hits[0]!.channels).toEqual(['lexical']);
});
it('falls back with bounded errors for absent and failing providers', async () => {
  const local = await fixture(); await local.add('review-code');
  expect((await local.service.discover({ query: 'code', mode: 'hybrid' })).search.semantic.reason).toBe('no-provider');
  const failing = await fixture({ identity: { provider: 'test', model: 'one', dimensions: 2 }, embedDocuments: async () => { throw new Error('SECRET_PROVIDER_RESPONSE'); } });
  await failing.add('review-code');
  const result = (await failing.service.discover({ query: 'code', mode: 'hybrid' })).search;
  expect(result.semantic.reason).toBe('provider-failure'); expect(JSON.stringify(result)).not.toContain('SECRET_PROVIDER_RESPONSE');
});
it('keeps concurrent hybrid work single-flight and propagates cancellation without hidden queues', async () => {
  let start!: () => void; const started = new Promise<void>(resolve => { start = resolve; });
  let calls = 0, wasAborted = false;
  const { service, add } = await fixture({ identity: { provider: 'test', model: 'one', dimensions: 2 },
    embedDocuments: async (_texts, options) => { calls++; start(); return new Promise((_resolve, reject) => options!.signal!.addEventListener('abort', () => { wasAborted = true; reject(new Error('aborted')); }, { once: true })); } });
  await add('review-code'); const controller = new AbortController();
  const pending = service.discover({ query: 'code', mode: 'hybrid', signal: controller.signal }); await started;
  expect((await service.discover({ query: 'code', mode: 'hybrid' })).search.semantic.reason).toBe('busy');
  controller.abort(); expect((await pending).search.semantic.reason).toBe('cancelled'); expect(wasAborted).toBe(true); expect(calls).toBe(1);
});
it('reads exact digest-bound UTF8 fragments with bounded full envelopes and rejects drift', async () => {
  const { service, add } = await fixture();
  const { directory, content } = await add('review-code', '## Instructions\n' + '😀"\\\n'.repeat(900));
  const { digest } = await service.inspect('review-code');
  let offset = 0, assembled = '';
  for (;;) {
    const result = await service.read('review-code', { expectedActiveDigest: digest, offset, maxBytes: 512 });
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(512);
    expect(result.content.isWellFormed()).toBe(true); assembled += result.content;
    expect(result).toMatchObject({ digest, source: 'SKILL.md', delivery: 'instruction-fragment', executionAuthority: false });
    if (result.nextOffset === null) break;
    expect(result.nextOffset).toBeGreaterThan(offset); offset = result.nextOffset;
  }
  expect(assembled).toBe(content);
  const emojiOffset = Buffer.byteLength(content.slice(0, content.indexOf('😀')));
  await expect(service.read('review-code', { expectedActiveDigest: digest, offset: emojiOffset + 1 })).rejects.toThrow('SKILL_READ_OFFSET_INVALID');
  await expect(service.read('review-code', { expectedActiveDigest: digest, offset: Buffer.byteLength(content) + 1 })).rejects.toThrow('SKILL_READ_OFFSET_INVALID');
  await writeFile(path.join(directory, 'SKILL.md'), content + 'changed');
  await expect(service.read('review-code', { expectedActiveDigest: digest })).rejects.toThrow('SKILL_ACTIVE_REVISION_CHANGED');
});
it('rejects invalid UTF8 reads', async () => {
  const { root, service, add } = await fixture();
  const { directory, content } = await add('review-code');
  await writeFile(path.join(directory, 'SKILL.md'), Buffer.concat([Buffer.from(content), Buffer.from([0xc0, 0xaf])]));
  const { digest } = await service.inspect('review-code');
  await expect(service.read('review-code', { expectedActiveDigest: digest })).rejects.toThrow('SKILL_READ_UTF8_INVALID');
});
it('rejects symlinked active directories', async context => {
  const { symlinkOrSkip } = await import('./helpers/optional-symlink.js');
  const { root, service, add } = await fixture();
  const { directory } = await add('review-code');
  const { digest } = await service.inspect('review-code');
  await symlinkOrSkip(context, directory, path.join(root, 'runtime/skills/catalog', 'linked-skill'), 'dir');
  const discovery = await service.discover({ query: 'review-code' }); expect(discovery.search.catalog.invalid).toBe(1);
  await expect(service.read('linked-skill', { expectedActiveDigest: digest })).rejects.toThrow('SKILL_SYMLINK_REFUSED');
});
it('validates query, limit and read budget at the owner boundary', async () => {
  const { service } = await fixture();
  await expect(service.discover({ query: ' ' })).rejects.toThrow('SKILL_SEARCH_QUERY_INVALID');
  await expect(service.discover({ query: 'x'.repeat(4001) })).rejects.toThrow('SKILL_SEARCH_QUERY_INVALID');
  await expect(service.discover({ query: 'x', limit: 9 })).rejects.toThrow('SKILL_SEARCH_LIMIT_INVALID');
  await expect(service.read('review-code', { expectedActiveDigest: 'sha256:' + 'a'.repeat(64), maxBytes: 511 })).rejects.toThrow('SKILL_READ_BUDGET_INVALID');
});
it('aborts the provider at the five-second deadline and reports lexical fallback', async () => {
  let start!: () => void; const started = new Promise<void>(resolve => { start = resolve; });
  let wasAborted = false;
  const { service, add } = await fixture({ identity: { provider: 'test', model: 'one', dimensions: 2 },
    embedDocuments: async (_texts, options) => { start(); return new Promise((_resolve, reject) => options!.signal!.addEventListener('abort', () => { wasAborted = true; reject(new Error('aborted')); }, { once: true })); } });
  await add('review-code');
  vi.useFakeTimers();
  try {
    const pending = service.discover({ query: 'review-code', mode: 'hybrid' }); await started;
    await vi.advanceTimersByTimeAsync(5001);
    const result = (await pending).search;
    expect(wasAborted).toBe(true); expect(result).toMatchObject({ effectiveMode: 'lexical', semantic: { reason: 'timeout' } });
    expect(result.hits[0]!.channels).toEqual(['lexical']);
  } finally { vi.useRealTimers(); }
});
it('keeps the provider slot occupied after timeout until even an uncooperative provider settles', async () => {
  let start!: () => void; const started = new Promise<void>(resolve => { start = resolve; });
  let release!: (value: number[][]) => void;
  const { service, add } = await fixture({ identity: { provider: 'test', model: 'one', dimensions: 2 },
    embedDocuments: async () => { start(); return new Promise(resolve => { release = resolve; }); } });
  await add('review-code'); vi.useFakeTimers();
  try {
    const pending = service.discover({ query: 'code', mode: 'hybrid' }); await started;
    await vi.advanceTimersByTimeAsync(5001); expect((await pending).search.semantic.reason).toBe('timeout');
    expect((await service.discover({ query: 'code', mode: 'hybrid' })).search.semantic.reason).toBe('busy');
    release([[1, 0], [1, 0]]); await Promise.resolve();
    expect((await service.discover({ query: 'code' })).search.semantic.embeddedDescriptors).toBe(0);
  } finally { vi.useRealTimers(); }
});
it('never revives a superseded descriptor from an in-flight provider result', async () => {
  let start!: () => void; const started = new Promise<void>(resolve => { start = resolve; });
  let release!: (value: number[][]) => void;
  const { service, add } = await fixture({ identity: { provider: 'test', model: 'one', dimensions: 2 },
    embedDocuments: async () => { start(); return new Promise(resolve => { release = resolve; }); } });
  await add('review-code', 'first revision');
  const pending = service.discover({ query: 'code', mode: 'hybrid' }); await started;
  await add('review-code', 'second revision'); await service.discover({ query: 'code' });
  release([[1, 0], [1, 0]]); await pending;
  expect((await service.discover({ query: 'code' })).search.semantic.embeddedDescriptors).toBe(0);
});
