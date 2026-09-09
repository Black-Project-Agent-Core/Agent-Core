import { mkdir } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';
import { FileKeyStore } from './auth/key-store.js';
import { loadConfig, loadRuntimeConfig, type AppConfig } from './config.js';
import { createHttpHandler } from './http/app.js';
import { createMemoryContextLeaseHttpHandler } from './http/memory-context-lease.js';
import { HttpSecurityPolicy } from './http/security-policy.js';
import { FileAuditLogger } from './logging/audit-log.js';
import { createMcpHttpHandler } from './mcp/handler.js';
import { SERVER_VERSION } from './mcp/server.js';
import { OAuthService } from './oauth/service.js';
import { FileOAuthStore } from './oauth/store.js';
import { createRuntimeServices, type RuntimeServices } from './runtime/services.js';
import { watchShutdownRequest, type ShutdownRequestWatcher } from './runtime/shutdown-request.js';
import type { MemoryServiceDependencies } from './memory/service.js';

export interface AgentCoreService {
  server: Server;
  host: string;
  port: number;
  memory: RuntimeServices['memory'];
  execution: RuntimeServices['execution'];
  telemetry: RuntimeServices['telemetry'];
  close(): Promise<void>;
}

export async function startAgentCoreService(config: AppConfig = loadConfig(), dependencies:{memory?:MemoryServiceDependencies}={}): Promise<AgentCoreService> {
  await Promise.all([
    mkdir(config.dataDir, { recursive: true }),
    mkdir(config.logDir, { recursive: true }),
    mkdir(config.capabilityDir, { recursive: true }),
  ]);

  const keyStore = new FileKeyStore(config.dataDir);
  const oauthStore = new FileOAuthStore(config.dataDir);
  const httpSecurity = new HttpSecurityPolicy(config.httpSecurity);
  const auditLogger = new FileAuditLogger(config.logDir, config.observability.audit);
  const runtime = createRuntimeServices(
    config.allowedRoots,
    config.capabilityDir,
    auditLogger,
    config.memory,
    config.execution,
    config.github,
    undefined,
    config.observability,
    SERVER_VERSION,
    config.maintenance,
    config.langflow,
    config.operatorDirectives,
    dependencies.memory,
  );
  const oauthService = new OAuthService(keyStore, oauthStore, httpSecurity, runtime.metrics);
  // Warm independent persistence subsystems without coupling listener availability to either one.
  await Promise.allSettled([
    runtime.memory.status(),
    runtime.operatorDirectives.status(''),
    config.execution.enabled ? runtime.execution.open() : Promise.resolve(),
  ]);
  runtime.maintenance.start();
  const server = createServer(createHttpHandler({
    keyStore,
    oauthService,
    security: httpSecurity,
    auditLogger,
    healthMetricsProvider: async () => runtime.healthMetrics.getMetrics(),
    metrics: runtime.metrics,
    telemetry: runtime.telemetry,
    healthProvider: async () => {
      const [memory, execution] = await Promise.all([
        runtime.memory.status(),
        runtime.execution.health(),
      ]);
      return {
        version: SERVER_VERSION,
        memory: { ...memory, state: runtime.memory.currentState },
        continuity: {
          enabled: memory.enabled,
          healthy: memory.healthy,
          snapshotReady: memory.healthy,
          counts: {
            activeTasks: 0,
            blockedTasks: 0,
            deferredTasks: 0,
            frontier: 0,
            interruptedTurns: 0,
          },
        },
        execution,
      };
    },
    mcpHandler: createMcpHttpHandler(runtime, { protocolMode: config.mcp.protocolMode }),
    memoryContextLeaseHandler: createMemoryContextLeaseHttpHandler(runtime),
  }));

  try {
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
  } catch (error) {
    runtime.maintenance.close();
    await Promise.allSettled([runtime.telemetry.close(), runtime.execution.close(), runtime.memory.close(), runtime.operatorDirectives.close(), auditLogger.close()]);
    throw error;
  }

  const address = server.address() as AddressInfo;
  return {
    server,
    host: config.host,
    port: address.port,
    memory: runtime.memory,
    execution: runtime.execution,
    telemetry: runtime.telemetry,
    close: async () => {
      await closeServer(server);
      runtime.maintenance.close();
      await runtime.telemetry.close();
      await runtime.execution.close();
      await runtime.memory.close();
      await runtime.operatorDirectives.close();
      await auditLogger.close();
    },
  };
}

const HTTP_SHUTDOWN_GRACE_MS = 1_000;

export function createEntrypointGracefulClose(
  closeService: () => Promise<void>,
  closeWatcher: () => void,
  requestExit: (code: number) => void,
): () => Promise<void> {
  let closing = false;
  return async () => {
    if (closing) return;
    closing = true;
    try {
      await closeService();
      closeWatcher();
      requestExit(0);
    } catch (error) {
      closing = false;
      throw error;
    }
  };
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    const forceCloseTimer = setTimeout(() => {
      server.closeAllConnections();
    }, HTTP_SHUTDOWN_GRACE_MS);
    forceCloseTimer.unref();
    server.close((error) => {
      clearTimeout(forceCloseTimer);
      if (error) reject(error);
      else resolve();
    });
    server.closeIdleConnections();
  });
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  try {
    const service = await startAgentCoreService(loadRuntimeConfig());
    process.stdout.write(`Agent Core listening on http://${service.host}:${service.port}/mcp\n`);
    let shutdownWatcher: ShutdownRequestWatcher | undefined;
    const gracefulClose = createEntrypointGracefulClose(
      () => service.close(),
      () => { shutdownWatcher?.close(); },
      (code) => {
        const exitTimer = setTimeout(() => process.exit(code), 50);
        exitTimer.unref();
      },
    );
    const reportCloseError = (error: unknown) => {
      process.stderr.write(`Agent Core failed to close cleanly: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    };
    const shutdownRequestPath = process.env.AGENT_CORE_SHUTDOWN_REQUEST_PATH?.trim();
    if (shutdownRequestPath) {
      shutdownWatcher = watchShutdownRequest(shutdownRequestPath, gracefulClose);
    }
    process.once('SIGINT', () => { void gracefulClose().catch(reportCloseError); });
    process.once('SIGTERM', () => { void gracefulClose().catch(reportCloseError); });
  } catch (error) {
    process.stderr.write(`Agent Core failed to start: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
