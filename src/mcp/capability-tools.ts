import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { VerifiedKey } from '../auth/key-types.js';
import { buildCraftPlan } from '../crafting/craft-plan.js';
import { parseCraftingContinuityCheckpoint, resumeCraftingProjection } from '../crafting/continuity.js';
import { resolveCraftingMode } from '../crafting/mode-resolver.js';
import { deriveCraftingFeatureContract } from '../crafting/task-contract.js';
import { attachExecutionContinuity, type ContinuitySnapshot } from '../continuity/snapshot.js';
import type { ContinuityTaskRecord } from '../continuity/store.js';
import type { ContinuityCapture } from '../continuity/types.js';
import { MemoryHardLifecycleError, memoryObjectiveHash, type MemoryContextLifecycleRecord } from '../memory/hard-lifecycle.js';
import type { MemorySearchHit } from '../memory/types.js';
import type { RouteCraftingProjection } from '../runtime/route-context-store.js';
import type { RuntimeServices } from '../runtime/services.js';
import { persistentPrincipalId } from './project-scope.js';
import { injectMemoryIntoRoutingContext } from './memory-injection.js';
import { craftingRouteSchema } from './crafting-schemas.js';

function textResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof Error && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : undefined;
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: { ...(code ? { code } : {}), message } }, null, 2) }],
    isError: true,
  };
}

function memoryConfidence(hits: MemorySearchHit[]): number {
  if (hits.length === 0) return 0;
  const breadth = Math.min(1, hits.length / 5);
  const signalCoverage = hits.filter((hit) => hit.whyMatched.exact > 0 || hit.whyMatched.lexical > 0).length / hits.length;
  const provenanceCoverage = hits.filter((hit) => Boolean(hit.sourceEventId)).length / hits.length;
  return Number((0.4 * breadth + 0.3 * signalCoverage + 0.3 * provenanceCoverage).toFixed(6));
}

function guarded<T>(operation: () => T) {
  try { return textResult(operation()); }
  catch (error) { return errorResult(error); }
}

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
const routeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

export const CAPABILITY_TOOL_NAMES = [
  'capability_route', 'capability_search', 'capability_get',
  'skill_load', 'capability_dependencies', 'capability_coverage',
] as const;

const capabilityType = z.enum([
  'skill', 'agent', 'command', 'hook', 'framework', 'collection', 'guide', 'utility',
]);
const capabilityRisk = z.enum(['low', 'medium', 'high', 'unknown']);
const capabilityState = z.enum([
  'cataloged', 'source_resolved', 'license_verified', 'function_analyzed',
  'safety_reviewed', 'normalized', 'native_ready', 'reference_only',
  'quarantined', 'unresolved', 'license_unknown', 'source_removed',
]);

const continuityCaptureSchema = z.object({
  objective: z.string().max(20_000).optional(),
  acceptanceCriteria: z.array(z.string().max(20_000)).max(50).optional(),
  constraints: z.array(z.string().max(20_000)).max(50).optional(),
  parentTaskId: z.string().max(5_000).optional(),
  resumeTaskId: z.string().max(5_000).optional(),
});

const CONTINUATION_EXACT_PHRASES = new Set([
  'pick up where we left off',
]);
const CONTINUATION_PATTERNS = [
  /^(?:(?:silakan|silahkan|tolong)\s+)?(?:lanjut|lanjutkan|teruskan)(?:\s+lagi)?(?:\s+(?:task|tugas|pekerjaan)(?:\s+sebelumnya)?)?(?:\s+(?:hingga|sampai)\s+selesai)?$/,
  /^(?:please\s+)?(?:continue(?:\s+from)?|resume)(?:\s+the)?(?:\s+(?:previous|prior))?(?:\s+(?:task|work))?$/,
] as const;

function isKnownContinuationPhrase(task: string): boolean {
  const normalized = task
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[.!?,;:]+$/g, '')
    .replace(/\s+/g, ' ');
  return CONTINUATION_EXACT_PHRASES.has(normalized)
    || CONTINUATION_PATTERNS.some((pattern) => pattern.test(normalized));
}

function compareTaskCandidates(left: ContinuityTaskRecord, right: ContinuityTaskRecord): number {
  if (left.priority !== right.priority) return right.priority - left.priority;
  if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt;
  return left.taskId < right.taskId ? -1 : left.taskId > right.taskId ? 1 : 0;
}

function resumableCandidates(snapshot: ContinuitySnapshot): ContinuityTaskRecord[] {
  const unique = new Map<string, ContinuityTaskRecord>();
  for (const task of snapshot.activeTasks) {
    if (task.status === 'running') unique.set(task.taskId, task);
  }
  for (const task of snapshot.unfinishedPlans) {
    if (task.status === 'interrupted') unique.set(task.taskId, task);
  }
  return [...unique.values()].sort(compareTaskCandidates);
}

function candidateView(task: ContinuityTaskRecord) {
  return {
    taskId: task.taskId,
    title: task.title,
    objective: task.objective ?? null,
    status: task.status,
    priority: task.priority,
    updatedAt: task.updatedAt,
  };
}

type ContinuityRouteStatus = 'disabled' | 'healthy' | 'degraded' | 'ambiguous';

async function attachExecutionSnapshot(
  runtime: RuntimeServices,
  scope: { principalId: string; projectId?: string },
  snapshot: ContinuitySnapshot,
): Promise<ContinuitySnapshot> {
  if (!runtime.execution.config.enabled) return snapshot;
  try {
    await runtime.execution.open();
    return attachExecutionContinuity(snapshot, await runtime.execution.continuitySummary(scope));
  } catch {
    return snapshot;
  }
}

export function registerCapabilityTools(
  server: McpServer,
  runtime: RuntimeServices,
  key: VerifiedKey,
): void {
  server.registerTool('capability_route', {
    title: 'Route Capabilities',
    description: 'Create a principal-bound Agent Core routing context for an actionable task before task-execution tools are used.',
    inputSchema: {
      task: z.string().min(1).max(20_000),
      context: z.string().max(20_000).optional(),
      projectRoot: z.string().min(1).max(5_000).optional(),
      continuity: continuityCaptureSchema.optional(),
      crafting: craftingRouteSchema.optional(),
    },
    annotations: routeAnnotations,
  }, async ({ task, context, projectRoot, continuity, crafting }) => {
    let projectId: string;
    try {
      projectId = runtime.workspace.resolveProjectRoot({
        explicitRoot: projectRoot,
        texts: [task, context],
      });
    } catch (error) {
      return errorResult(error);
    }
    const reservation = runtime.routes.reserve();
    let craftingDecision: ReturnType<typeof resolveCraftingMode> | null = null;
    let initialCraftPlan: ReturnType<typeof buildCraftPlan> | null = null;
    let resumedCrafting: RouteCraftingProjection | null = null;
    if (crafting) {
      try {
        const feature = deriveCraftingFeatureContract({
          task,
          context,
          projectId,
          declaration: crafting,
        });
        craftingDecision = resolveCraftingMode({
          routeContextId: reservation.routeContextId,
          projectId,
          feature,
          references: crafting.references,
        });
        runtime.crafting.registerDecision(craftingDecision);
        if (craftingDecision.mode === 'BUILD_FROM_ZERO') {
          initialCraftPlan = buildCraftPlan({
            decision: craftingDecision,
            decisions: [],
            hostVerification: feature.verificationRequirements,
            donorVerification: [],
          });
          runtime.crafting.registerCraftPlan(initialCraftPlan);
        }
      } catch (error) {
        return errorResult(error);
      }
    }
    const scope = {
      principalId: persistentPrincipalId(runtime, key),
      projectId,
    };
    let memoryStatus: 'disabled' | 'healthy' | 'degraded' = runtime.memory.config.enabled ? 'healthy' : 'disabled';
    let continuityStatus: ContinuityRouteStatus = runtime.memory.config.enabled ? 'healthy' : 'disabled';
    let preflight = null as Awaited<ReturnType<typeof runtime.memory.preflight>> | null;
    let continuitySnapshot = null as ContinuitySnapshot | null;
    let continuityTurnId: string | null = null;
    let continuityTaskId: string | null = null;
    let continuityResumeCandidates: ReturnType<typeof candidateView>[] = [];

    let lifecycleRecord: MemoryContextLifecycleRecord | null = null;
    let priorPendingCount = 0;
    let lifecycleAdvisoryCode: 'MEMORY_POSTFLIGHT_REQUIRED' | undefined;
    let memoryContextLease: string | null = null;
    let memoryContextLeaseExpiresAt: string | null = null;

    if (runtime.memory.config.enabled) {
      try {
        await runtime.memory.reconcileContinuity(
          scope,
          runtime.routes.activeRouteContextIds(key.id, projectId),
        );
      } catch {
        continuityStatus = 'degraded';
      }

      try {
        continuitySnapshot = await attachExecutionSnapshot(
          runtime,
          scope,
          await runtime.memory.getContinuitySnapshot(scope),
        );
      } catch {
        continuityStatus = 'degraded';
      }

      const capture: ContinuityCapture = continuity ? { ...continuity } : {};
      if (continuitySnapshot && !capture.resumeTaskId && isKnownContinuationPhrase(task)) {
        const candidates = resumableCandidates(continuitySnapshot);
        if (candidates.length === 1) {
          capture.resumeTaskId = candidates[0]!.taskId;
        } else if (candidates.length > 1) {
          continuityStatus = 'ambiguous';
          continuityResumeCandidates = candidates.map(candidateView);
        }
      }

      if (continuityStatus !== 'ambiguous') {
        if (craftingDecision && capture.resumeTaskId) {
          try {
            const resumeTask = await runtime.memory.getContinuityTask(scope, capture.resumeTaskId);
            const checkpointId = resumeTask?.lastCheckpointId;
            if (checkpointId) {
              const checkpoint = await runtime.memory.getContinuityCheckpoint(scope, checkpointId);
              if (checkpoint) {
                let savedCrafting = null as ReturnType<typeof parseCraftingContinuityCheckpoint> | null;
                try {
                  savedCrafting = parseCraftingContinuityCheckpoint(checkpoint);
                } catch (error) {
                  if (!(error instanceof Error) || error.message !== 'CRAFTING_CONTINUITY_STATE_MISSING') throw error;
                }
                if (savedCrafting) {
                  const savedPlan = runtime.crafting.getCraftPlan(savedCrafting.craftPlanId);
                  if (!savedPlan) throw new Error('CRAFTING_CONTINUITY_PLAN_UNAVAILABLE');
                  resumedCrafting = resumeCraftingProjection(savedCrafting, craftingDecision, savedPlan);
                }
              }
            }
          } catch (error) {
            return errorResult(error);
          }
        }
        try {
          const reconciliationRequired = await runtime.memory.findLifecycleReconciliationRequired({
            scope,
            objectiveHash: memoryObjectiveHash(task, context),
            ...(capture.resumeTaskId ? { continuityTaskId: capture.resumeTaskId } : {}),
          });
          priorPendingCount = reconciliationRequired.length;
          if (priorPendingCount > 0) {
            if (runtime.memory.config.hardLifecycleMode === 'enforce') {
              return errorResult(new MemoryHardLifecycleError(
                'MEMORY_POSTFLIGHT_REQUIRED',
                'Previous meaningful work for this objective/task requires postflight reconciliation before a new memory context is opened',
                { pendingCount: priorPendingCount },
              ));
            }
            if (runtime.memory.config.hardLifecycleMode === 'advisory') {
              lifecycleAdvisoryCode = 'MEMORY_POSTFLIGHT_REQUIRED';
            }
          }
        } catch (error) {
          if (error instanceof MemoryHardLifecycleError) return errorResult(error);
          memoryStatus = 'degraded';
          if (runtime.memory.config.hardLifecycleMode === 'enforce') {
            return errorResult(new MemoryHardLifecycleError(
              'MEMORY_PREFLIGHT_REQUIRED',
              'Memory lifecycle reconciliation is unavailable; enforce mode cannot open a compliant actionable context',
            ));
          }
        }

        try {
          preflight = await runtime.memory.preflight({
            scope,
            routeContextId: reservation.routeContextId,
            task,
            context,
            routeMetadata: { workspaceRoots: runtime.workspace.roots },
            expiresAt: Date.parse(reservation.expiresAt),
          });
        } catch {
          memoryStatus = 'degraded';
        }

        if (continuitySnapshot) {
          try {
            const started = await runtime.memory.beginContinuityTurn(
              scope,
              reservation.routeContextId,
              task,
              context,
              capture,
              Date.parse(reservation.expiresAt),
            );
            continuityTurnId = started.turnId;
            continuityTaskId = started.taskId;
          } catch {
            continuityStatus = 'degraded';
          }
        }

        if (preflight && continuityTaskId) {
          try {
            lifecycleRecord = await runtime.memory.bindLifecycleTask(scope, preflight.contextId, continuityTaskId);
          } catch (error) {
            memoryStatus = 'degraded';
            if (runtime.memory.config.hardLifecycleMode === 'enforce') {
              return errorResult(error);
            }
          }
        } else if (preflight) {
          lifecycleRecord = await runtime.memory.getLifecycleContext(scope, preflight.contextId).catch(() => null);
        }

        if (continuityTurnId && continuityTaskId) {
          try {
            continuitySnapshot = await attachExecutionSnapshot(
              runtime,
              scope,
              await runtime.memory.getContinuitySnapshot(scope),
            );
          } catch {
            continuityStatus = 'degraded';
          }
        }
      } else {
        // Ambiguous continuation remains non-actionable and does not open a new preflight lifecycle.
        preflight = null;
      }
    }

    if (preflight && lifecycleRecord && runtime.memory.config.hardLifecycleMode !== 'disabled') {
      try {
        const issuedLease = await runtime.memory.issueContextLease({
          scope,
          contextId: preflight.contextId,
          routeContextId: reservation.routeContextId,
        });
        memoryContextLease = issuedLease.token;
        memoryContextLeaseExpiresAt = new Date(issuedLease.expiresAt).toISOString();
      } catch (error) {
        memoryStatus = 'degraded';
        if (runtime.memory.config.hardLifecycleMode === 'enforce') return errorResult(error);
      }
    }

    const memoryInjection = injectMemoryIntoRoutingContext(context, preflight);
    const plan = runtime.router.route(task, memoryInjection.context);
    if (memoryInjection.applied && !plan.reasonCodes.includes('autonomous_memory_context')) {
      plan.reasonCodes = [...plan.reasonCodes, 'autonomous_memory_context'];
    }
    let route = runtime.routes.create(key.id, plan, {
      reservation,
      projectId,
      ...(preflight ? {
        memorySnapshot: {
          memoryContextId: preflight.contextId,
          memorySnapshotHash: preflight.snapshotHash,
          blockingGuardrailMemoryIds: preflight.blockingGuardrails.map((item) => item.memoryId),
          blockingGuardrails: preflight.blockingGuardrails.map((item) => ({
            memoryId: item.memoryId,
            revisionId: item.revisionId,
            canonicalKey: item.canonicalKey,
            ...(item.sourceEventId ? { sourceEventId: item.sourceEventId } : {}),
          })),
          enforceHardGuardrails: runtime.memory.config.enforceHardGuardrails,
        },
      } : {}),
      ...(continuityTurnId ? { continuityTurnId } : {}),
      ...(continuityTaskId ? { continuityTaskId } : {}),
      ...(continuitySnapshot ? { continuitySnapshotHash: continuitySnapshot.snapshotHash } : {}),
      ...(resumedCrafting ? { crafting: resumedCrafting } : craftingDecision ? {
        crafting: {
          craftingId: craftingDecision.craftingId,
          mode: craftingDecision.mode,
          featureContractHash: craftingDecision.featureContractHash,
          referenceSetHash: craftingDecision.referenceSetHash,
          ...(initialCraftPlan ? { craftPlanId: initialCraftPlan.craftPlanId } : {}),
          state: initialCraftPlan ? 'ready' as const : 'analysis' as const,
        },
      } : {}),
    });
    if (route.crafting?.state === 'ready' && route.crafting.craftPlanId) {
      const lease = runtime.crafting.issueLease({
        principalId: key.id,
        projectId,
        routeContextId: route.routeContextId,
        crafting: route.crafting,
        routeExpiresAt: Date.parse(route.expiresAt),
      });
      route = runtime.routes.updateCrafting(route.routeContextId, key.id, { leaseId: lease.leaseId });
    }

    const memorySummary = preflight?.recalled ?? [];
    const memoryDirective = {
      inspectionRequired: memorySummary.length > 0
        || (preflight?.blockingGuardrails.length ?? 0) > 0
        || (preflight?.priorFailures.length ?? 0) > 0
        || (preflight?.relatedDecisions.length ?? 0) > 0,
      hasBlockingGuardrails: (preflight?.blockingGuardrails.length ?? 0) > 0,
      hasPriorFailures: (preflight?.priorFailures.length ?? 0) > 0,
      hasRelatedDecisions: (preflight?.relatedDecisions.length ?? 0) > 0,
    };
    const continuityDirective = {
      inspectionRequired: continuitySnapshot !== null,
      ambiguousResume: continuityStatus === 'ambiguous',
      resumableCandidateCount: continuityResumeCandidates.length,
    };
    return textResult({
      routeContextId: route.routeContextId,
      projectId,
      tier: route.tier,
      mode: route.mode,
      domain: route.domain,
      confidence: route.confidence,
      risk: route.risk,
      recommendedCapabilities: route.recommendedCapabilities,
      requiredSkillLoads: route.requiredSkillLoads,
      allowedTools: route.allowedTools,
      verification: route.verification,
      reasonCodes: route.reasonCodes,
      crafting: route.crafting ?? null,
      craftingDirective: route.crafting ? {
        mode: route.crafting.mode,
        sourceGroundingRequired: route.crafting.mode === 'FEATURE_TRANSPLANTATION' && route.crafting.state === 'analysis',
        mutationReady: route.crafting.state === 'ready' || route.crafting.state === 'mutation_started' || route.crafting.state === 'verification_pending',
      } : null,
      memoryStatus,
      memoryContextId: preflight?.contextId ?? null,
      memorySummary,
      blockingGuardrails: preflight?.blockingGuardrails ?? [],
      openConflicts: preflight?.openConflicts ?? [],
      priorFailures: preflight?.priorFailures ?? [],
      relatedDecisions: preflight?.relatedDecisions ?? [],
      memoryConfidence: memoryConfidence(memorySummary),
      memorySnapshotHash: preflight?.snapshotHash ?? null,
      memoryContextLease,
      memoryContextLeaseExpiresAt,
      memoryLifecycle: {
        mode: runtime.memory.config.hardLifecycleMode,
        postflightState: lifecycleRecord?.postflightState ?? null,
        priorPending: priorPendingCount > 0,
        priorPendingCount,
        ...(lifecycleAdvisoryCode ? { advisoryCode: lifecycleAdvisoryCode } : {}),
      },
      memoryInjection: {
        applied: memoryInjection.applied,
        memoryIds: memoryInjection.memoryIds,
        characterCount: memoryInjection.characterCount,
        omittedCount: memoryInjection.omittedCount,
      },
      memoryDirective,
      continuityStatus,
      continuityTurnId,
      continuityTaskId,
      continuitySnapshot,
      continuitySnapshotHash: continuitySnapshot?.snapshotHash ?? null,
      continuityResumeCandidates,
      continuityDirective,
      expiresAt: route.expiresAt,
    });
  });

  server.registerTool('capability_search', {
    title: 'Search Capabilities',
    description: 'Search compact Agent Core capability metadata by function, type, category, risk, state, or agent compatibility.',
    inputSchema: {
      query: z.string().max(20_000).default(''),
      type: capabilityType.optional(),
      category: z.string().max(200).optional(),
      risk: capabilityRisk.optional(),
      state: capabilityState.optional(),
      compatibility: z.string().max(100).optional(),
      limit: z.number().int().min(1).max(100).default(20),
    },
    annotations: readOnlyAnnotations,
  }, async ({ query, type, category, risk, state, compatibility, limit }) => textResult({
    results: runtime.capabilities.search(query, {
      type, category, risk, state, compatibility, limit,
    }),
  }));

  server.registerTool('capability_get', {
    title: 'Get Capability',
    description: 'Return canonical metadata and audit state for one Agent Core capability. This never returns full skill instructions.',
    inputSchema: { id: z.string().min(1).max(200) },
    annotations: readOnlyAnnotations,
  }, async ({ id }) => guarded(() => {
    const capability = runtime.capabilities.get(id);
    if (!capability) throw new Error(`Unknown capability: ${id}`);
    return capability;
  }));
  server.registerTool('skill_load', {
    title: 'Load Audited Skill',
    description: 'Load full instructions only for an audited native-ready skill and optionally bind that load to an Agent Core route context.',
    inputSchema: {
      id: z.string().min(1).max(200),
      routeContextId: z.string().uuid().optional(),
    },
    annotations: readOnlyAnnotations,
  }, async ({ id, routeContextId }) => guarded(() => {
    const loaded = runtime.capabilities.loadSkill(id);
    if (routeContextId) {
      runtime.routes.markSkillLoaded(routeContextId, key.id, id);
    }
    return loaded;
  }));

  server.registerTool('capability_dependencies', {
    title: 'Capability Dependencies',
    description: 'Inspect required Agent Core tools, dependencies, side effects, risk, and eligibility before loading or using a capability.',
    inputSchema: { id: z.string().min(1).max(200) },
    annotations: readOnlyAnnotations,
  }, async ({ id }) => guarded(() => runtime.capabilities.dependencies(id)));

  server.registerTool('capability_coverage', {
    title: 'Capability Coverage',
    description: 'Return catalog coverage totals and audit states for the Agent Core capability registry.',
    annotations: readOnlyAnnotations,
  }, async () => textResult(runtime.capabilities.coverage()));
}
