import { mkdir } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { pathToFileURL } from 'node:url';
import { FileKeyStore } from './auth/key-store.js';
import { CodeIntelligenceService } from './code-intelligence/service.js';
import { loadConfig, type AppConfig } from './config.js';
import { createHttpHandler } from './http/app.js';
import { HttpSecurityPolicy } from './http/security-policy.js';
import { LearningService } from './learning/service.js';
import { HermesPartnerService } from './partner/service.js';
import { SemanticIdeService } from './semantic-ide/service.js';
import { createMcpHttpHandler } from './mcp/handler.js';
import { CloudflareWorkersAIEmbedder } from './memory/embedder.js';
import { MemoryService } from './memory/service.js';
import { SERVER_VERSION } from './mcp/server.js';
import { OAuthService } from './oauth/service.js';
import { FileOAuthStore } from './oauth/store.js';
import { PhoneController } from './phone/controller.js';
import { configManager } from './rdc/config-manager.js';
import { toolHistory } from './rdc/utils/toolHistory.js';
import { ensureChromeAvailable } from './rdc/tools/pdf/markdown.js';
import { activityTracker } from './tracker/activity-tracker.js';

activityTracker.installProcessHooks();

export interface AgentCoreService {
  server: Server;
  host: string;
  port: number;
  close(): Promise<void>;
}

export async function startAgentCoreService(config: AppConfig = loadConfig()): Promise<AgentCoreService> {
  activityTracker.record('SYSTEM', 'info', 'Starting Agent Core RDC bridge', 'service-start');
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
  const memoryService = await MemoryService.initialize(process.cwd(), config.memoryDir, memoryEmbedder);
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

  let hermesPartner: HermesPartnerService | undefined;
  if (config.hermesPartner) {
    try {
      hermesPartner = await HermesPartnerService.initialize(config.hermesPartner);
    } catch (error) {
      activityTracker.captureFailure('PARTNER', error, 'partner-service-start-failure');
    }
  }

  const keyStore = new FileKeyStore(config.dataDir);
  const oauthStore = new FileOAuthStore(config.dataDir);
  const security = new HttpSecurityPolicy(config.httpSecurity);
  const oauthService = new OAuthService(keyStore, oauthStore, security, undefined, (context) => {
    activityTracker.record('AUTH', 'info', 'OAuth authorization request rejected', 'oauth-authorization-validation', context);
  });
  const server = createServer(createHttpHandler({
    keyStore,
    oauthService,
    security,
    healthProvider: async () => {
      const [liveMemoryHealth, liveRdcHealth, livePhoneHealth, liveCodeIntelligenceHealth, liveSemanticIdeHealth, liveLearningHealth, livePartnerHealth] = await Promise.all([
        memoryService.refreshHealth(),
        configManager.health(),
        phoneController ? phoneController.health() : Promise.resolve(undefined),
        codeIntelligence ? codeIntelligence.health() : Promise.resolve(undefined),
        semanticIde ? semanticIde.health() : Promise.resolve(undefined),
        learningService ? learningService.health() : Promise.resolve(undefined),
        hermesPartner ? hermesPartner.health() : Promise.resolve(undefined),
      ]);
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
        ...(livePartnerHealth ? { partner: livePartnerHealth } : {}),
      };
    },
    mcpHandler: createMcpHttpHandler({
      protocolMode: config.mcp.protocolMode,
      memoryService,
      learningService,
      hermesPartner,
      semanticIde,
      phoneController,
      codeIntelligence,
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
  activityTracker.record('SYSTEM', 'success', 'Agent Core RDC bridge is listening', 'service-listening', { host: config.host, port: address.port });
  return {
    server,
    host: config.host,
    port: address.port,
    close: async () => {
      activityTracker.record('SYSTEM', 'info', 'Agent Core service is closing', 'service-stop');
      await closeServer(server);
      if (hermesPartner) await hermesPartner.close();
      if (semanticIde) await semanticIde.close();
      if (codeIntelligence) await codeIntelligence.close();
      await toolHistory.cleanup();
      await configManager.close();
      activityTracker.record('SYSTEM', 'success', 'Agent Core service closed', 'service-stopped');
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
    const service = await startAgentCoreService(loadConfig());
    process.stdout.write(`Agent Core RDC bridge listening on http://${service.host}:${service.port}/mcp\n`);
    const gracefulClose = createEntrypointGracefulClose(
      () => service.close(),
      (code) => {
        const timer = setTimeout(() => process.exit(code), 50);
        timer.unref();
      },
    );
    const report = (error: unknown) => {
      activityTracker.captureFailure('SYSTEM', error, 'shutdown-failure');
      process.stderr.write(`Agent Core RDC bridge failed to close: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    };
    process.once('SIGINT', () => { void gracefulClose().catch(report); });
    process.once('SIGTERM', () => { void gracefulClose().catch(report); });
  } catch (error) {
    activityTracker.captureFailure('SYSTEM', error, 'startup-failure');
    process.stderr.write(`Agent Core RDC bridge failed to start: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
