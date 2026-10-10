import type { DesktopSnapshot } from './host';
import { labelForTone, normalizeTone, type SystemView } from './model';

const text = (value: unknown, fallback = '-') => {
  const str = String(value ?? '').trim();
  return str || fallback;
};

export function buildSystems(snapshot?: DesktopSnapshot): SystemView[] {
  if (!snapshot) return [];
  const h = snapshot.health;
  const semanticVersions = h.semanticIde.configuredServers
    .filter(server => server.compatibility === 'compatible')
    .map(server => server.id === 'csharp' ? 'C#' : server.id === 'typescript' ? 'TS' : server.id === 'powershell' ? 'PowerShell' : server.id === 'python' ? 'Python' : server.id)
    .join(', ');
  const codeTone = normalizeTone(h.codeIntelligence.status, h.codeIntelligence.issueCount);
  const semanticTone = normalizeTone(h.semanticIde.status, h.semanticIde.issueCount);
  const memoryTone = normalizeTone(h.memory.status, h.memory.issueCount);
  const executionTone = normalizeTone(h.execution.status);
  const learningTone = normalizeTone(h.learning.status, h.learning.issueCount);
  const agentRuntime = h.agentRuntime;
  const agentTone = agentRuntime ? normalizeTone(agentRuntime.status, agentRuntime.issueCount) : 'offline';
  const phoneTone = normalizeTone(h.phone.status);
  const tunnelTone = snapshot.tunnel.ready ? 'healthy' : 'offline';
  const coreTone = snapshot.core.httpHealthy ? 'healthy' : 'error';

  const systems: SystemView[] = [
    {
      id:'core', name:'Core Runtime', description:'Main agent process and runtime environment', tone:coreTone,
      label:labelForTone(coreTone), category:'Core',
      meta:[['Version', snapshot.version], ['PID', text(snapshot.core.pid)], ['Port', String(snapshot.core.port)], ['HTTP', snapshot.core.httpHealthy ? 'Responding' : 'Unavailable']],
    },
    {
      id:'memory', name:'Memory', description:'Canonical store, embeddings and retrieval', tone:memoryTone,
      label:labelForTone(memoryTone), category:'Memory',
      meta:[['Components','4'], ['Index',text(h.memory.index)], ['Embedding',text(h.memory.embedding)], ['Notes',String(h.memory.noteCount)]],
      issue:h.memory.issueCount ? `${h.memory.issueCount} memory issue(s)` : undefined,
    },
    {
      id:'code', name:'Code Intelligence', description:'Code analysis and intelligence provider', tone:codeTone,
      label:labelForTone(codeTone), category:'Code Intelligence',
      meta:[['Provider',text(h.codeIntelligence.provider)], ['Index',text(h.codeIntelligence.index)], ['Daemon',text(h.codeIntelligence.daemon)], ['Isolation',h.codeIntelligence.isolationOk ? 'OK' : 'Issue']],
      issue:h.codeIntelligence.issue,
    },
    {
      id:'semantic', name:'Semantic IDE', description:'IDE integration and language understanding', tone:semanticTone,
      label:labelForTone(semanticTone), category:'Semantic IDE',
      meta:[['Components',String(h.semanticIde.configuredServers.length)], ['Languages',semanticVersions || '-'], ['Status',text(h.semanticIde.status)], ['Issues',String(h.semanticIde.issueCount)]],
      issue:h.semanticIde.issue,
    },
    {
      id:'execution', name:'Execution', description:'Execution bridge and tool runtime', tone:executionTone,
      label:labelForTone(executionTone), category:'Execution',
      meta:[['Mode',text(h.execution.mode)], ['HTTP',snapshot.core.httpHealthy ? 'Healthy' : 'Unavailable'], ['Bridge',snapshot.status.connection === 'on' ? 'Responding' : 'Offline'], ['Issues',executionTone === 'healthy' ? '0' : '1']],
    },
    {
      id:'learning', name:'Learning', description:'Continuous learning and model improvement', tone:learningTone,
      label:labelForTone(learningTone), category:'Learning',
      meta:[['Components',String(h.learning.sinkStatus.length)], ['Memory Sink',h.learning.sinkStatus.find(s=>s.name==='memory')?.available ? 'Ready' : 'Unavailable'], ['Grafel Sink',h.learning.sinkStatus.find(s=>s.name==='grafel-patterns')?.available ? 'Ready' : 'Unavailable'], ['Issues',String(h.learning.issueCount)]],
    },
    {
      id:'partner', name:'Agent Core AI', description:'Native model + Agent Core tool runtime', tone:agentTone,
      label:agentRuntime ? labelForTone(agentTone) : 'Coming Soon', category:'AI Agent',
      meta:agentRuntime
        ? [['Providers',`${agentRuntime.configuredProviderCount}/${agentRuntime.providerCount}`], ['Sessions',String(agentRuntime.sessionCount)], ['Running',String(agentRuntime.runningSessionCount)], ['Pending Finalization',String(agentRuntime.pendingFinalizationCount)], ['Skills',String(agentRuntime.skillCount)]]
        : [['Providers','Not configured'], ['Sessions','0'], ['Running','0'], ['Pending Finalization','0'], ['Skills','0']],
      issue:agentRuntime?.issue,
    },
    {
      id:'phone', name:'Phone', description:'Mobile device integration and device bridge', tone:phoneTone,
      label:labelForTone(phoneTone), category:'Phone',
      meta:[['Mode',text(h.phone.mode)], ['Pairing',h.phone.deviceOnline ? 'Connected' : 'Offline'], ['Transport',text(h.phone.transport)], ['Device',text(h.phone.deviceId)]],
    },
    {
      id:'game', name:'Game Mode', description:'Game automation and interactive mode', tone:phoneTone,
      label:labelForTone(phoneTone), category:'Game Mode',
      meta:[['Device',text(h.phone.deviceId)], ['Controller',h.phone.deviceOnline ? 'Online' : 'Offline'], ['Transport',text(h.phone.transport)], ['State',snapshot.status.gameMode === 'on' ? 'Ready' : 'Unavailable']],
    },
    {
      id:'tunnel', name:'Tunnel', description:'Secure tunnel and remote access', tone:tunnelTone,
      label:labelForTone(tunnelTone), category:'Tunnel',
      meta:[['Port',String(snapshot.tunnel.port)], ['Status',snapshot.tunnel.ready ? 'Ready' : 'Offline'], ['Transport','Secure tunnel'], ['Issues',snapshot.tunnel.ready ? '0' : '1']],
    },
    {
      id:'integrations', name:'Integrations', description:'OAuth, API keys and external services', tone:'unknown',
      label:'Unknown', category:'Integrations',
      meta:[['Evidence','No dedicated health surface'], ['Host','Local'], ['Core',snapshot.status.connection === 'on' ? 'Online' : 'Offline'], ['Issues','-']],
    },
    {
      id:'auth', name:'Auth / OAuth', description:'Authentication and authorization', tone:'unknown',
      label:'Unknown', category:'Security',
      meta:[['Evidence','No dedicated health surface'], ['Core Status',snapshot.status.connection === 'on' ? 'Online' : 'Offline'], ['Data Store','Protected'], ['Issues','-']],
    },
  ];
  return systems;
}

export function systemCounts(systems: SystemView[]) {
  const counts = { all: systems.length, healthy:0, degraded:0, warning:0, error:0, offline:0, unknown:0 };
  for (const item of systems) counts[item.tone] += 1;
  return counts;
}
