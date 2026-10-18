import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadAgentProtocol } from '../src/mcp/agent-protocol.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function assertReflexionContract(contract: string): void {
  const checks: Array<[string, RegExp]> = [
    ['Reflexion section', /## Failure-learning \/ Reflexion protocol/i],
    ['failure-triggered behavior', /real failure evidence|MCP .*isError|thrown exception|failed authorized verification|explicit user correction/i],
    ['direct evidence first', /Start from the direct failing result/i],
    ['blind retry prohibition', /Never repeat an equivalent failed tool\/action with equivalent arguments blindly/i],
    ['bounded durable recall', /at most \*\*1[–-]3\*\* relevant durable lessons/i],
    ['task-local reflection is not durable truth', /task-local reflection is not durable truth/i],
    ['verified promotion requirement', /After a correction materially succeeds.*mandatory Learning finalization lifecycle.*checkpoint with reason `verified-recovery`/i],
    ['private reasoning persistence prohibition', /Do not persist hidden\/private reasoning, raw scratchpads, full chain-of-thought/i],
    ['controller-side architecture', /Reflexion must remain controller behavior over existing evidence and MemoryService/i],
    ['no autonomous retry runtime', /Do not introduce autonomous retry loops, a second agent\/runtime, a reflection database, or a machine-control gate/i],
  ];

  for (const [label, pattern] of checks) {
    if (!pattern.test(contract)) throw new Error(`Reflexion contract invariant missing: ${label}`);
  }
}

describe('Reflexion controller contract regression', () => {
  it('loads the mandatory root AGENTS.md contract and protects semantic invariants', async () => {
    const loaded = loadAgentProtocol();
    const onDisk = (await readFile(path.join(repoRoot, 'AGENTS.md'), 'utf8')).trim();

    expect(loaded).toBe(onDisk);
    expect(() => assertReflexionContract(loaded)).not.toThrow();
  });

  it('negative-controls the regression: removing a protected invariant is detected', () => {
    const contract = loadAgentProtocol();
    const weakened = contract.replace(
      /Never repeat an equivalent failed tool\/action with equivalent arguments blindly\.[^\n]*/i,
      'Retries are allowed.',
    );

    expect(() => assertReflexionContract(weakened)).toThrow(/blind retry prohibition/i);
    expect(() => assertReflexionContract(contract)).not.toThrow();
  });

  it('keeps Reflexion as controller behavior over direct sibling tool systems', async () => {
    const serverSource = await readFile(path.join(repoRoot, 'src', 'mcp', 'server.ts'), 'utf8');
    const handlerSource = await readFile(path.join(repoRoot, 'src', 'mcp', 'handler.ts'), 'utf8');
    const packageJson = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(serverSource).toContain("tool(server, 'read_file'");
    expect(serverSource).toMatch(/registerMemoryTools\(\s*server/);
    expect(serverSource).not.toContain('capability_route');
    expect(handlerSource).not.toContain('ReflexionService');

    const dependencyNames = [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
    ].map((name) => name.toLowerCase());

    for (const forbidden of ['langchain', 'chromadb', 'reflexion']) {
      expect(dependencyNames.some((name) => name.includes(forbidden))).toBe(false);
    }

    await expect(access(path.join(repoRoot, 'src', 'reflexion'))).rejects.toThrow();
  });
});
