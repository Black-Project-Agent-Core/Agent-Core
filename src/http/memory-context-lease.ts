import type { IncomingMessage, ServerResponse } from 'node:http';
import { MemoryHardLifecycleError } from '../memory/hard-lifecycle.js';
import type { RuntimeServices } from '../runtime/services.js';
import { classifyWorkflowOperation, workflowOperationInput, workflowScope } from '../mcp/workflow-guard.js';
import { isEngineeringPath } from '../workflow/engineering-policy.js';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_LEASE_CHARS = 4096;
const MAX_TOOL_NAME_CHARS = 128;
const MAX_WORKSPACE_ROOT_CHARS = 4096;

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = `${JSON.stringify(body)}\n`;
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  response.end(payload);
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error('MEMORY_CONTEXT_LEASE_BODY_TOO_LARGE');
    chunks.push(buffer);
  }
  if (size === 0) throw new Error('MEMORY_CONTEXT_LEASE_BODY_REQUIRED');
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('MEMORY_CONTEXT_LEASE_JSON_INVALID');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('MEMORY_CONTEXT_LEASE_JSON_INVALID');
  return parsed as Record<string, unknown>;
}

function boundedString(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) throw new Error(`${label}_INVALID`);
  return value;
}

function safeInput(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('MEMORY_CONTEXT_LEASE_INPUT_INVALID');
  const input = value as Record<string, unknown>;
  if (typeof input.command === 'string' && input.command.length > 32_768) throw new Error('MEMORY_CONTEXT_LEASE_COMMAND_TOO_LARGE');
  return input;
}

function lifecycleFailureBody(code: 'MEMORY_PREFLIGHT_REQUIRED' | 'MEMORY_POSTFLIGHT_REQUIRED', message: string) {
  return { error: { code, message } };
}

export function createMemoryContextLeaseHttpHandler(runtime: RuntimeServices) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'method_not_allowed' });
      return;
    }

    let body: Record<string, unknown>;
    try {
      body = await readJson(request);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'MEMORY_CONTEXT_LEASE_REQUEST_INVALID';
      sendJson(response, code === 'MEMORY_CONTEXT_LEASE_BODY_TOO_LARGE' ? 413 : 400, { error: code });
      return;
    }

    const mode = runtime.memory.config.hardLifecycleMode;
    let action: 'before' | 'after';
    let toolName: string;
    let workspaceRoot: string;
    let input: Record<string, unknown>;
    let lease: string | undefined;
    try {
      action = boundedString(body.action, 'MEMORY_CONTEXT_LEASE_ACTION', 16) as 'before' | 'after';
      if (action !== 'before' && action !== 'after') throw new Error('MEMORY_CONTEXT_LEASE_ACTION_INVALID');
      toolName = boundedString(body.toolName, 'MEMORY_CONTEXT_LEASE_TOOL', MAX_TOOL_NAME_CHARS);
      workspaceRoot = boundedString(body.workspaceRoot, 'MEMORY_CONTEXT_LEASE_WORKSPACE', MAX_WORKSPACE_ROOT_CHARS);
      input = safeInput(body.input);
      if (body.lease !== undefined) lease = boundedString(body.lease, 'MEMORY_CONTEXT_LEASE_TOKEN', MAX_LEASE_CHARS);
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : 'MEMORY_CONTEXT_LEASE_REQUEST_INVALID' });
      return;
    }

    const classification = classifyWorkflowOperation(toolName, input);
    const base = {
      ok: true,
      mode,
      required: classification.meaningful && mode !== 'disabled',
      mutationClass: classification.mutationClass,
    };
    if (!classification.meaningful) {
      sendJson(response, 200, { ...base, valid: true });
      return;
    }

    const failureCode = action === 'after' ? 'MEMORY_POSTFLIGHT_REQUIRED' : 'MEMORY_PREFLIGHT_REQUIRED';
    if (!lease) {
      sendJson(response, 428, lifecycleFailureBody(failureCode, action === 'after'
          ? 'Meaningful workspace work completed but its memory postflight could not be recorded'
          : 'A valid Memory Context Lease is required before meaningful workspace work'));
      return;
    }

    try {
      if (action === 'before') {
        const authority = await runtime.memory.validateContextLease({ lease, workspaceRoot });
        const lifecycle = await runtime.memory.getLifecycleContext(authority.scope, authority.contextId);
        const scope = workflowScope(runtime, authority.scope.principalId, workspaceRoot,
          lifecycle?.continuityTaskId ?? authority.routeContextId);
        const operation = workflowOperationInput(toolName, input);
        // A caller-supplied tool name is not execution authority. This endpoint
        // observes adapter work; it cannot own process evidence or resource claims.
        operation.viaExecution = false;
        const workflow = await runtime.workflow.status(scope);
        const mutating = !['read_only','github_read_only','shell_read_only'].includes(classification.mutationClass);
        const engineeringMutation = mutating && ((operation.paths ?? []).some(isEngineeringPath)
          || classification.mutationClass === 'shell_mutation_or_unknown');
        if (mutating && (workflow?.planRequired || workflow?.engineering?.required || engineeringMutation)
          || toolName === 'workflow_plan' || toolName === 'craft_source') {
          throw Object.assign(new Error('Use the routed Agent-Core operation so planned work is executed and recorded under server authority'), { code: 'WORKFLOW_MANAGED_OPERATION_REQUIRED' });
        }
        await runtime.workflow.authorize(scope, operation);
        sendJson(response, 200, { ...base, valid: true });
        return;
      }
      const lifecycle = await runtime.memory.completeContextLeaseMeaningfulWork({
        lease,
        workspaceRoot,
        toolName,
        reasonCode: classification.reasonCode,
      });
      sendJson(response, 200, { ...base, valid: true, postflightState: lifecycle.postflightState });
    } catch (error) {
      if (error instanceof Error && 'code' in error && String(error.code).startsWith('WORKFLOW_')) {
        sendJson(response, 428, { error: { code: error.code, message: error.message } });
        return;
      }
      const message = action === 'after'
        ? 'Meaningful workspace work completed but its memory postflight could not be recorded'
        : 'A valid Memory Context Lease is required before meaningful workspace work';
      const status = error instanceof MemoryHardLifecycleError ? 428 : 503;
      sendJson(response, status, lifecycleFailureBody(failureCode, message));
    }
  };
}
