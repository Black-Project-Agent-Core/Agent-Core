import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadConfig } from '../../dist/config.js';
const cfg = loadConfig();
const mode = process.argv[2];
if (mode === 'inspect-task') {
  const { readFile } = await import('node:fs/promises');
  const data = JSON.parse(await readFile(new URL('../../runtime/agent-runtime/state.json', import.meta.url), 'utf8'));
  const t = data.tasks.find(task => task.id === process.argv[3]);
  if (!t) { console.log(JSON.stringify({found:false})); process.exitCode=2; }
  else console.log(JSON.stringify({found:true,id:t.id,status:t.status,terminalOutcome:t.terminalOutcome,
    verificationStatus:t.verificationStatus,finalizationStatus:t.finalization?.status,
    reportedModels:t.modelIdentity?.identities?.map(x=>x.model),
    metrics:{toolCalls:t.metrics?.toolCalls,toolFailures:t.metrics?.toolFailures,providerAttempts:t.metrics?.providerAttempts},
    episodes:t.episodes?.slice(-36).map(e=>({at:e.at,kind:e.kind,toolName:e.toolName,summary:e.summary?.slice(0,650),failureClass:e.failureClass,failureFamily:e.failureFamily}))}));
} else if (mode === 'probe') {
  console.log(JSON.stringify({ enabled: cfg.agentRuntime.enabled,
    policy: cfg.agentRuntime.capabilityPolicy,
    allowedCapabilities: cfg.agentRuntime.allowedCapabilities,
    toolCeilingCount: cfg.agentRuntime.allowedTools.length,
    uiAuthConfigured: Boolean(cfg.agentUiToken) }));
} else if (cfg.agentUiToken) {
  const bridge = fileURLToPath(new URL('../external/native-chat-bridge.mjs', import.meta.url));
  const child = spawn(process.execPath, [bridge, ...process.argv.slice(2)], {
    cwd: path.dirname(path.dirname(path.dirname(bridge))),
    windowsHide: true, stdio: 'inherit',
    env: { ...process.env, AGENT_CORE_UI_TOKEN: cfg.agentUiToken,
      AGENT_CORE_NATIVE_CHAT_TIMEOUT_MS: '120000' },
  });
  child.on('exit', code => { process.exitCode = code ?? 1; });
  child.on('error', error => { console.error(error.code || 'bridge-error'); process.exitCode = 1; });
} else { console.error('UI authentication is unavailable; no bypass attempted'); process.exitCode = 3; }
