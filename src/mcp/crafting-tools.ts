import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { VerifiedKey } from '../auth/key-types.js';
import { applyCompatibilitySurgery } from '../crafting/compatibility-surgery.js';
import { buildCraftPlan } from '../crafting/craft-plan.js';
import { buildFeatureAnatomy } from '../crafting/feature-anatomy.js';
import { resolveReferenceSource } from '../crafting/reference-resolution.js';
import { buildSourceGroundingReceipt, inspectSourceEvidence } from '../crafting/source-grounding.js';
import type { RuntimeServices } from '../runtime/services.js';
import { routeErrorResult } from './route-guard.js';

export const CRAFTING_TOOL_NAMES = ['crafting_prepare', 'crafting_status'] as const;

function textResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}
function errorResult(error: unknown) {
  return routeErrorResult(error) ?? {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: { message: error instanceof Error ? error.message : String(error) } }, null, 2) }],
    isError: true as const,
  };
}

const evidenceRole = z.enum(['entry_point', 'dependency', 'state', 'config', 'lifecycle', 'test', 'interface', 'error_path']);
const relation = z.enum(['DEFINES', 'CALLS', 'IMPORTS', 'IMPLEMENTS', 'CONFIGURES', 'READS_STATE', 'WRITES_STATE', 'STARTS', 'STOPS', 'TESTS', 'OWNS']);
const action = z.enum(['KEEP', 'ADAPT', 'REPLACE', 'DROP', 'REIMPLEMENT']);
const surgery = z.enum(['NONE', 'ADAPTER', 'TYPE_MAP', 'AUTHORITY_REPLACEMENT', 'LIFECYCLE_REWIRE', 'ERROR_MAP']);
const authorityId = z.enum([
  'semantic_memory', 'memory_lifecycle', 'workspace_containment', 'routing',
  'operational_execution', 'github_operations', 'operational_audit', 'authentication', 'runtime_health',
]);

const prepareSchema = {
  routeContextId: z.string().uuid(),
  referenceRoots: z.array(z.object({ referenceId: z.string().min(1).max(200), root: z.string().min(1).max(5_000) }).strict()).max(16),
  evidence: z.array(z.object({
    referenceId: z.string().min(1).max(200), sourcePath: z.string().min(1).max(5_000), role: evidenceRole,
    observation: z.string().min(1).max(4_000), symbol: z.string().max(1_000).optional(),
    lineStart: z.number().int().min(1).optional(), lineEnd: z.number().int().min(1).optional(),
  }).strict()).min(1).max(500),
  requirements: z.object({ tests: z.boolean(), lifecycle: z.boolean(), stateOrConfig: z.boolean() }).strict(),
  spareparts: z.array(z.object({
    sparepartId: z.string().min(1).max(500), referenceId: z.string().min(1).max(200), sourcePath: z.string().min(1).max(5_000),
    symbol: z.string().max(1_000).optional(), role: z.string().min(1).max(2_000), evidenceRefs: z.array(z.string().max(1_000)).min(1).max(100),
  }).strict()).min(1).max(500),
  connections: z.array(z.object({ from: z.string().min(1).max(500), to: z.string().min(1).max(500), relation,
    evidenceRefs: z.array(z.string().max(1_000)).min(1).max(100) }).strict()).max(2_000),
  coverage: z.array(z.object({ evidenceId: z.string().min(1).max(1_000), status: z.enum(['unknown', 'not_required']), reason: z.string().min(1).max(2_000) }).strict()).max(500),
  decisions: z.array(z.object({
    sparepartId: z.string().min(1).max(500), action, rationaleCode: z.string().min(1).max(1_000),
    targetPath: z.string().max(5_000).optional(), targetBinding: z.string().max(2_000).optional(),
    preservedBehaviors: z.array(z.string().max(2_000)).max(100),
    intentionallyChangedBehaviors: z.array(z.string().max(2_000)).max(100),
    evidenceRefs: z.array(z.string().max(1_000)).min(1).max(100),
  }).strict()).min(1).max(500),
  bindings: z.array(z.object({
    sparepartId: z.string().min(1).max(500), boundary: z.string().min(1).max(1_000),
    donorContract: z.string().min(1).max(2_000), hostContract: z.string().min(1).max(2_000), surgery,
    verificationRequirement: z.string().min(1).max(2_000), preservesHostAuthority: z.boolean(),
  }).strict()).max(500),
  authorityClaims: z.array(z.object({ sparepartId: z.string().min(1).max(500), authorityId,
    role: z.enum(['owner', 'adapter', 'observer']) }).strict()).max(500),
  hostVerification: z.array(z.string().max(2_000)).max(100),
  donorVerification: z.array(z.string().max(2_000)).max(100),
} as const;

function autoEvidenceRef(value: string, evidenceIdsByPath: Map<string, string[]>): string {
  if (!value.startsWith('AUTO:')) return value;
  const path = value.slice('AUTO:'.length);
  const ids = evidenceIdsByPath.get(path) ?? [];
  if (ids.length !== 1) throw new Error(`AUTO evidence reference is not uniquely resolvable: ${path}`);
  return ids[0]!;
}

function mapRefs(values: string[], evidenceIdsByPath: Map<string, string[]>): string[] {
  return values.map((value) => autoEvidenceRef(value, evidenceIdsByPath));
}
export function registerCraftingTools(server: McpServer, runtime: RuntimeServices, key: VerifiedKey): void {
  server.registerTool('crafting_status', {
    title: 'Real Steel Crafting Status',
    description: 'Return bounded Real Steel crafting state for a routed coding task.',
    inputSchema: { routeContextId: z.string().uuid() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ routeContextId }) => {
    try {
      const route = runtime.routes.getOwned(routeContextId, key.id);
      const crafting = route.crafting ?? null;
      const plan = crafting?.craftPlanId ? runtime.crafting.getCraftPlan(crafting.craftPlanId) : null;
      return textResult({
        routeContextId,
        projectId: route.projectId ?? null,
        crafting,
        plan: plan ? {
          craftPlanId: plan.craftPlanId,
          mode: plan.mode,
          status: plan.status,
          decisionCount: plan.decisions.length,
          decisionActions: plan.decisions.reduce<Record<string, number>>((counts, item) => {
            counts[item.action] = (counts[item.action] ?? 0) + 1;
            return counts;
          }, {}),
          compatibilityBindingCount: plan.compatibilityBindings?.length ?? 0,
          hostVerification: [...plan.hostVerification],
          donorVerification: [...plan.donorVerification],
        } : null,
      });
    } catch (error) { return errorResult(error); }
  });

  server.registerTool('crafting_prepare', {
    title: 'Prepare Real Steel Feature Transplantation',
    description: 'Re-read approved reference source, build connected feature anatomy and compatibility decisions, then issue the mutation lease for FEATURE_TRANSPLANTATION.',
    inputSchema: prepareSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (input) => {
    try {
      const route = runtime.routes.getOwned(input.routeContextId, key.id);
      if (!route.crafting || route.crafting.mode !== 'FEATURE_TRANSPLANTATION') {
        throw new Error('crafting_prepare requires a FEATURE_TRANSPLANTATION route');
      }
      const decision = runtime.crafting.getDecision(route.crafting.craftingId);
      if (!decision) throw new Error('Crafting mode decision is unavailable for this route');
      const roots = new Map(input.referenceRoots.map((item) => [item.referenceId, item.root]));
      const resolved = new Map<string, Awaited<ReturnType<typeof resolveReferenceSource>>>();
      for (const reference of decision.references) {
        const root = roots.get(reference.referenceId);
        if (!root) throw new Error(`Missing local source root for reference: ${reference.referenceId}`);
        resolved.set(reference.referenceId, await resolveReferenceSource(reference, root, runtime.workspace));
      }
      const evidence = [];
      const evidenceIdsByPath = new Map<string, string[]>();
      for (const request of input.evidence) {
        const source = resolved.get(request.referenceId);
        if (!source) throw new Error(`Evidence references unknown source: ${request.referenceId}`);
        const item = await inspectSourceEvidence({
          workspace: runtime.workspace,
          reference: source,
          relativePath: request.sourcePath,
          role: request.role,
          observation: request.observation,
          ...(request.symbol ? { symbol: request.symbol } : {}),
          ...(request.lineStart !== undefined ? { lineStart: request.lineStart } : {}),
          ...(request.lineEnd !== undefined ? { lineEnd: request.lineEnd } : {}),
        });
        evidence.push(item);
        const ids = evidenceIdsByPath.get(item.sourcePath) ?? [];
        ids.push(item.evidenceId);
        evidenceIdsByPath.set(item.sourcePath, ids);
      }
      const receipt = buildSourceGroundingReceipt({ decision, evidence, requirements: input.requirements });
      const spareparts = input.spareparts.map((item) => ({
        ...item,
        evidenceRefs: mapRefs(item.evidenceRefs, evidenceIdsByPath),
      }));
      const connections = input.connections.map((item) => ({
        ...item,
        evidenceRefs: mapRefs(item.evidenceRefs, evidenceIdsByPath),
      }));
      const coverage = input.coverage.map((item) => ({
        ...item,
        evidenceId: autoEvidenceRef(item.evidenceId, evidenceIdsByPath),
      }));
      const anatomy = buildFeatureAnatomy({ receipt, spareparts, connections, coverage });
      const decisions = input.decisions.map((item) => ({
        ...item,
        evidenceRefs: mapRefs(item.evidenceRefs, evidenceIdsByPath),
      }));
      const basePlan = buildCraftPlan({
        decision,
        groundingReceipt: receipt,
        anatomy,
        decisions,
        hostVerification: input.hostVerification,
        donorVerification: input.donorVerification,
      });
      const compatible = applyCompatibilitySurgery({
        craftPlan: basePlan,
        bindings: input.bindings,
        authorityClaims: input.authorityClaims,
      });
      if (compatible.status !== 'ready') {
        throw new Error(`Craft plan remains blocked: ${compatible.blockingReasons.join(', ')}`);
      }
      runtime.crafting.registerCraftPlan(compatible);
      let updated = runtime.routes.updateCrafting(input.routeContextId, key.id, {
        groundingReceiptId: receipt.receiptId,
        craftPlanId: compatible.craftPlanId,
        state: 'ready',
      });
      const lease = runtime.crafting.issueLease({
        principalId: key.id,
        projectId: updated.projectId,
        routeContextId: updated.routeContextId,
        crafting: updated.crafting!,
        routeExpiresAt: Date.parse(updated.expiresAt),
      });
      updated = runtime.routes.updateCrafting(input.routeContextId, key.id, { leaseId: lease.leaseId });
      return textResult({
        routeContextId: updated.routeContextId,
        projectId: updated.projectId ?? null,
        crafting: updated.crafting,
        grounding: {
          receiptId: receipt.receiptId,
          inspectedSourceFiles: receipt.inspectedSourceFiles,
          inspectedTests: receipt.inspectedTests,
          evidenceCount: receipt.evidence.length,
        },
        anatomy: {
          anatomyId: anatomy.anatomyId,
          sparepartCount: anatomy.spareparts.length,
          connectionCount: anatomy.connections.length,
        },
        plan: {
          craftPlanId: compatible.craftPlanId,
          decisionCount: compatible.decisions.length,
          compatibilityBindingCount: compatible.compatibilityBindings.length,
        },
      });
    } catch (error) { return errorResult(error); }
  });
}
