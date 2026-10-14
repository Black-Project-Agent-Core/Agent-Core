import { createHash } from 'node:crypto';
import type { AgentCapabilityFamily } from './agent-capability-catalog.js';
import type { AgentModelMessage, AgentModelToolCall } from './agent-provider.js';
import { redactSensitiveString } from './security/redaction.js';
import {
  readVerifiedResultBytes,
  RESULT_ARTIFACT_TTL_MS,
  type ExpectedResultIntegrity,
} from './security/verified-result-artifact.js';

export const AGENT_TURN_CHECKPOINT_SCHEMA_VERSION = 1 as const;
export const AGENT_TURN_CHECKPOINT_MAX_BYTES = 2 * 1024 * 1024;
export const AGENT_TURN_CHECKPOINT_TTL_MS = RESULT_ARTIFACT_TTL_MS;

export type AgentTurnCheckpointPhase =
  | 'model-ready'
  | 'provider-dispatch'
  | 'model-received'
  | 'tool-planned'
  | 'tool-dispatching'
  | 'tool-result-durable'
  | 'finalization-started'
  | 'finalization-complete'
  | 'chat-commit-pending'
  | 'terminal';
export interface AgentTurnArtifactReference {
  path: string;
  digest: string;
  storedBytes: number;
}

export interface AgentTurnPendingTool {
  callId: string;
  name: string;
  arguments: string;
  invocationId: string;
  mutating: boolean;
  phase: 'planned' | 'dispatching';
}

export interface AgentTurnMemoryEvidence {
  memoryId: string;
  retrievalAttemptId: string;
  contentDigest: string;
}

export interface AgentTurnFinalResult {
  response: string;
  learningStatus?: 'complete' | 'failed';
  jobVerification?: 'pass' | 'fail' | 'unavailable';
  providerId?: string;
  model?: string;
  iterations: number;
  retrievalAttemptIds: string[];
}
export interface AgentTurnCheckpointState {
  schemaVersion: typeof AGENT_TURN_CHECKPOINT_SCHEMA_VERSION;
  conversationId: string;
  turnId: string;
  runtimeTaskId: string;
  runtimeSessionId: string;
  prompt: string;
  workspace?: string;
  messages: AgentModelMessage[];
  nextIteration: number;
  maxIterations: number;
  providerAttemptsConsumed: number;
  maxProviderAttempts: number;
  approvedCapabilities: AgentCapabilityFamily[];
  historicalGrantedTools: string[];
  toolContractDigest: string;
  hasStrategy: boolean;
  needsStrategy: boolean;
  lastStrategyText: string;
  currentStrategySummary: string;
  failedFingerprints: string[];
  memoryEvidence: AgentTurnMemoryEvidence[];
  providerId?: string;
  model?: string;
  pendingTool?: AgentTurnPendingTool;
  artifactRefs: AgentTurnArtifactReference[];
  finalResult?: AgentTurnFinalResult;
  createdAtMs: number;
  updatedAtMs: number;
  expiresAtMs: number;
}

function digest(value: string): string {
  return 'sha256:' + createHash('sha256').update(value, 'utf8').digest('hex');
}

function safeString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function safeStrings(value: unknown, maxItems: number, maxChars: number): string[] {
  return Array.isArray(value)
    ? [...new Set(value.map(item => safeString(item, maxChars)).filter(Boolean))].slice(0, maxItems)
    : [];
}

function validateToolCall(raw: unknown): AgentModelToolCall {
  if (!raw || typeof raw !== 'object') throw new Error('AGENT_CHAT_CHECKPOINT_TOOL_CALL_INVALID');
  const value = raw as AgentModelToolCall;
  const id = safeString(value.id, 200);
  const name = safeString(value.function?.name, 200);
  const args = safeString(value.function?.arguments, 200_000);
  if (!id || !name) throw new Error('AGENT_CHAT_CHECKPOINT_TOOL_CALL_INVALID');
  return { id, type: 'function', function: { name, arguments: args } };
}

function validateMessage(raw: unknown): AgentModelMessage {
  if (!raw || typeof raw !== 'object') throw new Error('AGENT_CHAT_CHECKPOINT_MESSAGE_INVALID');
  const value = raw as AgentModelMessage;
  if (!['system', 'user', 'assistant', 'tool'].includes(value.role)) {
    throw new Error('AGENT_CHAT_CHECKPOINT_MESSAGE_ROLE_INVALID');
  }
  const content = value.content === null ? null : safeString(value.content, 200_000);
  return {
    role: value.role,
    content,
    ...(value.tool_call_id ? { tool_call_id: safeString(value.tool_call_id, 200) } : {}),
    ...(value.name ? { name: safeString(value.name, 200) } : {}),
    ...(Array.isArray(value.tool_calls)
      ? { tool_calls: value.tool_calls.slice(0, 32).map(validateToolCall) }
      : {}),
  };
}
export function serializeAgentTurnCheckpoint(
  raw: AgentTurnCheckpointState,
): { state: AgentTurnCheckpointState; json: string; digest: string } {
  const normalized = normalizeAgentTurnCheckpoint(raw);
  const state = normalizeAgentTurnCheckpoint({
    ...normalized,
    prompt: redactSensitiveString(normalized.prompt),
    messages: normalized.messages.map(message => ({
      ...message,
      content: typeof message.content === 'string'
        ? redactSensitiveString(message.content)
        : message.content,
      ...(message.tool_calls ? {
        tool_calls: message.tool_calls.map(call => ({
          ...call,
          function: {
            ...call.function,
            arguments: redactSensitiveString(call.function.arguments),
          },
        })),
      } : {}),
    })),
    lastStrategyText: redactSensitiveString(normalized.lastStrategyText),
    currentStrategySummary: redactSensitiveString(normalized.currentStrategySummary),
    ...(normalized.pendingTool ? {
      pendingTool: {
        ...normalized.pendingTool,
        arguments: redactSensitiveString(normalized.pendingTool.arguments),
      },
    } : {}),
    ...(normalized.finalResult ? {
      finalResult: {
        ...normalized.finalResult,
        response: redactSensitiveString(normalized.finalResult.response),
      },
    } : {}),
  });
  const json = JSON.stringify(state);
  if (Buffer.byteLength(json, 'utf8') > AGENT_TURN_CHECKPOINT_MAX_BYTES) {
    throw new Error('AGENT_CHAT_CHECKPOINT_TOO_LARGE');
  }
  return { state, json, digest: digest(json) };
}

export function normalizeAgentTurnCheckpoint(raw: unknown): AgentTurnCheckpointState {
  if (!raw || typeof raw !== 'object') throw new Error('AGENT_CHAT_CHECKPOINT_INVALID');
  const value = raw as Partial<AgentTurnCheckpointState>;
  if (value.schemaVersion !== AGENT_TURN_CHECKPOINT_SCHEMA_VERSION) {
    throw new Error('AGENT_CHAT_CHECKPOINT_SCHEMA_UNSUPPORTED');
  }
  const conversationId = safeString(value.conversationId, 200);
  const turnId = safeString(value.turnId, 200);
  const runtimeTaskId = safeString(value.runtimeTaskId, 200);
  const runtimeSessionId = safeString(value.runtimeSessionId, 200);
  const prompt = safeString(value.prompt, 200_000);
  if (!conversationId || !turnId || !runtimeTaskId || !runtimeSessionId || !prompt) {
    throw new Error('AGENT_CHAT_CHECKPOINT_IDENTITY_INVALID');
  }
  const createdAtMs = Number(value.createdAtMs);
  const updatedAtMs = Number(value.updatedAtMs);
  const expiresAtMs = Number(value.expiresAtMs);
  if (![createdAtMs, updatedAtMs, expiresAtMs].every(Number.isSafeInteger)
    || expiresAtMs <= createdAtMs) {
    throw new Error('AGENT_CHAT_CHECKPOINT_TIME_INVALID');
  }
  const nextIteration = Number(value.nextIteration);
  const maxIterations = Number(value.maxIterations);
  const providerAttemptsConsumed = Number(value.providerAttemptsConsumed);
  const maxProviderAttempts = Number(value.maxProviderAttempts);
  if (![nextIteration, maxIterations, providerAttemptsConsumed, maxProviderAttempts]
    .every(item => Number.isSafeInteger(item) && item >= 0)
    || nextIteration < 1 || maxIterations < 1 || nextIteration > maxIterations + 1
    || providerAttemptsConsumed > maxProviderAttempts) {
    throw new Error('AGENT_CHAT_CHECKPOINT_BUDGET_INVALID');
  }
  const toolContractDigest = safeString(value.toolContractDigest, 80).toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(toolContractDigest)) {
    throw new Error('AGENT_CHAT_CHECKPOINT_TOOL_CONTRACT_INVALID');
  }
  const artifactRefs = Array.isArray(value.artifactRefs) ? value.artifactRefs.slice(0, 64).map(rawRef => {
    const ref = rawRef as AgentTurnArtifactReference;
    const path = safeString(ref?.path, 4_000);
    const digestValue = safeString(ref?.digest, 80).toLowerCase();
    const storedBytes = Number(ref?.storedBytes);
    if (!path || !/^sha256:[0-9a-f]{64}$/.test(digestValue)
      || !Number.isSafeInteger(storedBytes) || storedBytes < 1) {
      throw new Error('AGENT_CHAT_CHECKPOINT_ARTIFACT_INVALID');
    }
    return { path, digest: digestValue, storedBytes };
  }) : [];

  const pending = value.pendingTool;
  const pendingTool = pending ? {
    callId: safeString(pending.callId, 200),
    name: safeString(pending.name, 200),
    arguments: safeString(pending.arguments, 200_000),
    invocationId: safeString(pending.invocationId, 200),
    mutating: pending.mutating === true,
    phase: pending.phase === 'dispatching' ? 'dispatching' as const : 'planned' as const,
  } : undefined;
  if (pendingTool && (!pendingTool.callId || !pendingTool.name || !pendingTool.invocationId)) {
    throw new Error('AGENT_CHAT_CHECKPOINT_PENDING_TOOL_INVALID');
  }
  const finalResult = value.finalResult ? {
    response: safeString(value.finalResult.response, 200_000),
    ...(value.finalResult.learningStatus ? { learningStatus: value.finalResult.learningStatus } : {}),
    ...(value.finalResult.jobVerification ? { jobVerification: value.finalResult.jobVerification } : {}),
    ...(value.finalResult.providerId
      ? { providerId: safeString(value.finalResult.providerId, 100) } : {}),
    ...(value.finalResult.model ? { model: safeString(value.finalResult.model, 200) } : {}),
    iterations: Math.max(0, Number(value.finalResult.iterations) || 0),
    retrievalAttemptIds: safeStrings(value.finalResult.retrievalAttemptIds, 64, 200),
  } : undefined;

  return {
    schemaVersion: AGENT_TURN_CHECKPOINT_SCHEMA_VERSION,
    conversationId, turnId, runtimeTaskId, runtimeSessionId, prompt,
    ...(value.workspace ? { workspace: safeString(value.workspace, 200) } : {}),
    messages: Array.isArray(value.messages) ? value.messages.slice(-256).map(validateMessage) : [],
    nextIteration, maxIterations, providerAttemptsConsumed, maxProviderAttempts,
    approvedCapabilities: safeStrings(value.approvedCapabilities, 32, 100) as AgentCapabilityFamily[],
    historicalGrantedTools: safeStrings(value.historicalGrantedTools, 128, 200),
    toolContractDigest,
    hasStrategy: value.hasStrategy === true,
    needsStrategy: value.needsStrategy === true,
    lastStrategyText: safeString(value.lastStrategyText, 2_000),
    currentStrategySummary: safeString(value.currentStrategySummary, 4_000),
    failedFingerprints: safeStrings(value.failedFingerprints, 256, 80),
    memoryEvidence: Array.isArray(value.memoryEvidence) ? value.memoryEvidence.slice(-128).map(item => ({
      memoryId: safeString(item?.memoryId, 128),
      retrievalAttemptId: safeString(item?.retrievalAttemptId, 200),
      contentDigest: safeString(item?.contentDigest, 80).toLowerCase(),
    })).filter(item => item.memoryId && item.retrievalAttemptId
      && /^sha256:[0-9a-f]{64}$/.test(item.contentDigest)) : [],
    ...(value.providerId ? { providerId: safeString(value.providerId, 100) } : {}),
    ...(value.model ? { model: safeString(value.model, 200) } : {}),
    ...(pendingTool ? { pendingTool } : {}),
    artifactRefs,
    ...(finalResult ? { finalResult } : {}),
    createdAtMs, updatedAtMs, expiresAtMs,
  };
}

export function parseAgentTurnCheckpoint(
  json: string,
  expectedDigest: string,
): AgentTurnCheckpointState {
  if (digest(json) !== expectedDigest.toLowerCase()) {
    throw new Error('AGENT_CHAT_CHECKPOINT_INTEGRITY_MISMATCH');
  }
  return normalizeAgentTurnCheckpoint(JSON.parse(json));
}
export async function verifyCheckpointArtifacts(
  state: AgentTurnCheckpointState,
  storageRoot: string,
): Promise<void> {
  if (Date.now() > state.expiresAtMs) throw new Error('AGENT_CHAT_CHECKPOINT_EXPIRED');
  for (const ref of state.artifactRefs) {
    const expected: ExpectedResultIntegrity = {
      digest: ref.digest,
      storedBytes: ref.storedBytes,
    };
    await readVerifiedResultBytes(ref.path, expected, storageRoot);
  }
}

export function resultArtifactReference(raw: unknown): AgentTurnArtifactReference | null {
  const budget = (raw as any)?._meta?.resultBudget;
  const artifact = typeof budget?.artifact === 'string' ? budget.artifact : '';
  const integrity = budget?.artifactIntegrity;
  const digestValue = typeof integrity?.digest === 'string'
    ? integrity.digest.toLowerCase() : '';
  const storedBytes = Number(integrity?.storedBytes);
  if (budget?.spilled !== true || !artifact
    || !/^sha256:[0-9a-f]{64}$/.test(digestValue)
    || !Number.isSafeInteger(storedBytes) || storedBytes < 1) return null;
  return { path: artifact, digest: digestValue, storedBytes };
}
