import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../../src/config.js';
import { createMemoryObservatoryHttpHandler } from '../../../src/http/memory-observatory.js';
import { FileAuditLogger } from '../../../src/logging/audit-log.js';
import type { MemoryActivitySink } from '../../../src/memory/activity.js';
import { MemoryService } from '../../../src/memory/service.js';
import { WorkspacePolicy } from '../../../src/runtime/workspace.js';
import { createObservatorySidecarServer } from '../server/server.js';

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  return (server.address() as AddressInfo).port;
}

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections?.();
  if (!server.listening) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

function percentile95(values: number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)] ?? Number.POSITIVE_INFINITY;
}

const staticRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

test('real DMF postflight/revision/edge activity converges in browser and remains under 500 ms p95', async ({ page }) => {
  test.setTimeout(90_000);
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-observatory-browser-'));
  const config = loadConfig({
    AGENT_CORE_MEMORY_DB_PATH: path.join(root, 'memory.sqlite'),
    AGENT_CORE_MEMORY_PRINCIPAL_ID: 'observatory-browser-principal',
    AGENT_CORE_MEMORY_OBSERVATORY_ENABLED: 'true',
    AGENT_CORE_MEMORY_OBSERVATORY_MODE: 'shadow',
    AGENT_CORE_GITHUB_ENABLED: 'false',
    AGENT_CORE_EXECUTION_ENABLED: 'false',
    AGENT_CORE_MAINTENANCE_ENABLED: 'false',
  }, root);
  const audit = new FileAuditLogger(path.join(root, 'logs'), config.observability.audit);
  const activitySink: MemoryActivitySink = {
    emit(event) {
      const { type, timestamp: _timestamp, ...data } = event;
      audit.logRuntime('memory', type, data);
    },
  };
  const memory = new MemoryService(config.memory, undefined, { activitySink });
  const workspace = new WorkspacePolicy([root]);
  const scope = { principalId: config.memory.principalId!, projectId: root };
  const observatoryHandler = createMemoryObservatoryHttpHandler({
    memory,
    workspace,
    auditJournal: audit.journal,
    config: config.memoryObservatory,
  });
  const upstream = createServer((request, response) => {
    void observatoryHandler(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(500, { 'content-type': 'application/json' });
      if (!response.writableEnded) response.end('{"error":"test_upstream_failure"}');
    });
  });
  let sidecar: Server | undefined;

  try {
    await memory.status(scope);
    const a1Value = 'Initial durable decision A1.';
    const a2Value = 'Continuation decision A2.';
    const a1 = await memory.commit({ scope, canonicalKey: 'e2e.a1', kind: 'decision', value: a1Value, sourceType: 'e2e' });
    const a2 = await memory.commit({ scope, canonicalKey: 'e2e.a2', kind: 'decision', value: a2Value, sourceType: 'e2e' });
    await memory.applyPostflight({
      scope,
      routeContextId: 'e2e-link-a1-a2',
      candidate: { canonicalKey: 'e2e.a1', kind: 'decision', value: a1Value },
      targetMemoryId: a1.memoryId,
      reasonCodes: ['SAME_BELIEF_NEW_EVIDENCE'],
      evidenceRefs: ['e2e:continues'],
      proposedRelations: [{ targetMemoryId: a2.memoryId, relation: 'continues', evidenceRefs: ['e2e:continues'] }],
    });
    await audit.drain();

    const upstreamPort = await listen(upstream);
    sidecar = createObservatorySidecarServer({
      host: '127.0.0.1',
      port: 0,
      agentCoreUrl: `http://127.0.0.1:${upstreamPort}`,
      workspaceRoot: root,
      staticRoot,
    });
    const sidecarPort = await listen(sidecar);
    await page.goto(`http://127.0.0.1:${sidecarPort}/`);
    await expect(page.getByText('Initial durable decision A1.')).toBeVisible();
    await expect(page.getByText('Continuation decision A2.')).toBeVisible();

    const a3Initial = 'A3 branch created through real postflight.';
    const a3 = await memory.applyPostflight({
      scope,
      routeContextId: 'e2e-create-a3',
      candidate: { canonicalKey: 'e2e.a3', kind: 'decision', value: a3Initial, title: 'A3 Branch' },
      branchParentMemoryId: a2.memoryId,
      reasonCodes: ['DISTINCT_BRANCH'],
      evidenceRefs: ['e2e:a3'],
      proposedRelations: [{ targetMemoryId: a2.memoryId, relation: 'branch_of', evidenceRefs: ['e2e:a3'] }],
    });
    expect(a3.decision).toBe('WRITE_BRANCH');
    await audit.drain();
    await expect(page.getByText('A3 Branch', { exact: true })).toBeVisible();

    let expectedRevision = 2;
    await memory.revise({ scope, memoryId: a3.memoryId!, value: 'A3 revised through authoritative DMF.', sourceType: 'e2e' });
    await audit.drain();
    let a3Card = page.getByText('A3 Branch', { exact: true }).locator('..');
    await expect(a3Card.getByText(`r${expectedRevision}`, { exact: true })).toBeVisible();

    const evidence = await memory.commit({
      scope,
      canonicalKey: 'e2e.validation',
      kind: 'artifact',
      value: 'Browser convergence validation evidence.',
      sourceType: 'e2e',
    });
    await audit.drain();
    await expect(page.getByText('e2e.validation', { exact: true }).first()).toBeVisible();

    await memory.applyPostflight({
      scope,
      routeContextId: 'e2e-validate-a3',
      candidate: { canonicalKey: 'e2e.a3', kind: 'decision', value: 'A3 revised through authoritative DMF.' },
      targetMemoryId: a3.memoryId,
      reasonCodes: ['SAME_BELIEF_NEW_EVIDENCE'],
      evidenceRefs: ['e2e:validated-by'],
      proposedRelations: [{ targetMemoryId: evidence.memoryId, relation: 'validated_by', evidenceRefs: ['e2e:validated-by'] }],
    });
    await audit.drain();
    await expect(page.getByText('validated_by', { exact: true }).first()).toBeVisible();

    const latencies: number[] = [];
    for (let sample = 0; sample < 50; sample += 1) {
      const browserStart = await page.evaluate(() => performance.now());
      expectedRevision += 1;
      await memory.revise({
        scope,
        memoryId: a3.memoryId!,
        value: `A3 convergence sample ${sample + 1}.`,
        sourceType: 'e2e',
      });
      await audit.drain();
      a3Card = page.getByText('A3 Branch', { exact: true }).locator('..');
      await expect(a3Card.getByText(`r${expectedRevision}`, { exact: true })).toBeVisible({ timeout: 2_000 });
      const browserEnd = await page.evaluate(() => performance.now());
      latencies.push(browserEnd - browserStart);
    }
    const p95 = percentile95(latencies);
    console.log(`TASK10_BROWSER_CONVERGENCE_P95_MS=${p95.toFixed(3)}`);
    expect(latencies).toHaveLength(50);
    expect(p95).toBeLessThan(500);
    const convergence = page.getByTestId('graph-convergence-latency');
    await expect(convergence).toBeVisible();
    const samples = Number(await convergence.getAttribute('data-samples'));
    expect(samples).toBeGreaterThanOrEqual(50);
  } finally {
    await page.goto('about:blank').catch(() => undefined);
    if (sidecar) await closeServer(sidecar).catch(() => undefined);
    await closeServer(upstream).catch(() => undefined);
    await memory.close().catch(() => undefined);
    await audit.close().catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
});
