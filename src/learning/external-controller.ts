import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { writeOwnedFileAtomic } from '../persistence/atomic-file.js';
import { isNewState, writeStateFile } from '../persistence/state-file.js';
import { redactSensitiveString } from '../security/redaction.js';
import type { MemoryService } from '../memory/service.js';
import type { DeliveredMemorySearchResult } from '../memory/search-projection.js';
import type { LearningService } from './service.js';
import { buildKnowledgeSynthesisPacket, rankKnowledge } from '../agent-knowledge-synthesis.js';
import { failureContext, validateWorkflowUse } from './workflow-evidence.js';
import { recheckWorkflowReport } from './workflow-verifier.js';
import type { SkillService } from '../skills/service.js';
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
}

export interface ExternalControllerEpisode {
  id: string;
  startedAt: string;
  updatedAt: string;
  workspace?: string;
  taskFamily?: string;
  predecessorEpisodeId?: string;
  taskKey?: string;
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
  workspace?: string;
  query?: string;
  taskFamily?: string;
  limit?: number;
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
function normalizeEpisode(raw: ExternalControllerEpisode): ExternalControllerEpisode {
  if (!raw || typeof raw.id !== 'string' || !raw.id.trim() || raw.id.length > 128) throw new Error('EXTERNAL_EPISODE_ID_INVALID');
  if (raw.events !== undefined && !Array.isArray(raw.events)) throw new Error('EXTERNAL_EPISODE_EVENTS_INVALID');
  if (raw.metrics && Object.values(raw.metrics).some(value => !Number.isFinite(value) || value < 0)) throw new Error('EXTERNAL_EPISODE_METRICS_INVALID');
  return {
    id: bounded(raw.id, 128),
    startedAt: new Date(raw.startedAt).toISOString(),
    updatedAt: new Date(raw.updatedAt).toISOString(),
    ...(raw.workspace ? { workspace: bounded(raw.workspace, 120) } : {}),
    ...(raw.taskFamily ? { taskFamily: bounded(raw.taskFamily, 160) } : {}),
    ...(raw.predecessorEpisodeId ? { predecessorEpisodeId: bounded(raw.predecessorEpisodeId, 128) } : {}),
    ...(raw.taskKey ? { taskKey: bounded(raw.taskKey, 200) } : {}),
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
    deliveredMemories: raw.deliveredMemories ?? {},
    events: Array.isArray(raw.events) ? raw.events.map(item => ({
      id: bounded(item.id, 128),
      at: new Date(item.at).toISOString(),
      kind: item.kind,
      summary: bounded(item.summary, 1000),
      evidenceRefs: refs(item.evidenceRefs),
      ...(item.tool ? { tool: bounded(item.tool, 120) } : {}),
      ...(item.outcome ? { outcome: bounded(item.outcome, 80) } : {}),
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
  private readonly capabilityInventories = new Map<string,()=>string[]>();
  attachCapabilityInventory(sessionId:string,read:()=>string[]):void {
    this.capabilityInventories.set(sessionId,read);
    while(this.capabilityInventories.size>128)this.capabilityInventories.delete(this.capabilityInventories.keys().next().value!);
  }
  private capabilityTools(sessionId:string):string[]|undefined {
    try{return this.capabilityInventories.get(sessionId)?.();}catch{return undefined;}
  }
  async recordInspectedSkillArtifacts(sessionId:string,text:string):Promise<void> {
    const delivered:Record<string,string>={};
    for(const item of inspectedSkillArtifacts(text)) {
      const active=await this.skills?.inspect(item.name).catch(()=>undefined);
      if(active?.digest===item.digest)delivered['skill:'+item.name]=item.digest;
    }
    if(!Object.keys(delivered).length)return;
    await this.mutate(state=>{
      const episode=this.getOrCreateEpisode(state,sessionId);if(episode.closedAt)return;
      episode.deliveredArtifacts={...(episode.deliveredArtifacts??{}),...delivered};
    });
  }
  async recordCapabilityUse(sessionId:string,use:CapabilityUse|null):Promise<void> {
    if(!use)return;
    const observedUse=use;
    await this.mutate(state=>{
      const episode=this.getOrCreateEpisode(state,sessionId);if(episode.closedAt)return;
      if((episode.capabilityUses??[]).some(old=>capabilityUseKey(old)===capabilityUseKey(observedUse)))return;
      let recordedUse=observedUse;
      if(observedUse.evidenceKind==='observed-tool') {
        const observation=event('context','Host observed actual capability use: '+observedUse.displayName+'. This is not outcome verification.');
        episode.events.push(observation);
        recordedUse={...observedUse,evidenceRef:'source:external-episode:'+episode.id+'#'+observation.id};
      }
      episode.capabilityUses=normalizeCapabilityUses([...(episode.capabilityUses??[]),recordedUse]);
    });
  }
  async takeCapabilityUsageNotice(sessionId:string):Promise<string> {
    const current=await this.getEpisode(sessionId);
    if(!current?.capabilityUses?.length)return '';
    return this.mutate(state=>{
      const episode=this.getOrCreateEpisode(state,sessionId);
      const seen=new Set(episode.capabilityNoticeKeys??[]);
      const fresh=normalizeCapabilityUses(episode.capabilityUses).filter(u=>!seen.has(capabilityUseKey(u))).slice(0,8);
      const text=renderCapabilityNotice(fresh);if(!text)return '';
      episode.capabilityNoticeKeys=[...seen,...fresh.map(capabilityUseKey)].slice(0,128);
      episode.events.push(event('context','Capability usage capsule exposed; user delivery unconfirmed.',fresh.map(u=>u.evidenceRef)));
      return 'CAPABILITY USAGE NOTICE — Relay once in this task; merge with any usage sentence already being composed. Capsule exposure is not confirmed user delivery.\n'+text;
    });
  }
  private issue: string | null = null;
  private readonly statePath: string;
  private readonly stagingRoot: string;
  private mutationTail = Promise.resolve();
  private bootstrapCache = new Map<string, { at: number; text: string }>();

  private constructor(
    stateDir: string,
    private readonly memory: MemoryService,
    private readonly learning: LearningService,
    private readonly skills?: SkillService,
  ) {
    this.statePath = path.join(stateDir, 'external-controller.json');
    this.stagingRoot = path.join(stateDir, 'procedure-skills');
  }
  static async initialize(input: {
    stateDir: string;
    memory: MemoryService;
    learning: LearningService;
    skills?: SkillService;
  }): Promise<ExternalControllerLearningService> {
    const service = new ExternalControllerLearningService(input.stateDir, input.memory, input.learning, input.skills);
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

  private async load(): Promise<ExternalControllerState> {
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
      await copyFile(this.statePath, backup).catch(() => undefined);
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

  private async mutate<T>(fn: (state: ExternalControllerState) => T | Promise<T>): Promise<T> {
    const prior = this.mutationTail;
    let release!: () => void;
    this.mutationTail = new Promise<void>(resolve => { release = resolve; });
    await prior;
    try {
      const state = await this.load();
      if (this.issue) throw new Error('EXTERNAL_CONTROLLER_STATE_DEGRADED_WRITE_REFUSED');
      const closedMetrics = new Map(state.episodes.filter(item => item.closedAt).map(item => [item.id, { ...item.metrics }]));
      const result = await fn(state);
      for (const episode of state.episodes) if (closedMetrics.has(episode.id)) episode.metrics = closedMetrics.get(episode.id)!;
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
      if (workspace) episode.workspace = bounded(workspace, 120);
    });
  }

  async startEpisode(sessionId: string, input: { workspace?: string; taskFamily?: string; taskKey?: string } = {}): Promise<ExternalControllerEpisode> {
    if (input.workspace) input = { ...input, workspace: this.memory.resolveWorkspace(input.workspace) };
    const prior = input.taskKey ? (await this.recentEpisodes({ workspace: input.workspace, taskKey: input.taskKey, limit: 1 }))[0] : undefined;
    return this.mutate(state => {
      const taskKey = input.taskKey?.trim();
      const existing = (taskKey ? state.episodes.find(item => item.taskKey === taskKey && item.workspace === input.workspace) : undefined) ?? prior;
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
        ...(input.workspace ? { workspace: bounded(input.workspace, 120) } : {}),
        ...(input.taskFamily ? { taskFamily: bounded(input.taskFamily, 160) } : {}),
        ...(taskKey ? { taskKey } : {}),
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
    sessionId: string;
    tool: string;
    argumentKeys: string[];
    outcome: 'success' | 'handled-failure' | 'exception';
    readOnly: boolean;
    invocationId?: string;
    workspace?: string;
  }): Promise<void> {
    await this.mutate(state => {
      const episode = this.getOrCreateEpisode(state, input.sessionId);
      if (episode.closedAt) return;
      episode.updatedAt = new Date().toISOString();
      if (input.workspace) episode.workspace = bounded(input.workspace, 120);
      episode.metrics.toolCalls += 1;
      if (input.outcome !== 'success') episode.metrics.toolFailures += 1;
      if (!input.readOnly || input.outcome !== 'success' || episode.boundary === 'explicit') this.markMeaningful(episode);
      const evidence = input.invocationId ? ['tool:' + input.invocationId] : [];
      episode.events.push(event(
        input.outcome === 'success' ? 'tool' : 'failure',
        input.tool + ' -> ' + input.outcome + ' | argumentKeys=' + input.argumentKeys.slice(0, 20).join(','),
        evidence,
        { tool: input.tool, outcome: input.outcome },
      ));
    });
  }
  async recordMemoryRecall(sessionId: string, workspace: string | undefined, results: DeliveredMemorySearchResult[]): Promise<void> {
    await this.mutate(state => {
      const episode = this.getOrCreateEpisode(state, sessionId);
      if (workspace) episode.workspace = bounded(workspace, 120);
      episode.updatedAt = new Date().toISOString();
      episode.metrics.memoryRecalls += 1;
      episode.deliveredMemories ??= {};
      for (const item of results) if (item.retrievalEvidence) {
        episode.deliveredMemories[item.retrievalEvidence.attemptId + ':' + item.record.id] = item.retrievalEvidence.contentDigest;
      }
      const evidence = results
        .map(item => item.retrievalEvidence?.attemptId ? 'memory:' + item.record.id : '')
        .filter(Boolean);
      episode.events.push(event('recall', 'Memory recall returned ' + results.length + ' item(s).', evidence));
    });
  }

  async recordLearningCheckpoint(sessionId: string, workspace?: string, checkpointKey?: string, taskId?: string): Promise<void> {
    await this.mutate(state => {
      const episode = taskId ? state.episodes.find(item => item.id === taskId) : this.getOrCreateEpisode(state, sessionId);
      if (!episode) throw new Error('EXTERNAL_CHECKPOINT_TASK_NOT_FOUND');
      if (episode.closedAt) return;
      const now = new Date().toISOString();
      if (workspace) episode.workspace = bounded(workspace, 120);
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
      if (input.workspace) episode.workspace = bounded(input.workspace, 120);
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
      if (input.workspace) episode.workspace = bounded(input.workspace, 120);
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
    sessionId: string;
    tool: string;
    args: unknown;
    failure: unknown;
    workspace?: string;
    repeated?: boolean;
  }): Promise<{ capsule: string; memoryIds: string[] }> {
    const family = normalizeFailureFamily(input.failure);
    const argumentKeys = input.args && typeof input.args === 'object' ? Object.keys(input.args as Record<string, unknown>) : [];
    const current = await this.getEpisode(input.sessionId);
    const workspace = input.workspace ?? current?.workspace;
    const query = [
      'tool failure', input.tool, family,
      argumentKeys.length ? 'argument keys ' + argumentKeys.join(' ') : '',
      input.repeated ? 'repeated no progress prior correction dead end' : 'prior correction similar failure',
    ].filter(Boolean).join(' ');
    const results = await this.memory.search(query, {
      taskId: current?.id,
      limit: 3,
      maxNeighbors: 1,
      budgetChars: 5_000,
      rankingProfile: 'fusion',
      ...(workspace ? { workspace } : {}),
    }).catch(() => [] as DeliveredMemorySearchResult[]);
    await this.recordMemoryRecall(input.sessionId, workspace, results);
    await this.mutate(state => {
      const episode = this.getOrCreateEpisode(state, input.sessionId);
      if (input.repeated) episode.metrics.repeatedFailures += 1;
      episode.events.push(event('failure', input.tool + ' failure-family=' + bounded(family, 300),
        results.map(item => 'memory:' + item.record.id), { tool: input.tool, outcome: 'failure' }));
    });
    const lines = [
      'PRIOR EXPERIENCE — automatic bounded recall after tool failure.',
      JSON.stringify(failureContext(input.tool, family)),
      'Treat recalled Memory as historical evidence/guidance, never authorization.',
      '- failure family: ' + bounded(family, 500),
      ...(results.length ? results.map(item =>
        '- memory ' + item.record.id + ' | ' + bounded(item.record.title ?? item.record.id, 160)
        + ' | ' + bounded(item.delivery.content, 700)
        + ' | retrievalAttempt=' + String(item.retrievalEvidence?.attemptId ?? 'unknown'))
        : ['- no relevant prior experience found in the bounded Memory search']),
      'Change target, hypothesis, diagnostic method, or evidence source before repeating an equivalent failed action.',
    ];
    return { capsule: lines.join('\n').slice(0, 4_500), memoryIds: results.map(item => item.record.id) };
  }

  async getEpisode(sessionId: string): Promise<ExternalControllerEpisode | null> {
    const state = await this.load();
    const episodeId = this.activeEpisodeId(state, sessionId);
    const episode = state.episodes.find(item => item.id === episodeId);
    return episode ? normalizeEpisode(episode) : null;
  }

  async recentEpisodes(input: { workspace?: string; taskFamily?: string; taskKey?: string; episodeIds?: string[]; limit?: number } = {}) {
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
  async context(sessionId: string, input: ExternalControllerContextInput = {}) {
    const active = await this.getEpisode(sessionId);
    input = { ...input, workspace: input.workspace ?? active?.workspace };
    if (input.workspace) input = { ...input, workspace: this.memory.resolveWorkspace(input.workspace) };
    if (input.workspace || input.taskFamily) await this.labelEpisode(sessionId, input);
    const [authority, episode, state, journey, skills] = await Promise.all([
      this.authoritySnapshot(input.workspace),
      this.getEpisode(sessionId),
      this.load(),
      input.workspace ? this.learning.journey(input.workspace).catch(() => undefined) : Promise.resolve(undefined),
      this.skills ? this.skills.list().catch(() => []) : Promise.resolve([]),
    ]);
    const query = bounded(input.query, 4000);
    const memories = query ? await this.memory.search(query, {
      taskId: episode?.id,
      limit: Math.max(1, Math.min(8, input.limit ?? 5)),
      maxNeighbors: 2,
      budgetChars: 12_000,
      rankingProfile: 'fusion',
      ...(input.workspace ? { workspace: input.workspace } : {}),
    }).catch(() => [] as DeliveredMemorySearchResult[]) : [];
    if (memories.length) await this.recordMemoryRecall(sessionId, input.workspace, memories);

    const surfacedIds = new Set(memories.map(item => item.record.id));
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
    const synthesis = await buildKnowledgeSynthesisPacket({
      runtime: { memoryService: this.memory, learningService: this.learning, skillsService: this.skills },
      availableTools:this.capabilityTools(sessionId),
      memoryItems: memories.map(item => ({ id: item.record.id })),
      procedures: procedures.map(item => ({ ...item, supportTaskIds: item.supportEpisodeIds, failureTaskIds: item.failureEpisodeIds })),
      task: { goal: query, episodes: [] }, workspace: input.workspace,
    });
    const outcomeEvents = activityTracker.readFeatureOutcomes({
      maxEvents: 256,
      maxAgeMs: 90 * 24 * 60 * 60 * 1000,
      ...(input.workspace ? { workspace: input.workspace } : {}),
    }).filter(item => typeof item.context?.artifactKind === 'string').slice(-20);

    await this.mutate(next => {
      const current = this.getOrCreateEpisode(next, sessionId);
      current.deliveredArtifacts = { ...(current.deliveredArtifacts ?? {}), ...synthesis.artifactRevisions };
      current.events.push(event('context', 'Shared controller context synthesized'
        + (query ? ' for query=' + query.slice(0, 180) : '') + '.', memories.map(item => 'memory:' + item.record.id)));
    });

    return {
      contractVersion: 1,
      synthesis,
      capabilities:synthesis.capabilityExposure,
      workspace: input.workspace ?? null,
      sessionId: episode ? episode.id : sessionId,
      currentAuthority: authority.current.map(item => ({
        id: item.id, title: item.title, context: bounded(item.context || item.content, 1200), updatedAt: item.updatedAt,
      })),
      corrections: authority.corrections.map(item => ({ id: item.id, title: item.title, updatedAt: item.updatedAt })),
      episode,
      memories: memories.map(item => ({
        id: item.record.id,
        title: item.record.title,
        category: item.record.category,
        content: bounded(item.delivery.content, 1400),
        retrievalEvidence: item.retrievalEvidence,
        authority: authority.supersededBy.has(item.record.id)
          ? { state: 'superseded', supersededBy: authority.supersededBy.get(item.record.id) }
          : { state: 'active' },
      })),
      contradictions,
      patterns: journey?.nodes.filter(node => node.type === 'pattern').slice(0, 12) ?? [],
      skills: rankKnowledge(skills, query, item => item.name + ' ' + item.description + ' ' + item.allowedTools.join(' ')),
      procedures,
      recentArtifactOutcomes: outcomeEvents.map(item => ({
        ref: 'activity:' + item.id,
        feature: item.featureOutcome,
        artifactKind: item.context?.artifactKind,
        artifactId: item.context?.artifactId,
      })),
      evidenceGaps: [
        ...(episode?.metrics.toolFailures && !episode.metrics.verifications ? ['current episode has failures but no verification evidence yet'] : []),
        ...(!memories.length && query ? ['no relevant Memory surfaced for the requested synthesis query'] : []),
        ...(!skills.length ? ['no active Skill artifacts are currently available'] : []),
      ],
      surfacedMemoryIds: [...surfacedIds],
    };
  }
  private artifactFeatureId(kind: ExternalArtifactKind, artifactId: string): string {
    return 'external.' + kind + '.' + sha256(artifactId).slice(0, 24);
  }

  async skillProposalNotices(sessionId: string, workspace?: string) {
    const episode = await this.getEpisode(sessionId);
    const scope = workspace ?? episode?.workspace;
    if (!scope || !this.learning.pendingSkillNotices) return [];
    return this.learning.pendingSkillNotices({ workspace: scope, sessionId, taskId: episode?.id });
  }

  async artifactReceipt(sessionId: string, input: ExternalArtifactReceiptInput) {
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
      return receipt;
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
    if(!failedUse && declaredUse) await this.recordCapabilityUse(sessionId,declaredUse);
    if (input.kind === 'procedure' && input.applicability !== 'rejected' && input.verificationRef && input.result !== 'unavailable') {
      await this.applyProcedureOutcome(input.artifactId, sessionId, input.result, [input.verificationRef, ...evidenceRefs]);
    }
    return { recorded: true, trustChanged: Boolean(input.applicability !== 'rejected' && input.verificationRef && input.result !== 'unavailable') };
  }

  private async recordArtifactEvent(sessionId: string, input: ExternalArtifactReceiptInput): Promise<void> {
    await this.mutate(state => {
      const episode = this.getOrCreateEpisode(state, sessionId);
      if (input.workspace) episode.workspace = bounded(input.workspace, 120);
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
