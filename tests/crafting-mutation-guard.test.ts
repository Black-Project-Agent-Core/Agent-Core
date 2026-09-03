import { randomUUID } from 'node:crypto';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import type { RoutePlan } from '../src/capabilities/route-types.js';
import type { CraftPlan } from '../src/crafting/craft-plan.js';
import { classifyCraftingMutation } from '../src/crafting/mutation-intent.js';
import { loadConfig, type MemoryHardLifecycleMode } from '../src/config.js';
import { createHttpHandler } from '../src/http/app.js';
import { FileAuditLogger } from '../src/logging/audit-log.js';
import { createMcpHttpHandler } from '../src/mcp/handler.js';
import { createRuntimeServices, type RuntimeServices } from '../src/runtime/services.js';
import type { RouteCraftingProjection } from '../src/runtime/route-context-store.js';

const roots: string[] = [];
const servers: Server[] = [];
const runtimes: RuntimeServices[] = [];
const loggers: FileAuditLogger[] = [];

function routePlan(): RoutePlan {
  return {
    tier: 'structured', mode: 'capability_guided', domain: 'implementation', confidence: 1, risk: 'medium',
    recommendedCapabilities: [], requiredSkillLoads: [], allowedTools: ['read_file', 'write_file'],
    verification: { required: true, suggestedTools: ['read_file'] }, reasonCodes: ['crafting_guard_test'],
  };
}
async function setup(
  enforcement: 'disabled' | 'advisory' | 'enforce',
  memoryMode: MemoryHardLifecycleMode = 'disabled',
) {
  const root = await mkdtemp(path.join(os.tmpdir(), `agent-core-crafting-guard-${enforcement}-`));
  roots.push(root);
  const keyStore = new FileKeyStore(path.join(root, 'data'));
  const principal = await keyStore.create(`principal-${enforcement}`);
  const defaults = loadConfig({
    AGENT_CORE_MEMORY_ENABLED: memoryMode === 'disabled' ? 'false' : 'true',
    AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: memoryMode,
  }, root);
  const logger = new FileAuditLogger(path.join(root, 'logs'));
  loggers.push(logger);
  const runtime = createRuntimeServices(
    [root], path.join(root, 'capabilities'), logger,
    { ...defaults.memory, enabled: memoryMode !== 'disabled', dbPath: path.join(root, 'memory.sqlite') },
    { ...defaults.execution, enabled: false },
    defaults.github, undefined, defaults.observability, 'test', defaults.maintenance,
    { mode: 'disabled', leaseTtlMs: 5 * 60_000 },
    { enforcement, leaseTtlMs: 5 * 60_000 },
  );
  runtimes.push(runtime);
  const server = createServer(createHttpHandler({ keyStore, auditLogger: logger, mcpHandler: createMcpHttpHandler(runtime) }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return { root, runtime, logger, principal, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}
async function call(baseUrl: string, key: string, name: string, args: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method: 'tools/call', params: { name, arguments: args } }),
  });
  return await response.json() as Record<string, any>;
}

function body(result: Record<string, any>): Record<string, any> {
  return JSON.parse(result.result.content[0].text);
}
function errorCode(result: Record<string, any>): string | undefined {
  return body(result).error?.code;
}

function projection(mode: RouteCraftingProjection['mode']): RouteCraftingProjection {
  return {
    craftingId: `craft:${mode}`,
    mode,
    featureContractHash: 'a'.repeat(64),
    referenceSetHash: 'b'.repeat(64),
    ...(mode === 'FEATURE_TRANSPLANTATION' ? { groundingReceiptId: 'grounding:fixture' } : {}),
    craftPlanId: `craft-plan:${mode}`,
    state: 'ready',
  };
}

function registeredPlan(crafting: RouteCraftingProjection): CraftPlan {
  return {
    craftPlanId: crafting.craftPlanId!, craftingId: crafting.craftingId, mode: crafting.mode,
    featureContractHash: crafting.featureContractHash, referenceSetHash: crafting.referenceSetHash,
    ...(crafting.groundingReceiptId ? { groundingReceiptId: crafting.groundingReceiptId } : {}),
    anatomyId: crafting.mode === 'FEATURE_TRANSPLANTATION' ? 'anatomy:fixture' : undefined,
    decisions: crafting.mode === 'FEATURE_TRANSPLANTATION' ? [{
      sparepartId: 'core', action: 'KEEP', rationaleCode: 'PRESERVE_CORE',
      targetPath: 'src/transplanted.ts', preservedBehaviors: ['core behavior'], intentionallyChangedBehaviors: [], evidenceRefs: ['e-core'],
    }] : [],
    hostVerification: [], donorVerification: [], status: 'ready', blockingReasons: [],
  };
}

async function createCraftingRoute(
  runtime: RuntimeServices,
  principalId: string,
  root: string,
  mode?: RouteCraftingProjection['mode'],
  memoryPreflight = false,
) {
  const reservation = runtime.routes.reserve();
  let memorySnapshot;
  if (memoryPreflight) {
    const preflight = await runtime.memory.preflight({
      scope: { principalId, projectId: root }, routeContextId: reservation.routeContextId,
      task: 'Craft source fixture', context: 'Real Steel mutation guard test', expiresAt: Date.parse(reservation.expiresAt),
    });
    memorySnapshot = {
      memoryContextId: preflight.contextId, memorySnapshotHash: preflight.snapshotHash,
      blockingGuardrailMemoryIds: [], blockingGuardrails: [], enforceHardGuardrails: false,
    };
  }
  const crafting = mode ? projection(mode) : undefined;
  if (crafting) runtime.crafting.registerCraftPlan(registeredPlan(crafting));
  let route = runtime.routes.create(principalId, routePlan(), {
    reservation,
    projectId: root,
    ...(memorySnapshot ? { memorySnapshot } : {}),
    ...(crafting ? { crafting } : {}),
  });
  if (crafting) {
    const lease = runtime.crafting.issueLease({
      principalId, projectId: root, routeContextId: route.routeContextId,
      crafting, routeExpiresAt: Date.parse(route.expiresAt),
    });
    route = runtime.routes.updateCrafting(route.routeContextId, principalId, { leaseId: lease.leaseId });
  }
  return route;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(runtimes.splice(0).map(async (runtime) => {
    await runtime.execution.close().catch(() => undefined);
    await runtime.memory.close().catch(() => undefined);
  }));
  await Promise.all(loggers.splice(0).map((logger) => logger.close().catch(() => undefined)));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })));
});

describe('Real Steel mutation classification', () => {
  it('distinguishes source mutation, verification, docs, and reads structurally', () => {
    expect(classifyCraftingMutation('write_file', { path: 'src/a.ts' }).required).toBe(true);
    expect(classifyCraftingMutation('write_file', { path: 'docs/a.md' }).required).toBe(false);
    expect(classifyCraftingMutation('execute_command', { command: 'npm test' }).mutationClass).toBe('verification_command');
    expect(classifyCraftingMutation('read_file', { path: 'src/a.ts' }).required).toBe(false);
  });
});

describe('Real Steel crafting mutation guard', () => {
  it('enforce blocks source mutation before filesystem side effect when crafting state is missing', async () => {
    const f = await setup('enforce');
    const route = await createCraftingRoute(f.runtime, f.principal.metadata.id, f.root);
    const target = path.join(f.root, 'src', 'blocked.ts');
    const spy = vi.spyOn(f.runtime.filesystem, 'writeFile');
    const result = await call(f.baseUrl, f.principal.key, 'write_file', {
      path: target, content: 'blocked\n', routeContextId: route.routeContextId,
    });
    expect(result.result.isError).toBe(true);
    expect(errorCode(result)).toBe('CRAFTING_REQUIRED');
    expect(spy).not.toHaveBeenCalled();
    await expect(access(target)).rejects.toThrow();
  });

  it('advisory records would-block but preserves current mutation behavior', async () => {
    const f = await setup('advisory');
    const route = await createCraftingRoute(f.runtime, f.principal.metadata.id, f.root);
    const target = path.join(f.root, 'src', 'advisory.ts');
    const result = await call(f.baseUrl, f.principal.key, 'write_file', {
      path: target, content: 'export const ok = true;\n', routeContextId: route.routeContextId,
    });
    expect(result.result.isError).not.toBe(true);
    await expect(access(target)).resolves.toBeUndefined();
  });
  it('BUILD_FROM_ZERO allows original implementation but rejects donor-derived mutation evidence', async () => {
    const f = await setup('enforce');
    const route = await createCraftingRoute(f.runtime, f.principal.metadata.id, f.root, 'BUILD_FROM_ZERO');
    const original = await call(f.baseUrl, f.principal.key, 'write_file', {
      path: path.join(f.root, 'src', 'original.ts'), content: 'export const original = true;\n',
      routeContextId: route.routeContextId,
    });
    expect(original.result.isError).not.toBe(true);

    const donor = await call(f.baseUrl, f.principal.key, 'write_file', {
      path: path.join(f.root, 'src', 'donor.ts'), content: 'export const donor = true;\n',
      routeContextId: route.routeContextId,
      craftingIntent: { origin: 'donor_derived', sparepartId: 'external' },
    });
    expect(donor.result.isError).toBe(true);
    expect(errorCode(donor)).toBe('BUILD_FROM_ZERO_DONOR_EVIDENCE_FORBIDDEN');
  });

  it('FEATURE_TRANSPLANTATION requires mutation mapping and rejects clean-room parallel work for KEEP', async () => {
    const f = await setup('enforce');
    const route = await createCraftingRoute(f.runtime, f.principal.metadata.id, f.root, 'FEATURE_TRANSPLANTATION');
    const missing = await call(f.baseUrl, f.principal.key, 'write_file', {
      path: path.join(f.root, 'src', 'transplanted.ts'), content: 'missing mapping\n', routeContextId: route.routeContextId,
    });
    expect(errorCode(missing)).toBe('CRAFT_MUTATION_MAPPING_REQUIRED');

    const parallel = await call(f.baseUrl, f.principal.key, 'write_file', {
      path: path.join(f.root, 'src', 'transplanted.ts'), content: 'parallel\n', routeContextId: route.routeContextId,
      craftingIntent: { origin: 'host_original', sparepartId: 'core' },
    });
    expect(errorCode(parallel)).toBe('CLEAN_ROOM_PARALLEL_IMPLEMENTATION');
  });
  it('FEATURE_TRANSPLANTATION allows donor-derived mutation mapped to the selected KEEP sparepart', async () => {
    const f = await setup('enforce');
    const route = await createCraftingRoute(f.runtime, f.principal.metadata.id, f.root, 'FEATURE_TRANSPLANTATION');
    const result = await call(f.baseUrl, f.principal.key, 'write_file', {
      path: path.join(f.root, 'src', 'transplanted.ts'), content: 'export const transplanted = true;\n',
      routeContextId: route.routeContextId,
      craftingIntent: { origin: 'donor_derived', sparepartId: 'core' },
    });
    expect(result.result.isError).not.toBe(true);
    expect(f.runtime.routes.get(route.routeContextId)?.crafting?.state).toBe('mutation_started');
  });

  it('preserves memory hard lifecycle as the first rejection authority', async () => {
    const f = await setup('enforce', 'enforce');
    const route = await createCraftingRoute(f.runtime, f.principal.metadata.id, f.root);
    const craftingSpy = vi.spyOn(f.runtime.crafting, 'validateLease');
    const result = await call(f.baseUrl, f.principal.key, 'write_file', {
      path: path.join(f.root, 'src', 'memory-first.ts'), content: 'blocked\n', routeContextId: route.routeContextId,
    });
    expect(errorCode(result)).toBe('MEMORY_PREFLIGHT_REQUIRED');
    expect(craftingSpy).not.toHaveBeenCalled();
  });

  it('crafting rejection after valid memory preflight does not fabricate postflight work', async () => {
    const f = await setup('enforce', 'enforce');
    const route = await createCraftingRoute(f.runtime, f.principal.metadata.id, f.root, undefined, true);
    const contextId = route.memorySnapshot!.memoryContextId;
    const result = await call(f.baseUrl, f.principal.key, 'write_file', {
      path: path.join(f.root, 'src', 'crafting-blocked.ts'), content: 'blocked\n', routeContextId: route.routeContextId,
    });
    expect(errorCode(result)).toBe('CRAFTING_REQUIRED');
    expect(await f.runtime.memory.getLifecycleContext({ principalId: f.principal.metadata.id, projectId: f.root }, contextId))
      .toMatchObject({ postflightState: 'OPEN', meaningfulWorkCount: 0 });
  });
});
