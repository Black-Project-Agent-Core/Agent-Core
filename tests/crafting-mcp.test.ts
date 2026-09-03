import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import { loadConfig } from '../src/config.js';
import { createHttpHandler } from '../src/http/app.js';
import { parseCraftingContinuityCheckpoint } from '../src/crafting/continuity.js';
import { createMcpHttpHandler } from '../src/mcp/handler.js';
import { createRuntimeServices, type RuntimeServices } from '../src/runtime/services.js';

const roots: string[] = [];
const servers: Server[] = [];
const runtimes: RuntimeServices[] = [];

async function setup(options: { memoryEnabled?: boolean } = {}) {
  const root = await mkdtemp(path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'agent-core-crafting-mcp-'));
  roots.push(root);
  const donor = path.join(root, 'reference');
  const host = path.join(root, 'host');
  await mkdir(path.join(donor, 'src'), { recursive: true });
  await mkdir(path.join(donor, 'test'), { recursive: true });
  await mkdir(path.join(host, 'src'), { recursive: true });
  await writeFile(path.join(donor, 'src', 'registry.mjs'), "export const dispatch = (v) => `donor:${v}`;\n", 'utf8');
  await writeFile(path.join(donor, 'src', 'core.mjs'), "import { dispatch } from './registry.mjs';\nexport const processValue = (v) => dispatch(v.trim().toLowerCase());\n", 'utf8');
  await writeFile(path.join(donor, 'test', 'core.test.mjs'), "// donor behavior test\n", 'utf8');

  const defaults = loadConfig({}, root);
  const runtime = createRuntimeServices(
    [root], path.join(root, 'capabilities'), undefined,
    { ...defaults.memory, enabled: options.memoryEnabled ?? false, dbPath: path.join(root, 'memory.sqlite') },
    { ...defaults.execution, enabled: false }, defaults.github, undefined,
    defaults.observability, 'crafting-mcp', defaults.maintenance,
    { enforcement: 'enforce', leaseTtlMs: 60_000 },
  );
  runtimes.push(runtime);
  const keyStore = new FileKeyStore(path.join(root, 'data'));
  const created = await keyStore.create('crafting-client');
  const server = createServer(createHttpHandler({ keyStore, mcpHandler: createMcpHttpHandler(runtime) }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return { root, donor, host, runtime, created, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}
async function request(baseUrl: string, key: string, body: unknown) {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify(body),
  });
  return await response.json() as Record<string, any>;
}

async function call(baseUrl: string, key: string, name: string, args: Record<string, unknown> = {}) {
  return request(baseUrl, key, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
}

function body(result: Record<string, any>) {
  return JSON.parse(result.result.content[0].text) as Record<string, any>;
}

async function listTools(baseUrl: string, key: string) {
  const result = await request(baseUrl, key, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  return result.result.tools as Array<Record<string, any>>;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(runtimes.splice(0).map(async (runtime) => {
    await runtime.execution.close().catch(() => undefined);
    await runtime.memory.close().catch(() => undefined);
  }));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })));
});

const featureInput = {
  featureId: 'processor',
  title: 'Processor',
  requiredBehaviors: ['normalize-before-dispatch'],
  requiredInvariants: ['host execution ownership'],
  explicitNonGoals: ['donor telemetry'],
  targetAuthorities: ['operational_execution'],
  verificationRequirements: ['host-integration'],
};
describe('Real Steel MCP workflow', () => {
  it('exposes crafting workflow tools beside capability routing', async () => {
    const f = await setup();
    const tools = await listTools(f.baseUrl, f.created.key);
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(['capability_route', 'crafting_prepare', 'crafting_status']));
  });

  it('creates a ready BUILD_FROM_ZERO route and lease directly from the coding plan contract', async () => {
    const f = await setup();
    const routed = body(await call(f.baseUrl, f.created.key, 'capability_route', {
      task: 'Implement a host-native processor without an implementation reference.',
      projectRoot: f.host,
      crafting: { ...featureInput, references: [] },
    }));
    expect(routed.crafting).toMatchObject({ mode: 'BUILD_FROM_ZERO', state: 'ready' });
    expect(routed.crafting.leaseId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(routed.crafting.craftPlanId).toMatch(/^craft-plan:/);

    const written = await call(f.baseUrl, f.created.key, 'write_file', {
      path: path.join(f.host, 'src', 'processor.mjs'), content: 'export const processor = true;\n',
      routeContextId: routed.routeContextId,
      craftingIntent: { origin: 'host_original' },
    });
    expect(written.result.isError).not.toBe(true);
  });

  it('locks reference-driven coding in analysis until actual source-grounded craft preparation succeeds', async () => {
    const f = await setup();
    const reference = {
      referenceId: 'processor-reference', kind: 'local_repo', localPath: f.donor,
      commit: '1'.repeat(40), tree: '2'.repeat(40), featureScope: 'processor', approvalSource: 'user',
    };
    const routed = body(await call(f.baseUrl, f.created.key, 'capability_route', {
      task: 'Transplant processor behavior from the approved local implementation reference.',
      projectRoot: f.host,
      crafting: { ...featureInput, references: [reference] },
    }));
    expect(routed.crafting).toMatchObject({ mode: 'FEATURE_TRANSPLANTATION', state: 'analysis' });
    expect(routed.crafting.leaseId).toBeUndefined();

    const readable = await call(f.baseUrl, f.created.key, 'read_file', {
      path: path.join(f.donor, 'src', 'core.mjs'), routeContextId: routed.routeContextId,
    });
    expect(readable.result.isError).not.toBe(true);

    const premature = body(await call(f.baseUrl, f.created.key, 'write_file', {
      path: path.join(f.host, 'src', 'core.mjs'), content: '// too early\n', routeContextId: routed.routeContextId,
      craftingIntent: { origin: 'donor_derived', sparepartId: 'core' },
    }));
    expect(premature.error.code).toMatch(/CRAFTING|CRAFT_PLAN/);

    const prepared = body(await call(f.baseUrl, f.created.key, 'crafting_prepare', {
      routeContextId: routed.routeContextId,
      referenceRoots: [{ referenceId: 'processor-reference', root: f.donor }],
      evidence: [
        { referenceId: 'processor-reference', sourcePath: 'src/core.mjs', role: 'entry_point', observation: 'processValue normalizes input before dispatch.' },
        { referenceId: 'processor-reference', sourcePath: 'src/registry.mjs', role: 'dependency', observation: 'registry owns donor dispatch.' },
        { referenceId: 'processor-reference', sourcePath: 'test/core.test.mjs', role: 'test', observation: 'donor behavior test.' },
      ],
      requirements: { tests: true, lifecycle: false, stateOrConfig: false },
      spareparts: [
        { sparepartId: 'core', referenceId: 'processor-reference', sourcePath: 'src/core.mjs', role: 'core algorithm', evidenceRefs: ['AUTO:src/core.mjs'] },
        { sparepartId: 'registry', referenceId: 'processor-reference', sourcePath: 'src/registry.mjs', role: 'execution owner', evidenceRefs: ['AUTO:src/registry.mjs'] },
        { sparepartId: 'donor-test', referenceId: 'processor-reference', sourcePath: 'test/core.test.mjs', role: 'verification', evidenceRefs: ['AUTO:test/core.test.mjs'] },
      ],
      connections: [
        { from: 'core', to: 'registry', relation: 'CALLS', evidenceRefs: ['AUTO:src/core.mjs', 'AUTO:src/registry.mjs'] },
        { from: 'donor-test', to: 'core', relation: 'TESTS', evidenceRefs: ['AUTO:test/core.test.mjs', 'AUTO:src/core.mjs'] },
      ],
      coverage: [],
      decisions: [
        { sparepartId: 'core', action: 'ADAPT', rationaleCode: 'HOST_BOUNDARY', targetPath: 'src/core.mjs', preservedBehaviors: ['normalize-before-dispatch'], intentionallyChangedBehaviors: [], evidenceRefs: ['AUTO:src/core.mjs'] },
        { sparepartId: 'registry', action: 'REPLACE', rationaleCode: 'HOST_EXECUTION_AUTHORITY', targetPath: 'src/registry-adapter.mjs', targetBinding: 'ExecutionService/ProcessManager', preservedBehaviors: ['dispatch boundary'], intentionallyChangedBehaviors: ['host owns dispatch'], evidenceRefs: ['AUTO:src/registry.mjs'] },
        { sparepartId: 'donor-test', action: 'DROP', rationaleCode: 'VERIFICATION_ONLY', preservedBehaviors: [], intentionallyChangedBehaviors: ['mapped to host verification'], evidenceRefs: ['AUTO:test/core.test.mjs'] },
      ],
      bindings: [{ sparepartId: 'registry', boundary: 'operational_execution', donorContract: 'DonorRegistry', hostContract: 'ExecutionService/ProcessManager', surgery: 'AUTHORITY_REPLACEMENT', verificationRequirement: 'host-integration', preservesHostAuthority: true }],
      authorityClaims: [{ sparepartId: 'registry', authorityId: 'operational_execution', role: 'owner' }],
      hostVerification: ['host-integration'],
      donorVerification: ['normalize-before-dispatch'],
    }));
    expect(prepared.crafting).toMatchObject({ mode: 'FEATURE_TRANSPLANTATION', state: 'ready' });
    expect(prepared.crafting.leaseId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(prepared.crafting.craftPlanId).toMatch(/^craft-plan:/);

    const allowed = await call(f.baseUrl, f.created.key, 'write_file', {
      path: path.join(f.host, 'src', 'core.mjs'), content: '// adapted donor core\n',
      routeContextId: routed.routeContextId,
      craftingIntent: { origin: 'donor_derived', sparepartId: 'core' },
    });
    expect(allowed.result.isError).not.toBe(true);

    const cleanRoom = body(await call(f.baseUrl, f.created.key, 'write_file', {
      path: path.join(f.host, 'src', 'parallel.mjs'), content: '// parallel rewrite\n',
      routeContextId: routed.routeContextId,
      craftingIntent: { origin: 'host_original', sparepartId: 'core' },
    }));
    expect(cleanRoom.error.code).toBe('CLEAN_ROOM_PARALLEL_IMPLEMENTATION');

    const status = body(await call(f.baseUrl, f.created.key, 'crafting_status', { routeContextId: routed.routeContextId }));
    expect(status.crafting).toMatchObject({ mode: 'FEATURE_TRANSPLANTATION', state: 'mutation_started' });
    expect(status.plan).toMatchObject({ craftPlanId: prepared.crafting.craftPlanId, decisionCount: 3 });
    expect(JSON.stringify(status)).not.toMatch(/sourceBody|donorBody/i);
  });

  it('persists prepared transplantation state in task checkpoints and resumes it on a fresh route with a fresh lease', async () => {
    const f = await setup({ memoryEnabled: true });
    const reference = {
      referenceId: 'processor-reference', kind: 'local_repo', localPath: f.donor,
      commit: '1'.repeat(40), tree: '2'.repeat(40), featureScope: 'processor', approvalSource: 'user',
    };
    const routeArgs = {
      task: 'Transplant processor behavior from the approved local implementation reference.',
      projectRoot: f.host,
      continuity: { objective: 'Transplant processor behavior' },
      crafting: { ...featureInput, references: [reference] },
    };
    const first = body(await call(f.baseUrl, f.created.key, 'capability_route', routeArgs));
    expect(first.continuityTaskId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(first.crafting).toMatchObject({ mode: 'FEATURE_TRANSPLANTATION', state: 'analysis' });

    const prepared = body(await call(f.baseUrl, f.created.key, 'crafting_prepare', {
      routeContextId: first.routeContextId,
      referenceRoots: [{ referenceId: 'processor-reference', root: f.donor }],
      evidence: [
        { referenceId: 'processor-reference', sourcePath: 'src/core.mjs', role: 'entry_point', observation: 'processValue normalizes input before dispatch.' },
        { referenceId: 'processor-reference', sourcePath: 'src/registry.mjs', role: 'dependency', observation: 'registry owns donor dispatch.' },
        { referenceId: 'processor-reference', sourcePath: 'test/core.test.mjs', role: 'test', observation: 'donor behavior test.' },
      ],
      requirements: { tests: true, lifecycle: false, stateOrConfig: false },
      spareparts: [
        { sparepartId: 'core', referenceId: 'processor-reference', sourcePath: 'src/core.mjs', role: 'core algorithm', evidenceRefs: ['AUTO:src/core.mjs'] },
        { sparepartId: 'registry', referenceId: 'processor-reference', sourcePath: 'src/registry.mjs', role: 'execution owner', evidenceRefs: ['AUTO:src/registry.mjs'] },
        { sparepartId: 'donor-test', referenceId: 'processor-reference', sourcePath: 'test/core.test.mjs', role: 'verification', evidenceRefs: ['AUTO:test/core.test.mjs'] },
      ],
      connections: [
        { from: 'core', to: 'registry', relation: 'CALLS', evidenceRefs: ['AUTO:src/core.mjs', 'AUTO:src/registry.mjs'] },
        { from: 'donor-test', to: 'core', relation: 'TESTS', evidenceRefs: ['AUTO:test/core.test.mjs', 'AUTO:src/core.mjs'] },
      ],
      coverage: [],
      decisions: [
        { sparepartId: 'core', action: 'ADAPT', rationaleCode: 'HOST_BOUNDARY', targetPath: 'src/core.mjs', preservedBehaviors: ['normalize-before-dispatch'], intentionallyChangedBehaviors: [], evidenceRefs: ['AUTO:src/core.mjs'] },
        { sparepartId: 'registry', action: 'REPLACE', rationaleCode: 'HOST_EXECUTION_AUTHORITY', targetPath: 'src/registry-adapter.mjs', targetBinding: 'ExecutionService/ProcessManager', preservedBehaviors: ['dispatch boundary'], intentionallyChangedBehaviors: ['host owns dispatch'], evidenceRefs: ['AUTO:src/registry.mjs'] },
        { sparepartId: 'donor-test', action: 'DROP', rationaleCode: 'VERIFICATION_ONLY', preservedBehaviors: [], intentionallyChangedBehaviors: ['mapped to host verification'], evidenceRefs: ['AUTO:test/core.test.mjs'] },
      ],
      bindings: [{ sparepartId: 'registry', boundary: 'operational_execution', donorContract: 'DonorRegistry', hostContract: 'ExecutionService/ProcessManager', surgery: 'AUTHORITY_REPLACEMENT', verificationRequirement: 'host-integration', preservesHostAuthority: true }],
      authorityClaims: [{ sparepartId: 'registry', authorityId: 'operational_execution', role: 'owner' }],
      hostVerification: ['host-integration'], donorVerification: ['normalize-before-dispatch'],
    }));
    expect(prepared.crafting).toMatchObject({ state: 'ready' });

    const checkpointResult = body(await call(f.baseUrl, f.created.key, 'task_checkpoint', {
      routeContextId: first.routeContextId,
      status: 'interrupted',
      summary: 'Pause prepared Real Steel transplantation for a later route.',
    }));
    expect(checkpointResult.checkpointId).toMatch(/^[0-9a-f-]{36}$/i);
    const checkpoint = await f.runtime.memory.getContinuityCheckpoint(
      { principalId: f.created.metadata.id, projectId: first.projectId }, checkpointResult.checkpointId,
    );
    expect(checkpoint).not.toBeNull();
    const savedCrafting = parseCraftingContinuityCheckpoint(checkpoint!);
    expect(savedCrafting).toMatchObject({
      craftingId: prepared.crafting.craftingId,
      craftPlanId: prepared.crafting.craftPlanId,
      verificationStatus: 'pending',
    });

    const second = body(await call(f.baseUrl, f.created.key, 'capability_route', {
      ...routeArgs,
      continuity: { resumeTaskId: first.continuityTaskId },
    }));
    expect(second.routeContextId).not.toBe(first.routeContextId);
    expect(second.crafting).toMatchObject({
      craftingId: prepared.crafting.craftingId,
      craftPlanId: prepared.crafting.craftPlanId,
      state: 'ready',
    });
    expect(second.crafting.leaseId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(second.crafting.leaseId).not.toBe(prepared.crafting.leaseId);
  });

});
