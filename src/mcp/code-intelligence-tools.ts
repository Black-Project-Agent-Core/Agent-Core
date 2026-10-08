import { McpServer } from '@modelcontextprotocol/server';
import type { CallToolResult } from '@modelcontextprotocol/client';
import type { CodeIntelligenceService } from '../code-intelligence/service.js';
import { buildChangedSymbolReview } from '../code-intelligence/change-review.js';
import { scanChangedSourceSecurity } from '../code-intelligence/changed-source-security.js';
import type { SemanticIdeService } from '../semantic-ide/service.js';
import type { ExternalControllerLearningService } from '../learning/external-controller.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import { redactSensitiveString } from '../security/redaction.js';
import { parseCallToolResultJson } from './call-tool-result.js';
import { externalControllerToolResult } from './external-controller-tool-support.js';
import * as schemas from './code-intelligence-schemas.js';

function textResult(value: unknown): any {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function errorResult(message: string): any {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

function compactErrorFamily(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split(':', 1)[0]?.slice(0, 120) || 'CODE_INTELLIGENCE_ERROR';
}

function contextFromInput(input: any): {
  workspace?: string;
  ref?: string;
  worktreePath?: string;
  repoFilter?: string[];
} {
  return {
    ...(input.workspace ? { workspace: input.workspace } : {}),
    ...(input.ref ? { ref: input.ref } : {}),
    ...(input.worktreePath ? { worktreePath: input.worktreePath } : {}),
    ...(input.repoFilter?.length ? { repoFilter: input.repoFilter } : {}),
  };
}

function providerArgs(
  extra: Record<string, unknown> | undefined,
  base: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...(extra ?? {}),
    ...base,
  };
}

const ENTITY_ID_KEYS = new Set(['id', 'entity_id', 'node_id', 'source_id', 'target_id', 'from_id', 'to_id', 'caller_id', 'callee_id']);
const EDGE_ID_KEYS = new Set(['edge_id', 'relationship_id', 'rel_id']);
const TOUCH_LIMIT = 12;

export function collectBoundedGraphTouches(result: CallToolResult, args: Record<string, unknown>): { entityIds: string[]; edgeIds: string[] } {
  const entities = new Set<string>();
  const edges = new Set<string>();
  const add = (set: Set<string>, value: unknown): void => {
    if (typeof value !== 'string' || !value.trim() || set.size >= TOUCH_LIMIT) return;
    set.add(redactSensitiveString(value.trim()).slice(0, 300));
  };
  for (const key of ['entity_id', 'from', 'to', 'source', 'target']) add(entities, args[key]);
  const visit = (value: unknown, depth = 0): void => {
    if (depth > 6 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 100)) visit(item, depth + 1);
      return;
    }
    if (typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
      if (ENTITY_ID_KEYS.has(key)) add(entities, item);
      if (EDGE_ID_KEYS.has(key)) add(edges, item);
      if (entities.size < TOUCH_LIMIT || edges.size < TOUCH_LIMIT) visit(item, depth + 1);
    }
  };
  visit(parseCallToolResultJson(result));
  return { entityIds: [...entities], edgeIds: [...edges] };
}

async function runProvider(
  service: CodeIntelligenceService,
  family: string,
  action: string,
  providerTool: string,
  args: Record<string, unknown>,
  context: ReturnType<typeof contextFromInput>,
  allowStale = false,
  externalController?: ExternalControllerLearningService,
  externalSessionId?: string,
): Promise<any> {
  const started = Date.now();
  try {
    const result = await service.callProviderTool(providerTool, args, { context, allowStale });
    let touchContext: Record<string, unknown> = {};
    if (!result.isError && ['code_orient', 'code_graph', 'code_surface', 'code_analysis'].includes(family)) {
      try {
        const touches = collectBoundedGraphTouches(result, args);
        touchContext = {
          ...(touches.entityIds.length ? { touchedEntityIds: touches.entityIds } : {}),
          ...(touches.edgeIds.length ? { touchedEdgeIds: touches.edgeIds } : {}),
        };
      } catch {
        touchContext = {};
      }
    }
    activityTracker.record(
      'CODE_INTELLIGENCE',
      result.isError ? 'info' : 'success',
      result.isError ? `${family} provider operation failed` : `${family} completed`,
      result.isError ? 'code-intelligence-tool-failure' : 'code-intelligence-tool',
      {
        family,
        action,
        providerTool,
        workspace: context.workspace ?? '',
        ref: context.ref ?? '',
        durationMs: Date.now() - started,
        ...touchContext,
      },
    );
    return externalControllerToolResult({
      service: externalController,
      sessionId: externalSessionId,
      tool: family,
      args,
      result: result as any,
      readOnly: ['code_orient', 'code_graph', 'code_surface', 'code_analysis'].includes(family),
      ...(context.workspace ? { workspace: context.workspace } : {}),
    });
  } catch (error) {
    activityTracker.record(
      'CODE_INTELLIGENCE',
      'info',
      `${family} unavailable`,
      'code-intelligence-tool-failure',
      {
        family,
        action,
        providerTool,
        workspace: context.workspace ?? '',
        ref: context.ref ?? '',
        durationMs: Date.now() - started,
        errorFamily: compactErrorFamily(error),
      },
    );
    return externalControllerToolResult({
      service: externalController,
      sessionId: externalSessionId,
      tool: family,
      args,
      result: errorResult(error instanceof Error ? error.message : String(error)),
      readOnly: ['code_orient', 'code_graph', 'code_surface', 'code_analysis'].includes(family),
      ...(context.workspace ? { workspace: context.workspace } : {}),
    });
  }
}

export function registerCodeIntelligenceTools(
  server: McpServer,
  service: CodeIntelligenceService,
  semanticIde?: SemanticIdeService,
  externalController?: ExternalControllerLearningService,
  externalSessionId?: string,
): void {
  const providerCall = (
    serviceArg: CodeIntelligenceService,
    family: string,
    action: string,
    providerTool: string,
    args: Record<string, unknown>,
    context: ReturnType<typeof contextFromInput>,
    allowStale = false,
  ) => runProvider(
    serviceArg, family, action, providerTool, args, context, allowStale,
    externalController, externalSessionId,
  );

  server.registerTool('code_orient', {
    title: 'Code Intelligence Orient',
    description: 'Structural code orientation, freshness, diagnostics, quarantine visibility, entity discovery, and inspection backed by project-local Grafel. Source files remain authoritative.',
    inputSchema: schemas.codeOrient.shape,
    annotations: { title: 'Code Intelligence Orient', readOnlyHint: true, openWorldHint: false },
  }, async (args: any) => {
    const input = schemas.codeOrient.parse(args);
    const context = contextFromInput(input);

    if (input.action === 'status') {
      if (input.workspace || input.ref || input.worktreePath || input.repoFilter?.length) {
        return textResult(await service.workspaceStatus(context));
      }
      return textResult(await service.health(true));
    }
    if (input.action === 'diagnostics') return textResult(await service.diagnostics(context));
    if (input.action === 'quarantine') return textResult(await service.quarantine(context));
    if (input.action === 'metrics') {
      return textResult(await service.providerMetrics({
        ...context,
        ...(input.metricsDays !== undefined ? { days: input.metricsDays } : {}),
        ...(input.metricsLimit !== undefined ? { limit: input.metricsLimit } : {}),
      }));
    }

    if (input.action === 'find') {
      if (!input.query) return errorResult('query is required for action=find');
      return providerCall(service, 'code_orient', input.action, 'grafel_find', providerArgs(input.params, {
        query: input.query,
        ...(input.search ? { search: input.search } : {}),
        ...(input.kind ? { kind_filter: input.kind } : {}),
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.fields?.length ? { fields: input.fields } : {}),
        ...(input.contextFilter?.length ? { context_filter: input.contextFilter } : {}),
        ...(input.crossRepo !== undefined ? { cross_repo: input.crossRepo } : {}),
        ...(input.minConfidence !== undefined ? { min_confidence: input.minConfidence } : {}),
        ...(input.depth !== undefined ? { depth: input.depth } : {}),
        ...(input.tokenBudget !== undefined ? { token_budget: input.tokenBudget } : {}),
        ...(input.repoFilter ? { repo_filter: input.repoFilter } : {}),
      }), context);
    }

    if (input.action === 'inspect') {
      if (!input.entityId) return errorResult('entityId is required for action=inspect');
      return providerCall(service, 'code_orient', input.action, 'grafel_inspect', providerArgs(input.params, {
        entity_id: input.entityId,
        ...(input.fields?.length ? { fields: input.fields } : {}),
        ...(input.includeUnresolved !== undefined ? { include_unresolved: input.includeUnresolved } : {}),
        ...(input.includeFacet ? { include: input.includeFacet } : {}),
        ...(input.minConfidence !== undefined ? { min_confidence: input.minConfidence } : {}),
        ...(input.repoFilter ? { repo_filter: input.repoFilter } : {}),
      }), context);
    }

    return providerCall(service, 'code_orient', input.action, 'grafel_orient', providerArgs(input.params, {
      view: input.action,
      ...(input.tokenBudget !== undefined ? { token_budget: input.tokenBudget } : {}),
      ...(input.repoFilter ? { repo_filter: input.repoFilter } : {}),
    }), context);
  });

  server.registerTool('code_graph', {
    title: 'Code Intelligence Graph',
    description: 'Navigate callers/callees/uses, paths, bounded subgraphs, and data/control/def-use/effect traces in a request-scoped workspace/ref graph.',
    inputSchema: schemas.codeGraph.shape,
    annotations: { title: 'Code Intelligence Graph', readOnlyHint: true, openWorldHint: false },
  }, async (args: any) => {
    const input = schemas.codeGraph.parse(args);
    const context = contextFromInput(input);

    if (input.action === 'related') {
      if (!input.entityId) return errorResult('entityId is required for action=related');
      return providerCall(service, 'code_graph', input.action, 'grafel_related', providerArgs(input.params, {
        entity_id: input.entityId,
        ...(input.direction ? { direction: input.direction } : {}),
        ...(input.depth !== undefined ? { depth: input.depth } : {}),
        ...(input.tokenBudget !== undefined ? { token_budget: input.tokenBudget } : {}),
        ...(input.repoFilter ? { repo_filter: input.repoFilter } : {}),
      }), context);
    }
    if (input.action === 'paths') {
      if (!input.from || !input.to) return errorResult('from and to are required for action=paths');
      return providerCall(service, 'code_graph', input.action, 'grafel_find_paths', providerArgs(input.params, {
        from: input.from,
        to: input.to,
        ...(input.maxHops !== undefined ? { max_hops: input.maxHops } : {}),
      }), context);
    }
    if (input.action === 'subgraph') {
      if (!input.entityId) return errorResult('entityId is required for action=subgraph');
      return providerCall(service, 'code_graph', input.action, 'grafel_subgraph', providerArgs(input.params, {
        entity_id: input.entityId,
        ...(input.depth !== undefined ? { depth: input.depth } : {}),
        ...(input.maxNodes !== undefined ? { max_nodes: input.maxNodes } : {}),
      }), context);
    }

    const traceKind = input.kind ?? 'effects';
    if (traceKind === 'path' || traceKind === 'data') {
      const source = input.source ?? input.from;
      const target = input.target ?? input.to;
      if (!source) return errorResult(`source or from is required for action=trace kind=${traceKind}`);
      if (traceKind === 'path' && !target) return errorResult('target or to is required for action=trace kind=path');
      return providerCall(service, 'code_graph', input.action, 'grafel_trace', providerArgs(input.params, {
        kind: traceKind,
        source,
        ...(target ? { target } : {}),
        ...(input.repoFilter ? { repo_filter: input.repoFilter } : {}),
      }), context);
    }
    const entityId = input.entityId ?? input.target ?? input.to;
    if (!entityId) return errorResult(`entityId, target, or to is required for action=trace kind=${traceKind}`);
    return providerCall(service, 'code_graph', input.action, 'grafel_trace', providerArgs(input.params, {
      kind: traceKind,
      entity_id: entityId,
      ...(input.repoFilter ? { repo_filter: input.repoFilter } : {}),
    }), context);
  });

  server.registerTool('code_surface', {
    title: 'Code Intelligence Surface',
    description: 'Inspect API surfaces, cross-repo links, change impact, and graph-aware diffs in a request-scoped workspace/ref. Cross-link mutation is not exposed.',
    inputSchema: schemas.codeSurface.shape,
    annotations: { title: 'Code Intelligence Surface', readOnlyHint: true, openWorldHint: false },
  }, async (args: any) => {
    const input = schemas.codeSurface.parse(args);
    const context = contextFromInput(input);

    if (input.action === 'endpoints') {
      return providerCall(service, 'code_surface', input.action, 'grafel_endpoints', providerArgs(input.params, {
        action: input.endpointAction ?? 'definitions',
        ...(input.detail ? { detail: input.detail } : {}),
        ...(input.entityId ? { entity_id: input.entityId } : {}),
        ...(input.repoFilter ? { repo_filter: input.repoFilter } : {}),
      }), context);
    }
    if (input.action === 'cross_links') {
      return providerCall(service, 'code_surface', input.action, 'grafel_cross_links', providerArgs(input.params, {
        action: 'list',
      }), context);
    }
    if (input.action === 'impact') {
      const scope = input.scope ?? (input.entityId ? 'entity' : 'changeset');
      if (scope === 'entity' && !input.entityId) return errorResult('entityId is required for entity impact');
      if (scope === 'changeset' && !input.repo) return errorResult('repo is required for changeset impact');
      const providerResult = await runProvider(
        service,
        'code_surface',
        input.action,
        'grafel_impact_radius',
        providerArgs(input.params, {
          scope,
          ...(input.entityId ? { entity_id: input.entityId } : {}),
          ...(input.repo ? { repo: input.repo } : {}),
          ...(input.base ? { base: input.base } : {}),
          ...(input.head ? { head: input.head } : {}),
        }),
        context,
      ) as CallToolResult;
      if (scope === 'entity' || providerResult.isError) return providerResult as any;

      const structuralImpact = parseCallToolResultJson(providerResult);
      try {
        const reviewContext = await service.resolveWorkspace({
          ...context,
          repoFilter: [input.repo!],
        });
        const reviewEvidence = await buildChangedSymbolReview({
          service,
          semanticIde,
          context: reviewContext,
          repo: input.repo!,
          root: reviewContext.worktreePath ?? reviewContext.cwd,
          ...(input.base ? { base: input.base } : {}),
          ...(input.head ? { head: input.head } : {}),
        });
        const base = structuralImpact && typeof structuralImpact === 'object' && !Array.isArray(structuralImpact)
          ? structuralImpact as Record<string, unknown>
          : { structuralImpact };
        return textResult({ ...base, reviewEvidence });
      } catch (error) {
        const base = structuralImpact && typeof structuralImpact === 'object' && !Array.isArray(structuralImpact)
          ? structuralImpact as Record<string, unknown>
          : { structuralImpact };
        return textResult({
          ...base,
          reviewEvidence: {
            status: 'unavailable',
            reason: error instanceof Error ? error.message : String(error),
            sourceAuthority: 'exact-source+semantic-ide+grafel',
          },
        });
      }
    }

    const aspect = input.aspect ?? 'refs';
    if (aspect === 'refs') {
      const refA = input.refA ?? input.base;
      const refB = input.refB ?? input.head;
      if (!input.repo || !refA || !refB) return errorResult('repo plus refA/refB (or base/head) are required for diff aspect=refs');
      return providerCall(service, 'code_surface', input.action, 'grafel_diff', providerArgs(input.params, {
        aspect,
        repo: input.repo,
        ref_a: refA,
        ref_b: refB,
      }), context);
    }
    if (aspect === 'payload') {
      return providerCall(service, 'code_surface', input.action, 'grafel_diff', providerArgs(input.params, { aspect }), context);
    }
    if (!input.groupOracle || !input.groupV3) return errorResult(`groupOracle and groupV3 are required for diff aspect=${aspect}`);
    if (aspect === 'literals' && !input.set) return errorResult('set is required for diff aspect=literals');
    return providerCall(service, 'code_surface', input.action, 'grafel_diff', providerArgs(input.params, {
      aspect,
      group_oracle: input.groupOracle,
      group_v3: input.groupV3,
      ...(input.set ? { set: input.set } : {}),
    }), context);
  });

  server.registerTool('code_analysis', {
    title: 'Code Intelligence Analysis',
    description: 'On-demand structural debt, security, tests, or architectural-fitness analysis. Provider debt/security findings are advisory evidence: verify exact current source/callers before deletion, vulnerability claims, or architectural conclusions. Fitness violations are evidence and never an execution gate.',
    inputSchema: schemas.codeAnalysis.shape,
    annotations: { title: 'Code Intelligence Analysis', readOnlyHint: true, openWorldHint: false },
  }, async (args: any) => {
    const input = schemas.codeAnalysis.parse(args);
    const context = contextFromInput(input);
    const allowedAnalysis: Record<'debt' | 'security' | 'tests', readonly string[]> = {
      debt: ['dead_code', 'find_dead_code', 'cycles', 'import_cycles', 'stubs', 'impure', 'license'],
      security: ['findings', 'secrets', 'auth_coverage', 'changed_source'],
      tests: ['coverage', 'reachability', 'contract_effectiveness', 'coverage_effectiveness'],
    };
    if (input.kind === 'fitness') {
      if (input.analysisPreset) return errorResult('analysisPreset is not used for kind=fitness');
      try {
        return textResult(await service.runFitness({
          ...context,
          ...(input.repo ? { repo: input.repo } : {}),
          ...(input.strict !== undefined ? { strict: input.strict } : {}),
        }));
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }

    if (input.analysisPreset && !allowedAnalysis[input.kind].includes(input.analysisPreset)) {
      return errorResult(`analysisPreset=${input.analysisPreset} is invalid for kind=${input.kind}; valid values: ${allowedAnalysis[input.kind].join(', ')}`);
    }
    if (input.kind === 'security' && input.analysisPreset === 'changed_source') {
      if (!input.worktreePath) return errorResult('worktreePath is required for security changed_source analysis');
      if (!input.changedFiles?.length) return errorResult('changedFiles is required for security changed_source analysis');
      try {
        const scan = await scanChangedSourceSecurity({
          root: input.worktreePath,
          files: input.changedFiles,
          rules: input.securityRules,
        });
        activityTracker.recordOutcome('CODE_INTELLIGENCE', 'success', 'Deterministic changed-source security advisory completed', {
          featureId: 'code.security.changed-source',
          outcome: scan.findings.length ? 'findings' : 'clean',
          properties: { filesScanned: scan.filesScanned, findings: scan.findings.length, resolved: scan.resolved.length },
        }, 'code-security-advisory', { workspace: context.workspace ?? '', ref: context.ref ?? '' });
        return textResult(scan);
      } catch (error) {
        activityTracker.recordOutcome('CODE_INTELLIGENCE', 'warn', 'Deterministic changed-source security advisory unavailable', {
          featureId: 'code.security.changed-source', outcome: 'unavailable',
        }, 'code-security-advisory');
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
    const providerTool = input.kind === 'debt'
      ? 'grafel_debt'
      : input.kind === 'security'
        ? 'grafel_security'
        : 'grafel_test_analysis';
    const discriminator = input.analysisPreset ?? input.analysis ?? (input.kind === 'debt' ? 'dead_code' : input.kind === 'security' ? 'findings' : 'coverage');
    return providerCall(service, 'code_analysis', input.kind, providerTool, providerArgs(input.params, {
      kind: discriminator,
      ...(input.kind === 'security' && input.minConfidence !== undefined
        ? { min_confidence: input.minConfidence }
        : {}),
      ...(input.repoFilter ? { repo_filter: input.repoFilter } : {}),
    }), context);
  });

  server.registerTool('code_patterns', {
    title: 'Code Intelligence Patterns',
    description: 'Query or manage codebase-scoped implementation recipes grounded in Grafel entities. record uses a natural-language trigger plus real Grafel entity exemplars; legacy text remains a trigger shorthand. Generic operational lessons remain in Agent Core Memory.',
    inputSchema: schemas.codePatterns.shape,
    annotations: { title: 'Code Intelligence Patterns', readOnlyHint: false, openWorldHint: false },
  }, async (args: any) => {
    const input = schemas.codePatterns.parse(args);
    const context = contextFromInput(input);
    const patternKind = input.kind ?? 'code';

    if (patternKind === 'graph') {
      if (input.action !== 'list' && input.action !== 'get') {
        return errorResult('kind=graph is read-only and supports action=list|get');
      }
      if (input.action === 'get' && !input.patternId) return errorResult('patternId is required for kind=graph action=get');
      return providerCall(service, 'code_patterns', input.action, 'grafel_patterns', providerArgs(input.params, {
        kind: 'graph',
        action: input.action,
        ...(input.patternId ? { pattern_id: input.patternId } : {}),
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
      }), context);
    }

    if (patternKind === 'template') {
      if (input.action !== 'list' && input.action !== 'query') {
        return errorResult('kind=template is read-only; provider supports list/query enumeration but no stable get id');
      }
      return providerCall(service, 'code_patterns', input.action, 'grafel_patterns', providerArgs(input.params, {
        kind: 'template',
        ...(input.literalKind ? { literal_kind: input.literalKind } : {}),
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.repoFilter ? { repo_filter: input.repoFilter } : {}),
      }), context);
    }

    if (input.action === 'list') return errorResult('kind=code does not expose list; use action=query with text');
    const base: Record<string, unknown> = { kind: 'code', action: input.action };

    if (input.action === 'query') {
      if (!input.text) return errorResult('text is required for action=query');
      Object.assign(base, {
        text: input.text,
        ...(input.category ? { category: input.category } : {}),
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.includePrivate !== undefined ? { include_private: input.includePrivate } : {}),
      });
    } else if (input.action === 'record') {
      const naturalLanguage = input.trigger?.naturalLanguage ?? input.text;
      if (!naturalLanguage || !input.steps?.length || !input.exemplars?.length) {
        return errorResult('trigger.naturalLanguage (or legacy text), steps, and Grafel entity exemplars are required for action=record');
      }
      Object.assign(base, {
        trigger: {
          natural_language: naturalLanguage,
          ...(input.trigger?.keywords?.length ? { keywords: input.trigger.keywords } : {}),
          ...(input.trigger?.targetEntityKinds?.length ? { target_entity_kinds: input.trigger.targetEntityKinds } : {}),
        },
        steps: input.steps,
        exemplars: input.exemplars,
        category: input.category ?? 'code',
      });
    } else if (input.action === 'get') {
      if (!input.patternId) return errorResult('patternId is required for action=get');
      Object.assign(base, { pattern_id: input.patternId, ...(input.includePrivate !== undefined ? { include_private: input.includePrivate } : {}) });
    } else if (input.action === 'refine') {
      if (!input.patternId || !input.changes) return errorResult('patternId and changes are required for action=refine');
      Object.assign(base, { pattern_id: input.patternId, changes: input.changes });
    } else if (input.action === 'apply') {
      if (!input.patternId || input.success === undefined) return errorResult('patternId and success are required for action=apply');
      Object.assign(base, { pattern_id: input.patternId, success: input.success, ...(input.createdEntities ? { created_entities: input.createdEntities } : {}) });
    } else if (input.action === 'reject') {
      if (!input.patternId || !input.reason) return errorResult('patternId and reason are required for action=reject');
      Object.assign(base, { pattern_id: input.patternId, reason: input.reason, ...(input.setToZero !== undefined ? { set_to_zero: input.setToZero } : {}) });
    } else if (input.action === 'promote') {
      if (!input.candidateId) return errorResult('candidateId is required for action=promote');
      Object.assign(base, { candidate_id: input.candidateId, ...(input.approvalNote !== undefined ? { approval_note: input.approvalNote } : {}) });
    }

    return providerCall(
      service,
      'code_patterns',
      input.action,
      'grafel_patterns',
      providerArgs(input.params, base),
      context,
      input.action !== 'query' && input.action !== 'get',
    );
  });

  server.registerTool('code_workspace', {
    title: 'Code Intelligence Workspace',
    description: 'Resolve, register, inspect, index, and list refs for request-scoped Grafel workspaces. Registration/index are explicit mutations; no drive discovery or external AI-host mutation occurs.',
    inputSchema: schemas.codeWorkspace.shape,
    annotations: { title: 'Code Intelligence Workspace', readOnlyHint: false, openWorldHint: false },
  }, async (args: any) => {
    const input = schemas.codeWorkspace.parse(args);
    try {
      if (input.action === 'list') return textResult(await service.listWorkspaces());
      if (input.action === 'resolve') {
        const contextInput = contextFromInput(input);
        if (input.path && !input.workspace && !input.worktreePath) {
          try {
            return textResult({ registered: true, context: await service.resolveWorkspace({ ...contextInput, worktreePath: input.path }) });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!message.startsWith('CODE_WORKSPACE_NOT_REGISTERED')) throw error;
            return textResult({
              registered: false,
              preview: await service.previewWorkspaceRegistration({
                path: input.path,
                ...(input.group ? { group: input.group } : {}),
                ...(input.allowProtectedPath !== undefined ? { allowProtectedPath: input.allowProtectedPath } : {}),
              }),
            });
          }
        }
        return textResult({ registered: true, context: await service.resolveWorkspace(contextInput) });
      }
      if (input.action === 'register') {
        return textResult(await service.registerWorkspace({
          ...(input.path ? { path: input.path } : {}),
          ...(input.group ? { group: input.group } : {}),
          ...(input.repos ? { repos: input.repos } : {}),
          ...(input.trackWorktrees !== undefined ? { trackWorktrees: input.trackWorktrees } : {}),
          ...(input.allowRepoMarker !== undefined ? { allowRepoMarker: input.allowRepoMarker } : {}),
          ...(input.allowProtectedPath !== undefined ? { allowProtectedPath: input.allowProtectedPath } : {}),
        }));
      }
      if (input.action === 'unregister') {
        if (!input.workspace) return errorResult('workspace is required for action=unregister');
        return textResult(await service.unregisterWorkspace({
          workspace: input.workspace,
          ...(input.confirmation ? { confirmation: input.confirmation } : {}),
        }));
      }
      if (input.action === 'prune_workspaces') {
        return textResult(await service.pruneWorkspaces({
          ...(input.apply !== undefined ? { apply: input.apply } : {}),
          ...(input.confirmation ? { confirmation: input.confirmation } : {}),
        }));
      }

      const context = {
        ...contextFromInput(input),
        ...(input.path && !input.worktreePath ? { worktreePath: input.path } : {}),
      };
      if (input.action === 'status') return textResult(await service.workspaceStatus(context));
      if (input.action === 'index') return textResult(await service.indexWorkspace(context));
      if (input.action === 'refs') return textResult(await service.workspaceRefs(context));
      if (input.action === 'pin_ref' || input.action === 'unpin_ref') {
        if (!input.repo || !input.targetRef) {
          return errorResult('repo and targetRef are required for pin_ref/unpin_ref');
        }
        return textResult(await service.setWorkspaceRefPin({
          ...context,
          repo: input.repo,
          targetRef: input.targetRef,
          pinned: input.action === 'pin_ref',
        }));
      }
      if (input.action === 'prune_refs') {
        return textResult(await service.pruneWorkspaceRefs({
          ...context,
          ...(input.ttl ? { ttl: input.ttl } : {}),
          ...(input.apply !== undefined ? { apply: input.apply } : {}),
          ...(input.confirmation ? { confirmation: input.confirmation } : {}),
        }));
      }
      return errorResult('unsupported code_workspace action');
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : String(error));
    }
  });

  server.registerTool('code_repair', {
    title: 'Code Intelligence Repair',
    description: 'List, inspect, explicitly resolve, or abandon Grafel residual-edge candidates. Mutations require source verification and provider validation; reindex is separate.',
    inputSchema: schemas.codeRepair.shape,
    annotations: { title: 'Code Intelligence Repair', readOnlyHint: false, openWorldHint: false },
  }, async (args: any) => {
    const input = schemas.codeRepair.parse(args);
    const context = contextFromInput(input);

    try {
      if (
        input.action === 'quarantine_remove'
        || input.action === 'quarantine_pin'
        || input.action === 'quarantine_unpin'
      ) {
        if (!input.repo || !input.quarantinePath) {
          return errorResult('repo and quarantinePath are required for quarantine mutation');
        }
        if (input.confirmation !== 'QUARANTINE_MUTATION') {
          return errorResult('confirmation=QUARANTINE_MUTATION is required for quarantine mutation');
        }
        const action = input.action === 'quarantine_remove'
          ? 'remove'
          : input.action === 'quarantine_pin'
            ? 'pin'
            : 'unpin';
        return textResult(await service.mutateQuarantine({
          ...context,
          action,
          repo: input.repo,
          relativePath: input.quarantinePath,
          confirmation: input.confirmation,
        }));
      }

      const candidateType = input.candidateType ?? 'residual';

      if (candidateType === 'cross_link') {
        const listCrossLinks = async () => service.callProviderTool('grafel_cross_links', {
          action: 'list',
          ...(input.repoFilter ? { repo_filter: input.repoFilter } : {}),
          ...(input.limit !== undefined ? { limit: input.limit } : { limit: 100 }),
        }, { context, allowStale: true });

        if (input.action === 'list') return listCrossLinks() as any;

        if (input.action === 'inspect') {
          if (!input.candidateId) return errorResult('candidateId is required for cross_link inspect');
          const result = await listCrossLinks();
          if (result.isError) return result as any;
          const payload = parseCallToolResultJson(result);
          const rows = Array.isArray(payload) ? payload as Array<Record<string, unknown>> : [];
          const candidate = rows.find(item => String(item.id ?? item.candidate_id ?? '') === input.candidateId);
          if (!candidate) return errorResult('cross-link candidate not found in bounded list');
          return textResult({
            candidate,
            sourceVerificationRequiredBeforeDecision: true,
            targetVerificationRequiredBeforeAccept: true,
            sourceAuthority: 'Agent Core exact current source/graph verification',
          });
        }

        if (input.action !== 'accept' && input.action !== 'reject') {
          return errorResult('cross_link supports action=list|inspect|accept|reject');
        }
        if (!input.candidateId) return errorResult(`candidateId is required for cross_link ${input.action}`);
        if (input.sourceVerified !== true) return errorResult('sourceVerified=true is required before cross-link mutation');

        if (input.action === 'accept') {
          if (input.targetVerified !== true) return errorResult('targetVerified=true is required before cross-link accept');
          return providerCall(service, 'code_repair', 'cross_link_accept', 'grafel_cross_links', {
            action: 'accept',
            candidate_id: input.candidateId,
            ...(input.overrideTarget ? { override_target: input.overrideTarget } : {}),
          }, context, true);
        }

        if (!input.reason) return errorResult('reason is required for cross-link reject');
        return providerCall(service, 'code_repair', 'cross_link_reject', 'grafel_cross_links', {
          action: 'reject',
          candidate_id: input.candidateId,
          reason: input.reason,
        }, context, true);
      }

      if (candidateType === 'enrichment') {
        const listEnrichments = async () => service.callProviderTool('grafel_docgen_apply', {
          kind: 'enrichments',
          action: 'list',
          ...(input.repoFilter ? { repo_filter: input.repoFilter } : {}),
          ...(input.candidateKind ? { candidate_kind: input.candidateKind } : {}),
          ...(input.limit !== undefined ? { limit: input.limit } : { limit: 100 }),
        }, { context, allowStale: true });

        if (input.action === 'list') return listEnrichments() as any;

        if (input.action === 'inspect') {
          if (!input.candidateId) return errorResult('candidateId is required for enrichment inspect');
          const result = await listEnrichments();
          if (result.isError) return result as any;
          const payload = parseCallToolResultJson(result);
          const rows = Array.isArray(payload) ? payload as Array<Record<string, unknown>> : [];
          const candidate = rows.find(item => String(item.id ?? item.candidate_id ?? '') === input.candidateId);
          if (!candidate) return errorResult('enrichment candidate not found in bounded list');
          return textResult({
            candidate,
            verificationRequiredBeforeDecision: true,
            sourceAuthority: 'Agent Core exact current source or graph-backed verification',
          });
        }

        if (input.action !== 'submit' && input.action !== 'reject') {
          return errorResult('enrichment supports action=list|inspect|submit|reject');
        }
        if (!input.candidateId) return errorResult(`candidateId is required for enrichment ${input.action}`);
        if (input.sourceVerified !== true) return errorResult('sourceVerified=true is required before enrichment mutation');

        if (input.action === 'submit') {
          if (!input.value) return errorResult('value is required for enrichment submit');
          if (!input.reasoning) return errorResult('reasoning is required for enrichment submit');
          if (input.confidence === undefined) return errorResult('confidence is required explicitly for enrichment submit');
          return providerCall(service, 'code_repair', 'enrichment_submit', 'grafel_docgen_apply', {
            kind: 'enrichments',
            action: 'submit',
            candidate_id: input.candidateId,
            value: input.value,
            confidence: input.confidence,
            reason: input.reasoning,
          }, context, true);
        }

        if (!input.reason) return errorResult('reason is required for enrichment reject');
        return providerCall(service, 'code_repair', 'enrichment_reject', 'grafel_docgen_apply', {
          kind: 'enrichments',
          action: 'reject',
          candidate_id: input.candidateId,
          reason: input.reason,
        }, context, true);
      }

      if (input.action === 'accept' || input.action === 'reject') {
        return errorResult('candidateType=residual does not support accept/reject');
      }

      if (input.action === 'list') {
        return service.listRepairs({
          ...context,
          ...(input.repoFilter ? { repoFilter: input.repoFilter } : {}),
          ...(input.limit !== undefined ? { limit: input.limit } : {}),
          ...(input.offset !== undefined ? { offset: input.offset } : {}),
        }) as any;
      }

      if (input.action === 'inspect') {
        if (!input.candidateId) return errorResult('candidateId is required for action=inspect');
        const result = await service.listRepairs({
          ...context,
          ...(input.repoFilter ? { repoFilter: input.repoFilter } : {}),
          limit: input.limit ?? 100,
          offset: input.offset ?? 0,
        });
        if (result.isError) return result as any;
        const payload = parseCallToolResultJson(result) as { residuals?: Array<Record<string, unknown>>; total?: number } | null;
        const candidate = payload?.residuals?.find(item => String(item.residual_id ?? item.id ?? '') === input.candidateId);
        if (!candidate) {
          return errorResult(`candidate not found in bounded page; total=${payload?.total ?? 'unknown'} offset=${input.offset ?? 0}`);
        }
        return textResult({
          candidate,
          sourceVerificationRequiredBeforeSubmit: true,
          targetVerificationRequiredForBindToEntity: true,
          sourceAuthority: 'Agent Core exact current file read/search, not provider source snippets',
        });
      }

      if (!input.candidateId) return errorResult(`candidateId is required for action=${input.action}`);
      if (input.sourceVerified !== true) return errorResult('sourceVerified=true is required after exact current-source inspection');

      if (input.action === 'abandon') {
        if (!input.reason) return errorResult('reason is required for action=abandon');
        const result = await service.submitRepair({
          ...context,
          residualId: input.candidateId,
          resolution: 'abandon',
          reason: input.reason,
          confidence: input.confidence ?? 1,
          ...(input.repo ? { repo: input.repo } : {}),
        });
        if (result.isError) return result as any;
        return textResult({ provider: parseCallToolResultJson(result), requiresReindex: true });
      }

      if (!input.resolution) return errorResult('resolution is required for action=submit');
      if (!input.reasoning) return errorResult('reasoning is required for action=submit');
      if (input.resolution === 'bind_to_entity') {
        if (!input.targetEntityId) return errorResult('targetEntityId is required for bind_to_entity');
        if (input.targetVerified !== true) return errorResult('targetVerified=true is required for bind_to_entity after exact target verification');
      }
      if (input.resolution === 'reclassify_as_external' && !input.module) return errorResult('module is required for reclassify_as_external');
      if (input.resolution === 'reclassify_as_dynamic' && !input.reasoning) return errorResult('reasoning is required for reclassify_as_dynamic');
      if (input.resolution === 'reclassify_as_resolved' && !input.newTarget) return errorResult('newTarget is required for reclassify_as_resolved');

      const result = await service.submitRepair({
        ...context,
        residualId: input.candidateId,
        resolution: input.resolution,
        ...(input.targetEntityId ? { targetEntityId: input.targetEntityId } : {}),
        ...(input.newTarget ? { newTarget: input.newTarget } : {}),
        ...(input.module ? { module: input.module } : {}),
        reasoning: input.reasoning,
        confidence: input.confidence ?? 1,
        ...(input.repo ? { repo: input.repo } : {}),
      });
      if (result.isError) return result as any;
      return textResult({ provider: parseCallToolResultJson(result), requiresReindex: true });
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : String(error));
    }
  });
}
