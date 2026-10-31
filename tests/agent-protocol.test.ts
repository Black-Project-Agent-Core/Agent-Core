import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAgentProtocol } from '../src/mcp/agent-protocol.js';
import { ControllerContractGate } from '../src/mcp/controller-contract.js';

const inspection = vi.hoisted(() => ({ linkedPath: undefined as string | undefined }));
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, lstatSync: ((...args: Parameters<typeof actual.lstatSync>) => {
    const info = actual.lstatSync(...args);
    return String(args[0]) === inspection.linkedPath ? { ...info, isSymbolicLink: () => true } : info;
  }) };
});

const temporaryRoot = fileURLToPath(new URL('../runtime/tmp/', import.meta.url));
const roots: string[] = [];
afterEach(async () => {
  inspection.linkedPath = undefined;
  for (const root of roots.splice(0)) {
    const relative = path.relative(temporaryRoot, root);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unsafe fixture cleanup');
    await rm(root, { recursive: true, force: true });
  }
});
async function fixture(reference = 'docs/instructions/topic.md') {
  const root = await mkdtemp(path.join(temporaryRoot, 'agent-protocol-'));
  roots.push(root);
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await mkdir(path.join(root, 'docs/instructions'));
  const entry = path.join(root, 'AGENTS.md');
  await writeFile(entry, '# Fixture core\n\n[Selected topic](' + reference + ')\n');
  return { root, entry, topic: path.join(root, 'docs/instructions/topic.md') };
}

describe('bounded linked operating contract', () => {
  it('hashes linked bytes without preloading bodies and invalidates receipts after a same-size/mtime edit', async () => {
    const f = await fixture();
    await writeFile(f.topic, 'PRIVATE-TO-TOPIC rule one');
    const first = loadAgentProtocol(f.entry);
    expect(first).toContain('# Fixture core');
    expect(first).toMatch(/INSTRUCTION BUNDLE REVISION: sha256:[a-f0-9]{64}$/);
    expect(first).not.toContain('PRIVATE-TO-TOPIC');
    const gate = new ControllerContractGate(() => loadAgentProtocol(f.entry));
    const receipt = gate.read('fixture');
    gate.acknowledge('fixture', receipt.contractSession, receipt.digest);
    const previous = await stat(f.topic);
    await writeFile(f.topic, 'PRIVATE-TO-TOPIC rule two');
    await utimes(f.topic, previous.atime, previous.mtime);
    expect(loadAgentProtocol(f.entry)).not.toBe(first);
    expect(() => gate.assertReady('fixture', receipt.contractSession)).toThrow('CONTRACT_REVISION_CHANGED');
  });

  it('includes reference names in the bundle revision and ignores unrelated links', async () => {
    const f = await fixture();
    await writeFile(f.topic, 'identical body');
    const first = loadAgentProtocol(f.entry).split('INSTRUCTION BUNDLE REVISION: ')[1];
    await writeFile(path.join(f.root, 'docs/instructions/other.md'), 'identical body');
    await writeFile(f.entry, '# Fixture core\n[Other](docs/instructions/other.md)\n[Outside](docs/not-loaded.md)\n');
    const second = loadAgentProtocol(f.entry);
    expect(second.split('INSTRUCTION BUNDLE REVISION: ')[1]).not.toBe(first);
    expect(second).not.toContain('identical body');
  });

  it('rejects too many references, oversized bodies, missing bodies and non-regular files', async () => {
    const f = await fixture();
    await writeFile(f.topic, 'x'.repeat(8_193));
    expect(() => loadAgentProtocol(f.entry)).toThrow(/limit|large|8192/i);
    await rm(f.topic);
    expect(() => loadAgentProtocol(f.entry)).toThrow();
    await mkdir(f.topic);
    expect(() => loadAgentProtocol(f.entry)).toThrow(/regular|file/i);
    await writeFile(f.entry, '# Fixture\n' + Array.from({ length: 33 }, (_, i) => `[Topic](docs/instructions/topic-${i}.md)`).join('\n'));
    expect(() => loadAgentProtocol(f.entry)).toThrow(/32|references/i);
  });

  it('bounds the root read and reserves room for its bundle marker', async () => {
    const f = await fixture();
    await writeFile(f.entry, 'x'.repeat(8_192));
    expect(() => loadAgentProtocol(f.entry)).toThrow(/limit|large/i);
    await writeFile(f.entry, 'x'.repeat(8_000));
    expect(Buffer.byteLength(loadAgentProtocol(f.entry))).toBeLessThanOrEqual(8_192);
    await writeFile(f.entry, Buffer.from([0xff]));
    expect(() => loadAgentProtocol(f.entry)).toThrow();
  });

  it.each(['docs/instructions/../private.md', 'docs/instructions/%2e%2e/private.md',
    'docs/instructions/nested/topic.md', './docs/instructions/topic.md', 'docs\\instructions\\topic.md'])
  ('rejects noncanonical/escaping instruction links: %s', async reference => {
    const f = await fixture(reference);
    expect(() => loadAgentProtocol(f.entry)).toThrow(/reference|path/i);
  });

  it.each(['directory', 'file'])('rejects a junction/symlink at the reference %s boundary', async boundary => {
    const f = await fixture();
    await writeFile(f.topic, 'fixture');
    // The E: test host cannot create reparse points; exercise the same lstat boundary deterministically.
    inspection.linkedPath = boundary === 'directory' ? path.join(f.root, 'docs/instructions') : f.topic;
    expect(() => loadAgentProtocol(f.entry)).toThrow(/link|path/i);
  });

  it('keeps the real entry and topic files bounded', async () => {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const entry = await readFile(path.join(root, 'AGENTS.md'), 'utf8');
    expect(Buffer.byteLength(entry)).toBeLessThanOrEqual(8_192);
    const targets = [...entry.matchAll(/\]\((docs\/instructions\/[a-z0-9-]+\.md)\)/g)].map(match => match[1]!);
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.length).toBeLessThanOrEqual(32);
    for (const target of targets) expect((await readFile(path.join(root, target))).length).toBeLessThanOrEqual(8_192);
  });
});
