import { WorkflowService } from './workflows/service.js';
import { access, mkdir, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { NativeAgentController } from './agent-controller.js';
import { AgentChatService } from './agent-chat-service.js';
import { AgentRuntimeService } from './agent-runtime.js';
import { FileKeyStore } from './auth/key-store.js';
import { CodeIntelligenceService } from './code-intelligence/service.js';
import { loadConfig, type AppConfig } from './config.js';
import { createHttpHandler } from './http/app.js';
import { HttpSecurityPolicy } from './http/security-policy.js';
import { LearningService } from './learning/service.js';
import { ExternalControllerLearningService } from './learning/external-controller.js';
import { SemanticIdeService } from './semantic-ide/service.js';
import { SkillService } from './skills/service.js';
import { WebResearchService } from './web-research/service.js';
import { createMcpHttpHandler } from './mcp/handler.js';
import { McpMutationSafety } from './mcp/mutation-safety.js';
import { CloudflareWorkersAIEmbedder } from './memory/embedder.js';
import { initializeAgentCoreMemory } from './memory/host-runtime.js';
import { SERVER_VERSION } from './mcp/server.js';
import { OAuthService } from './oauth/service.js';
import { FileOAuthStore } from './oauth/store.js';
import { PhoneController } from './phone/controller.js';
import { preparePortableRuntime } from './portability/runtime-relocation.js';
import { browserControlService } from './rdc/browser-control/service.js';
import { browserExtensionBridge } from './rdc/browser-control/extension-bridge.js';
import { configManager } from './rdc/config-manager.js';
import { terminalManager } from './rdc/terminal-manager.js';
import { toolHistory } from './rdc/utils/toolHistory.js';
import { ensureChromeAvailable } from './rdc/tools/pdf/markdown.js';
import { activityTracker } from './tracker/activity-tracker.js';
import { reconcileInterruptedToolInvocations } from './tracker/tool-invocation.js';

const invocationRecovery = reconcileInterruptedToolInvocations(activityTracker);
if (invocationRecovery.reconciled > 0) {
  activityTracker.record(
    'MCP',
    'warn',
    `Recovered ${invocationRecovery.reconciled} interrupted tool invocation(s) as outcome-unknown`,
    'tool-invocation-reconciliation',
    invocationRecovery,
  );
}
activityTracker.installProcessHooks();

export interface AgentCoreService {
  server: Server;
  host: string;
  port: number;
  agentController?: NativeAgentController;
  agentChat?: AgentChatService;
  close(): Promise<void>;
}

export async function startAgentCoreService(config: AppConfig = loadConfig()): Promise<AgentCoreService> {
  activityTracker.record('SYSTEM', 'info', 'Starting Agent Core RDC bridge', 'service-start');
  const portability = await preparePortableRuntime(config.projectRoot);
  if (portability.relocated || portability.transientReset) {
    activityTracker.record('SYSTEM', 'success', 'Agent Core project relocation/portability migration detected; transient machine-bound state archived', 'project-relocation-repair', { ...portability });
  }
  await mkdir(config.dataDir, { recursive: true });
  const initialRdcHealth = await configManager.health();
  activityTracker.record(
    'EXECUTION',
    initialRdcHealth.status === 'available' ? 'success' : 'warn',
    initialRdcHealth.status === 'available' ? 'RDC configuration is available' : 'RDC configuration is unavailable',
    'rdc-config-readiness',
    { ...initialRdcHealth },
  );
  const embeddingConfig = config.memoryEmbedding;
  const memoryEmbedder = embeddingConfig?.provider === 'cloudflare-workers-ai'
    ? new CloudflareWorkersAIEmbedder({
      accountId: embeddingConfig.accountId!,
      apiToken: embeddingConfig.apiToken!,
      model: embeddingConfig.model!,
      dimensions: embeddingConfig.dimensions,
    })
    : undefined;
  const memoryRuntime = await initializeAgentCoreMemory(config.projectRoot, config.memoryDir, memoryEmbedder);
  const memoryService = memoryRuntime.service;
  const memoryHealth = memoryService.health();
  activityTracker.record('MEMORY', memoryHealth.status === 'available' ? 'success' : 'warn', 'Memory service initialized', 'memory-service-start', { ...memoryHealth });
  if (initialRdcHealth.status === 'available') ensureChromeAvailable();
  const phoneController = config.phone ? new PhoneController(config.phone) : undefined;
  if (phoneController) {
    activityTracker.record(
      'SYSTEM',
      config.phone!.enabled ? 'success' : 'info',
      config.phone!.enabled ? 'Phone control feature enabled' : 'Phone control feature disabled',
      'phone-feature-readiness',
      phoneController.describe(),
    );
  }
  const codeIntelligence = config.codeIntelligence
    ? await CodeIntelligenceService.initialize(config.codeIntelligence)
    : undefined;
  if (codeIntelligence) {
    const initialCodeIntelligenceHealth = await codeIntelligence.health();
    activityTracker.record(
      'CODE_INTELLIGENCE',
      initialCodeIntelligenceHealth.status === 'available' ? 'success' : 'info',
      'Code-intelligence service initialized',
      'code-intelligence-start',
      {
        status: initialCodeIntelligenceHealth.status,
        provider: initialCodeIntelligenceHealth.provider,
        index: initialCodeIntelligenceHealth.index,
        group: initialCodeIntelligenceHealth.group,
        issueCount: initialCodeIntelligenceHealth.issueCount,
      },
    );
  }

  let semanticIde: SemanticIdeService | undefined;
  if (codeIntelligence && memoryService) {
    await memoryService.registerWorkspaceAliases(await codeIntelligence.listWorkspaces().catch(() => []));
  }
  if (config.semanticIde) {
    try {
      semanticIde = await SemanticIdeService.initialize(config.semanticIde, codeIntelligence);
      const initialSemanticIdeHealth = await semanticIde.health();
      activityTracker.record(
        'SEMANTIC_IDE',
        initialSemanticIdeHealth.status === 'available' ? 'success' : 'info',
        'Semantic IDE service initialized',
        'semantic-ide-start',
        {
          status: initialSemanticIdeHealth.status,
          backend: initialSemanticIdeHealth.backend,
          issueCount: initialSemanticIdeHealth.issueCount,
        },
      );
    } catch (error) {
      activityTracker.captureFailure('SEMANTIC_IDE', error, 'semantic-ide-start-failure');
    }
  }

  let learningService: LearningService | undefined;
  if (config.learning) {
    try {
      learningService = await LearningService.initialize(config.learning, memoryService, codeIntelligence);
    } catch (error) {
      activityTracker.captureFailure('LEARNING', error, 'learning-service-start-failure');
    }
  }

  let skillsService: SkillService | undefined;
  try {
    skillsService = await SkillService.initialize(config.projectRoot, undefined, { embedder: memoryEmbedder });
    activityTracker.record('SKILLS', 'success', 'Skill artifact service initialized', 'skills-service-start', {
      status: 'available',
    });
  } catch (error) {
    activityTracker.captureFailure('SKILLS', error, 'skills-service-start-failure');
  }

  let externalControllerLearning: ExternalControllerLearningService | undefined;
  learningService?.attachSkills(skillsService);
  if (learningService) {
    try {
      externalControllerLearning = await ExternalControllerLearningService.initialize({
        stateDir: config.learning.stateDir,
        memory: memoryService,
        learning: learningService,
        ...(memoryRuntime.experience ? { experience: memoryRuntime.experience } : {}),
        ...(skillsService ? { skills: skillsService } : {}),
      });
    } catch (error) {
      activityTracker.captureFailure('LEARNING', error, 'external-controller-learning-start-failure');
    }
  }

  let agentRuntime: AgentRuntimeService | undefined;
  if (learningService) {
    try {
      agentRuntime = await AgentRuntimeService.initialize(config.projectRoot, learningService, config.agentRuntime, memoryService);
    } catch (error) {
      activityTracker.captureFailure('AGENT_RUNTIME', error, 'agent-runtime-start-failure');
    }
  }

  const mutationSafety = McpMutationSafety.initialize(path.join(config.projectRoot, 'runtime', 'mcp'));
  activityTracker.record('MCP', mutationSafety.status().status === 'available' ? 'success' : 'warn', 'MCP mutation-safety service initialized', 'mcp-mutation-safety-start', { ...mutationSafety.status() });

  const keyStore = new FileKeyStore(config.dataDir);
  const oauthStore = new FileOAuthStore(config.dataDir);
  const security = new HttpSecurityPolicy(config.httpSecurity);
  const oauthService = new OAuthService(keyStore, oauthStore, security, undefined, (context) => {
    activityTracker.record('AUTH', 'info', 'OAuth authorization request rejected', 'oauth-authorization-validation', context);
  });
  const webResearch = new WebResearchService(config.webResearch);
  activityTracker.record(
    'SYSTEM',
    webResearch.health().status === 'available' ? 'success' : 'info',
    'Web research service initialized',
    'web-research-start',
    { ...webResearch.health() },
  );
  const controllerMcpRuntime = {
    memoryService,
    memoryExperience: memoryRuntime.experience,
    learningService,
    semanticIde,
    skillsService,
    phoneController,
    codeIntelligence,
    externalControllerLearning,
    mutationSafety,
    webResearch,
  };
  const agentController = agentRuntime
    ? new NativeAgentController(agentRuntime, controllerMcpRuntime, config.agentRuntime)
    : undefined;
  let agentChat: AgentChatService | undefined;
  if (agentRuntime && agentController) {
    try {
      agentChat = await AgentChatService.initialize(
        config.projectRoot,
        agentRuntime,
        agentController,
      );
      activityTracker.record(
        'AGENT_RUNTIME',
        'success',
        'Interactive agent chat service initialized',
        'agent-chat-start',
        agentChat.health(),
      );
    } catch (error) {
      activityTracker.captureFailure(
        'AGENT_RUNTIME',
        error,
        'agent-chat-start-failure',
      );
    }
  }

  const workflows = new WorkflowService(config.projectRoot);
  const server = createServer(createHttpHandler({
    workflows: () => workflows.snapshot(),
    browserBridge: browserExtensionBridge,
    keyStore,
    oauthService,
    security,
    agentUiToken: config.agentUiToken,
    ...(agentController ? { agentRun: (input: { prompt: string; workspace?: string }) => agentController.runTask(input) } : {}),
    ...(agentChat ? { agentChat } : {}),
    healthProvider: async () => {
      const [liveMemoryHealth, liveRdcHealth, livePhoneHealth, liveCodeIntelligenceHealth, liveSemanticIdeHealth, liveLearningHealth, liveSkillsHealth, liveExternalControllerHealth] = await Promise.all([
        memoryService.refreshHealth(),
        configManager.health(),
        phoneController ? phoneController.health() : Promise.resolve(undefined),
        codeIntelligence ? codeIntelligence.health() : Promise.resolve(undefined),
        semanticIde ? semanticIde.health() : Promise.resolve(undefined),
        learningService ? learningService.health() : Promise.resolve(undefined),
        skillsService ? skillsService.status() : Promise.resolve(undefined),
        externalControllerLearning ? externalControllerLearning.status() : Promise.resolve(undefined),
      ]);
      const liveAgentRuntimeHealth = agentRuntime
        ? await agentRuntime.health(liveSkillsHealth?.skillCount ?? 0)
        : undefined;
      return {
        version: SERVER_VERSION,
        bridge: 'rdc-local',
        toolSurface: 'desktop-commander-0.2.50-local',
        memory: liveMemoryHealth,
        execution: {
          status: liveRdcHealth.status === 'available' ? 'available' : 'unavailable',
          mode: 'rdc-direct',
          ...(liveRdcHealth.status === 'available' ? {} : {
            issueCount: liveRdcHealth.issueCount,
            ...(liveRdcHealth.issue ? { issue: liveRdcHealth.issue } : {}),
          }),
        },
        ...(livePhoneHealth ? { phone: livePhoneHealth } : {}),
        ...(liveCodeIntelligenceHealth ? { codeIntelligence: liveCodeIntelligenceHealth } : {}),
        ...(liveSemanticIdeHealth ? { semanticIde: liveSemanticIdeHealth } : {}),
        ...(liveLearningHealth ? { learning: liveLearningHealth } : {}),
        ...(liveSkillsHealth ? { skills: liveSkillsHealth } : {}),
        ...(liveExternalControllerHealth ? { externalControllerLearning: liveExternalControllerHealth } : {}),
        ...(liveAgentRuntimeHealth ? { agentRuntime: liveAgentRuntimeHealth } : {}),
        ...(agentChat ? { agentChat: agentChat.health() } : {}),
        webResearch: webResearch.health(),
        mcpMutationSafety: mutationSafety.status(),
      };
    },
    mcpHandler: createMcpHttpHandler({
      protocolMode: config.mcp.protocolMode,
      ...controllerMcpRuntime,
    }),
  }));
  server.on('clientError', (error, socket) => {
    activityTracker.record('CLIENT', 'info', error.message, 'client-connection-error', {
      code: (error as NodeJS.ErrnoException).code ?? '',
      remoteAddress: (socket as Socket).remoteAddress ?? '',
    });
    socket.destroy();
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(config.port, config.host);
  });

  const address = server.address() as AddressInfo;
  workflows.start();
  activityTracker.record('SYSTEM', 'success', 'Agent Core RDC bridge is listening', 'service-listening', { host: config.host, port: address.port });
  return {
    server,
    host: config.host,
    port: address.port,
    ...(agentController ? { agentController } : {}),
    ...(agentChat ? { agentChat } : {}),
    close: async () => {
      activityTracker.record('SYSTEM', 'info', 'Agent Core service is closing', 'service-stop');
      const failures: string[] = [];
      mutationSafety.beginDraining();
      const mutationsDrained = await mutationSafety.waitForDrain(5_000);
      if (!mutationsDrained) {
        failures.push('mcp-mutation-drain');
        activityTracker.record('MCP', 'warn', 'Timed out waiting for admitted MCP mutations to drain; continuing bounded shutdown', 'mcp-mutation-drain-timeout', { ...mutationSafety.status() });
      }
      const cleanup = async (name: string, operation: () => Promise<unknown>): Promise<void> => {
        try {
          await operation();
        } catch (error) {
          failures.push(name);
          activityTracker.captureFailure(
            'SYSTEM',
            error,
            'service-stop-component-failure',
            { component: name },
          );
        }
      };

      await cleanup('workflows', () => workflows.close());
      const memoryExperience = memoryRuntime.experience;
      if (memoryExperience) await cleanup('memory-experience', async () => memoryExperience.dispose());
      await cleanup('http-server', () => closeServer(server));
      await cleanup('browser-control', () => browserControlService.closeAll());
      await cleanup('terminal-manager', () => terminalManager.shutdownAll());
      if (semanticIde) await cleanup('semantic-ide', () => semanticIde.close());
      if (codeIntelligence) await cleanup('code-intelligence', () => codeIntelligence.close());
      await cleanup('tool-history', () => toolHistory.cleanup());
      await cleanup('config-manager', () => configManager.close());

      activityTracker.record(
        'SYSTEM',
        failures.length ? 'warn' : 'success',
        failures.length
          ? 'Agent Core service closed with bounded cleanup failures'
          : 'Agent Core service closed',
        'service-stopped',
        { issueCount: failures.length, components: failures },
      );
    },
  };
}

const HTTP_SHUTDOWN_GRACE_MS = 1_000;
async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => server.closeAllConnections(), HTTP_SHUTDOWN_GRACE_MS);
    timer.unref();
    server.close((error) => {
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    });
    server.closeIdleConnections();
  });
}

export function createEntrypointGracefulClose(
  closeService: () => Promise<void>,
  requestExit: (code: number) => void,
): () => Promise<void> {
  let closing = false;
  return async () => {
    if (closing) return;
    closing = true;
    try {
      await closeService();
      requestExit(0);
    } catch (error) {
      closing = false;
      throw error;
    }
  };
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  try {
    const config = loadConfig();
    const service = await startAgentCoreService(config);
    process.stdout.write(`Agent Core RDC bridge listening on http://${service.host}:${service.port}/mcp\n`);

    const report = (error: unknown) => {
      activityTracker.captureFailure('SYSTEM', error, 'shutdown-failure');
      process.stderr.write(`Agent Core RDC bridge failed to close: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    };

    let controlTimer: NodeJS.Timeout | undefined;
    const gracefulClose = createEntrypointGracefulClose(
      async () => {
        if (controlTimer) {
          clearInterval(controlTimer);
          controlTimer = undefined;
        }
        await service.close();
      },
      (code) => {
        const timer = setTimeout(() => process.exit(code), 50);
        timer.unref();
      },
    );

    if (config.launcherControlFile) {
      let controlInFlight = false;
      controlTimer = setInterval(() => {
        if (controlInFlight) return;
        void (async () => {
          try {
            await access(config.launcherControlFile!);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
            report(error);
            return;
          }

          controlInFlight = true;
          if (controlTimer) {
            clearInterval(controlTimer);
            controlTimer = undefined;
          }
          await rm(config.launcherControlFile!, { force: true }).catch(() => undefined);
          activityTracker.record(
            'SYSTEM',
            'info',
            'Launcher requested full Agent Core shutdown',
            'launcher-shutdown-request',
          );
          await gracefulClose().catch(report);
        })();
      }, 250);
      controlTimer.unref();
    }

    process.once('SIGINT', () => { void gracefulClose().catch(report); });
    process.once('SIGTERM', () => { void gracefulClose().catch(report); });
  } catch (error) {
    activityTracker.captureFailure('SYSTEM', error, 'startup-failure');
    process.stderr.write(`Agent Core RDC bridge failed to start: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
