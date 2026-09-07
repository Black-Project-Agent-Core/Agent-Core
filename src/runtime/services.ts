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
import { MemoryService } from '../memory/service.js';
import { OperatorDirectiveService } from '../operator-directives/service.js';
import { GitHubMemoryRemoteTransport } from '../memory/remote-transport.js';
import { TelemetryService } from '../observability/telemetry.js';
import { SubAgentCoreService } from '../subagentcore/service.js';
import { FileSystemService } from './filesystem.js';
import { ProcessManager } from './process-manager.js';
import { RouteContextStore } from './route-context-store.js';
import { SearchService } from './search.js';
import { WorkspacePolicy } from './workspace.js';
import { RuntimeMetricRegistry } from './metric-window.js';
import { RuntimeHealthMetrics } from './health-metrics.js';
import { NodeResourceSnapshotProvider } from './resource-snapshot.js';
import { LocalMaintenanceCoordinator } from './maintenance.js';

export interface RuntimeServices {
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
  subagentcore: SubAgentCoreService;
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
  const memoryRemoteTransport = resolvedMemoryConfig.remote.enabled
    ? new GitHubMemoryRemoteTransport(github.git, workspace, resolvedMemoryConfig.remote)
    : undefined;
  const memory = new MemoryService(resolvedMemoryConfig, metrics, { remoteTransport: memoryRemoteTransport });
  const subagentcore = new SubAgentCoreService({
    memory,
    projectRoot: allowedRoots[0] ?? process.cwd(),
  });
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
    storagePath: path.dirname(resolvedExecutionConfig.dbPath),
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
    workspace,
    filesystem: new FileSystemService(workspace),
    search: new SearchService(workspace),
    processes: new ProcessManager(workspace),
    capabilities,
    router: new CapabilityRouter(capabilities),
    routes: new RouteContextStore({ ...(routingAuditLogger ? { auditLogger: routingAuditLogger } : {}), metrics }),
    memory,
    execution,
    github,
    langflow,
    subagentcore,
    operatorDirectives,
    metrics,
    audit: runtimeAudit,
    telemetry,
    resourceGovernor,
    maintenance,
  } as Omit<RuntimeServices, 'healthMetrics'> & { healthMetrics?: RuntimeHealthMetrics };
  runtime.healthMetrics = new RuntimeHealthMetrics(runtime as RuntimeServices);
  return runtime as RuntimeServices;
}
