import { createHash } from 'node:crypto';
import { redactSensitiveValue } from './security/redaction.js';

export type AgentEpisodeEventKind =
  | 'task-start' | 'recall' | 'hypothesis' | 'action' | 'observation'
  | 'failure' | 'diagnosis' | 'strategy-change' | 'verification'
  | 'knowledge-use' | 'procedure-candidate' | 'finalization';

export type AgentFailureClass =
  | 'tool-runtime' | 'verification' | 'hypothesis-disproved'
  | 'no-progress' | 'contradiction' | 'provider-transport' | 'unknown';

export interface AgentEpisodeEvent {
  id: string;
  kind: AgentEpisodeEventKind;
  at: string;
  summary: string;
  evidenceRefs: string[];
  toolName?: string;
  failureClass?: AgentFailureClass;
  failureFamily?: string;
  strategyFingerprint?: string;
  retrievalAttemptIds?: string[];
  knowledgeIds?: string[];
}

export interface AgentTaskMetrics {
  startedAt: string;
  toolCalls: number;
  toolFailures: number;
  adaptiveRecalls: number;
  strategyChanges: number;
  blockedEquivalentRetries: number;
  hypotheses: number;
  verifications: number;
  knowledgeUseReceipts: number;
  artifactUseOutcomes: number;
  firstHypothesisAt?: string;
}

export interface AgentKnowledgeUseDeclaration {
  memoryId: string;
  applicability: 'applied' | 'adapted' | 'rejected';
  reasonCode: string;
  summary?: string;
  retrievalAttemptId: string;
  contentDigest: string;
}

export type AgentArtifactKind = 'procedure' | 'skill' | 'pattern';
export interface AgentArtifactUseDeclaration {
  contentDigest?: string;
  kind: AgentArtifactKind;
  artifactId: string;
  applicability: 'applied' | 'adapted' | 'rejected';
  reasonCode: string;
  summary?: string;
}

export interface AgentProcedureCandidate {
  contractVersion?: 1;
  contractDigest?: string;
  contractReceipts?: Array<{ taskId: string; contractDigest: string; outcome: 'verified' | 'failed'; evidenceRefs: string[] }>;
  workspace?: string;
  origins?: Array<'native' | 'external'>;
  historicalTaskIds?: string[];
  needsReview?: boolean;
  migratedSources?: string[];
  fingerprint: string;
  name: string;
  description: string;
  steps: string[];
  allowedTools: string[];
  reuseCondition?: string;
  evidenceRefs: string[];

  supportTaskIds: string[];
  failureTaskIds: string[];
  status: 'candidate' | 'skill-imported' | 'revision-staged';
  skillName?: string;
  skillDigest?: string;
  updatedAt: string;
}

export interface AgentStrategyDeclaration {
  strategy: string;
  hypothesis: string;
  expectedObservation: string;
  evidenceRefs: string[];
  knowledgeUse: Array<{
    memoryId: string;
    applicability: 'applied' | 'adapted' | 'rejected';
    reasonCode: string;
    summary?: string;
  }>;
  artifactUse: AgentArtifactUseDeclaration[];
}

export function defaultTaskMetrics(now = new Date().toISOString()): AgentTaskMetrics {
  return {
    startedAt: now, toolCalls: 0, toolFailures: 0, adaptiveRecalls: 0,
    strategyChanges: 0, blockedEquivalentRetries: 0, hypotheses: 0,
    verifications: 0, knowledgeUseReceipts: 0, artifactUseOutcomes: 0,
  };
}

function canonical(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return String(value ?? '');
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    if (key === 'origin') continue;
    output[key] = canonical((value as Record<string, unknown>)[key]);
  }
  return output;
}

export function agentStrategyFingerprint(toolName: string, args: unknown): string {
  const safe = redactSensitiveValue(args ?? {});
  const payload = JSON.stringify(canonical(safe)) ?? '{}';
  return 'sha256:' + createHash('sha256').update(toolName + '\n' + payload).digest('hex');
}

export function procedureFingerprint(name: string, steps: string[]): string {
  return 'sha256:' + createHash('sha256')
    .update(name.trim().toLowerCase() + '\n' + steps.map(step => step.trim()).join('\n'))
    .digest('hex');
}

/** Internal compatibility identity. The historical name/steps address remains unchanged. */
export function procedureContract(item: Pick<AgentProcedureCandidate, 'name' | 'description' | 'steps' | 'allowedTools' | 'reuseCondition' | 'workspace'>) {
  return {
    fingerprint: procedureFingerprint(item.name, item.steps),
    name: item.name.trim(), steps: item.steps.map(step => step.trim()),
    workspace: item.workspace ?? null, purpose: item.description.trim(),
    trigger: (item.reuseCondition ?? item.description).trim(),
    allowedTools: [...new Set((item.allowedTools ?? []).map(tool => tool.trim()))].sort(),
  };
}

export function procedureContractDigest(item: Parameters<typeof procedureContract>[0]): string {
  return 'sha256:' + createHash('sha256').update(JSON.stringify(procedureContract(item))).digest('hex');
}

export function assertProcedureCompatible(current: Parameters<typeof procedureContract>[0], incoming: Parameters<typeof procedureContract>[0]): void {
  const before = procedureContract(current), after = procedureContract(incoming);
  const fields = (Object.keys(before) as Array<keyof typeof before>).filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
  if (fields.length) throw new Error('LEARNING_PROCEDURE_CONTRACT_CONFLICT:' + fields.join(','));
}

/** Counts attributable history only; qualification still freshly replays each receipt. */
export function procedureBoundEvidence(item: AgentProcedureCandidate) {
  const receipts = item.contractVersion === 1 && item.contractDigest === procedureContractDigest(item)
    ? (item.contractReceipts ?? []).filter(receipt => receipt.contractDigest === item.contractDigest) : [];
  const supportTaskIds = [...new Set(receipts.filter(r => r.outcome === 'verified').map(r => r.taskId))];
  const failureTaskIds = [...new Set(receipts.filter(r => r.outcome === 'failed').map(r => r.taskId))];
  return { receipts, supportTaskIds, failureTaskIds,
    legacyTaskIds: [...new Set([...item.supportTaskIds, ...item.failureTaskIds, ...(item.historicalTaskIds ?? [])])]
      .filter(id => !supportTaskIds.includes(id) && !failureTaskIds.includes(id)) };
}

export function artifactUseFeatureId(kind: AgentArtifactKind, artifactId: string): string {
  const digest = createHash('sha256').update(kind + '\n' + artifactId.trim()).digest('hex').slice(0, 24);
  return `agent-artifact.${kind}.${digest}`;
}

export function classifyAgentFailure(text: string): AgentFailureClass {
  const value = text.toLowerCase();
  if (/provider|http_[45]\d\d|rate.?limit|timeout|network|fetch/.test(value)) return 'provider-transport';
  if (/verif|assert|expected|mismatch|evidence/.test(value)) return 'verification';
  if (/contradict|conflict/.test(value)) return 'contradiction';
  if (/repeat|no.progress|same failure|stuck/.test(value)) return 'no-progress';
  return 'tool-runtime';
}

export function buildAdaptiveRecallQuery(input: {
  goal: string;
  toolName?: string;
  failureSummary: string;
  failureFamily?: string;
  strategySummary?: string;
}): string {
  const parts = [
    'Goal: ' + input.goal.trim(),
    input.toolName ? 'Failed tool/action: ' + input.toolName : '',
    'Observed failure: ' + input.failureSummary.trim(),
    input.failureFamily ? 'Failure family: ' + input.failureFamily : '',
    input.strategySummary ? 'Prior strategy: ' + input.strategySummary.trim() : '',
    'Find prior verified lessons, corrections, failed approaches, dependencies, or procedures that can change the next strategy.',
  ].filter(Boolean);
  return parts.join('\n').slice(0, 10_000);
}

