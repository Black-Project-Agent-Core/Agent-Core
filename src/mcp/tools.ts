import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { VerifiedKey } from '../auth/key-types.js';
import { OperationalMemoryAudit } from '../memory/operational-audit.js';
import type { RuntimeServices } from '../runtime/services.js';
import { completeMemoryLifecycleOperation, validateMemoryLifecycleBeforeOperation } from './memory-lifecycle-guard.js';
import { resolveAuditProjectId, resolvedProjectScope, resolveRouteExistingPath, resolveRouteTargetPath } from './project-scope.js';
import { routeErrorResult, validateOperationalRoute } from './route-guard.js';
import { withOperationAuthority } from '../runtime/operation-context.js';
import { authorizeRouteWorkflow, routeWorkflowScope, workflowOperationInput } from './workflow-guard.js';

function textResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message }, null, 2) }], isError: true };
}

async function guarded<T>(operation: () => Promise<T>) {
  try { return textResult(await operation()); }
  catch (error) { return errorResult(error); }
}

async function routeGuarded<T>(
  runtime: RuntimeServices,
  key: VerifiedKey,
  routeContextId: string,
  toolName: string,
  operation: (route: NonNullable<ReturnType<typeof runtime.routes.get>>) => Promise<T>,
  auditInput: Record<string, unknown> = {},
) {
  const audit = new OperationalMemoryAudit(runtime, key);
  let route;
  let lifecycleDecision;
  try {
    route = validateOperationalRoute(runtime, key, routeContextId, toolName);
    lifecycleDecision = await validateMemoryLifecycleBeforeOperation(runtime, key, route, toolName, auditInput);
  } catch (error) {
    await audit.rejected(resolveAuditProjectId(runtime, key, routeContextId), routeContextId, toolName, auditInput, error);
    return routeErrorResult(error) ?? errorResult(error);
  }

  await audit.intended(route, toolName, auditInput);
  let releaseClaim: (() => Promise<void>) | undefined;
  try {
    const mutation = ['write_file', 'edit_file', 'create_directory', 'move_file'].includes(toolName);
    if (mutation) {
      const paths = workflowOperationInput(toolName, auditInput).paths ?? [];
      const writes = await Promise.all(paths.map(p => resolveRouteTargetPath(runtime, route, p)));
      releaseClaim = await runtime.execution.acquireWorkspaceClaim({ principalId: key.id, projectId: route.projectId ?? runtime.workspace.resolveProjectRoot() }, { writes });
    }
    const result = await withOperationAuthority(
      (name, input) => authorizeRouteWorkflow(runtime, key, route, name, { ...auditInput, ...input }),
      () => operation(route),
    );
    if (mutation && (route.workflow || route.continuityTaskId)) {
      const completedInput = { ...auditInput, ...(result && typeof result === 'object' ? result : {}) };
      try {
        await runtime.workflow.recordOperation(routeWorkflowScope(runtime, key, route), workflowOperationInput(toolName, completedInput));
      } catch (error) {
        throw Object.assign(new Error('File operation completed, but its workflow receipt is pending; inspect the file before retrying'),
          { code: 'WORKFLOW_OPERATION_RECEIPT_PENDING', details: { mutationCommitted: true, causeCode: error instanceof Error && 'code' in error ? error.code : 'unknown' } });
      }
    }
    await completeMemoryLifecycleOperation(runtime, key, route, toolName, lifecycleDecision);
    await audit.succeeded(route, toolName, auditInput, result);
    return textResult(result);
  } catch (error) {
    await audit.failed(route, toolName, auditInput, error);
    return routeErrorResult(error) ?? errorResult(error);
  } finally {
    await releaseClaim?.();
  }
}

const ROUTE_REQUIRED_DESCRIPTION = 'Obtain routeContextId from capability_route before using this tool.';
const routedDescription = (description: string) => `${description} ${ROUTE_REQUIRED_DESCRIPTION}`;
const workflowEditSchema = { stepId: z.string().min(1).max(200).optional(), planVersion: z.number().int().positive().optional() };

function processOwner(key: VerifiedKey, projectId: string, originRouteContextId?: string) {
  return {
    principalId: key.id,
    projectId,
    ...(originRouteContextId ? { originRouteContextId } : {}),
  };
}

export const OPERATIONAL_TOOL_NAMES = [
  'workspace_info', 'list_directory', 'read_file', 'read_multiple_files',
  'write_file', 'edit_file', 'create_directory', 'move_file', 'get_file_info',
  'search_files', 'execute_command', 'start_process', 'read_process_output',
  'stop_process', 'list_processes',
] as const;

export function registerOperationalTools(
  server: McpServer,
  runtime: RuntimeServices,
  key: VerifiedKey,
): void {
  server.registerTool('workspace_info', {
    title: 'Workspace Info',
    description: 'Show the filesystem roots this Agent Core identity is allowed to access.',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => textResult({ roots: runtime.workspace.roots }));

  server.registerTool('list_directory', {
    title: 'List Directory',
    description: routedDescription('List files and directories inside an allowed workspace, optionally descending several levels.'),
    inputSchema: {
      path: z.string(),
      depth: z.number().int().min(1).max(10).default(2),
      maxEntries: z.number().int().min(1).max(2000).default(500),
      routeContextId: z.string().uuid(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ path, depth, maxEntries, routeContextId }) => routeGuarded(
    runtime, key, routeContextId, 'list_directory',
    async (route) => runtime.filesystem.listDirectory(
      await resolveRouteExistingPath(runtime, route, path), depth, maxEntries,
    ),
    { path, depth, maxEntries },
  ));

  server.registerTool('read_file', {
    title: 'Read File',
    description: routedDescription('Read a UTF-8 text file from an allowed workspace, with optional line and byte bounds.'),
    inputSchema: {
      path: z.string(),
      startLine: z.number().int().min(0).optional(),
      lineCount: z.number().int().min(1).max(10000).optional(),
      maxBytes: z.number().int().min(1).max(5 * 1024 * 1024).optional(),
      routeContextId: z.string().uuid(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ path, startLine, lineCount, maxBytes, routeContextId }) => routeGuarded(
    runtime, key, routeContextId, 'read_file',
    async (route) => runtime.filesystem.readFile(
      await resolveRouteExistingPath(runtime, route, path), { startLine, lineCount, maxBytes },
    ),
    { path, startLine, lineCount, maxBytes },
  ));

  server.registerTool('read_multiple_files', {
    title: 'Read Multiple Files',
    description: routedDescription('Read several UTF-8 text files from allowed workspaces in one call.'),
    inputSchema: {
      paths: z.array(z.string()).min(1).max(50),
      startLine: z.number().int().min(0).optional(),
      lineCount: z.number().int().min(1).max(10000).optional(),
      maxBytes: z.number().int().min(1).max(5 * 1024 * 1024).optional(),
      routeContextId: z.string().uuid(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ paths, startLine, lineCount, maxBytes, routeContextId }) => routeGuarded(
    runtime, key, routeContextId, 'read_multiple_files',
    async (route) => runtime.filesystem.readMultipleFiles(
      await Promise.all(paths.map((entry) => resolveRouteExistingPath(runtime, route, entry))),
      { startLine, lineCount, maxBytes },
    ),
    { paths, startLine, lineCount, maxBytes },
  ));

  server.registerTool('write_file', {
    title: 'Write File',
    description: routedDescription('Create, replace, or append UTF-8 text in a file inside an allowed workspace.'),
    inputSchema: {
      path: z.string(),
      content: z.string(),
      mode: z.enum(['rewrite', 'append']).default('rewrite'),
      ...workflowEditSchema,
      routeContextId: z.string().uuid(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async ({ path, content, mode, routeContextId, stepId, planVersion }) => routeGuarded(
    runtime, key, routeContextId, 'write_file',
    async (route) => runtime.filesystem.writeFile(
      await resolveRouteTargetPath(runtime, route, path), content, mode,
    ),
    { path, mode, contentBytes: Buffer.byteLength(content, 'utf8'), stepId, planVersion },
  ));

  server.registerTool('edit_file', {
    title: 'Edit File',
    description: routedDescription('Replace an exact text block in a file and reject the edit when the match count is not exactly what was expected.'),
    inputSchema: {
      path: z.string(),
      oldString: z.string().min(1),
      newString: z.string(),
      expectedReplacements: z.number().int().min(1).max(10000).default(1),
      ...workflowEditSchema,
      routeContextId: z.string().uuid(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async ({ path, oldString, newString, expectedReplacements, routeContextId, stepId, planVersion }) => routeGuarded(
    runtime, key, routeContextId, 'edit_file',
    async (route) => runtime.filesystem.editFile(
      await resolveRouteExistingPath(runtime, route, path), oldString, newString, expectedReplacements,
    ),
    {
      path,
      expectedReplacements,
      stepId, planVersion,
      oldStringBytes: Buffer.byteLength(oldString, 'utf8'),
      newStringBytes: Buffer.byteLength(newString, 'utf8'),
    },
  ));

  server.registerTool('create_directory', {
    title: 'Create Directory',
    description: routedDescription('Create a directory, including missing parent directories, inside an allowed workspace.'),
    inputSchema: { path: z.string(), routeContextId: z.string().uuid(), ...workflowEditSchema },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ path, routeContextId, stepId, planVersion }) => routeGuarded(
    runtime, key, routeContextId, 'create_directory',
    async (route) => runtime.filesystem.createDirectory(
      await resolveRouteTargetPath(runtime, route, path),
    ),
    { path, stepId, planVersion },
  ));

  server.registerTool('move_file', {
    title: 'Move File',
    description: routedDescription('Move or rename a file or directory between locations that are both inside allowed workspaces.'),
    inputSchema: {
      source: z.string(),
      destination: z.string(),
      ...workflowEditSchema,
      routeContextId: z.string().uuid(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async ({ source, destination, routeContextId, stepId, planVersion }) => routeGuarded(
    runtime, key, routeContextId, 'move_file',
    async (route) => runtime.filesystem.moveFile(
      await resolveRouteExistingPath(runtime, route, source),
      await resolveRouteTargetPath(runtime, route, destination),
    ),
    { source, destination, stepId, planVersion },
  ));

  server.registerTool('get_file_info', {
    title: 'Get File Info',
    description: routedDescription('Return metadata for a file or directory inside an allowed workspace.'),
    inputSchema: { path: z.string(), routeContextId: z.string().uuid() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ path, routeContextId }) => routeGuarded(
    runtime, key, routeContextId, 'get_file_info',
    async (route) => runtime.filesystem.getFileInfo(
      await resolveRouteExistingPath(runtime, route, path),
    ),
    { path },
  ));

  server.registerTool('search_files', {
    title: 'Search Files',
    description: routedDescription('Search recursively by filename or UTF-8 text content inside an allowed workspace.'),
    inputSchema: {
      path: z.string(),
      query: z.string().min(1),
      mode: z.enum(['files', 'content']).default('files'),
      maxResults: z.number().int().min(1).max(1000).default(100),
      routeContextId: z.string().uuid(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ path, query, mode, maxResults, routeContextId }) => routeGuarded(
    runtime, key, routeContextId, 'search_files',
    async (route) => runtime.search.search({
      path: await resolveRouteExistingPath(runtime, route, path), query, mode, maxResults,
    }),
    { path, query, mode, maxResults },
  ));

  server.registerTool('execute_command', {
    title: 'Execute Command',
    description: routedDescription('Run a PowerShell command once in an allowed working directory with timeout and output bounds. High-risk system commands are blocked.'),
    inputSchema: {
      command: z.string().min(1),
      cwd: z.string().optional(),
      timeoutMs: z.number().int().min(1).max(10 * 60_000).default(30_000),
      routeContextId: z.string().uuid(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  }, async ({ command, cwd, timeoutMs, routeContextId }) => routeGuarded(
    runtime, key, routeContextId, 'execute_command',
    async (route) => {
      const projectId = route.projectId ?? runtime.workspace.resolveProjectRoot();
      const resolvedCwd = await resolveRouteExistingPath(runtime, route, cwd ?? projectId);
      return runtime.processes.execute(command, { cwd: resolvedCwd, timeoutMs });
    },
    { command, ...(cwd ? { cwd } : {}), timeoutMs },
  ));

  server.registerTool('start_process', {
    title: 'Start Process',
    description: routedDescription('Start a long-running PowerShell command in an allowed working directory and return an opaque process session ID.'),
    inputSchema: {
      command: z.string().min(1),
      cwd: z.string().optional(),
      routeContextId: z.string().uuid(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  }, async ({ command, cwd, routeContextId }) => {
    const audit = new OperationalMemoryAudit(runtime, key);
    return routeGuarded(
      runtime, key, routeContextId, 'start_process',
      async (route) => {
        const projectId = route.projectId ?? runtime.workspace.resolveProjectRoot();
        const resolvedCwd = await resolveRouteExistingPath(runtime, route, cwd ?? projectId);
        return runtime.processes.start(command, {
          cwd: resolvedCwd,
          owner: processOwner(key, projectId, routeContextId),
          onTerminal: (snapshot) => audit.lifecycle(
            projectId,
            routeContextId,
            'start_process',
            'terminal',
            { sessionId: snapshot.sessionId },
            snapshot,
          ),
        });
      },
      { command, ...(cwd ? { cwd } : {}) },
    );
  });

  server.registerTool('read_process_output', {
    title: 'Read Process Output',
    description: 'Read the bounded stdout/stderr snapshot and state of an owned Agent Core process session.',
    inputSchema: { sessionId: z.string().min(1), routeContextId: z.string().uuid().optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ sessionId, routeContextId }) => {
    const audit = new OperationalMemoryAudit(runtime, key);
    try {
      const context = routeContextId
        ? runtime.processes.sessionContext(
          sessionId,
          processOwner(key, resolvedProjectScope(runtime, key, routeContextId).projectId),
        )
        : runtime.processes.sessionContextForPrincipal(sessionId, key.id);
      const projectId = context.projectId ?? runtime.workspace.resolveProjectRoot();
      const owner = processOwner(key, projectId);
      const result = runtime.processes.read(sessionId, owner);
      await audit.lifecycle(
        projectId,
        context.originRouteContextId ?? sessionId,
        'read_process_output',
        'observed',
        { sessionId },
        result,
      );
      return textResult(result);
    } catch (error) {
      return errorResult(error);
    }
  });

  server.registerTool('stop_process', {
    title: 'Stop Process',
    description: 'Stop an owned Agent Core-managed process session without requiring its original route to still be active.',
    inputSchema: { sessionId: z.string().min(1), routeContextId: z.string().uuid().optional() },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, async ({ sessionId, routeContextId }) => {
    const audit = new OperationalMemoryAudit(runtime, key);
    try {
      const context = routeContextId
        ? runtime.processes.sessionContext(
          sessionId,
          processOwner(key, resolvedProjectScope(runtime, key, routeContextId).projectId),
        )
        : runtime.processes.sessionContextForPrincipal(sessionId, key.id);
      const projectId = context.projectId ?? runtime.workspace.resolveProjectRoot();
      const owner = processOwner(key, projectId);
      const before = runtime.processes.read(sessionId, owner);
      const sourceRef = context.originRouteContextId ?? sessionId;
      await audit.lifecycle(projectId, sourceRef, 'stop_process', 'stop_requested', { sessionId }, before);
      const result = await runtime.processes.stop(sessionId, owner);
      await audit.lifecycle(projectId, sourceRef, 'stop_process', 'stop_succeeded', { sessionId }, result);
      return textResult(result);
    } catch (error) {
      return errorResult(error);
    }
  });

  server.registerTool('list_processes', {
    title: 'List Processes',
    description: 'List only process sessions owned by the authenticated principal in the resolved project.',
    inputSchema: { routeContextId: z.string().uuid().optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ routeContextId }) => guarded(async () => {
    const project = resolvedProjectScope(runtime, key, routeContextId);
    return { processes: runtime.processes.list(processOwner(key, project.projectId)) };
  }));
}
