import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { access, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const SHADOW_PORTS = Object.freeze({ agentCore: 8865, codespaceMcp: 39765, observatory: 3697 });
const LIVE_AGENT_CORE_URL = 'http://127.0.0.1:8765/health';
const LIVE_CODESPACE_URL = 'http://127.0.0.1:38765/healthz';
const LIVE_METADATA_PATHS = [
  '/workspaces/.agent-core-codespace/agent-core.pid',
  '/workspaces/.agent-core-codespace/connection.json',
  '/workspaces/.agent-core-codespace/mcp-url.txt',
  '/workspaces/Agent-Core/plugin/codespace/runtime/state/http-mcp.url',
  '/workspaces/Agent-Core/plugin/codespace/runtime/state/http-mcp.lifecycle.json',
];
const SECRET_ENV_KEY = /(?:TOKEN|SECRET|PASSWORD|PASSWD|PWD|CREDENTIAL|API_KEY|ENCRYPTION_KEY)/i;
const MAX_LOG_TAIL = 8_000;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function safeLog(value) {
  return String(value)
    .replace(/mcl1\.[A-Za-z0-9_.-]+/g, '[REDACTED_LEASE]')
    .replace(/(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]+/gi, '[REDACTED_GITHUB_TOKEN]')
    .slice(-MAX_LOG_TAIL);
}

function cleanChildEnv(overrides = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (SECRET_ENV_KEY.test(key)) delete env[key];
  }
  for (const key of [
    'AGENT_CORE_PUBLIC_BASE_URL', 'AGENT_CORE_TRUST_PROXY', 'AGENT_CORE_MCP_ALLOWED_ORIGINS',
    'AGENT_CORE_OTLP_ENDPOINT', 'AGENT_CORE_MEMORY_REMOTE_OWNER', 'AGENT_CORE_MEMORY_REMOTE_REPO',
    'AGENT_CORE_MEMORY_REMOTE_KEY_FILE', 'AGENT_CORE_MEMORY_REMOTE_KEY_HEX', 'AGENT_CORE_MEMORY_REMOTE_PRINCIPAL_ID',
    'AGENT_CORE_GITHUB_TOKEN_FILE', 'AGENT_CORE_GITHUB_PACKAGES_TOKEN_FILE',
    'CODESPACE_MCP_HTTP_URL_FILE', 'CODESPACE_MCP_HTTP_LIFECYCLE_FILE',
    'CODESPACE_AGENT_CORE_MEMORY_LEASE_URL', 'CODESPACE_AGENT_CORE_SHARED_MEMORY_URL',
  ]) delete env[key];
  return { ...env, ...overrides };
}

async function fileFingerprint(filePath) {
  try {
    const bytes = await readFile(filePath);
    const info = await stat(filePath);
    return {
      path: filePath,
      exists: true,
      bytes: info.size,
      hash: createHash('sha256').update(bytes).digest('hex'),
    };
  } catch {
    return { path: filePath, exists: false, bytes: 0, hash: null };
  }
}

async function metadataFingerprint(paths = LIVE_METADATA_PATHS) {
  return Promise.all(paths.map(fileFingerprint));
}

function projectAgentHealth(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    status: value.status ?? null,
    version: value.version ?? null,
    memory: value.memory ? {
      enabled: value.memory.enabled ?? null,
      healthy: value.memory.healthy ?? null,
      state: value.memory.state ?? null,
      schemaVersion: value.memory.schemaVersion ?? null,
      dbPath: value.memory.dbPath ?? null,
    } : null,
    execution: value.execution ? {
      enabled: value.execution.enabled ?? null,
      healthy: value.execution.healthy ?? null,
      state: value.execution.state ?? null,
      schemaVersion: value.execution.schemaVersion ?? null,
      dbPath: value.execution.dbPath ?? null,
    } : null,
  };
}

function projectCodespaceHealth(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    name: value.name ?? null,
    version: value.version ?? null,
    status: value.status ?? null,
    transport: value.transport ?? null,
    pid: value.pid ?? null,
  };
}

async function fetchJson(url, timeoutMs = 2_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function safeFetchProjection(url, projector) {
  try { return projector(await fetchJson(url)); }
  catch { return null; }
}

async function waitForJson(url, predicate, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'unavailable';
  while (Date.now() < deadline) {
    try {
      const value = await fetchJson(url, 1_000);
      if (predicate(value)) return value;
      lastError = `predicate rejected ${JSON.stringify(value).slice(0, 400)}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(100);
  }
  throw new Error(`SHADOW_READINESS_TIMEOUT ${url}: ${safeLog(lastError)}`);
}

async function assertPortFree(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', (error) => reject(new Error(`SHADOW_PORT_IN_USE:${port}:${error.code ?? error.message}`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}

async function isPortFree(port) {
  try { await assertPortFree(port); return true; }
  catch { return false; }
}

function spawnTracked(label, command, args, options) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk) => { stdout = safeLog(`${stdout}${chunk}`); });
  child.stderr?.on('data', (chunk) => { stderr = safeLog(`${stderr}${chunk}`); });
  child.once('error', (error) => { stderr = safeLog(`${stderr}\n${error.message}`); });
  return { label, child, output: () => ({ stdout, stderr }) };
}

async function stopTracked(item) {
  const child = item?.child;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const exited = once(child, 'exit').then(() => true).catch(() => true);
  const timeout = sleep(3_000).then(() => false);
  if (!await Promise.race([exited, timeout])) {
    child.kill('SIGKILL');
    await Promise.race([once(child, 'exit').catch(() => undefined), sleep(1_000)]);
  }
}

function parseToolJson(result, toolName) {
  if (result?.isError) throw new Error(`${toolName}_FAILED:${safeLog(JSON.stringify(result.content ?? []))}`);
  const text = Array.isArray(result?.content)
    ? result.content.find((item) => item && item.type === 'text' && typeof item.text === 'string')?.text
    : undefined;
  if (!text) throw new Error(`${toolName}_MISSING_TEXT_RESULT`);
  try { return JSON.parse(text); }
  catch { throw new Error(`${toolName}_INVALID_JSON_RESULT`); }
}

async function loadMcpClient(pluginRoot) {
  const require = createRequire(path.join(pluginRoot, 'package.json'));
  const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
  return { Client, StreamableHTTPClientTransport };
}

async function requireArtifact(target, code) {
  try { await access(target); }
  catch { throw new Error(`${code}:${target}`); }
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
}

function authoritativeSnapshotProjection(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  return {
    schemaVersion: snapshot.schemaVersion,
    project: snapshot.project,
    status: snapshot.status,
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    conflicts: snapshot.conflicts,
    timeline: snapshot.timeline,
    continuity: snapshot.continuity,
    truncated: snapshot.truncated,
  };
}

export async function runMemoryObservatoryShadowCanary(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const pluginRoot = path.join(repoRoot, 'plugin', 'codespace');
  const observatoryRoot = path.join(repoRoot, 'SubProject', 'Memory-Observatory');
  const rootEntry = path.join(repoRoot, 'dist', 'index.js');
  const pluginEntry = path.join(pluginRoot, 'dist', 'http-server.js');
  const observatoryEntry = path.join(observatoryRoot, 'server-dist', 'server.js');
  await Promise.all([
    requireArtifact(rootEntry, 'SHADOW_AGENT_CORE_BUILD_REQUIRED'),
    requireArtifact(pluginEntry, 'SHADOW_CODESPACE_BUILD_REQUIRED'),
    requireArtifact(observatoryEntry, 'SHADOW_OBSERVATORY_BUILD_REQUIRED'),
  ]);
  await Promise.all(Object.values(SHADOW_PORTS).map(assertPortFree));

  const liveAgentCoreBefore = await safeFetchProjection(LIVE_AGENT_CORE_URL, projectAgentHealth);
  const liveCodespaceBefore = await safeFetchProjection(LIVE_CODESPACE_URL, projectCodespaceHealth);
  const metadataBefore = await metadataFingerprint();

  const providedStateRoot = options.stateRoot ? path.resolve(options.stateRoot) : null;
  const shadowRoot = providedStateRoot ?? await mkdtemp(path.join(os.tmpdir(), 'agent-core-memory-observatory-shadow-'));
  if (providedStateRoot) await mkdir(shadowRoot, { recursive: true });
  const workspaceRoot = path.join(shadowRoot, 'workspace');
  const agentCoreRoot = path.join(shadowRoot, 'agent-core');
  const codespaceRoot = path.join(shadowRoot, 'codespace');
  await Promise.all([
    mkdir(workspaceRoot, { recursive: true }),
    mkdir(agentCoreRoot, { recursive: true }),
    mkdir(codespaceRoot, { recursive: true }),
  ]);
  const urlFile = path.join(codespaceRoot, 'http-mcp.url');
  const children = [];
  let client;
  let transport;
  let opened;
  let openedResume;
  let checkpoint;
  let checkpointFinal;
  let mutationVerified = false;
  let recallCompleted = false;
  let resumedRecallCount = 0;
  let graph;
  let backendGraph;
  let activity;
  let failure;

  try {
    const agent = spawnTracked('agent-core-shadow', process.execPath, [rootEntry], {
      cwd: repoRoot,
      env: cleanChildEnv({
        AGENT_CORE_HOST: '127.0.0.1',
        AGENT_CORE_PORT: String(SHADOW_PORTS.agentCore),
        AGENT_CORE_DATA_DIR: path.join(agentCoreRoot, 'data'),
        AGENT_CORE_LOG_DIR: path.join(agentCoreRoot, 'logs'),
        AGENT_CORE_CAPABILITY_DIR: path.join(repoRoot, 'capabilities'),
        AGENT_CORE_ALLOWED_ROOTS: workspaceRoot,
        AGENT_CORE_MEMORY_ENABLED: 'true',
        AGENT_CORE_MEMORY_PRINCIPAL_ID: 'memory-observatory-shadow-canary',
        AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: 'advisory',
        AGENT_CORE_MEMORY_DB_PATH: path.join(agentCoreRoot, 'memory', 'agent-core-memory.sqlite'),
        AGENT_CORE_MEMORY_REMOTE_ENABLED: 'false',
        AGENT_CORE_MEMORY_OBSERVATORY_ENABLED: 'true',
        AGENT_CORE_MEMORY_OBSERVATORY_MODE: 'shadow',
        AGENT_CORE_EXECUTION_ENABLED: 'true',
        AGENT_CORE_EXECUTION_DB_PATH: path.join(agentCoreRoot, 'execution', 'execution.sqlite'),
        AGENT_CORE_EXECUTION_LOG_ROOT: path.join(agentCoreRoot, 'execution', 'runs'),
        AGENT_CORE_GITHUB_ENABLED: 'false',
        AGENT_CORE_MAINTENANCE_ENABLED: 'false',
        AGENT_CORE_MCP_PROTOCOL_MODE: 'dual',
      }),
    });
    children.push(agent);
    await waitForJson(`http://127.0.0.1:${SHADOW_PORTS.agentCore}/health`, (value) =>
      value?.status === 'ok' && value?.memory?.healthy === true && value?.execution?.healthy === true);

    const codespace = spawnTracked('codespace-mcp-shadow', process.execPath, [pluginEntry], {
      cwd: pluginRoot,
      env: cleanChildEnv({
        NODE_ENV: 'test',
        CODESPACE_WORKSPACE_ROOT: workspaceRoot,
        CODESPACE_TEST_ALLOWED_BASE: shadowRoot,
        CODESPACE_MCP_HTTP_HOST: '127.0.0.1',
        CODESPACE_MCP_HTTP_PORT: String(SHADOW_PORTS.codespaceMcp),
        CODESPACE_MCP_HTTP_URL_FILE: urlFile,
        CODESPACE_MEMORY_LIFECYCLE_MODE: 'advisory',
        CODESPACE_AGENT_CORE_MEMORY_LEASE_URL: `http://127.0.0.1:${SHADOW_PORTS.agentCore}/internal/memory-context-lease`,
        CODESPACE_AGENT_CORE_SHARED_MEMORY_URL: `http://127.0.0.1:${SHADOW_PORTS.agentCore}/internal/codespace-memory`,
        CODESPACE_MEMORY_LEASE_TIMEOUT_MS: '5000',
        CODESPACE_SHARED_MEMORY_TIMEOUT_MS: '10000',
      }),
    });
    children.push(codespace);
    await waitForJson(`http://127.0.0.1:${SHADOW_PORTS.codespaceMcp}/healthz`, (value) => value?.status === 'ok');

    const observatory = spawnTracked('memory-observatory-shadow', process.execPath, [observatoryEntry], {
      cwd: observatoryRoot,
      env: cleanChildEnv({
        MEMORY_OBSERVATORY_HOST: '127.0.0.1',
        MEMORY_OBSERVATORY_PORT: String(SHADOW_PORTS.observatory),
        MEMORY_OBSERVATORY_AGENT_CORE_URL: `http://127.0.0.1:${SHADOW_PORTS.agentCore}`,
        MEMORY_OBSERVATORY_WORKSPACE_ROOT: workspaceRoot,
      }),
    });
    children.push(observatory);
    await waitForJson(`http://127.0.0.1:${SHADOW_PORTS.observatory}/api/health`, (value) => value?.status === 'ok' && value?.mode === 'shadow');

    const { Client, StreamableHTTPClientTransport } = await loadMcpClient(pluginRoot);
    client = new Client({ name: 'memory-observatory-shadow-canary', version: '1.0.0' });
    transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${SHADOW_PORTS.codespaceMcp}/mcp`));
    await client.connect(transport);
    const tools = await client.listTools();
    if (tools.tools.length !== 19) throw new Error(`SHADOW_TOOL_COUNT_MISMATCH:${tools.tools.length}`);

    const status = parseToolJson(await client.callTool({ name: 'memory_status', arguments: {} }), 'memory_status');
    if (status?.enabled !== true || status?.healthy !== true) throw new Error('SHADOW_SHARED_MEMORY_UNHEALTHY');

    opened = parseToolJson(await client.callTool({
      name: 'memory_open_context',
      arguments: {
        task: 'Run isolated Memory Observatory shadow canary',
        context: 'Exercise recall, bounded mutation, checkpoint, graph projection, and activity evidence.',
        continuity: {
          objective: 'Prove the shadow candidate path without replacing the live Codespace runtime.',
          acceptanceCriteria: ['bounded file mutation verified', 'memory checkpoint completed', 'observatory evidence visible'],
        },
      },
    }), 'memory_open_context');
    if (!opened?.memoryContextLease || !opened?.memoryContextId || !opened?.continuityTaskId || !opened?.continuityTurnId || !opened?.routeContextId) {
      throw new Error('SHADOW_OPEN_CONTEXT_INCOMPLETE');
    }

    const search = parseToolJson(await client.callTool({
      name: 'memory_search',
      arguments: { query: 'isolated Memory Observatory shadow canary', includeHistory: false, limit: 8 },
    }), 'memory_search');
    recallCompleted = Array.isArray(search?.hits);

    const mutationResult = await client.callTool({
      name: 'write_file',
      arguments: {
        path: 'shadow-canary.txt',
        content: 'shadow candidate mutation verified\n',
        memoryContextLease: opened.memoryContextLease,
      },
    });
    if (mutationResult?.isError) throw new Error(`SHADOW_MUTATION_FAILED:${safeLog(JSON.stringify(mutationResult.content ?? []))}`);
    const written = await readFile(path.join(workspaceRoot, 'shadow-canary.txt'), 'utf8');
    mutationVerified = written === 'shadow candidate mutation verified\n';
    if (!mutationVerified) throw new Error('SHADOW_MUTATION_VERIFY_FAILED');

    checkpoint = parseToolJson(await client.callTool({
      name: 'memory_checkpoint',
      arguments: {
        routeContextId: opened.routeContextId,
        memoryContextId: opened.memoryContextId,
        continuityTaskId: opened.continuityTaskId,
        continuityTurnId: opened.continuityTurnId,
        status: 'completed',
        summary: 'Isolated shadow candidate mutation and memory workflow completed.',
        evidence: [{ type: 'file', ref: 'shadow-canary.txt', result: 'verified' }],
        decisions: [{
          key: 'shadow-canary-mode',
          value: 'isolated candidate verified',
          reason: 'The candidate MCP mutation, checkpoint, and observer path were verified.',
        }],
        outcomes: [{
          key: 'shadow-canary-outcome',
          value: 'candidate path works without live replacement',
          evidenceRefs: ['shadow-canary.txt'],
        }],
        projectTerminal: true,
      },
    }), 'memory_checkpoint');
    if (checkpoint?.taskStatus !== 'completed' || checkpoint?.turnState !== 'closed' || checkpoint?.memoryLifecycle?.postflightState !== 'CLOSED') {
      throw new Error(`SHADOW_CHECKPOINT_NOT_CLOSED:${safeLog(JSON.stringify(checkpoint))}`);
    }

    const activityUrl = `http://127.0.0.1:${SHADOW_PORTS.observatory}/api/activity?after=0&limit=250`;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      graph = await fetchJson(`http://127.0.0.1:${SHADOW_PORTS.observatory}/api/snapshot`);
      activity = await fetchJson(activityUrl);
      const events = new Set((activity?.records ?? []).map((record) => record.event));
      const contextObserved = (activity?.records ?? []).some((record) => record.contextId === opened.memoryContextId);
      const taskObserved = (activity?.records ?? []).some((record) => record.continuityTaskId === opened.continuityTaskId);
      if ((graph?.nodes?.length ?? 0) > 0 && contextObserved && taskObserved
        && events.has('memory.write_decision') && events.has('memory.postflight_completed')) break;
      await sleep(100);
    }

    backendGraph = await fetchJson(`http://127.0.0.1:${SHADOW_PORTS.agentCore}/internal/memory-observatory/snapshot`);
    const events = [...new Set((activity?.records ?? []).map((record) => record.event))].sort();
    const contextObserved = (activity?.records ?? []).some((record) => record.contextId === opened.memoryContextId);
    const taskObserved = (activity?.records ?? []).some((record) => record.continuityTaskId === opened.continuityTaskId);
    const memoryNodeIds = new Set((graph?.nodes ?? []).map((node) => node.memoryId));
    const promoted = checkpoint?.promotedMemoryIds ?? [];
    if (!promoted.some((memoryId) => memoryNodeIds.has(memoryId))) throw new Error('SHADOW_PROMOTED_MEMORY_NOT_IN_GRAPH');

    await client.close();
    client = undefined;
    transport = undefined;
  } catch (error) {
    failure = error;
  } finally {
    if (client) await client.close().catch(() => undefined);
    for (const item of [...children].reverse()) await stopTracked(item);
  }

  const liveAgentCoreAfter = await safeFetchProjection(LIVE_AGENT_CORE_URL, projectAgentHealth);
  const liveCodespaceAfter = await safeFetchProjection(LIVE_CODESPACE_URL, projectCodespaceHealth);
  const metadataAfter = await metadataFingerprint();
  const shadowPortsReleased = (await Promise.all(Object.values(SHADOW_PORTS).map(isPortFree))).every(Boolean);
  const liveUnchanged = stableJson(liveAgentCoreBefore) === stableJson(liveAgentCoreAfter)
    && stableJson(liveCodespaceBefore) === stableJson(liveCodespaceAfter)
    && stableJson(metadataBefore) === stableJson(metadataAfter);

  const result = {
    ports: { ...SHADOW_PORTS },
    shadow: {
      agentCoreHealthy: Boolean(graph),
      codespaceMcpHealthy: Boolean(opened),
      observatoryHealthy: Boolean(activity),
      separateStateRoots: shadowRoot !== '/workspaces/.agent-core-codespace'
        && !workspaceRoot.startsWith('/workspaces/.agent-core-codespace')
        && !agentCoreRoot.startsWith('/workspaces/.agent-core-codespace'),
      githubEnabled: false,
      remoteMemoryEnabled: false,
    },
    workflow: {
      toolCount: 19,
      openedContext: Boolean(opened?.memoryContextId),
      recallCompleted,
      mutationVerified,
      checkpointClosed: checkpoint?.memoryLifecycle?.postflightState === 'CLOSED',
      checkpointStatus: checkpoint?.taskStatus ?? null,
      leaseExposedInResult: false,
    },
    observatory: {
      graphNodeCount: graph?.nodes?.length ?? 0,
      graphEdgeCount: graph?.edges?.length ?? 0,
      activityCount: activity?.records?.length ?? 0,
      contextObserved: Boolean(opened && (activity?.records ?? []).some((record) => record.contextId === opened.memoryContextId)),
      taskObserved: Boolean(opened && (activity?.records ?? []).some((record) => record.continuityTaskId === opened.continuityTaskId)),
      snapshotMatchesBackend: Boolean(graph && backendGraph && stableJson(authoritativeSnapshotProjection(graph)) === stableJson(authoritativeSnapshotProjection(backendGraph))),
      events: [...new Set((activity?.records ?? []).map((record) => record.event))].sort(),
    },
    live: {
      agentCoreBefore: liveAgentCoreBefore,
      agentCoreAfter: liveAgentCoreAfter,
      codespaceBefore: liveCodespaceBefore,
      codespaceAfter: liveCodespaceAfter,
      metadataBefore,
      metadataAfter,
      unchanged: liveUnchanged,
    },
    cleanup: { shadowPortsReleased },
  };

  if (!providedStateRoot) await rm(shadowRoot, { recursive: true, force: true }).catch(() => undefined);

  if (failure) {
    const childEvidence = children.map((item) => ({ label: item.label, ...item.output() }));
    throw new Error(`MEMORY_OBSERVATORY_SHADOW_CANARY_FAILED: ${safeLog(failure instanceof Error ? failure.message : String(failure))}; childEvidence=${safeLog(JSON.stringify(childEvidence))}`);
  }
  if (!liveUnchanged) throw new Error(`LIVE_RUNTIME_CHANGED_DURING_SHADOW_CANARY:${safeLog(JSON.stringify(result.live))}`);
  if (!shadowPortsReleased) throw new Error('SHADOW_PORT_RELEASE_FAILED');
  return result;
}

function cliOptions(argv) {
  let stateRoot;
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') { json = true; continue; }
    if (arg === '--root') {
      const value = argv[index + 1];
      if (!value) throw new Error('SHADOW_CANARY_ROOT_REQUIRED');
      stateRoot = value;
      index += 1;
      continue;
    }
    throw new Error(`SHADOW_CANARY_ARGUMENT_UNSUPPORTED:${arg}`);
  }
  return { stateRoot, json };
}

function cliReport(result) {
  return {
    status: 'PASS',
    shadow: {
      agentCoreUrl: `http://127.0.0.1:${SHADOW_PORTS.agentCore}`,
      candidateMcpUrl: `http://127.0.0.1:${SHADOW_PORTS.codespaceMcp}/mcp`,
      observatoryUrl: `http://127.0.0.1:${SHADOW_PORTS.observatory}`,
      githubEnabled: result.shadow.githubEnabled,
      remoteMemoryEnabled: result.shadow.remoteMemoryEnabled,
      separateStateRoots: result.shadow.separateStateRoots,
    },
    canary: {
      memoryContextOpened: result.workflow.openedContext,
      recallObserved: result.workflow.recallCompleted,
      mutationFileWritten: result.workflow.mutationVerified,
      checkpointCompleted: result.workflow.checkpointClosed && result.workflow.checkpointStatus === 'completed',
      memoryActivityObserved: result.observatory.activityCount > 0 && result.observatory.contextObserved && result.observatory.taskObserved,
      observatorySnapshotMatchesBackend: result.observatory.snapshotMatchesBackend,
      graphNodeCount: result.observatory.graphNodeCount,
      activityCount: result.observatory.activityCount,
      events: result.observatory.events,
    },
    live: {
      before: {
        agentCore: result.live.agentCoreBefore,
        codespace: result.live.codespaceBefore,
        metadata: result.live.metadataBefore,
      },
      after: {
        agentCore: result.live.agentCoreAfter,
        codespace: result.live.codespaceAfter,
        metadata: result.live.metadataAfter,
      },
    },
    cleanup: { shadowPortsClosed: result.cleanup.shadowPortsReleased },
  };
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entry && fileURLToPath(import.meta.url) === entry) {
  let parsed;
  try { parsed = cliOptions(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write(`${safeLog(error instanceof Error ? error.message : String(error))}\n`);
    process.exitCode = 1;
  }
  if (parsed) {
    runMemoryObservatoryShadowCanary({ repoRoot: process.cwd(), ...(parsed.stateRoot ? { stateRoot: parsed.stateRoot } : {}) })
      .then((result) => {
        const report = cliReport(result);
        process.stdout.write(parsed.json ? `${JSON.stringify(report)}\n` : `${JSON.stringify(report, null, 2)}\n`);
      })
      .catch((error) => {
        process.stderr.write(`${safeLog(error instanceof Error ? error.message : String(error))}\n`);
        process.exitCode = 1;
      });
  }
}
