import {
  AGENT_CAPABILITY_CATALOG,
  AGENT_CAPABILITY_FAMILIES,
  capabilityDescriptor,
  capabilityRisk,
  isAgentCapabilityFamily,
  type AgentCapabilityFamily,
  type AgentCapabilityRisk,
  type AgentToolRestriction,
} from './agent-capability-catalog.js';

export type AgentCapabilityPolicyMode =
  | 'explicit'
  | 'minimal'
  | 'read-only'
  | 'dynamic';

export interface AgentCapabilityPolicyConfig {
  mode: AgentCapabilityPolicyMode;
  allowedTools: string[];
  allowedCapabilities: AgentCapabilityFamily[];
}

export interface AgentCapabilityRequest {
  requestedFamilies: AgentCapabilityFamily[];
  userPrompt: string;
  reason?: string;
  expectedActions?: string[];
  availableTools: string[];
  currentFamilies?: AgentCapabilityFamily[];
}

export interface AgentCapabilityDenied {
  family: AgentCapabilityFamily;
  reason:
    | 'policy-mode'
    | 'operator-family-ceiling'
    | 'user-intent'
    | 'tool-ceiling'
    | 'unavailable';
}

export interface AgentCapabilityResolution {
  requestedFamilies: AgentCapabilityFamily[];
  approvedFamilies: AgentCapabilityFamily[];
  denied: AgentCapabilityDenied[];
  tools: string[];
  restrictions: Record<string, AgentToolRestriction>;
  riskCeiling: AgentCapabilityRisk;
}
function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function normalizedTools(values: string[]): string[] {
  return unique(values.map(value => value.trim()).filter(Boolean)).slice(0, 128);
}

function delegatedExecutionIntent(text: string): boolean {
  return /\b(do the task|complete the task|proceed with the task|implement it|finish it|set it up|kerjakan|selesaikan|implementasikan|pasang|siapkan|lanjutkan task|lanjutkan pengerjaan)\b/i.test(text);
}

function mutationIntent(text: string): boolean {
  return /\b(fix|edit|modify|change|update|write|create|add|remove|rename|move|replace|patch|implement|build|buat|ubah|perbaiki|tulis|tambahkan|hapus|pindah|ganti|implementasi)\b/i.test(text)
    || delegatedExecutionIntent(text);
}

function processIntent(text: string): boolean {
  return /\b(run|execute|start|launch|build|compile|test|install|invoke|terminal|command|jalankan|eksekusi|mulai|buka aplikasi|kompilasi|tes|install)\b/i.test(text)
    || delegatedExecutionIntent(text);
}

function browserActIntent(text: string): boolean {
  return /\b(click|type|submit|select|scroll|press|login|sign in|form|checkout|book|tap|klik|ketik|kirim|pilih|gulir|masuk|formulir)\b/i.test(text);
}

function processAdminIntent(text: string): boolean {
  return /\b(kill|terminate|stop process|force terminate|end process|matikan proses|hentikan proses|akhiri proses)\b/i.test(text);
}

function configIntent(text: string): boolean {
  return /\b(set config|change config|configuration|setting|environment setting|ubah konfigurasi|ubah setting|setelan)\b/i.test(text);
}

function memoryWriteIntent(text: string): boolean {
  return /\b(remember|memorize|save (?:a )?(?:memory|lesson|knowledge)|record (?:a )?(?:memory|lesson)|learn from|ingat|simpan|catat|pelajari|rekam pembelajaran)\b/i.test(text);
}

function artifactInspectIntent(text: string): boolean {
  return /\b(inspect|analy[sz]e|audit|examine|reverse.engineer|periksa|analisis|inspeksi|analisa|audit artefak)\b/i.test(text);
}

function webIntent(text: string): boolean {
  return /\b(web|internet|online|website|site|url|search the web|latest|current|research|browser|cari web|internet|situs|terbaru|riset|browser)\b/i.test(text);
}

function phoneActIntent(text: string): boolean {
  return /\b(phone|android|device|tap|swipe|type on phone|launch app|ponsel|hp|ketuk|geser|buka aplikasi)\b/i.test(text)
    || /\b(game mode|joki game|mainkan game|bermain game|play (?:a |the )?game|seven knights?|grand cross|7ds|gameplay)\b/i.test(text);
}
export function inferUserRiskCeiling(prompt: string): AgentCapabilityRisk {
  const text = prompt.trim();
  if (configIntent(text)) return 4;
  if (processAdminIntent(text) || browserActIntent(text) || phoneActIntent(text) || memoryWriteIntent(text)) return 3;
  if (mutationIntent(text) || processIntent(text) || artifactInspectIntent(text)) return 2;
  if (webIntent(text)) return 1;
  return 0;
}

function mergeRestrictions(
  current: AgentToolRestriction | undefined,
  next: AgentToolRestriction | undefined,
): AgentToolRestriction | undefined {
  if (!current) return next ? { ...next, ...(next.allowedActions ? { allowedActions: [...next.allowedActions] } : {}) } : undefined;
  if (!next) return current;
  const actions = unique([
    ...(current.allowedActions ?? []),
    ...(next.allowedActions ?? []),
  ]);
  return {
    ...(actions.length ? { allowedActions: actions } : {}),
    ...((current.forbidUrlRead === true && next.forbidUrlRead === true)
      ? { forbidUrlRead: true }
      : {}),
  };
}

function familyAllowedByIntent(
  family: AgentCapabilityFamily,
  userPrompt: string,
  riskCeiling: AgentCapabilityRisk,
): boolean {
  const risk = capabilityRisk(family);
  if (risk <= 1) return risk <= riskCeiling || risk === 0;
  if (risk > riskCeiling) return false;
  if (family === 'memory.write') return memoryWriteIntent(userPrompt);
  if (family === 'artifact.inspect') return artifactInspectIntent(userPrompt);
  if (family === 'files.mutate' || family === 'code.modify') return mutationIntent(userPrompt);
  if (family === 'process.execute') return processIntent(userPrompt);
  if (family === 'process.admin') return processAdminIntent(userPrompt);
  if (family === 'browser.act') return browserActIntent(userPrompt);
  if (family === 'phone.act') return phoneActIntent(userPrompt);
  if (family === 'admin.config') return configIntent(userPrompt);
  return true;
}
export class AgentCapabilityResolver {
  private readonly mode: AgentCapabilityPolicyMode;
  private readonly toolCeiling: Set<string> | null;
  private readonly familyCeiling: Set<AgentCapabilityFamily> | null;

  constructor(config: AgentCapabilityPolicyConfig) {
    this.mode = config.mode;
    const tools = normalizedTools(config.allowedTools);
    this.toolCeiling = tools.length ? new Set(tools) : null;
    const families = unique(config.allowedCapabilities.filter(isAgentCapabilityFamily));
    this.familyCeiling = families.length ? new Set(families) : null;
  }

  initialGrant(availableTools: string[], userPrompt = ''): AgentCapabilityResolution {
    const available = new Set(availableTools);
    if (this.mode === 'explicit') {
      const tools = this.toolCeiling
        ? [...this.toolCeiling].filter(tool => available.has(tool))
        : [];
      return {
        requestedFamilies: [],
        approvedFamilies: [],
        denied: [],
        tools,
        restrictions: {},
        riskCeiling: 0,
      };
    }

    if (this.mode === 'dynamic') {
      // Creator-delegated Native has the same currently registered MCP surface
      // at task start. Catalog families are discovery metadata, not a second
      // authorization gate. A nonempty explicit tool ceiling still applies.
      const tools = availableTools.filter(tool => !this.toolCeiling || this.toolCeiling.has(tool));
      const accessible = new Set(tools);
      const families = AGENT_CAPABILITY_CATALOG
        .filter(item => item.tools.some(tool => accessible.has(tool.name)))
        .map(item => item.family);
      return {
        requestedFamilies: families,
        approvedFamilies: families,
        denied: [],
        tools,
        restrictions: {},
        riskCeiling: 4,
      };
    }

    if (this.mode === 'read-only') {
      return this.resolve({
        requestedFamilies: AGENT_CAPABILITY_CATALOG
          .filter(item => item.risk <= 1)
          .map(item => item.family),
        userPrompt: 'read inspect research web',
        availableTools,
      });
    }

    const base = available.has('get_config')
      && (!this.toolCeiling || this.toolCeiling.has('get_config'))
      ? ['get_config']
      : [];
    return {
      requestedFamilies: [],
      approvedFamilies: [],
      denied: [],
      tools: base,
      restrictions: {},
      riskCeiling: 0,
    };
  }
  resolve(input: AgentCapabilityRequest): AgentCapabilityResolution {
    if (this.mode === 'dynamic') {
      // Dynamic describes the discovered runtime surface, not a model-selected
      // permission gate. The creator's configured tool ceiling and each
      // underlying tool's own admission contract remain authoritative.
      return { ...this.initialGrant(input.availableTools, input.userPrompt),
        requestedFamilies: unique(input.requestedFamilies.filter(isAgentCapabilityFamily)) };
    }
    const requested = unique(input.requestedFamilies.filter(isAgentCapabilityFamily));
    if (this.mode === 'explicit') {
      // Explicit never grows: a request is only denied, and the grant stays the operator's tool ceiling rather than shrinking to get_config.
      return { ...this.initialGrant(input.availableTools, input.userPrompt),
        requestedFamilies: requested, denied: requested.map(family => ({ family, reason: 'policy-mode' as const })) };
    }
    const available = new Set(input.availableTools);
    const current = unique((input.currentFamilies ?? []).filter(isAgentCapabilityFamily));
    const riskCeiling = inferUserRiskCeiling(input.userPrompt);
    const approved = new Set<AgentCapabilityFamily>(current);
    const denied: AgentCapabilityDenied[] = [];

    for (const family of requested) {
      if (this.mode === 'minimal') {
        denied.push({ family, reason: 'policy-mode' });
        continue;
      }
      if (this.mode === 'read-only' && capabilityRisk(family) > 1) {
        denied.push({ family, reason: 'policy-mode' });
        continue;
      }
      if (this.familyCeiling && !this.familyCeiling.has(family)) {
        denied.push({ family, reason: 'operator-family-ceiling' });
        continue;
      }
      if (!familyAllowedByIntent(family, input.userPrompt, riskCeiling)) {
        denied.push({ family, reason: 'user-intent' });
        continue;
      }
      const descriptor = capabilityDescriptor(family);
      const availableMembers = descriptor.tools.filter(tool => available.has(tool.name));
      if (!availableMembers.length) {
        denied.push({ family, reason: 'unavailable' });
        continue;
      }
      if (this.toolCeiling && availableMembers.every(tool => !this.toolCeiling!.has(tool.name))) {
        denied.push({ family, reason: 'tool-ceiling' });
        continue;
      }
      approved.add(family);
    }

    const tools = new Set<string>();
    // No prototype: a tool named `constructor` or `__proto__` must stay an ordinary key.
    const restrictions: Record<string, AgentToolRestriction> = Object.create(null);
    if (available.has('get_config') && (!this.toolCeiling || this.toolCeiling.has('get_config'))) {
      tools.add('get_config');
    }

    for (const family of approved) {
      for (const entry of capabilityDescriptor(family).tools) {
        if (!available.has(entry.name)) continue;
        if (this.toolCeiling && !this.toolCeiling.has(entry.name)) continue;
        tools.add(entry.name);
        const merged = mergeRestrictions(restrictions[entry.name], entry.restriction);
        if (merged) restrictions[entry.name] = merged;
      }
    }

    return {
      requestedFamilies: requested,
      approvedFamilies: [...approved],
      denied,
      tools: [...tools],
      restrictions,
      riskCeiling,
    };
  }

  catalogSummary(availableTools: string[]): Array<{
    family: AgentCapabilityFamily;
    risk: AgentCapabilityRisk;
    availableToolCount: number;
  }> {
    const available = new Set(availableTools);
    return AGENT_CAPABILITY_FAMILIES.map(family => ({
      family,
      risk: capabilityRisk(family),
      availableToolCount: capabilityDescriptor(family).tools
        .filter(tool => available.has(tool.name)).length,
    }));
  }
}
