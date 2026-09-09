import path from 'node:path';
import { CapabilityRegistry } from '../capabilities/registry-service.js';
import { CapabilityRouter } from '../capabilities/router.js';
import { loadConfig, type ExecutionConfig, type GitHubConfig, type LangflowConfig, type MaintenanceConfig, type MemoryConfig, type ObservabilityConfig, type OperatorDirectiveConfig } from '../config.js';
import { ExecutionLogStore } from '../execution/log-store.js';
import { ExecutionMemoryBridge } from '../execution/memory-bridge.js';
import { ExecutionMemoryPreSearch } from '../execution/memory-search.js';
import { ResourceGovernor } from '../execution/resource-governor.js';
import { ExecutionService } from '../execution/service.js';
import { ExecutionStore } from '../execution/store.js';
import { GitHubService, type GitHubServiceDependencies } from '../github/service.js';
import { LangflowService } from '../langflow/service.js';
import { NOOP_RUNTIME_AUDIT_LOGGER, type RoutingAuditLogger, type RuntimeAuditLogger } from '../logging/audit-log.js';
import { MemoryService, type MemoryServiceDependencies } from '../memory/service.js';
import { OperatorDirectiveService } from '../operator-directives/service.js';
import { TelemetryService } from '../observability/telemetry.js';
import { FileSystemService } from './filesystem.js';
import { ProcessManager } from './process-manager.js';
import { RouteContextStore } from './route-context-store.js';
import { SearchService } from './search.js';
import { WorkspacePolicy } from './workspace.js';
import { RuntimeMetricRegistry } from './metric-window.js';
import { RuntimeHealthMetrics } from './health-metrics.js';
import { NodeResourceSnapshotProvider } from './resource-snapshot.js';
import { LocalMaintenanceCoordinator } from './maintenance.js';
import { WorkflowService } from '../workflow/service.js';
import { canonicalFileNativeProjectId } from '../memory/file-native/paths.js';
import { TaskCheckpointService } from '../memory/task-checkpoint.js';
import { completionWorkflowScope, verifyWorkflowCompletion } from './workflow-completion.js';
import { MemoryHardLifecycleError } from '../memory/hard-lifecycle.js';

export interface RuntimeServices {
  workflow: WorkflowService;
  checkpoints: TaskCheckpointService;
  workspace: WorkspacePolicy;
  filesystem: FileSystemService;
  search: SearchService;
  processes: ProcessManager;
  capabilities: CapabilityRegistry;
  router: CapabilityRouter;
  routes: RouteContextStore;
  memory: MemoryService;
  execution: ExecutionService;
  github: GitHubService;
  langflow: LangflowService;
  operatorDirectives: OperatorDirectiveService;
  metrics: RuntimeMetricRegistry;
  audit: RuntimeAuditLogger;
  telemetry: TelemetryService;
  healthMetrics: RuntimeHealthMetrics;
  resourceGovernor: ResourceGovernor;
  maintenance: LocalMaintenanceCoordinator;
}

export function createRuntimeServices(
  allowedRoots: string[],
  capabilityDir = path.join(allowedRoots[0] ?? process.cwd(), 'capabilities'),
  routingAuditLogger?: RoutingAuditLogger,
  memoryConfig?: MemoryConfig,
  executionConfig?: ExecutionConfig,
  githubConfig?: GitHubConfig,
  githubDependencies?: GitHubServiceDependencies,
  observabilityConfig?: ObservabilityConfig,
  serviceVersion = 'unknown',
  maintenanceConfig?: MaintenanceConfig,
  langflowConfig?: LangflowConfig,
  operatorDirectiveConfig?: OperatorDirectiveConfig,
  memoryDependencies?: MemoryServiceDependencies,
): RuntimeServices {
  const workspace = new WorkspacePolicy(allowedRoots);
  const capabilities = CapabilityRegistry.open(capabilityDir);
  const defaults = loadConfig({}, allowedRoots[0] ?? process.cwd());
  const resolvedMemoryConfig = memoryConfig ?? defaults.memory;
  const resolvedExecutionConfig = executionConfig ?? defaults.execution;
  const resolvedGitHubConfig = githubConfig ?? defaults.github;
  const resolvedObservabilityConfig = observabilityConfig ?? defaults.observability;
  const resolvedMaintenanceConfig = maintenanceConfig ?? defaults.maintenance;
  const resolvedLangflowConfig = langflowConfig ?? defaults.langflow;
  const resolvedOperatorDirectiveConfig = operatorDirectiveConfig ?? defaults.operatorDirectives;
  const metrics = new RuntimeMetricRegistry();
  if (routingAuditLogger && 'attachMetrics' in routingAuditLogger
    && typeof (routingAuditLogger as RoutingAuditLogger & { attachMetrics?: unknown }).attachMetrics === 'function') {
    (routingAuditLogger as RoutingAuditLogger & { attachMetrics(metrics: RuntimeMetricRegistry): void }).attachMetrics(metrics);
  }
  const runtimeAudit = routingAuditLogger && 'logRuntime' in routingAuditLogger
    && typeof (routingAuditLogger as RoutingAuditLogger & Partial<RuntimeAuditLogger>).logRuntime === 'function'
    ? routingAuditLogger as RoutingAuditLogger & RuntimeAuditLogger
    : NOOP_RUNTIME_AUDIT_LOGGER;
  const telemetry = new TelemetryService(metrics, resolvedObservabilityConfig.otlp, { serviceVersion });
  const github = new GitHubService(resolvedGitHubConfig, workspace, { ...githubDependencies, metrics });
  const langflow = new LangflowService(resolvedLangflowConfig);
  const operatorDirectives = new OperatorDirectiveService(resolvedOperatorDirectiveConfig);
  const memory = new MemoryService(resolvedMemoryConfig, metrics, memoryDependencies);
  const workflow = new WorkflowService({
    workspace,
    projectRoot: resolvedMemoryConfig.fileNative.projectRoot,
    stateRoot: path.join(resolvedMemoryConfig.fileNative.vaultRoot, '.agent-core', 'state'),
    cacheRoot: path.join(resolvedMemoryConfig.fileNative.projectRoot, 'runtime', 'craft', 'sources'),
    protectedRoots: [resolvedMemoryConfig.fileNative.memoryRoot, resolvedExecutionConfig.stateRoot, resolvedExecutionConfig.logRoot,
      resolvedOperatorDirectiveConfig.stateRoot, path.join(resolvedMemoryConfig.fileNative.projectRoot, 'runtime'), path.join(resolvedMemoryConfig.fileNative.projectRoot, '.git')],
  });
  const routes = new RouteContextStore({ ...(routingAuditLogger ? { auditLogger: routingAuditLogger } : {}), metrics });
  const resolvePersistentMemoryScope = (scope: { principalId: string; projectId?: string }) => ({
    ...scope,
    principalId: resolvedMemoryConfig.principalId ?? scope.principalId,
  });
  const executionStore = new ExecutionStore();
  const executionBridge = new ExecutionMemoryBridge(
    executionStore,
    memory,
    new ExecutionLogStore(resolvedExecutionConfig.logRoot),
    resolvePersistentMemoryScope,
  );
  let execution!: ExecutionService;
  const resourceProvider = new NodeResourceSnapshotProvider({
    storagePath: path.dirname(resolvedExecutionConfig.stateRoot),
    auditStatus: () => runtimeAudit.status?.() ?? null,
    telemetryStatus: () => {
      const status = telemetry.status();
      return status.enabled ? status : null;
    },
    executionCounts: () => executionStore.systemCounts(),
    workerHealth: async () => execution?.currentState === 'healthy',
  });
  const resourceGovernor = new ResourceGovernor({
    operatorMaxConcurrency: resolvedExecutionConfig.maxConcurrency,
    config: resolvedExecutionConfig.resourceGovernance,
    provider: resourceProvider,
    metrics,
  });
  execution = new ExecutionService(resolvedExecutionConfig, workspace, {
    workflowAfterAttempt: async (scope, run, node) => {
      if (!run.continuityTaskId) return;
      const workflowScope = { principalId: resolvedMemoryConfig.principalId ?? scope.principalId,
        projectId: canonicalFileNativeProjectId(resolvedMemoryConfig.fileNative, scope.projectId ?? workspace.resolveProjectRoot()), taskId: run.continuityTaskId };
      const contract = await workflow.status(workflowScope);
      if (!contract?.plan) return;
      const binding = run.metadata.workflowBinding as { planHash?: string; planRevision?: string } | undefined;
      const revision = Number(binding?.planRevision);
      if (binding?.planHash !== contract.plan.hash || revision !== contract.plan.revision) {
        throw Object.assign(new Error('Completed command belongs to a superseded workflow plan; reconcile before continuing'), { code: 'WORKFLOW_PLAN_STALE' });
      }
      const canonical = (p: string) => process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p);
      const writes = (node.resources?.writes ?? []).map(p => path.resolve(node.cwd, p));
      const paths = contract.plan.targetBaseline.map(p => p.path).filter(p => writes.some(w => canonical(w) === canonical(p)));
      if (paths.length) await workflow.recordOperation(workflowScope, { toolName: 'execute_command', paths,
        command: node.command, stepIds: node.stepIds ?? [], planVersion: revision, viaExecution: true });
    },
    workflowGuard: async (request) => {
      const route = request.originRouteContextId ? routes.getOwned(request.originRouteContextId, request.scope.principalId) : undefined;
      const taskId = request.continuityTaskId ?? route?.workflow?.taskId ?? route?.continuityTaskId;
      if (!taskId) throw Object.assign(new Error('Execution requires a persisted workflow task'), { code: 'WORKFLOW_CONTEXT_REQUIRED' });
      if (!route || (route.workflow?.taskId ?? route.continuityTaskId) !== taskId
        || canonicalFileNativeProjectId(resolvedMemoryConfig.fileNative, route.projectId ?? workspace.resolveProjectRoot()) !== canonicalFileNativeProjectId(resolvedMemoryConfig.fileNative, request.scope.projectId ?? workspace.resolveProjectRoot())) {
        throw Object.assign(new Error('Execution must use the current route for its own task and project'), { code: 'WORKFLOW_CONTEXT_REQUIRED' });
      }
      if (resolvedMemoryConfig.hardLifecycleMode === 'enforce') {
        if (!route.memorySnapshot?.memoryContextId) throw new MemoryHardLifecycleError('MEMORY_PREFLIGHT_REQUIRED', 'Execution requires a current recalled memory context');
        await memory.validateLifecycleContext({
          scope: { principalId: resolvedMemoryConfig.principalId ?? request.scope.principalId, projectId: route.projectId },
          contextId: route.memorySnapshot.memoryContextId, routeContextId: route.routeContextId,
        });
      }
      return workflow.assertExecution({
        principalId: resolvedMemoryConfig.principalId ?? request.scope.principalId,
        projectId: canonicalFileNativeProjectId(resolvedMemoryConfig.fileNative, request.scope.projectId ?? workspace.resolveProjectRoot()),
        taskId,
      }, { ...request, nodes: [...request.nodes] });
    },
    store: executionStore,
    memoryBridge: executionBridge,
    memorySearch: new ExecutionMemoryPreSearch(memory, resolvePersistentMemoryScope),
    metrics,
    resourceGovernor,
  });
  const maintenance = new LocalMaintenanceCoordinator(resolvedMaintenanceConfig, {
    logRoot: resolvedExecutionConfig.logRoot,
    memoryStatus: () => memory.status(),
    executionHealth: () => execution.health(),
    audit: runtimeAudit,
    metrics,
  });
  const runtime = {
    workflow,
    workspace,
    filesystem: new FileSystemService(workspace, true),
    search: new SearchService(workspace),
    processes: new ProcessManager(workspace, true),
    capabilities,
    router: new CapabilityRouter(capabilities),
    routes,
    memory,
    execution,
    github,
    langflow,
    operatorDirectives,
    metrics,
    audit: runtimeAudit,
    telemetry,
    resourceGovernor,
    maintenance,
  } as Omit<RuntimeServices, 'healthMetrics' | 'checkpoints'> & { healthMetrics?: RuntimeHealthMetrics; checkpoints?: TaskCheckpointService };
  runtime.checkpoints = new TaskCheckpointService(memory, workspace, {
    acquireCheckpoint: async (scope, input) => {
      if (input.status !== 'completed') return undefined;
      const lifecycle = await memory.getLifecycleContext(scope, input.memoryContextId);
      return execution.acquireWorkspaceClaim({ principalId: lifecycle?.authorityPrincipalId ?? scope.principalId, projectId: input.workspaceRoot }, { reads: [input.workspaceRoot] });
    },
    beforeCheckpoint: (scope, input) => verifyWorkflowCompletion(runtime as RuntimeServices, scope, input),
    beforeDurability: async (scope, input, checkpointId) => {
      if (input.status === 'completed') await workflow.markClosed(completionWorkflowScope(runtime as RuntimeServices, scope, input), { checkpointId });
    },
  });
  runtime.healthMetrics = new RuntimeHealthMetrics(runtime as RuntimeServices);
  return runtime as RuntimeServices;
}
