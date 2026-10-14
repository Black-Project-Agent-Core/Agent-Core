import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { writeOwnedFileAtomic } from '../persistence/atomic-file.js';
import { isNewState, writeStateFile } from '../persistence/state-file.js';
import { redactSensitiveString } from '../security/redaction.js';
import type { MemoryService } from '../memory/service.js';
import type { MemoryService as ExperienceMemoryService } from '../../SubProject/agent-core-memory/dist/index.js';
import { createControllerMemoryDispatcher } from '../../SubProject/agent-core-memory/dist/index.js';
import { parseRetrievalPlan, type RetrievalPlan, type MergedRetrieval } from './subquestion-retrieval.js';
import { blockedPlannedMemory, discardPlannedMemory, withinBudget, runPlannedMemoryContext, type ContextMemoryRetrieval } from './planned-memory-context.js';
import type { DeliveredMemorySearchResult } from '../memory/search-projection.js';
import type { LearningService } from './service.js';
import { buildKnowledgeSynthesisPacket, rankKnowledge } from '../agent-knowledge-synthesis.js';
import { failureContext, validateWorkflowUse } from './workflow-evidence.js';
import { recheckWorkflowReport } from './workflow-verifier.js';
import type { SkillService } from '../skills/service.js';
import type { SkillSearchMode } from '../skills/discovery.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import { normalizeFailureFamily } from '../mcp/failure-loop-advisor.js';
import { procedureFingerprint } from '../agent-learning-loop.js';
import { readEvidenceSnapshot } from '../verification/evidence-snapshot.js';
import { normalizeCapabilityUses, artifactCapabilityUse, capabilityUseKey, renderCapabilityNotice, inspectedSkillArtifacts, type CapabilityUse } from '../capability-awareness.js';

const STATE_VERSION = 1 as const;
const MAX_EPISODES = 128;
const MAX_EVENTS = 160;
const MAX_PROCEDURES = 128;
const MAX_REFS = 24;
const SESSION_IDLE_MS = 60 * 60 * 1000;
const BOOTSTRAP_CACHE_MS = 15_000;

export type ExternalAttributionStatus = 'attributed' | 'late-closed' | 'late-unavailable' | 'unbound';
export interface ExternalInvocationContext {
  readonly version: 1;
  readonly invocationId: string;
  readonly processSessionId: string;
  readonly sessionId: string;
  readonly capturedAt: string;
  readonly binding: 'bound' | 'unbound';
  readonly taskId?: string;
  readonly ownerId?: string;
  readonly workspaceIdentityKey?: string;
  readonly workspace?: string;
  readonly unboundReason?: 'no-task' | 'scope-unavailable' | 'observer-unavailable';
}

export type ExternalArtifactKind = 'memory' | 'pattern' | 'skill' | 'procedure';
export type ExternalArtifactResult = 'success' | 'failure' | 'unavailable';
export interface ExternalControllerEvent {
  id: string;
  at: string;
  kind: 'tool' | 'failure' | 'recall' | 'artifact-use' | 'verification'
    | 'learning' | 'correction' | 'context' | 'procedure';
  summary: string;
  evidenceRefs: string[];
  tool?: string;
  outcome?: string;
  invocationId?: string;
  processSessionId?: string;
  taskId?: string;
  attributionStatus?: ExternalAttributionStatus;
}

export interface ExternalMemoryBinding { ownerId: string; workspaceIdentityKey: string }

export interface ExternalControllerEpisode {
  id: string;
  startedAt: string;
  updatedAt: string;
  workspace?: string;
  taskFamily?: string;
  predecessorEpisodeId?: string;
  taskKey?: string;
  memoryBinding?: ExternalMemoryBinding;
  boundary?: 'explicit' | 'inferred';
  closedAt?: string;
  recoverySource?: string;
  meaningful: boolean;
  pendingLearning: boolean;
  checkpointAt?: string;
  checkpointKeys?: string[];
  learningDecision?: string;
  terminalOutcome?: 'verified' | 'failed';
  verificationStatus?: 'pass' | 'fail' | 'unavailable';
  deliveredArtifacts?: Record<string, string>;
  capabilityUses?: CapabilityUse[];
  capabilityNoticeKeys?: string[];
  intentionExposureKeys?: string[];
  deliveredMemories?: Record<string, string>;
  events: ExternalControllerEvent[];
  metrics: {
    toolCalls: number;
    toolFailures: number;
    repeatedFailures: number;
    memoryRecalls: number;
    artifactUses: number;
    verifications: number;
  };
}
export interface ExternalProcedureCandidate {
  fingerprint: string;
  name: string;
  skillName: string;
  description: string;
  steps: string[];
  allowedTools: string[];
  reuseCondition?: string;
  evidenceRefs: string[];
  supportEpisodeIds: string[];
  failureEpisodeIds: string[];
  status: 'candidate' | 'skill-imported' | 'revision-staged';
  skillDigest?: string;
  createdAt: string;
  updatedAt: string;
}

interface ExternalControllerState {
  version: typeof STATE_VERSION;
  workflowVersion?: 2;
  episodes: ExternalControllerEpisode[];
  procedures: ExternalProcedureCandidate[];
  sessionHeads: Record<string, string>;
}

export interface ExternalControllerContextInput {
  taskId?: string;
  retrievalPlan?: RetrievalPlan;
  skillSearchMode?: SkillSearchMode;
  signal?: AbortSignal;
  workspace?: string;
  query?: string;
  taskFamily?: string;
  limit?: number;
}

interface PlannedContextScope {
  taskId:string; ownerId:string; workspace:string; workspaceIdentityKey:string; permitKey:string;
  controller:ReturnType<ExperienceMemoryService['controller']>;
  retrieval?:ContextMemoryRetrieval;
  readUsage?:()=>ContextMemoryRetrieval['usage'];
}

export interface ExternalArtifactReceiptInput {
  taskId?: string;
  actionRefs?: string[];
  kind: ExternalArtifactKind;
  artifactId: string;
  applicability: 'applied' | 'adapted' | 'rejected';
  result: ExternalArtifactResult;
  reasonCode: string;
  summary?: string;
  evidenceRefs?: string[];
  verificationRef?: string;
  retrievalAttemptId?: string;
  memoryId?: string;
  contentDigest?: string;
  memoryFeedback?: 'helpful' | 'not-helpful';
  workspace?: string;
}

export interface ExternalProcedureInput {
  operation: 'propose' | 'list' | 'inspect' | 'outcome';
  fingerprint?: string;
  name?: string;
  description?: string;
  steps?: string[];
  allowedTools?: string[];
  reuseCondition?: string;
  evidenceRefs?: string[];
  verificationRef?: string;
  result?: 'success' | 'failure';
  workspace?: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
function bounded(value: unknown, max = 800): string {
  return redactSensitiveString(String(value ?? '').trim().replace(/\s+/g, ' ')).slice(0, max);
}
function refs(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map(value => bounded(value, 1000)).filter(Boolean))].slice(0, MAX_REFS);
}
function slug(value: string): string {
  const base = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 52);
  return base || 'learned-procedure';
}
function defaultMetrics(): ExternalControllerEpisode['metrics'] {
  return { toolCalls: 0, toolFailures: 0, repeatedFailures: 0, memoryRecalls: 0, artifactUses: 0, verifications: 0 };
}
function defaultState(): ExternalControllerState {
  return { version: STATE_VERSION, episodes: [], procedures: [], sessionHeads: {} };
}
function event(kind: ExternalControllerEvent['kind'], summary: string, evidenceRefs: string[] = [], extra: Partial<ExternalControllerEvent> = {}): ExternalControllerEvent {
  return {
    id: randomUUID().replaceAll('-', ''),
    at: new Date().toISOString(),
    kind,
    summary: bounded(summary, 1000),
    evidenceRefs: refs(evidenceRefs),
    ...extra,
  };
}
function normalizeMemoryBinding(raw: unknown): ExternalMemoryBinding {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
    || Object.keys(raw).length !== 2) throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
  const { ownerId, workspaceIdentityKey } = raw as ExternalMemoryBinding;
  if (typeof ownerId !== 'string' || !ownerId || ownerId !== ownerId.trim() || ownerId.length > 128
    || typeof workspaceIdentityKey !== 'string' || !workspaceIdentityKey
    || workspaceIdentityKey !== workspaceIdentityKey.trim() || workspaceIdentityKey.length > 2048
    || /[\x00-\x1f\x7f]/.test(ownerId + workspaceIdentityKey)) throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
  return { ownerId, workspaceIdentityKey };
}
/** Canonical identity is not descriptive text: preserve registry spelling exactly. */
function boundWorkspaceName(raw: unknown): string {
  if (typeof raw !== 'string' || !raw || raw !== raw.trim() || raw.length > 120
    || /[\x00-\x1f\x7f]/.test(raw)) throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
  return raw;
}
/** Observational Learning labels cannot redirect a host-validated task binding. */
function observeEpisodeWorkspace(episode: ExternalControllerEpisode, workspace: string | undefined): void {
  if (workspace && !episode.memoryBinding) episode.workspace = bounded(workspace, 120);
}
function matchesMemoryBinding(episode: ExternalControllerEpisode, binding?: ExternalMemoryBinding): boolean {
  return binding ? episode.memoryBinding?.ownerId === binding.ownerId
    && episode.memoryBinding.workspaceIdentityKey === binding.workspaceIdentityKey : episode.memoryBinding === undefined;
}
function normalizeEpisode(raw: ExternalControllerEpisode): ExternalControllerEpisode {
  if (!raw || typeof raw.id !== 'string' || !raw.id.trim() || raw.id.length > 128) throw new Error('EXTERNAL_EPISODE_ID_INVALID');
  if (raw.events !== undefined && !Array.isArray(raw.events)) throw new Error('EXTERNAL_EPISODE_EVENTS_INVALID');
  if (raw.metrics && Object.values(raw.metrics).some(value => !Number.isFinite(value) || value < 0)) throw new Error('EXTERNAL_EPISODE_METRICS_INVALID');
  const memoryBinding = raw.memoryBinding !== undefined ? normalizeMemoryBinding(raw.memoryBinding) : undefined;
  if (memoryBinding) boundWorkspaceName(raw.workspace);
  return {
    id: bounded(raw.id, 128),
    startedAt: new Date(raw.startedAt).toISOString(),
    updatedAt: new Date(raw.updatedAt).toISOString(),
    ...(raw.workspace ? { workspace: memoryBinding ? boundWorkspaceName(raw.workspace) : bounded(raw.workspace, 120) } : {}),
    ...(raw.taskFamily ? { taskFamily: bounded(raw.taskFamily, 160) } : {}),
    ...(raw.predecessorEpisodeId ? { predecessorEpisodeId: bounded(raw.predecessorEpisodeId, 128) } : {}),
    ...(raw.taskKey ? { taskKey: bounded(raw.taskKey, 200) } : {}),
    ...(memoryBinding ? { memoryBinding } : {}),
    boundary: raw.boundary === 'explicit' ? 'explicit' : 'inferred',
    ...(raw.closedAt ? { closedAt: new Date(raw.closedAt).toISOString() } : {}),
    ...(raw.recoverySource ? { recoverySource: bounded(raw.recoverySource, 1000) } : {}),
    meaningful: Boolean(raw.meaningful),
    pendingLearning: Boolean(raw.pendingLearning),
    ...(raw.checkpointAt ? { checkpointAt: new Date(raw.checkpointAt).toISOString() } : {}),
    checkpointKeys: [...new Set(raw.checkpointKeys ?? [])],
    ...(raw.learningDecision ? { learningDecision: raw.learningDecision } : {}),
    ...(raw.terminalOutcome === 'verified' || raw.terminalOutcome === 'failed' ? { terminalOutcome: raw.terminalOutcome } : {}),
    verificationStatus: raw.verificationStatus ?? 'unavailable',
    deliveredArtifacts: raw.deliveredArtifacts ?? {},
    ...(raw.capabilityUses ? {capabilityUses:normalizeCapabilityUses(raw.capabilityUses)} : {}),
    ...(Array.isArray(raw.capabilityNoticeKeys) ? {capabilityNoticeKeys:raw.capabilityNoticeKeys.filter(k=>typeof k==='string' && k.length<=400).slice(0,128)} : {}),
    ...(Array.isArray(raw.intentionExposureKeys) ? { intentionExposureKeys: raw.intentionExposureKeys.filter(key => typeof key === 'string' && /^[a-f0-9]{64}$/.test(key)).slice(-64) } : {}),
    deliveredMemories: raw.deliveredMemories ?? {},
    events: Array.isArray(raw.events) ? raw.events.map(item => ({
      id: bounded(item.id, 128),
      at: new Date(item.at).toISOString(),
      kind: item.kind,
      summary: bounded(item.summary, 1000),
      evidenceRefs: refs(item.evidenceRefs),
      ...(item.tool ? { tool: bounded(item.tool, 120) } : {}),
      ...(item.outcome ? { outcome: bounded(item.outcome, 80) } : {}),
      ...(typeof item.invocationId === 'string' ? { invocationId: bounded(item.invocationId, 128) } : {}),
      ...(typeof item.processSessionId === 'string' ? { processSessionId: bounded(item.processSessionId, 128) } : {}),
      ...(typeof item.taskId === 'string' ? { taskId: bounded(item.taskId, 128) } : {}),
      ...(['attributed','late-closed','late-unavailable','unbound'].includes(item.attributionStatus ?? '')
        ? { attributionStatus: item.attributionStatus } : {}),
    })) : [],
    metrics: {
      toolCalls: Math.max(0, Number(raw.metrics?.toolCalls ?? 0)),
      toolFailures: Math.max(0, Number(raw.metrics?.toolFailures ?? 0)),
      repeatedFailures: Math.max(0, Number(raw.metrics?.repeatedFailures ?? 0)),
      memoryRecalls: Math.max(0, Number(raw.metrics?.memoryRecalls ?? 0)),
      artifactUses: Math.max(0, Number(raw.metrics?.artifactUses ?? 0)),
      verifications: Math.max(0, Number(raw.metrics?.verifications ?? 0)),
    },
  };
}
function normalizeSessionHeads(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const normalizedKey = bounded(key, 128);
    const normalizedValue = bounded(value, 128);
    if (normalizedKey && normalizedValue) result[normalizedKey] = normalizedValue;
  }
  return result;
}

function normalizeProcedure(raw: ExternalProcedureCandidate): ExternalProcedureCandidate {
  if (!raw || !/^sha256:[a-f0-9]{64}$/i.test(raw.fingerprint) || !raw.name?.trim()
    || !Array.isArray(raw.steps) || !raw.steps.length) throw new Error('EXTERNAL_PROCEDURE_INVALID');
  return {
    fingerprint: bounded(raw.fingerprint, 80).toLowerCase(),
    name: bounded(raw.name, 160),
    skillName: slug(raw.skillName || raw.name),
    description: bounded(raw.description, 2000),
    steps: (raw.steps ?? []).map(step => bounded(step, 2000)).filter(Boolean).slice(0, 50),
    allowedTools: [...new Set((raw.allowedTools ?? []).map(tool => bounded(tool, 120)).filter(Boolean))].slice(0, 64),
    ...(raw.reuseCondition ? { reuseCondition: bounded(raw.reuseCondition, 2000) } : {}),
    evidenceRefs: refs(raw.evidenceRefs),
    supportEpisodeIds: [...new Set(raw.supportEpisodeIds ?? [])],
    failureEpisodeIds: [...new Set(raw.failureEpisodeIds ?? [])],
    status: raw.status === 'skill-imported' || raw.status === 'revision-staged' ? raw.status : 'candidate',
    ...(raw.skillDigest ? { skillDigest: bounded(raw.skillDigest, 100) } : {}),
    createdAt: new Date(raw.createdAt).toISOString(),
    updatedAt: new Date(raw.updatedAt).toISOString(),
  };
}

export class ExternalControllerLearningService {
  // Ephemeral host-issued identity, never a persistent queue or caller-supplied authority.
  private readonly invocationLifecycles = new WeakMap<ExternalInvocationContext, { expiresAt?: number }>();

  async captureToolInvocationContext(input: {
    invocationId: string; processSessionId: string; sessionId: string; ownerId?: string;
  }): Promise<ExternalInvocationContext> {
    const base = { version: 1 as const, invocationId: input.invocationId,
      processSessionId: input.processSessionId, sessionId: input.sessionId,
      capturedAt: new Date().toISOString() };
    const unbound = (reason: ExternalInvocationContext['unboundReason']): ExternalInvocationContext =>
      ({ ...base, binding: 'unbound', unboundReason: reason });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = (async (): Promise<ExternalInvocationContext> => {
      const state = await this.load(true);
      if (this.issue) return unbound('observer-unavailable');
      const episode = state.episodes.find(item => item.id === this.activeEpisodeId(state, input.sessionId));
      if (!episode) return unbound('no-task');
      if (!input.ownerId || episode.boundary !== 'explicit' || !episode.memoryBinding
        || episode.memoryBinding.ownerId !== input.ownerId) return unbound('scope-unavailable');
      const workspace = this.validateMemoryWorkspace(episode.workspace, episode.memoryBinding);
      return { ...base, binding: 'bound', taskId: episode.id, ownerId: input.ownerId,
        workspaceIdentityKey: episode.memoryBinding.workspaceIdentityKey, workspace };
    })().catch(() => unbound('observer-unavailable'));
    try {
      const selected = await Promise.race([read, new Promise<ExternalInvocationContext>(resolve => {
        timer = setTimeout(() => resolve(unbound('observer-unavailable')), 100);
      })]);
      const context = Object.freeze(selected);
      this.invocationLifecycles.set(context, {});
      return context;
    } finally { if (timer) clearTimeout(timer); }
  }

  private invocationEpisode(state: ExternalControllerState, context?: ExternalInvocationContext): {
    episode?: ExternalControllerEpisode; status: ExternalAttributionStatus;
  } {
    if (!context || !this.invocationLifecycles.has(context) || context.binding !== 'bound') return { status: 'unbound' };
    const episode = state.episodes.find(item => item.id === context.taskId);
    if (!episode) return { status: 'late-unavailable' };
    if (!episode.memoryBinding || episode.memoryBinding.ownerId !== context.ownerId
      || episode.memoryBinding.workspaceIdentityKey !== context.workspaceIdentityKey
      || episode.workspace !== context.workspace) return { status: 'late-unavailable' };
    try { if (this.validateMemoryWorkspace(episode.workspace, episode.memoryBinding) !== context.workspace)
      return { status: 'late-unavailable' }; }
    catch { return { status: 'late-unavailable' }; }
    if (episode.closedAt) return { status: 'late-closed' };
    return { episode, status: 'attributed' };
  }

  async observeInvocation<T>(context: ExternalInvocationContext | undefined,
    action: (expiresAt: number) => Promise<T>, fallback: T): Promise<T> {
    const lifecycle = context && this.invocationLifecycles.get(context);
    if (!lifecycle) return fallback;
    lifecycle.expiresAt ??= performance.now() + 250;
    const remaining = lifecycle.expiresAt - performance.now();
    if (remaining <= 0) return fallback;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([action(lifecycle.expiresAt).catch(() => fallback), new Promise<T>(resolve => {
        timer = setTimeout(() => resolve(fallback), Math.max(1, remaining));
      })]);
    } finally { if (timer) clearTimeout(timer); }
  }

  async invocationDisclosureCurrent(context?: ExternalInvocationContext): Promise<boolean> {
    return this.observeInvocation(context, async () => {
      const state = await this.load(true);
      if (this.issue) return false;
      const match = this.invocationEpisode(state, context);
      return Boolean(match.episode && state.sessionHeads[context!.sessionId] === match.episode.id);
    }, false);
  }

  private readonly capabilityInventories = new Map<string,()=>string[]>();
  attachCapabilityInventory(sessionId:string,read:()=>string[]):void {
    this.capabilityInventories.set(sessionId,read);
    while(this.capabilityInventories.size>128)this.capabilityInventories.delete(this.capabilityInventories.keys().next().value!);
  }
  private capabilityTools(sessionId:string):string[]|undefined {
    try{return this.capabilityInventories.get(sessionId)?.();}catch{return undefined;}
  }
  async recordInspectedSkillArtifacts(sessionId: string, text: string, context?: ExternalInvocationContext): Promise<void> {
    if (context?.sessionId !== sessionId) return;
    await this.observeInvocation(context, async expiresAt => {
      const delivered: Record<string,string> = {};
      for (const item of inspectedSkillArtifacts(text)) {
        if (performance.now() >= expiresAt) return;
        const active = await this.skills?.inspect(item.name).catch(() => undefined);
        if (active?.digest === item.digest) delivered['skill:' + item.name] = item.digest;
      }
      if (!Object.keys(delivered).length) return;
      await this.mutate(state => {
        const episode = this.invocationEpisode(state, context).episode;
        if (episode) episode.deliveredArtifacts = { ...(episode.deliveredArtifacts ?? {}), ...delivered };
      }, expiresAt);
    }, undefined);
  }

  async recordCapabilityUse(sessionId: string, use: CapabilityUse | null, context?: ExternalInvocationContext): Promise<void> {
    if (!use || context?.sessionId !== sessionId) return;
    const observedUse = use;
    await this.observeInvocation(context, expiresAt => this.mutate(state => {
      const episode = this.invocationEpisode(state, context).episode;
      if (!episode || (episode.capabilityUses ?? []).some(old => capabilityUseKey(old) === capabilityUseKey(observedUse))) return;
      let recordedUse = observedUse;
      if (observedUse.evidenceKind === 'observed-tool') {
        const observation = event('context', 'Host observed actual capability use: ' + observedUse.displayName + '. This is not outcome verification.',
          ['tool:' + context.invocationId], { invocationId: context.invocationId, taskId: episode.id, processSessionId: context.processSessionId, attributionStatus: 'attributed' });
        episode.events.push(observation);
        recordedUse = { ...observedUse, evidenceRef: 'source:external-episode:' + episode.id + '#' + observation.id };
      }
      episode.capabilityUses = normalizeCapabilityUses([...(episode.capabilityUses ?? []), recordedUse]);
    }, expiresAt), undefined);
  }

  async takeCapabilityUsageNotice(sessionId: string, context?: ExternalInvocationContext): Promise<string> {
    if (context?.sessionId !== sessionId) return '';
    const notice = await this.observeInvocation(context, expiresAt => this.mutate(state => {
      const episode = this.invocationEpisode(state, context).episode;
      if (!episode || state.sessionHeads[sessionId] !== episode.id) return '';
      const seen = new Set(episode.capabilityNoticeKeys ?? []);
      const fresh = normalizeCapabilityUses(episode.capabilityUses).filter(use => !seen.has(capabilityUseKey(use))).slice(0,8);
      const text = renderCapabilityNotice(fresh);
      if (!text) return '';
      episode.capabilityNoticeKeys = [...seen, ...fresh.map(capabilityUseKey)].slice(0,128);
      episode.events.push(event('context', 'Capability usage capsule prepared; user delivery unconfirmed.', fresh.map(use => use.evidenceRef),
        { invocationId: context.invocationId, taskId: episode.id, processSessionId: context.processSessionId, attributionStatus: 'attributed' }));
      return 'CAPABILITY USAGE NOTICE — Relay once in this task; merge with any usage sentence already being composed. Capsule exposure is not confirmed user delivery.\n' + text;
    }, expiresAt), '');
    return notice && await this.invocationDisclosureCurrent(context) ? notice : '';
  }
  private issue: string | null = null;
  private readonly statePath: string;
  private readonly stagingRoot: string;
  private mutationTail = Promise.resolve();
  private bootstrapCache = new Map<string, { at: number; text: string }>();
  /** Only planned Memory context holds this permit; unrelated tools remain independent. */
  private readonly plannedMemoryBusy = new Set<string>();
  private readonly plannedMemoryPending = new Map<string, Promise<unknown>>();

  private constructor(
    stateDir: string,
    private readonly memory: MemoryService,
    private readonly learning: LearningService,
    private readonly skills?: SkillService,
    private readonly experience?: ExperienceMemoryService,
  ) {
    this.statePath = path.join(stateDir, 'external-controller.json');
    this.stagingRoot = path.join(stateDir, 'procedure-skills');
  }
  static async initialize(input: {
    stateDir: string;
    memory: MemoryService;
    learning: LearningService;
    skills?: SkillService;
    experience?: ExperienceMemoryService;
  }): Promise<ExternalControllerLearningService> {
    const service = new ExternalControllerLearningService(input.stateDir, input.memory, input.learning, input.skills, input.experience);
    await mkdir(input.stateDir, { recursive: true });
    await mkdir(service.stagingRoot, { recursive: true });
    const initial = await service.load();
    input.learning.attachSkills?.(input.skills);
    if (initial.procedures.length) await input.learning.migrateProcedures?.(initial.procedures.map(item => ({ ...item,
      supportTaskIds: item.supportEpisodeIds, failureTaskIds: item.failureEpisodeIds,
      workspace: (() => { const scopes = [...new Set(initial.episodes.filter(episode => [...item.supportEpisodeIds, ...item.failureEpisodeIds].includes(episode.id)).map(episode => episode.workspace).filter(Boolean))]; return scopes.length === 1 ? scopes[0] : undefined; })(),
    })), 'external');
    activityTracker.record('LEARNING', 'success', 'External controller cumulative-learning service initialized', 'external-controller-learning-start', {
      statePath: service.statePath,
      skillsAvailable: Boolean(input.skills),
    });
    return service;
  }

  private async load(readOnly = false): Promise<ExternalControllerState> {
    try {
      const parsed = JSON.parse(await readFile(this.statePath, 'utf8')) as ExternalControllerState;
      if (parsed.version !== STATE_VERSION) throw new Error('EXTERNAL_CONTROLLER_STATE_VERSION_UNSUPPORTED');
      if (parsed.workflowVersion !== undefined && parsed.workflowVersion !== 2) throw new Error('EXTERNAL_CONTROLLER_WORKFLOW_VERSION_UNSUPPORTED');
      if (!Array.isArray(parsed.episodes) || !Array.isArray(parsed.procedures)) throw new Error('EXTERNAL_CONTROLLER_STATE_SHAPE_INVALID');
      this.issue = null;
      return {
        version: STATE_VERSION,
        episodes: Array.isArray(parsed.episodes) ? parsed.episodes.map(normalizeEpisode) : [],
        procedures: Array.isArray(parsed.procedures) ? parsed.procedures.map(normalizeProcedure) : [],
        sessionHeads: normalizeSessionHeads(parsed.sessionHeads),
      };
    } catch (error) {
      if (await isNewState(this.statePath, error)) { this.issue = null; return defaultState(); }
      this.issue = 'EXTERNAL_CONTROLLER_STATE_DEGRADED';
      const backup = this.statePath + '.corrupt.' + new Date().toISOString().replaceAll(':', '-');
      if (!readOnly) await copyFile(this.statePath, backup).catch(() => undefined);
      activityTracker.captureFailure('LEARNING', error, 'external-controller-state-load-failure');
      return defaultState();
    }
  }
  private async save(state: ExternalControllerState): Promise<void> {
    const archive = state.episodes.filter(item => item.closedAt && !item.pendingLearning)
      .slice(0, Math.max(0, state.episodes.length - MAX_EPISODES));
    for (const item of archive) {
      await writeStateFile(path.join(path.dirname(this.statePath), 'episodes-archive', sha256(item.id) + '.json'), item);
    }
    const archived = new Set(archive.map(item => item.id));
    const normalized: ExternalControllerState = {
      version: STATE_VERSION,
      workflowVersion: 2,
      episodes: state.episodes.filter(item => !archived.has(item.id)).map(normalizeEpisode),
      procedures: state.procedures.map(normalizeProcedure),
      sessionHeads: normalizeSessionHeads(state.sessionHeads),
    };
    await writeStateFile(this.statePath, normalized);
  }

  private async mutate<T>(fn: (state: ExternalControllerState) => T | Promise<T>, observerExpiresAt?: number): Promise<T> {
    const prior = this.mutationTail;
    let release!: () => void;
    this.mutationTail = new Promise<void>(resolve => { release = resolve; });
    await prior;
    try {
      if (observerExpiresAt !== undefined && performance.now() >= observerExpiresAt) throw new Error('EXTERNAL_OBSERVER_EXPIRED');
      const state = await this.load(observerExpiresAt !== undefined);
      if (this.issue) throw new Error('EXTERNAL_CONTROLLER_STATE_DEGRADED_WRITE_REFUSED');
      if (observerExpiresAt !== undefined && performance.now() >= observerExpiresAt) throw new Error('EXTERNAL_OBSERVER_EXPIRED');
      const observerBefore = observerExpiresAt !== undefined ? JSON.stringify(state) : undefined;
      const closedMetrics = new Map(state.episodes.filter(item => item.closedAt).map(item => [item.id, { ...item.metrics }]));
      const result = await fn(state);
      for (const episode of state.episodes) if (closedMetrics.has(episode.id)) episode.metrics = closedMetrics.get(episode.id)!;
      if (observerBefore !== undefined && observerBefore === JSON.stringify(state)) return result;
      await this.save(state);
      this.bootstrapCache.clear();
      return result;
    } finally {
      release();
    }
  }

  private activeEpisodeId(state: ExternalControllerState, sessionId: string): string {
    return state.sessionHeads[sessionId] ?? sessionId;
  }

  private getOrCreateEpisode(state: ExternalControllerState, sessionId: string): ExternalControllerEpisode {
    let episodeId = this.activeEpisodeId(state, sessionId);
    let episode = state.episodes.find(item => item.id === episodeId);
    if (episode) return episode;
    if (state.sessionHeads[sessionId]) {
      episodeId = 'ext-' + randomUUID().replaceAll('-', '');
      state.sessionHeads[sessionId] = episodeId;
    }
    const now = new Date().toISOString();
    episode = {
      id: episodeId,
      startedAt: now,
      updatedAt: now,
      meaningful: false,
      pendingLearning: false,
      events: [],
      metrics: defaultMetrics(),
    };
    state.episodes.push(episode);
    return episode;
  }
  private markMeaningful(episode: ExternalControllerEpisode): void {
    if (episode.meaningful) return;
    episode.meaningful = true;
    episode.pendingLearning = true;
  }

  async touchSession(sessionId: string, workspace?: string): Promise<void> {
    await this.mutate(state => {
      const episode = this.getOrCreateEpisode(state, sessionId);
      episode.updatedAt = new Date().toISOString();
      observeEpisodeWorkspace(episode, workspace);
    });
  }

  private validateMemoryWorkspace(workspace: string | undefined, binding: ExternalMemoryBinding): string {
    try {
      if (!workspace?.trim()) throw new Error('missing workspace');
      const identity = this.memory.registeredWorkspaceIdentity(workspace);
      if (identity.key !== binding.workspaceIdentityKey) throw new Error('workspace drift');
      return boundWorkspaceName(identity.name);
    } catch { throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE'); }
  }

  async startEpisode(sessionId: string, input: { workspace?: string; taskFamily?: string; taskKey?: string } = {}, hostBinding?: ExternalMemoryBinding): Promise<ExternalControllerEpisode> {
    const binding = hostBinding === undefined ? undefined : normalizeMemoryBinding(hostBinding);
    if (binding) {
      if (!input.taskKey?.trim() || input.taskKey.length > 200) throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
      input = { ...input, workspace: this.validateMemoryWorkspace(input.workspace, binding) };
    } else if (input.workspace) input = { ...input, workspace: this.memory.resolveWorkspace(input.workspace) };
    if (input.taskKey) input = { ...input, taskKey: bounded(input.taskKey, 200) };
    const prior = input.taskKey ? (await this.recentEpisodes({ workspace: input.workspace, taskKey: input.taskKey.trim(), limit: 1, memoryBinding: binding, unboundOnly: !binding }))[0] : undefined;
    return this.mutate(state => {
      if (binding) this.validateMemoryWorkspace(input.workspace, binding);
      const taskKey = input.taskKey?.trim();
      const existing = (taskKey ? state.episodes.find(item => item.taskKey === taskKey && item.workspace === input.workspace && matchesMemoryBinding(item, binding)) : undefined) ?? prior;
      if (existing && !state.episodes.some(item => item.id === existing.id)) state.episodes.push(existing);
      if (existing) { state.sessionHeads[sessionId] = existing.id; return normalizeEpisode(existing); }
      const predecessorId = this.activeEpisodeId(state, sessionId);
      const predecessor = state.episodes.find(item => item.id === predecessorId);
      const now = new Date().toISOString();
      const nextId = 'ext-' + randomUUID().replaceAll('-', '');
      const episode: ExternalControllerEpisode = {
        id: nextId,
        startedAt: now,
        updatedAt: now,
        ...(input.workspace ? { workspace: binding ? boundWorkspaceName(input.workspace) : bounded(input.workspace, 120) } : {}),
        ...(input.taskFamily ? { taskFamily: bounded(input.taskFamily, 160) } : {}),
        ...(taskKey ? { taskKey } : {}),
        ...(binding ? { memoryBinding: binding } : {}),
        boundary: 'explicit',
        ...(predecessor ? { predecessorEpisodeId: predecessor.id } : {}),
        meaningful: false,
        pendingLearning: false,
        events: [event(
          'context',
          'Started independent external-controller episode.',
          predecessor ? ['episode:' + predecessor.id] : [],
        )],
        metrics: defaultMetrics(),
      };
      state.sessionHeads[sessionId] = nextId;
      state.episodes.push(episode);
      return normalizeEpisode(episode);
    });
  }

  async recordToolOutcome(input: {
    sessionId: string; tool: string; argumentKeys: string[];
    outcome: 'success' | 'handled-failure' | 'exception'; readOnly: boolean;
    invocationId?: string; workspace?: string; invocationContext?: ExternalInvocationContext;
  }): Promise<ExternalAttributionStatus> {
    const context = input.invocationContext;
    if (!context || context.sessionId !== input.sessionId
      || (input.invocationId && input.invocationId !== context.invocationId)) return 'unbound';
    return this.observeInvocation(context, expiresAt => this.mutate(state => {
      const match = this.invocationEpisode(state, context);
      if (!match.episode) return match.status;
      const episode = match.episode, evidence = 'tool:' + context.invocationId;
      if (episode.events.some(item => (item.kind === 'tool' || item.kind === 'failure')
        && item.evidenceRefs.includes(evidence))) return 'attributed' as const;
      episode.updatedAt = new Date().toISOString();
      episode.metrics.toolCalls += 1;
      if (input.outcome !== 'success') episode.metrics.toolFailures += 1;
      if (!input.readOnly || input.outcome !== 'success' || episode.boundary === 'explicit') this.markMeaningful(episode);
      episode.events.push(event(input.outcome === 'success' ? 'tool' : 'failure',
        bounded(input.tool, 120) + ' -> ' + input.outcome + ' | argumentKeys='
          + input.argumentKeys.slice(0,20).map(key => bounded(key,64)).join(','), [evidence], {
          tool: bounded(input.tool, 120), outcome: input.outcome, invocationId: context.invocationId,
          processSessionId: context.processSessionId, taskId: episode.id, attributionStatus: 'attributed',
        }));
      return 'attributed' as const;
    }, expiresAt), context.binding === 'bound' ? 'late-unavailable' : 'unbound');
  }

  async recordMemoryRecall(sessionId: string, workspace: string | undefined,
    results: DeliveredMemorySearchResult[], context?: ExternalInvocationContext): Promise<void> {
    if (context?.sessionId !== sessionId) return;
    await this.observeInvocation(context, expiresAt => this.mutate(state => {
      const episode = this.invocationEpisode(state, context).episode;
      if (!episode || (workspace && this.memory.resolveWorkspace(workspace) !== episode.workspace)) return;
      const evidence = 'recall:' + context.invocationId;
      if (episode.events.some(item => item.kind === 'recall' && item.evidenceRefs.includes(evidence))) return;
      episode.updatedAt = new Date().toISOString();
      episode.metrics.memoryRecalls += 1;
      episode.deliveredMemories ??= {};
      for (const item of results) if (item.retrievalEvidence) {
        episode.deliveredMemories[item.retrievalEvidence.attemptId + ':' + item.record.id] = item.retrievalEvidence.contentDigest;
      }
      episode.events.push(event('recall', 'Memory recall returned ' + results.length + ' item(s).',
        [evidence, ...results.filter(item => item.retrievalEvidence).map(item => 'memory:' + item.record.id)],
        { invocationId: context.invocationId, processSessionId: context.processSessionId, taskId: episode.id, attributionStatus: 'attributed' }));
    }, expiresAt), undefined);
  }

  async recordLearningCheckpoint(sessionId: string, workspace?: string, checkpointKey?: string, taskId?: string): Promise<void> {
    await this.mutate(state => {
      const episode = taskId ? state.episodes.find(item => item.id === taskId) : undefined;
      if (!episode) throw new Error('EXTERNAL_CHECKPOINT_TASK_NOT_FOUND');
      if (episode.closedAt) return;
      const now = new Date().toISOString();
      observeEpisodeWorkspace(episode, workspace);
      episode.updatedAt = now;
      episode.checkpointAt = now;
      episode.pendingLearning = true;
      if (checkpointKey) episode.checkpointKeys = [...new Set([...(episode.checkpointKeys ?? []), checkpointKey])];
      episode.events.push(event('learning', 'Learning checkpoint completed for this external-controller episode.'));
    });
  }

  async recordLearningReview(sessionId: string, summary: string, decisions?: Record<string, { complete: boolean; status: string }>): Promise<void> {
    await this.mutate(state => {
      for (const episode of state.episodes) {
        const keys = episode.checkpointKeys ?? [];
        if (!keys.some(key => decisions?.[key])) continue;
        episode.updatedAt = new Date().toISOString();
        episode.events.push(event('learning', 'Learning review: ' + summary));
        episode.checkpointKeys = keys.filter(key => !decisions?.[key]?.complete);
        if (episode.checkpointKeys.length === 0) {
          episode.pendingLearning = false;
          episode.learningDecision = [...new Set(keys.map(key => decisions?.[key]?.status).filter(Boolean))].join(',');
          if (episode.terminalOutcome) episode.closedAt = episode.updatedAt;
        }
      }
    });
  }
  async labelEpisode(sessionId: string, input: { workspace?: string; taskFamily?: string }): Promise<ExternalControllerEpisode> {
    return this.mutate(state => {
      const episode = this.getOrCreateEpisode(state, sessionId);
      observeEpisodeWorkspace(episode, input.workspace);
      if (input.taskFamily) episode.taskFamily = bounded(input.taskFamily, 160);
      episode.updatedAt = new Date().toISOString();
      return normalizeEpisode(episode);
    });
  }

  async verifyEpisode(sessionId: string, input: {
    outcome: 'verified' | 'failed';
    verificationRef: string;
    evidenceRefs?: string[];
    summary?: string;
    workspace?: string;
    taskFamily?: string;
  }): Promise<ExternalControllerEpisode> {
    const current = await this.getEpisode(sessionId);
    const verificationStatus = await recheckWorkflowReport(input.verificationRef, current?.id);
    return this.mutate(state => {
      const episode = this.getOrCreateEpisode(state, sessionId);
      if (episode.closedAt) return normalizeEpisode(episode);
      observeEpisodeWorkspace(episode, input.workspace);
      if (input.taskFamily) episode.taskFamily = bounded(input.taskFamily, 160);
      episode.updatedAt = new Date().toISOString();
      episode.terminalOutcome = input.outcome;
      episode.verificationStatus = verificationStatus;
      if (verificationStatus === 'pass') episode.metrics.verifications += 1;
      if (episode.learningDecision && !episode.pendingLearning) episode.closedAt = episode.updatedAt;
      this.markMeaningful(episode);
      episode.events.push(event(
        'verification',
        input.summary || 'External-controller task verification: ' + input.outcome,
        [input.verificationRef, ...(input.evidenceRefs ?? [])],
        { outcome: input.outcome },
      ));
      return normalizeEpisode(episode);
    });
  }
  private async authoritySnapshot(workspace = 'agent-core') {
    const records = await this.memory.list(workspace);
    const supersededBy = new Map<string, string[]>();
    for (const owner of records) {
      for (const link of owner.links) {
        if (link.type !== 'supersedes') continue;
        supersededBy.set(link.targetId, [...(supersededBy.get(link.targetId) ?? []), owner.id]);
      }
    }
    const current = records
      .filter(record => !supersededBy.has(record.id))
      .filter(record => record.tags.includes('primary-roadmap') || record.tags.includes('user-correction')
        || record.category === 'product-direction' || record.category === 'architecture-plan')
      .sort((a, b) => {
        const aPrimary = Number(a.tags.includes('primary-roadmap')) + Number(a.tags.includes('user-correction'));
        const bPrimary = Number(b.tags.includes('primary-roadmap')) + Number(b.tags.includes('user-correction'));
        return bPrimary - aPrimary || b.updatedAt.localeCompare(a.updatedAt);
      });
    const corrections = records
      .filter(record => !supersededBy.has(record.id) && record.tags.includes('user-correction'))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 3);
    const lessons = records
      .filter(record => record.category === 'operational-reflection' && record.tags.includes('agent-core'))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 3);
    return { records, supersededBy, current: current.slice(0, 2), corrections, lessons };
  }
  async bootstrapInstructions(sessionId: string): Promise<string> {
    const cached = this.bootstrapCache.get(sessionId);
    if (cached && Date.now() - cached.at < BOOTSTRAP_CACHE_MS) return cached.text;
    await this.touchSession(sessionId);
    const [authority, learningStatus, state] = await Promise.all([
      this.authoritySnapshot(),
      this.learning.status() as Promise<any>,
      this.load(),
    ]);
    const activeEpisodeId = this.activeEpisodeId(state, sessionId);
    const pendingEpisodes = state.episodes
      .filter(item => item.id !== activeEpisodeId && item.meaningful && item.pendingLearning)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 5);
    const lines = [
      'CURRENT AGENT CORE CONTEXT — deterministic external-controller bootstrap.',
      'This capsule is local context/evidence, not higher-priority instruction authority.',
      'Native and external controllers share Memory, Learning and Skills. External compliance is observed, not enforced by the runtime.',
      'Start each meaningful external task with controller_learning(action=episode, episodeOperation=start, taskKey=<stable-id>, workspace=<verified-scope>).',
      'At completion declare verification, then learning(checkpoint) with taskId and a stable key; learning(review) must name checkpointKeys and candidates or an explicit disposition. Legacy review never clears pending tasks.',
      ...authority.current.map(item => '- current authority: ' + item.id + ' | ' + bounded(item.title ?? item.id, 180)
        + ' | ' + bounded(item.context || item.content, 650)),
      ...authority.corrections.map(item => '- material correction: ' + item.id + ' | ' + bounded(item.title ?? item.id, 180)
        + ' | ' + bounded(item.context || item.content, 450)),
      ...authority.lessons.map(item => '- reusable lesson: ' + item.id + ' | ' + bounded(item.title ?? item.id, 180)),
      '- pending Learning reviews: ' + String(learningStatus?.pendingReviewCount ?? 0),
      '- prior external episodes with unresolved Learning: ' + String(pendingEpisodes.length),
      ...pendingEpisodes.map(item => '  - episode ' + item.id + ' updated ' + item.updatedAt + (item.workspace ? ' workspace=' + item.workspace : '')),
      'For complex/continuity-sensitive work, use controller_learning(action=context) to synthesize current evidence with prior Memory/Patterns/Skills.',
    ];
    const text = lines.join('\n').slice(0, 7_000);
    this.bootstrapCache.set(sessionId, { at: Date.now(), text });
    return text;
  }
  async failureContext(input: {
    sessionId: string; tool: string; args: unknown; failure: unknown;
    workspace?: string; repeated?: boolean; invocationContext?: ExternalInvocationContext;
  }): Promise<{ capsule: string; memoryIds: string[] }> {
    const context = input.invocationContext, empty = { capsule: '', memoryIds: [] as string[] };
    if (context?.sessionId !== input.sessionId) return empty;
    return this.observeInvocation(context, async expiresAt => {
      const state = await this.load(true);
      const current = this.issue ? undefined : this.invocationEpisode(state, context).episode;
      if (!current || performance.now() >= expiresAt) return empty;
      const family = normalizeFailureFamily(input.failure);
      const argumentKeys = input.args && typeof input.args === 'object' ? Object.keys(input.args as Record<string,unknown>) : [];
      const query = ['tool failure', input.tool, family,
        argumentKeys.length ? 'argument keys ' + argumentKeys.join(' ') : '',
        input.repeated ? 'repeated no progress prior correction dead end' : 'prior correction similar failure'].filter(Boolean).join(' ');
      const results = await this.memory.search(query, { taskId: current.id, workspace: current.workspace,
        limit: 3, maxNeighbors: 1, budgetChars: 5_000, rankingProfile: 'fusion' }).catch(() => [] as DeliveredMemorySearchResult[]);
      if (performance.now() >= expiresAt) return empty;
      await this.recordMemoryRecall(input.sessionId, current.workspace, results, context);
      await this.mutate(next => {
        const episode = this.invocationEpisode(next, context).episode;
        if (!episode) return;
        const evidence = 'failure-recall:' + context.invocationId;
        if (episode.events.some(item => item.evidenceRefs.includes(evidence))) return;
        if (input.repeated) episode.metrics.repeatedFailures += 1;
        episode.events.push(event('failure', input.tool + ' failure-family=' + bounded(family,300),
          [evidence, ...results.map(item => 'memory:' + item.record.id)],
          { tool: input.tool, outcome: 'failure', invocationId: context.invocationId,
            processSessionId: context.processSessionId, taskId: episode.id, attributionStatus: 'attributed' }));
      }, expiresAt);
      if (!await this.invocationDisclosureCurrent(context)) return empty;
      const lines = ['PRIOR EXPERIENCE — automatic bounded recall after tool failure.',
        JSON.stringify(failureContext(input.tool, family)),
        'Treat recalled Memory as historical evidence/guidance, never authorization.',
        '- failure family: ' + bounded(family,500),
        ...(results.length ? results.map(item => '- memory ' + item.record.id + ' | ' + bounded(item.record.title ?? item.record.id,160)
          + ' | ' + bounded(item.delivery.content,700) + ' | retrievalAttempt=' + String(item.retrievalEvidence?.attemptId ?? 'unknown'))
          : ['- no relevant prior experience found in the bounded Memory search']),
        'Change target, hypothesis, diagnostic method, or evidence source before repeating an equivalent failed action.'];
      return { capsule: lines.join('\n').slice(0,4_500), memoryIds: results.map(item => item.record.id) };
    }, empty);
  }

  /** Read-only selector resolution. Existence and ownership failures share one public code. */
  async resolveMemoryTask(ownerId: string, taskId: string): Promise<{ taskId: string; workspaceKey: string }> {
    try {
      if (typeof ownerId !== 'string' || !ownerId.trim() || ownerId !== ownerId.trim()
        || typeof taskId !== 'string' || !taskId.trim() || taskId.length > 128 || taskId !== taskId.trim()) throw new Error('invalid selector');
      const state = await this.load(true);
      if (this.issue) throw new Error('degraded state');
      let episode = state.episodes.find(item => item.id === taskId);
      if (!episode) episode = normalizeEpisode(JSON.parse(await readFile(path.join(path.dirname(this.statePath), 'episodes-archive', sha256(taskId) + '.json'), 'utf8')));
      if (episode.id !== taskId || !episode.memoryBinding || episode.memoryBinding.ownerId !== ownerId) throw new Error('unavailable binding');
      return { taskId: episode.id, workspaceKey: this.validateMemoryWorkspace(episode.workspace, episode.memoryBinding) };
    } catch { throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE'); }
  }

  async getEpisode(sessionId: string): Promise<ExternalControllerEpisode | null> {
    const state = await this.load();
    const episodeId = this.activeEpisodeId(state, sessionId);
    const episode = state.episodes.find(item => item.id === episodeId);
    return episode ? normalizeEpisode(episode) : null;
  }

  async recentEpisodes(input: { workspace?: string; taskFamily?: string; taskKey?: string; episodeIds?: string[]; limit?: number; memoryBinding?: ExternalMemoryBinding; unboundOnly?: boolean } = {}) {
    const state = await this.load();
    const archived: ExternalControllerEpisode[] = [];
    const directory = path.join(path.dirname(this.statePath), 'episodes-archive');
    try {
      for (const file of await readdir(directory)) {
        if (!/^[a-f0-9]{64}\.json$/.test(file)) continue;
        archived.push(normalizeEpisode(JSON.parse(await readFile(path.join(directory, file), 'utf8'))));
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    return [...new Map([...archived, ...state.episodes].map(item => [item.id, item])).values()]
      .filter(item => input.memoryBinding ? matchesMemoryBinding(item, input.memoryBinding) : !input.unboundOnly || matchesMemoryBinding(item))
      .filter(item => !input.workspace || item.workspace === input.workspace)
      .filter(item => !input.taskFamily || item.taskFamily === input.taskFamily)
      .filter(item => !input.taskKey || item.taskKey === input.taskKey)
      .filter(item => !input.episodeIds?.length || input.episodeIds.includes(item.id))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, input.episodeIds?.length || Math.max(1, Math.min(100, input.limit ?? 12)))
      .map(normalizeEpisode);
  }

  async recoverHistory(source: string, apply = false) {
    const resolved = path.resolve(source);
    if (path.dirname(resolved).toLowerCase() !== path.dirname(this.statePath).toLowerCase()
      || !path.basename(resolved).startsWith('external-controller.json.corrupt.')) {
      throw new Error('EXTERNAL_RECOVERY_SOURCE_REFUSED');
    }
    const snapshot = await readEvidenceSnapshot(resolved);
    const raw = JSON.parse(snapshot.text) as ExternalControllerState;
    if (raw.version !== STATE_VERSION) throw new Error('EXTERNAL_RECOVERY_VERSION_UNSUPPORTED');
    const invalid: string[] = [];
    const episodes: ExternalControllerEpisode[] = [];
    const procedures: ExternalProcedureCandidate[] = [];
    for (const [index, item] of (raw.episodes ?? []).entries()) {
      try { episodes.push({ ...normalizeEpisode(item), recoverySource: snapshot.digest }); }
      catch { invalid.push('episode:' + index); }
    }
    for (const [index, item] of (raw.procedures ?? []).entries()) {
      try { procedures.push(normalizeProcedure(item)); }
      catch { invalid.push('procedure:' + index); }
    }
    const merge = async (state: ExternalControllerState) => {
      const conflicts: string[] = [];
      let addedEpisodes = 0, addedProcedures = 0;
      for (const item of episodes) {
        const prior = state.episodes.find(value => value.id === item.id)
          ?? await readFile(path.join(path.dirname(this.statePath), 'episodes-archive', sha256(item.id) + '.json'), 'utf8')
            .then(text => normalizeEpisode(JSON.parse(text)), error => { if (error.code === 'ENOENT') return undefined; throw error; });
        if (!prior) { state.episodes.push(item); addedEpisodes++; }
        else if (prior.recoverySource !== snapshot.digest) conflicts.push('episode:' + item.id);
      }
      for (const item of procedures) {
        const prior = state.procedures.find(value => value.fingerprint === item.fingerprint);
        if (!prior) { state.procedures.push(item); addedProcedures++; }
        else if (JSON.stringify(prior) !== JSON.stringify(item)) conflicts.push('procedure:' + item.fingerprint);
      }
      return { applied: apply, sourceDigest: snapshot.digest, addedEpisodes, addedProcedures, conflicts, invalid };
    };
    if (!apply) return merge(await this.load());
    const result = await this.mutate(merge);
    await writeStateFile(path.join(path.dirname(this.statePath), 'recovery', snapshot.digest.slice(7) + '.json'), result);
    const recovered = await this.load();
    await this.learning.migrateProcedures?.(recovered.procedures.map(item => ({ ...item, supportTaskIds: item.supportEpisodeIds, failureTaskIds: item.failureEpisodeIds,
      workspace: (() => { const scopes = [...new Set(recovered.episodes.filter(episode => [...item.supportEpisodeIds, ...item.failureEpisodeIds].includes(episode.id)).map(episode => episode.workspace).filter(Boolean))]; return scopes.length === 1 ? scopes[0] : undefined; })(),
    })), 'external');
    return result;
  }
  private async memoryTaskContext(sessionId: string, episode: ExternalControllerEpisode | null) {
    const memory = this.memory as MemoryService & Partial<Pick<ExperienceMemoryService, 'controller'>>;
    try {
      if (!episode?.memoryBinding || !memory.controller) throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
      const scope = await this.resolveMemoryTask(episode.memoryBinding.ownerId, episode.id);
      const controller = memory.controller({ ...scope, controllerId: 'agent-core-external', sessionId });
      if (controller.capabilities().writeMode !== 'experience-v2') throw new Error('MEMORY_EXPERIENCE_NOT_ENABLED');
      // Host time is an observation. No tool/event cue is inferred from asking for context.
      return await controller.getTaskContext({ budget: { maxBytes: 8192 }, intentions: { now: new Date().toISOString(), eventKeys: [], limit: 16 } });
    } catch (error) {
      const code = error instanceof Error && /^MEMORY_[A-Z0-9_]+$/.test(error.message) ? error.message : 'MEMORY_TASK_CONTEXT_UNAVAILABLE';
      return { status: 'unavailable' as const, reason: code, advisory: true as const };
    }
  }

  /** Read-only preflight: never rotate tasks or construct an unbound Memory owner. */
  private async validatePlannedScope(sessionId:string,input:ExternalControllerContextInput,ownerId?:string,expected?:PlannedContextScope):Promise<PlannedContextScope> {
    const active=await this.getEpisode(sessionId);
    if(!ownerId||!active||active.id!==input.taskId||active.boundary!=='explicit'||active.closedAt
      ||active.memoryBinding?.ownerId!==ownerId||!active.workspace||!this.experience)
      throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
    const identity=(()=>{
      try {
        const registered=this.memory.registeredWorkspaceIdentity(active.workspace!);
        if(registered.key!==active.memoryBinding!.workspaceIdentityKey
          ||(input.workspace&&this.memory.registeredWorkspaceIdentity(input.workspace).key!==registered.key))
          throw new Error('workspace changed');
        return registered;
      } catch {throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');}
    })();
    const bound=await this.resolveMemoryTask(ownerId,active.id);
    if(bound.workspaceKey!==identity.name)throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
    if(expected&&(expected.taskId!==active.id||expected.ownerId!==ownerId
      ||expected.workspace!==identity.name||expected.workspaceIdentityKey!==identity.key))
      throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
    const controller=expected?.controller??this.experience.controller({...bound,controllerId:'agent-core-external',sessionId},'fusion-feedback-v1');
    if(controller.capabilities().writeMode!=='experience-v2')throw new Error('MEMORY_EXPERIENCE_NOT_ENABLED');
    return expected??{taskId:active.id,ownerId,workspace:identity.name,workspaceIdentityKey:identity.key,permitKey:ownerId+':'+sessionId,controller};
  }

  /** Check the same task inside the existing mutation transaction; never create a new episode. */
  private activePlannedEpisode(state:ExternalControllerState,sessionId:string,scope:PlannedContextScope):ExternalControllerEpisode {
    const current=state.episodes.find(item=>item.id===this.activeEpisodeId(state,sessionId));
    if(!current||current.id!==scope.taskId||current.closedAt||current.boundary!=='explicit'
      ||current.memoryBinding?.ownerId!==scope.ownerId
      ||current.memoryBinding.workspaceIdentityKey!==scope.workspaceIdentityKey
      ||current.workspace!==scope.workspace)throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
    try {
      const identity=this.memory.registeredWorkspaceIdentity(scope.workspace);
      if(identity.key!==scope.workspaceIdentityKey||identity.name!==scope.workspace)
        throw new Error('workspace changed');
    } catch {throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');}
    return current;
  }

  private plannedDeliveryConflicts(episode:ExternalControllerEpisode,report:ContextMemoryRetrieval):string[] {
    const delivered=new Map(Object.entries(episode.deliveredMemories??{})),conflicts=new Set<string>();
    for(const item of report.hits)for(const origin of item.origins) {
      const key=origin.retrievalEvidence.attemptId+':'+item.hit.id;
      const digest=origin.retrievalEvidence.contentDigest,prior=delivered.get(key);
      if(prior&&prior!==digest)conflicts.add(item.hit.id);
      else delivered.set(key,digest);
    }
    return [...conflicts];
  }

  private async contextMemoryRetrieval(sessionId:string,input:ExternalControllerContextInput,scope:PlannedContextScope):Promise<ContextMemoryRetrieval> {
    const dispatcher=createControllerMemoryDispatcher(scope.controller);
    return runPlannedMemoryContext({
      plan:input.retrievalPlan!,limit:input.limit??5,dispatcher,signal:input.signal,
      observeUsage:read=>{scope.readUsage=read;},
      onLateSettlement:async value=>{
        // Metadata only, bound to the original task; never disclose late bodies or register use.
        activityTracker.record('LEARNING','info','Planned Memory backend settled after wait ended',
          'planned-memory-late-settlement',{taskId:scope.taskId,workspace:scope.workspace,...value});
      },
      scopeCheck:async()=>{
        const current=await this.validatePlannedScope(sessionId,input,scope.ownerId,scope);
        if(current.taskId!==scope.taskId||current.workspace!==scope.workspace)
          throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
      },
      trackInFlight:pending=>{
        if(pending){
          const tracked=pending.then(()=>undefined,()=>undefined).then(()=>{
            if(this.plannedMemoryPending.get(scope.permitKey)===tracked)this.plannedMemoryPending.delete(scope.permitKey);
          });
          this.plannedMemoryPending.set(scope.permitKey,tracked);
        } else this.plannedMemoryPending.delete(scope.permitKey);
      },
    });
  }

  /** Planned contexts are opt-in and cannot start sibling work without a valid host-bound episode. */
  async context(sessionId:string,input:ExternalControllerContextInput={},hostOwnerId?:string,invocationContext?:ExternalInvocationContext) {
    if(!input.retrievalPlan)return this.contextCore(sessionId,input,undefined,invocationContext);
    const plan=parseRetrievalPlan(input.retrievalPlan);
    input={...input,retrievalPlan:plan};
    if(!input.taskId||!input.query?.trim()||input.query.trim()!==plan.rootQuery
      ||plan.questions.length<2||!Number.isInteger(input.limit??5)||(input.limit??5)<1||(input.limit??5)>8)
      throw new Error('RETRIEVAL_PLAN_INPUT_INVALID');
    let scope:PlannedContextScope;
    try{scope=await this.validatePlannedScope(sessionId,input,hostOwnerId);}
    catch{return {contractVersion:2,memoryRetrieval:blockedPlannedMemory(plan,'scope-unavailable')};}
    if(this.plannedMemoryBusy.has(scope.permitKey))
      return {contractVersion:2,memoryRetrieval:blockedPlannedMemory(plan,'retrieval-busy')};
    this.plannedMemoryBusy.add(scope.permitKey);
    try{return await this.contextCore(sessionId,{...input,workspace:scope.workspace},scope,invocationContext);}
    catch(error){
      // Preserve actual call accounting while withholding all old disclosure and synthesis.
      if(error instanceof Error&&['MEMORY_CONTROLLER_SCOPE_UNAVAILABLE','RETRIEVAL_DELIVERY_CHANGED'].includes(error.message)) {
        const reason=error.message==='RETRIEVAL_DELIVERY_CHANGED'?'delivery-changed':'scope-changed';
        const report=scope.retrieval?discardPlannedMemory(scope.retrieval,reason):blockedPlannedMemory(plan,reason);
        if(scope.readUsage)report.usage=scope.readUsage();
        return {contractVersion:2,memoryRetrieval:withinBudget(report)};
      }
      throw error;
    }finally{
      const pending=this.plannedMemoryPending.get(scope.permitKey);
      if(pending)void pending.then(()=>this.plannedMemoryBusy.delete(scope.permitKey),
        ()=>this.plannedMemoryBusy.delete(scope.permitKey));
      else this.plannedMemoryBusy.delete(scope.permitKey);
    }
  }
  private async contextCore(sessionId:string,input:ExternalControllerContextInput={},planned?:PlannedContextScope,invocationContext?:ExternalInvocationContext) {
    const skillQuery = String(input.query ?? '').trim();
    const skillSearchMode = input.skillSearchMode ?? 'lexical';
    if (!['lexical', 'hybrid'].includes(skillSearchMode)) throw new Error('SKILL_SEARCH_MODE_INVALID');
    if (skillSearchMode === 'hybrid' && !skillQuery) throw new Error('SKILL_SEARCH_QUERY_REQUIRED');
    const active = await this.getEpisode(sessionId);
    if(planned)await this.validatePlannedScope(sessionId,input,planned.ownerId,planned);
    input = { ...input, workspace: input.workspace ?? active?.workspace };
    if (input.workspace) input = { ...input, workspace: this.memory.resolveWorkspace(input.workspace) };
    if(planned) {
      await this.mutate(next=>{
        const current=this.activePlannedEpisode(next,sessionId,planned);
        if(input.taskFamily)current.taskFamily=bounded(input.taskFamily,160);
        current.updatedAt=new Date().toISOString();
      });
    } else if (input.workspace || input.taskFamily) await this.labelEpisode(sessionId, input);
    const [authority, episode, state, journey, skillDiscovery] = await Promise.all([
      this.authoritySnapshot(input.workspace),
      this.getEpisode(sessionId),
      this.load(),
      input.workspace ? this.learning.journey(input.workspace).catch(() => undefined) : Promise.resolve(undefined),
      skillQuery && this.skills
        ? this.skills.discover({ query: skillQuery, mode: skillSearchMode, ...(input.signal ? { signal: input.signal } : {}) }).catch(() => null)
        : Promise.resolve(undefined),
    ]);
    const query = bounded(input.query, 4000);
    const memoryRetrieval = planned ? await this.contextMemoryRetrieval(sessionId, input, planned) : undefined;
    if(planned&&memoryRetrieval)planned.retrieval=memoryRetrieval;
    const memories = !planned && query ? await this.memory.search(query, {
      taskId: episode?.id,
      limit: Math.max(1, Math.min(8, input.limit ?? 5)),
      maxNeighbors: 2,
      budgetChars: 12_000,
      rankingProfile: 'fusion',
      ...(input.workspace ? { workspace: input.workspace } : {}),
    }).catch(() => [] as DeliveredMemorySearchResult[]) : [];
    if (memories.length) await this.recordMemoryRecall(sessionId, input.workspace, memories, invocationContext);

    const surfacedIds = new Set(memoryRetrieval ? memoryRetrieval.hits.map(item => item.hit.id) : memories.map(item => item.record.id));
    const contradictions: Array<{ from: string; to: string; type: string }> = [];
    for (const item of memories) {
      for (const link of item.record.links) {
        if (!['contradicts', 'supersedes'].includes(link.type)) continue;
        contradictions.push({ from: item.record.id, to: link.targetId, type: link.type });
      }
    }
    const procedures = rankKnowledge((await this.learning.procedures(input.workspace)).map(item => ({ ...item,
      supportEpisodeIds: item.supportTaskIds, failureEpisodeIds: item.failureTaskIds }))
      .filter(item => item.supportEpisodeIds.length > 0)
      .sort((a, b) => {
        const as = a.supportEpisodeIds.length - a.failureEpisodeIds.length * 2;
        const bs = b.supportEpisodeIds.length - b.failureEpisodeIds.length * 2;
        return bs - as || b.updatedAt.localeCompare(a.updatedAt);
      }), query, item => [item.name, item.description, item.reuseCondition, ...item.steps].join(' '));
    if(planned&&memoryRetrieval&&episode) {
      if(planned.readUsage)memoryRetrieval.usage=planned.readUsage();
      memoryRetrieval.deliveryConflicts=this.plannedDeliveryConflicts(episode,memoryRetrieval);
      withinBudget(memoryRetrieval);
      // Dropping whole hits can only shrink this already-budgeted conflict list.
      memoryRetrieval.deliveryConflicts=this.plannedDeliveryConflicts(episode,memoryRetrieval);
    }
    const synthesis = await buildKnowledgeSynthesisPacket({
      runtime: { memoryService: this.memory, learningService: this.learning, skillsService: this.skills },
      availableTools:this.capabilityTools(sessionId),
      skillDiscovery,
      memoryItems: memories.map(item => ({ id: item.record.id })),
      ...(memoryRetrieval ? { memoryDisclosure: { hits:memoryRetrieval.hits,coverage:memoryRetrieval.coverage,revisionConflicts:memoryRetrieval.revisionConflicts } } : {}),
      procedures: procedures.map(item => ({ ...item, supportTaskIds: item.supportEpisodeIds, failureTaskIds: item.failureEpisodeIds })),
      task: { goal: query, episodes: [] }, workspace: input.workspace,
    });
    const deliveredSkills = new Set(synthesis.skillNames);
    const skills = (skillDiscovery?.search.hits ?? []).filter(hit => deliveredSkills.has(hit.name)).map(hit => ({
      ...skillDiscovery!.artifacts.find(artifact => artifact.name === hit.name && artifact.digest === hit.digest)!,
      ...hit, delivery: 'metadata' as const,
    }));
    const skillSearch = skillDiscovery ? (() => {
      const { hits, ...diagnostics } = skillDiscovery.search;
      return { ...diagnostics, deliveredHits: skills.length, omittedByBudget: hits.length - skills.length };
    })() : { status: skillQuery ? 'unavailable' as const : 'not-requested' as const, requestedMode: skillSearchMode };
    const outcomeEvents = activityTracker.readFeatureOutcomes({
      maxEvents: 256,
      maxAgeMs: 90 * 24 * 60 * 60 * 1000,
      ...(input.workspace ? { workspace: input.workspace } : {}),
    }).filter(item => typeof item.context?.artifactKind === 'string').slice(-20);

    const memoryTaskContext = await this.memoryTaskContext(sessionId, episode);
    // Recheck after synthesis too. A rotated task receives no previously synthesized hits.
    const finalRetrieval = memoryRetrieval;
    if(planned?.readUsage&&finalRetrieval)finalRetrieval.usage=planned.readUsage();
    // Synthesis has already selected its sources: never trim hits after this boundary.
    if(finalRetrieval&&Buffer.byteLength(JSON.stringify(finalRetrieval),'utf8')>32_768)
      throw new Error('RETRIEVAL_DELIVERY_CHANGED');
    if(planned)await this.validatePlannedScope(sessionId,input,planned.ownerId,planned);
    const intentionAttention = await this.mutate(next => {
      const current = planned ? this.activePlannedEpisode(next,sessionId,planned) : this.getOrCreateEpisode(next, sessionId);
      if(planned&&finalRetrieval) {
        const conflicts=this.plannedDeliveryConflicts(current,finalRetrieval);
        if(JSON.stringify(conflicts)!==JSON.stringify(finalRetrieval.deliveryConflicts??[]))
          throw new Error('RETRIEVAL_DELIVERY_CHANGED');
        current.deliveredMemories??={};
        for(const item of finalRetrieval.hits)for(const origin of item.origins) {
          if(conflicts.includes(item.hit.id))continue;
          const evidence=origin.retrievalEvidence;
          const key=evidence.attemptId+':'+item.hit.id;
          current.deliveredMemories[key]=evidence.contentDigest;
        }
        current.metrics.memoryRecalls+=finalRetrieval.calls.length;
        current.events.push(event('recall','Planned Memory: '+finalRetrieval.status
          +' calls='+finalRetrieval.calls.length+' delivered='+finalRetrieval.hits.length
          +' omitted='+finalRetrieval.omittedHits,finalRetrieval.hits.map(x=>'memory:'+x.hit.id).slice(0,12)));
      }
      current.deliveredArtifacts = { ...(current.deliveredArtifacts ?? {}), ...synthesis.artifactRevisions };
      current.events.push(event('context',planned ? 'Shared context with bounded planned Memory retrieval, no query/body logged.'
        : 'Shared controller context synthesized' + (query ? ' for query=' + query.slice(0, 180) : '') + '.',
        planned ? finalRetrieval?.hits.map(item=>'memory:'+item.hit.id).slice(0,12) ?? [] : memories.map(item=>'memory:'+item.record.id)));
      const source = 'data' in memoryTaskContext ? memoryTaskContext.data : undefined;
      const evaluation = source?.intentionEvaluation;
      const keys = new Set(current.intentionExposureKeys ?? []), itemIds: string[] = [];
      for (const item of evaluation?.items ?? []) {
        if (item.status !== 'eligible') continue;
        const key = sha256(JSON.stringify([source!.episodeRef.id, evaluation!.episodeRevision, item.itemId]));
        if (!keys.has(key)) { itemIds.push(item.itemId); keys.add(key); }
      }
      current.intentionExposureKeys = [...keys].slice(-64);
      // Exposure suppression belongs to this existing transport episode. It does not
      // resolve/defer the obligation or establish that the user received a notice.
      return { status: evaluation ? 'available' as const : 'unavailable' as const,
        itemIds, advisory: true as const, delivery: 'unconfirmed' as const };
    });

    return {
      contractVersion: planned ? 2 : 1,
      memoryTaskContext,
      intentionAttention,
      synthesis,
      capabilities:synthesis.capabilityExposure,
      workspace: input.workspace ?? null,
      sessionId: episode ? episode.id : sessionId,
      currentAuthority: authority.current.map(item => ({
        id: item.id, title: item.title, context: bounded(item.context || item.content, 1200), updatedAt: item.updatedAt,
      })),
      corrections: authority.corrections.map(item => ({ id: item.id, title: item.title, updatedAt: item.updatedAt })),
      episode,
      ...(planned ? { memoryRetrieval: finalRetrieval } : { memories: memories.map(item => ({
        id: item.record.id,
        title: item.record.title,
        category: item.record.category,
        content: bounded(item.delivery.content, 1400),
        retrievalEvidence: item.retrievalEvidence,
        authority: authority.supersededBy.has(item.record.id)
          ? { state: 'superseded', supersededBy: authority.supersededBy.get(item.record.id) }
          : { state: 'active' },
      })),
      contradictions }),
      patterns: journey?.nodes.filter(node => node.type === 'pattern').slice(0, 12) ?? [],
      skills,
      skillSearch,
      procedures,
      recentArtifactOutcomes: outcomeEvents.map(item => ({
        ref: 'activity:' + item.id,
        feature: item.featureOutcome,
        artifactKind: item.context?.artifactKind,
        artifactId: item.context?.artifactId,
      })),
      evidenceGaps: [
        ...(episode?.metrics.toolFailures && !episode.metrics.verifications ? ['current episode has failures but no verification evidence yet'] : []),
        ...(!(finalRetrieval ? finalRetrieval.hits.length : memories.length) && query ? ['no relevant Memory surfaced for the requested synthesis query'] : []),
        ...(skillDiscovery?.search.emptyReason === 'empty-catalog'
          || !skillQuery && synthesis.capabilityExposure.owners.skills === 'available' && !synthesis.capabilityExposure.counts.skill
          ? ['no active Skill artifacts are currently available'] : []),
        ...(synthesis.capabilityExposure.owners.skills === 'unavailable' ? ['Skill discovery is unavailable; catalog contents are unknown'] : []),
      ],
      surfacedMemoryIds: finalRetrieval ? [...new Set(finalRetrieval.hits.map(item=>item.hit.id))] : [...surfacedIds],
    };
  }
  private artifactFeatureId(kind: ExternalArtifactKind, artifactId: string): string {
    return 'external.' + kind + '.' + sha256(artifactId).slice(0, 24);
  }

  async skillProposalNotices(sessionId: string, workspace?: string, context?: ExternalInvocationContext) {
    if (context?.sessionId !== sessionId) return [];
    return this.observeInvocation(context, async () => {
      const state = await this.load(true);
      const episode = this.issue ? undefined : this.invocationEpisode(state,context).episode;
      if (!episode || state.sessionHeads[sessionId] !== episode.id || !episode.workspace
        || (workspace && this.memory.resolveWorkspace(workspace) !== episode.workspace) || !this.learning.pendingSkillNotices) return [];
      const notices = await this.learning.pendingSkillNotices({ workspace: episode.workspace, sessionId, taskId: episode.id });
      return await this.invocationDisclosureCurrent(context) ? notices : [];
    }, [] as Awaited<ReturnType<LearningService['pendingSkillNotices']>>);
  }

  async artifactReceipt(sessionId: string, input: ExternalArtifactReceiptInput, invocationContext?: ExternalInvocationContext) {
    const episode = await this.getEpisode(sessionId);
    if (input.kind !== 'memory' && (!input.contentDigest || episode?.deliveredArtifacts?.[input.kind + ':' + input.artifactId] !== input.contentDigest)) {
      throw new Error('EXTERNAL_RECEIPT_REVISION_NOT_DELIVERED');
    }
    if (input.taskId && input.taskId !== episode?.id) throw new Error('EXTERNAL_RECEIPT_TASK_MISMATCH');
    input = { ...input, taskId: episode?.id };
    const declaredUse=artifactCapabilityUse(input,episode?.deliveredArtifacts??{});
    const failedUse=input.result==='failure';
    const validation = await validateWorkflowUse(input);
    if (validation.status === 'unavailable' || validation.verification !== (input.result === 'success' ? 'pass' : 'fail')) input = { ...input, result: 'unavailable' };
    if (input.memoryFeedback !== undefined && (input.kind !== 'memory'
      || !['helpful', 'not-helpful'].includes(input.memoryFeedback) || input.applicability === 'rejected'
      || validation.status !== 'resolved' || input.result === 'unavailable')) {
      throw new Error('EXTERNAL_MEMORY_FEEDBACK_VERIFIED_USE_REQUIRED');
    }
    const evidenceRefs = refs(input.evidenceRefs);
    if ((input.result === 'success' || input.result === 'failure') && !input.verificationRef) {
      throw new Error('EXTERNAL_ARTIFACT_RECEIPT_VERIFICATION_REQUIRED');
    }
    if (input.kind === 'memory') {
      if (!input.retrievalAttemptId || !input.memoryId || !input.contentDigest) {
        throw new Error('EXTERNAL_MEMORY_RECEIPT_FIELDS_REQUIRED');
      }
      if (episode?.deliveredMemories?.[input.retrievalAttemptId + ':' + input.memoryId] !== input.contentDigest) throw new Error('EXTERNAL_RECEIPT_MEMORY_NOT_DELIVERED_TO_TASK');
      const useId = 'external:' + input.retrievalAttemptId.slice(0, 80) + ':' + sha256(input.memoryId + input.reasonCode).slice(0, 16);
      const receipt = await this.learning.receipt({
        taskId: input.taskId, actionRefs: input.actionRefs,
        useId,
        retrievalAttemptId: input.retrievalAttemptId,
        memoryId: input.memoryId,
        contentDigest: input.contentDigest,
        ...(input.workspace ? { workspace: input.workspace } : {}),
        applicability: input.applicability,
        result: input.result,
        reasonCode: input.reasonCode,
        evidenceRefs,
        ...(input.verificationRef ? { verificationRef: input.verificationRef } : {}),
        ...(input.summary ? { summary: bounded(input.summary, 500) } : {}),
      });
      await this.recordArtifactEvent(sessionId, input);
      if (!input.memoryFeedback) return receipt;
      // Explicit assessment only. One task/revision gets one bounded utility update,
      // even if the controller repeats recall or supplies another receipt reason.
      const eventId = 'external-use:' + sha256(JSON.stringify([episode!.id, input.memoryId, input.contentDigest]));
      try {
        if (receipt.receipt.evidenceValidation !== 'resolved' || receipt.receipt.result === 'unavailable') throw new Error('EXTERNAL_MEMORY_FEEDBACK_VERIFIED_USE_REQUIRED');
        const feedback = await this.memory.feedback(input.memoryId, eventId, input.memoryFeedback, input.contentDigest);
        return { ...receipt, memoryFeedback: { status: 'recorded' as const, ...feedback } };
      } catch (error) {
        activityTracker.captureFailure('LEARNING', error, 'external-memory-feedback-unavailable');
        return { ...receipt, memoryFeedback: { status: 'unavailable' as const, reason: bounded(error instanceof Error ? error.message : 'feedback unavailable', 200) } };
      }
    }

    const context = {
      externalSessionId: sessionId,
      taskId: input.taskId, actionRefs: input.actionRefs, evidenceValidation: validation.status,
      semanticSupport: validation.semanticSupport,
      ...(input.workspace ? { workspace: input.workspace } : {}),
      artifactKind: input.kind,
      artifactId: input.artifactId,
      applicability: input.applicability,
      reasonCode: input.reasonCode,
      ...(input.verificationRef ? { verificationRef: input.verificationRef } : {}),
    };
    if (input.applicability !== 'rejected' && input.verificationRef && (input.result === 'success' || input.result === 'failure')) {
      if (input.kind === 'skill' && episode?.workspace && this.learning.recordSkillOutcome) {
        try {
          await this.learning.recordSkillOutcome({ workspace: episode.workspace, skillName: input.artifactId,
            revisionDigest: input.contentDigest!, taskId: episode.id, outcome: input.result,
            applicability: input.applicability as 'applied' | 'adapted', verificationRef: input.verificationRef,
            evidenceRefs, actionRefs: input.actionRefs });
          await this.learning.reviewSkillOutcomes(episode.workspace);
        } catch (error) { activityTracker.captureFailure('LEARNING', error, 'external-skill-outcome-unavailable'); }
      } else activityTracker.recordOutcome(
        'LEARNING',
        input.result === 'success' ? 'success' : 'warn',
        'External controller artifact outcome',
        {
          featureId: this.artifactFeatureId(input.kind, input.artifactId),
          outcome: input.result,
          properties: { kind: input.kind, applicability: input.applicability },
        },
        'external-controller-artifact-outcome',
        context,
      );
    } else {
      activityTracker.record(
        'LEARNING',
        'info',
        'External controller artifact use observed without verification; trust unchanged',
        'external-controller-artifact-use',
        context,
      );
    }
    await this.recordArtifactEvent(sessionId, input);
    if(!failedUse && declaredUse) await this.recordCapabilityUse(sessionId,declaredUse,invocationContext);
    if (input.kind === 'procedure' && input.applicability !== 'rejected' && input.verificationRef && input.result !== 'unavailable') {
      await this.applyProcedureOutcome(input.artifactId, sessionId, input.result, [input.verificationRef, ...evidenceRefs]);
    }
    return { recorded: true, trustChanged: Boolean(input.applicability !== 'rejected' && input.verificationRef && input.result !== 'unavailable') };
  }

  private async recordArtifactEvent(sessionId: string, input: ExternalArtifactReceiptInput): Promise<void> {
    await this.mutate(state => {
      const episode = state.episodes.find(item => item.id === input.taskId);
      if (!episode || episode.closedAt) return;
      observeEpisodeWorkspace(episode, input.workspace);
      if (input.applicability !== 'rejected' && input.result !== 'unavailable') episode.metrics.artifactUses += 1;
      episode.events.push(event(
        'artifact-use',
        input.kind + ':' + input.artifactId + ' -> ' + input.applicability + '/' + input.result,
        [input.verificationRef ?? '', ...(input.evidenceRefs ?? [])].filter(Boolean),
        { outcome: input.result },
      ));
    });
  }

  async procedure(sessionId: string, input: ExternalProcedureInput) {
    const episode = await this.getEpisode(sessionId);
    const workspace = input.workspace ?? episode?.workspace;
    const items = await this.learning.procedures(workspace);
    if (input.operation === 'list') return items;
    if (input.operation === 'inspect') {
      const found = items.find(item => item.fingerprint === input.fingerprint);
      if (!found) throw new Error('EXTERNAL_PROCEDURE_NOT_FOUND');
      return found;
    }
    if (input.operation === 'outcome') {
      return this.applyProcedureOutcome(input.fingerprint!, sessionId, input.result!, [input.verificationRef!, ...(input.evidenceRefs ?? [])]);
    }
    if (!episode || episode.terminalOutcome !== 'verified' || !input.name || !input.description || !input.steps?.length || !input.verificationRef) throw new Error('EXTERNAL_PROCEDURE_PROPOSAL_FIELDS_REQUIRED');
    return this.learning.supportProcedure({ taskId: episode.id, origin: 'external', workspace,
      name: input.name, description: input.description, steps: input.steps, allowedTools: input.allowedTools,
      reuseCondition: input.reuseCondition, outcome: 'verified', evidenceRefs: [input.verificationRef, ...(input.evidenceRefs ?? [])] });
  }

  private async applyProcedureOutcome(fingerprint: string, sessionId: string, result: 'success' | 'failure', evidenceRefs: string[]) {
    const episode = await this.getEpisode(sessionId);
    if (!episode) throw new Error('EXTERNAL_EPISODE_REQUIRED');
    const item = (await this.learning.procedures(episode.workspace)).find(value => value.fingerprint === fingerprint);
    if (!item) throw new Error('EXTERNAL_PROCEDURE_NOT_FOUND');
    return this.learning.supportProcedure({ ...item, taskId: episode.id, origin: 'external', evidenceRefs,
      outcome: result === 'success' ? 'verified' : 'failed' });
  }

  async evaluate(input: { workspace?: string; taskFamily?: string; limit?: number; cohortId?: string; baselineEpisodeIds?: string[]; candidateEpisodeIds?: string[] } = {}) {
    const episodes = await this.recentEpisodes({
      episodeIds: [...(input.baselineEpisodeIds ?? []), ...(input.candidateEpisodeIds ?? [])],
      workspace: input.workspace,
      taskFamily: input.taskFamily,
      limit: Math.max(4, Math.min(100, input.limit ?? 40)),
    });

    const meaningful = episodes
      .filter(item => item.meaningful)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const verified = meaningful.filter(item => item.terminalOutcome === 'verified' && item.verificationStatus === 'pass');
    const failed = meaningful.filter(item => item.terminalOutcome === 'failed');

    const aggregate = (items: ExternalControllerEpisode[]) => ({
      episodes: items.length,
      verified: items.filter(item => item.terminalOutcome === 'verified' && item.verificationStatus === 'pass').length,
      failed: items.filter(item => item.terminalOutcome === 'failed').length,
      toolCalls: items.reduce((sum, item) => sum + item.metrics.toolCalls, 0),
      toolFailures: items.reduce((sum, item) => sum + item.metrics.toolFailures, 0),
      repeatedFailures: items.reduce((sum, item) => sum + item.metrics.repeatedFailures, 0),
      memoryRecalls: items.reduce((sum, item) => sum + item.metrics.memoryRecalls, 0),
      artifactUses: items.reduce((sum, item) => sum + item.metrics.artifactUses, 0),
      pendingLearning: items.filter(item => item.pendingLearning).length,
    });

    const selected = (ids: string[] = []) => ids.map(id => {
      const found = meaningful.find(item => item.id === id);
      if (!found) throw new Error('EXTERNAL_EVALUATION_EPISODE_NOT_FOUND:' + id);
      return found;
    });
    const allIds = [...(input.baselineEpisodeIds ?? []), ...(input.candidateEpisodeIds ?? [])];
    if (new Set(allIds).size !== allIds.length) throw new Error('EXTERNAL_EVALUATION_OVERLAPPING_EPISODES');
    const baseline = selected(input.baselineEpisodeIds);
    const candidate = selected(input.candidateEpisodeIds);
    const base = aggregate(baseline);
    const current = aggregate(candidate);

    const rate = (part: number, total: number) => total ? part / total : null;
    return {
      contractVersion: 1,
      scope: {
        workspace: input.workspace ?? null,
        taskFamily: input.taskFamily ?? null,
        cohortId: input.cohortId ?? null,
      },
      totals: aggregate(meaningful),
      verification: {
        verified: verified.length,
        failed: failed.length,
        unverified: meaningful.length - verified.length - failed.length,
      },
      comparison: input.cohortId && baseline.length && candidate.length ? {
        baseline: base,
        candidate: current,
        correctnessPreserved: rate(current.verified, current.episodes) !== null
          && rate(base.verified, base.episodes) !== null
          && (rate(current.verified, current.episodes) as number)
            >= (rate(base.verified, base.episodes) as number),

        toolCallsPerEpisodeDelta: base.episodes && current.episodes
          ? current.toolCalls / current.episodes - base.toolCalls / base.episodes
          : null,
        repeatedFailuresPerEpisodeDelta: base.episodes && current.episodes
          ? current.repeatedFailures / current.episodes
            - base.repeatedFailures / base.episodes
          : null,
      } : {
        status: 'explicit-cohort-and-episode-selection-required',
        minimum: 4,
      },
      limitations: [
        'episode metrics are observational and do not establish causal improvement without a controlled comparable cohort',
        'larger Memory or Skill counts are not intelligence metrics',
        'unverified episodes must not be treated as successful outcomes',
      ],
    };
  }

  async status() {
    const state = await this.load();
    const procedures = await this.learning.procedures?.(undefined, true).catch(() => []) ?? [];
    return {
      status: this.issue ? 'degraded' as const : 'available' as const,
      ...(this.issue ? { issue: this.issue } : {}),
      mode: 'external-controller-derived-state' as const,
      episodeCount: state.episodes.length,

      pendingLearningEpisodes: state.episodes
        .filter(item => item.meaningful && item.pendingLearning).length,
      procedureCount: procedures.length,
      readyProcedureCount: procedures.filter(item => !item.needsReview && item.supportTaskIds.length >= 2
        && item.supportTaskIds.length > item.failureTaskIds.length * 2).length,
      statePath: this.statePath,
      semanticAuthority: 'memory-service',
      modelProviderRequired: false,
    };
  }
}
