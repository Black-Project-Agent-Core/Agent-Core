import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CapabilityRegistry } from '../src/capabilities/registry-service.js';
import { writeRegistryGeneration } from '../src/capabilities/registry-writer.js';
import { CapabilityRouter } from '../src/capabilities/router.js';
import type { CapabilityRecord } from '../src/capabilities/types.js';

const roots: string[] = [];
const MUTATION_TOOLS = [
  'write_file', 'edit_file', 'create_directory', 'move_file', 'execute_command', 'start_process',
  'execution_create', 'execution_start', 'execution_add_nodes', 'execution_retry', 'execution_cancel',
];

async function routerFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-router-intent-quality-'));
  roots.push(root);
  const records = JSON.parse(await readFile(new URL('./fixtures/quality/routing-capabilities.json', import.meta.url), 'utf8')) as CapabilityRecord[];
  await writeRegistryGeneration(root, records, { catalogSha: records[0]!.catalogSha, generatedAt: '2026-08-31T00:00:00.000Z' });
  return new CapabilityRouter(CapabilityRegistry.open(root));
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('router intent quality', () => {
  it('does not classify local remove wording as high impact', async () => {
    const router = await routerFixture();
    expect(router.route('Remove trailing whitespace from README.md')).toMatchObject({ tier: 'atomic', risk: 'low' });
    expect(router.route('Remove obsolete wording from API documentation')).toMatchObject({ tier: 'atomic', domain: 'documentation', risk: 'low' });
  });

  it('keeps non-atomic read-only investigation free of mutation permissions', async () => {
    const router = await routerFixture();
    const route = router.route('Review frontend dashboard visual hierarchy spacing');
    expect(route.tier).toBe('domain_complex');
    expect(route.requiredSkillLoads).toEqual([{ id: 'frontend-quality', name: 'frontend-quality' }]);
    for (const tool of MUTATION_TOOLS) expect(route.allowedTools).not.toContain(tool);
    expect(route.allowedTools).toEqual(expect.arrayContaining(['read_file', 'search_files']));
  });

  it('keeps generic project review structured without manufacturing a domain skill', async () => {
    const router = await routerFixture();
    const route = router.route('Review project status and summarize findings');
    expect(route).toMatchObject({ tier: 'structured', domain: 'general', requiredSkillLoads: [] });
    for (const tool of MUTATION_TOOLS) expect(route.allowedTools).not.toContain(tool);
  });

  it('keeps high-impact admin intent high impact without loading an unrelated skill', async () => {
    const router = await routerFixture();
    const route = router.route('Change admin registry setting');
    expect(route).toMatchObject({ tier: 'high_impact', risk: 'high', requiredSkillLoads: [] });
  });

  it('keeps only strong route recommendations instead of weak lexical secondary guidance', async () => {
    const router = await routerFixture();
    const docs = router.route('Review API documentation README wording for clarity');
    expect(docs.recommendedCapabilities.map((item) => item.id)).toEqual(['docs-helper']);

    const debug = router.route('Debug backend crash by inspecting runtime failure logs without changing files');
    expect(debug.recommendedCapabilities.map((item) => item.id)).toEqual(['backend-debug-reference']);
  });
});
