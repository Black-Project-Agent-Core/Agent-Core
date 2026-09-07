import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { VerifiedKey } from '../auth/key-types.js';
import { LangflowFabricError } from '../langflow/errors.js';
import { classifyMeaningfulWork } from '../memory/meaningful-work.js';
import { OperationalMemoryAudit } from '../memory/operational-audit.js';
import { AgentCoreRouteError, type RouteContext } from '../runtime/route-context-store.js';
import type { RuntimeServices } from '../runtime/services.js';
import { completeMemoryLifecycleOperation, validateMemoryLifecycleBeforeOperation } from './memory-lifecycle-guard.js';
import { resolveAuditProjectId } from './project-scope.js';
import { routeErrorResult, validateOperationalRoute } from './route-guard.js';

const ROUTE_REQUIRED_DESCRIPTION = 'Obtain routeContextId from capability_route before using this tool.';
const routedDescription = (description: string) => `${description} ${ROUTE_REQUIRED_DESCRIPTION}`;

export const LANGFLOW_TOOL_NAMES = [
  'langflow_status',
  'langflow_projects',
  'langflow_flows',
  'langflow_components',
  'langflow_flow_create',
  'langflow_flow_update',
  'langflow_graph_add_node',
  'langflow_graph_connect',
  'langflow_run',
] as const;

function textResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function errorResult(error: unknown) {
  if (error instanceof LangflowFabricError || error instanceof AgentCoreRouteError) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({
        error: {
          code: error.code,
          message: error.message,
          ...('details' in error && error.details ? { details: error.details } : {}),
        },
      }, null, 2) }],
      isError: true as const,
    };
  }
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({
      error: {
        code: 'LANGFLOW_FABRIC_ERROR',
        message: error instanceof Error ? error.message : String(error),
      },
    }, null, 2) }],
    isError: true as const,
  };
}

function safeAuditInput(toolName: string, input: Record<string, unknown>): Record<string, unknown> {
  if (toolName === 'langflow_run') {
    return {
      flowIdOrName: input.flowIdOrName,
      hasInputValue: typeof input.inputValue === 'string',
      hasTweaks: input.tweaks !== undefined,
      hasSessionId: typeof input.sessionId === 'string',
    };
  }
  if (toolName === 'langflow_flow_create') {
    return {
      name: input.name,
      projectId: input.projectId,
      hasDescription: typeof input.description === 'string',
      endpointName: input.endpointName,
    };
  }
  if (toolName === 'langflow_flow_update') {
    return {
      flowId: input.flowId,
      changesName: typeof input.name === 'string',
      changesDescription: typeof input.description === 'string',
      changesProject: typeof input.projectId === 'string',
      changesEndpoint: typeof input.endpointName === 'string',
      changesGraph: input.data !== undefined,
    };
  }
  if (toolName === 'langflow_graph_add_node') {
    return {
      flowId: input.flowId,
      componentName: input.componentName,
      category: input.category,
      nodeId: input.nodeId,
      x: input.x,
      y: input.y,
    };
  }
  if (toolName === 'langflow_graph_connect') {
    return {
      flowId: input.flowId,
      sourceNodeId: input.sourceNodeId,
      sourceOutputName: input.sourceOutputName,
      targetNodeId: input.targetNodeId,
      targetInputName: input.targetInputName,
    };
  }
  const output: Record<string, unknown> = {};
  if (typeof input.operation === 'string') output.operation = input.operation;
  if (typeof input.flowId === 'string') output.flowId = input.flowId;
  if (typeof input.category === 'string') output.category = input.category;
  return output;
}

function atomicReadOnly(route: RouteContext): boolean {
  return route.tier === 'atomic' && route.verification.required === false;
}

async function langflowRouteGuarded<T>(
  runtime: RuntimeServices,
  key: VerifiedKey,
  routeContextId: string,
  toolName: string,
  rawInput: Record<string, unknown>,
  operation: () => Promise<T>,
) {
  const audit = new OperationalMemoryAudit(runtime, key);
  const auditInput = safeAuditInput(toolName, rawInput);
  let route: RouteContext;
  let lifecycleDecision;
  try {
    route = validateOperationalRoute(runtime, key, routeContextId, toolName);
    const classification = classifyMeaningfulWork(toolName, rawInput);
    if (atomicReadOnly(route) && classification.meaningful) {
      throw new AgentCoreRouteError(
        'ROUTE_TOOL_NOT_ALLOWED',
        `Read-only route cannot perform a stateful Langflow operation through ${toolName}`,
      );
    }
    lifecycleDecision = await validateMemoryLifecycleBeforeOperation(runtime, key, route, toolName, rawInput);
  } catch (error) {
    await audit.rejected(resolveAuditProjectId(runtime, key, routeContextId), routeContextId, toolName, auditInput, error);
    return routeErrorResult(error) ?? errorResult(error);
  }

  await audit.intended(route, toolName, auditInput);
  try {
    const result = await operation();
    await completeMemoryLifecycleOperation(runtime, key, route, toolName, lifecycleDecision);
    await audit.succeeded(route, toolName, auditInput, result);
    return textResult(result);
  } catch (error) {
    await audit.failed(route, toolName, auditInput, error);
    return routeErrorResult(error) ?? errorResult(error);
  }
}

function requiredString(value: string | undefined, label: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new LangflowFabricError('LANGFLOW_VALIDATION_FAILED', `${label} is required.`);
  return trimmed;
}

function flowSummary(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { result: value };
  const flow = value as Record<string, unknown>;
  return {
    id: flow.id ?? null,
    name: flow.name ?? null,
    description: flow.description ?? null,
    folder_id: flow.folder_id ?? null,
    endpoint_name: flow.endpoint_name ?? null,
  };
}

export function registerLangflowTools(server: McpServer, runtime: RuntimeServices, key: VerifiedKey): void {
  server.registerTool('langflow_status', {
    title: 'Langflow Status',
    description: 'Check the configured local Langflow integration and loopback health endpoint without exposing credentials.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => {
    try { return textResult(await runtime.langflow.status()); }
    catch (error) { return errorResult(error); }
  });

  server.registerTool('langflow_projects', {
    title: 'Langflow Projects',
    description: routedDescription('List projects from the configured local Langflow instance.'),
    inputSchema: { routeContextId: z.string().uuid() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (input) => langflowRouteGuarded(
    runtime, key, input.routeContextId, 'langflow_projects', input, () => runtime.langflow.listProjects(),
  ));

  server.registerTool('langflow_flows', {
    title: 'Langflow Flows',
    description: routedDescription('List local Langflow flows or read one flow by ID.'),
    inputSchema: {
      operation: z.enum(['list', 'get']),
      flowId: z.string().optional(),
      routeContextId: z.string().uuid(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (input) => langflowRouteGuarded(
    runtime,
    key,
    input.routeContextId,
    'langflow_flows',
    input,
    () => input.operation === 'list'
      ? runtime.langflow.listFlows()
      : runtime.langflow.getFlow(requiredString(input.flowId, 'flowId')),
  ));

  server.registerTool('langflow_components', {
    title: 'Langflow Components',
    description: routedDescription('Read the local Langflow component catalog used to construct graph nodes.'),
    inputSchema: { routeContextId: z.string().uuid() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (input) => langflowRouteGuarded(
    runtime, key, input.routeContextId, 'langflow_components', input, () => runtime.langflow.listComponents(),
  ));

  server.registerTool('langflow_flow_create', {
    title: 'Create Langflow Flow',
    description: routedDescription('Create a new local Langflow flow with an empty graph unless graph data is explicitly supplied.'),
    inputSchema: {
      name: z.string().min(1).max(512),
      description: z.string().max(20_000).optional(),
      projectId: z.string().min(1).optional(),
      endpointName: z.string().min(1).max(512).optional(),
      data: z.object({
        nodes: z.array(z.record(z.string(), z.unknown())),
        edges: z.array(z.record(z.string(), z.unknown())),
      }).optional(),
      routeContextId: z.string().uuid(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (input) => langflowRouteGuarded(
    runtime,
    key,
    input.routeContextId,
    'langflow_flow_create',
    input,
    async () => flowSummary(await runtime.langflow.createFlow({
      name: input.name,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(input.endpointName !== undefined ? { endpointName: input.endpointName } : {}),
      ...(input.data !== undefined ? { data: input.data } : {}),
    })),
  ));

  server.registerTool('langflow_flow_update', {
    title: 'Update Langflow Flow',
    description: routedDescription('Update local Langflow flow metadata or replace its graph data through the official flow PATCH API.'),
    inputSchema: {
      flowId: z.string().min(1),
      name: z.string().min(1).max(512).optional(),
      description: z.string().max(20_000).optional(),
      projectId: z.string().min(1).optional(),
      endpointName: z.string().min(1).max(512).optional(),
      data: z.object({
        nodes: z.array(z.record(z.string(), z.unknown())),
        edges: z.array(z.record(z.string(), z.unknown())),
      }).optional(),
      routeContextId: z.string().uuid(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, async (input) => langflowRouteGuarded(
    runtime,
    key,
    input.routeContextId,
    'langflow_flow_update',
    input,
    async () => flowSummary(await runtime.langflow.updateFlow(input.flowId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(input.endpointName !== undefined ? { endpointName: input.endpointName } : {}),
      ...(input.data !== undefined ? { data: input.data } : {}),
    })),
  ));

  server.registerTool('langflow_graph_add_node', {
    title: 'Add Langflow Graph Node',
    description: routedDescription('Add a component from the local Langflow catalog to an existing flow and save the graph through the official PATCH API.'),
    inputSchema: {
      flowId: z.string().min(1),
      componentName: z.string().min(1).max(512),
      category: z.string().min(1).max(512).optional(),
      x: z.number().finite().optional(),
      y: z.number().finite().optional(),
      nodeId: z.string().min(1).max(512).optional(),
      routeContextId: z.string().uuid(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async (input) => langflowRouteGuarded(
    runtime,
    key,
    input.routeContextId,
    'langflow_graph_add_node',
    input,
    () => runtime.langflow.addComponentNode({
      flowId: input.flowId,
      componentName: input.componentName,
      ...(input.category !== undefined ? { category: input.category } : {}),
      position: { x: input.x ?? 0, y: input.y ?? 0 },
      ...(input.nodeId !== undefined ? { nodeId: input.nodeId } : {}),
    }),
  ));

  server.registerTool('langflow_graph_connect', {
    title: 'Connect Langflow Graph Nodes',
    description: routedDescription('Connect one named source output to one named target input in a local Langflow flow and save the graph.'),
    inputSchema: {
      flowId: z.string().min(1),
      sourceNodeId: z.string().min(1),
      sourceOutputName: z.string().min(1),
      targetNodeId: z.string().min(1),
      targetInputName: z.string().min(1),
      routeContextId: z.string().uuid(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async (input) => langflowRouteGuarded(
    runtime,
    key,
    input.routeContextId,
    'langflow_graph_connect',
    input,
    () => runtime.langflow.connectNodes({
      flowId: input.flowId,
      sourceNodeId: input.sourceNodeId,
      sourceOutputName: input.sourceOutputName,
      targetNodeId: input.targetNodeId,
      targetInputName: input.targetInputName,
    }),
  ));

  server.registerTool('langflow_run', {
    title: 'Run Langflow Flow',
    description: routedDescription('Execute one local Langflow flow by ID or endpoint name. The flow itself may call external models or tools, so execution is treated as stateful/open-world work.'),
    inputSchema: {
      flowIdOrName: z.string().min(1),
      inputValue: z.string().optional(),
      inputType: z.string().optional(),
      outputType: z.string().optional(),
      outputComponent: z.string().optional(),
      tweaks: z.record(z.string(), z.unknown()).optional(),
      sessionId: z.string().optional(),
      userId: z.string().optional(),
      routeContextId: z.string().uuid(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  }, async (input) => langflowRouteGuarded(
    runtime,
    key,
    input.routeContextId,
    'langflow_run',
    input,
    () => runtime.langflow.runFlow({
      flowIdOrName: input.flowIdOrName,
      ...(input.inputValue !== undefined ? { inputValue: input.inputValue } : {}),
      ...(input.inputType !== undefined ? { inputType: input.inputType } : {}),
      ...(input.outputType !== undefined ? { outputType: input.outputType } : {}),
      ...(input.outputComponent !== undefined ? { outputComponent: input.outputComponent } : {}),
      ...(input.tweaks !== undefined ? { tweaks: input.tweaks } : {}),
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
      ...(input.userId !== undefined ? { userId: input.userId } : {}),
    }),
  ));
}
