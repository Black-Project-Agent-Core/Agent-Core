import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { activityTracker } from '../tracker/activity-tracker.js';
import { HermesPartnerClient } from './hermes-client.js';
import { HermesPartnerRuntime } from './hermes-runtime.js';
import type {
  CollaborationContract,
  HermesPartnerConfig,
  HermesPartnerHealth,
  HermesRunStatus,
} from './types.js';

const MAX_DISCUSSION_ROUNDS = 3;
const TERMINAL_RUN_STATUSES = new Set(['completed', 'failed', 'cancelled', 'interrupted']);

function cleanText(value: string, label: string, max = 20_000): string {
  const result = value.trim();
  if (!result) throw new Error(`${label} is required`);
  if (result.length > max) throw new Error(`${label} exceeds ${max} characters`);
  return result;
}

function uniqueStrings(values: string[] | undefined, max = 32): string[] {
  return [...new Set((values ?? []).map(value => value.trim()).filter(Boolean))].slice(0, max);
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
}

function partnerSystemInstructions(phase: 'alignment' | 'execution'): string {
  const common = [
    'You are Hermes acting as a subordinate A2A partner to Agent Core and its connected AI/controller.',
    'Agent Core/controller is the lead, integrator, final decision-maker, and sole user-facing authority.',
    'You may propose alternatives, point out risks, and disagree with evidence, but you do not take final ownership of the overall task.',
    'Never claim the overall user task is complete; report only your assigned partner workstream.',
    'Do not expose credentials, tokens, secrets, private hidden reasoning, or chain-of-thought.',
    'Do not commit, tag, push, publish, deploy, release, change credentials, or broaden scope unless the lead explicitly assigns that exact action.',
    'Do not run broad tests or unrelated verification unless the task contract explicitly authorizes them.',
    'Any side-effect claim must include inspectable evidence such as an absolute path, command result, ID, or concise source reference.',
  ];
  if (phase === 'alignment') {
    common.push(
      'This is an ALIGNMENT/DISCUSSION turn only.',
      'Do not modify files, execute side effects, or begin the assigned implementation.',
      'Restate your understanding, identify dependencies/risks, propose how you will handle your half, and raise ambiguities before execution.',
      'Be concise and actionable.',
    );
  } else {
    common.push(
      'This is an EXECUTION turn. Work only on the explicitly assigned partner workstream.',
      'Respect the agreed workspace/path scope and constraints.',
      'If instructions conflict or scope becomes ambiguous, stop that part and report the ambiguity instead of improvising authority.',
      'Return: status, concise summary, evidence, changes/outputs, unresolved risks, and integration suggestions for the lead.',
    );
  }
  return common.join('\n');
}

function contractPrompt(contract: CollaborationContract): string {
  return [
    'A2A COLLABORATION CONTRACT',
    `Collaboration ID: ${contract.collaborationId}`,
    'Ownership balance: Lead 50% / Hermes partner 50% (approximate responsibility split, not token/tool-call accounting).',
    `Overall task: ${contract.task}`,
    `Workspace: ${contract.workspacePath}`,
    `Lead-owned workstream: ${contract.leadWorkstream}`,
    `Hermes-owned workstream: ${contract.partnerWorkstream}`,
    `Expected Hermes deliverable: ${contract.expectedDeliverable}`,
    contract.allowedPaths.length
      ? `Agreed partner path scope (contractual): ${contract.allowedPaths.join(', ')}`
      : 'Agreed partner path scope: the assigned workstream only.',
    contract.constraints.length
      ? ['Constraints:', ...contract.constraints.map(item => `- ${item}`)].join('\n')
      : 'Constraints: follow the lead instructions and preserve unrelated work.',
  ].join('\n');
}

export interface AlignInput {
  collaborationId?: string;
  task: string;
  workspacePath?: string;
  leadWorkstream: string;
  partnerWorkstream: string;
  constraints?: string[];
  allowedPaths?: string[];
  expectedDeliverable: string;
  wait?: boolean;
  waitTimeoutMs?: number;
}

export class HermesPartnerService {
  private readonly runtime: HermesPartnerRuntime;
  private readonly client: HermesPartnerClient;
  private readonly collaborations = new Map<string, CollaborationContract>();

  private constructor(readonly config: HermesPartnerConfig) {
    this.runtime = new HermesPartnerRuntime(config);
    this.client = new HermesPartnerClient(this.runtime);
  }

  static async initialize(config: HermesPartnerConfig): Promise<HermesPartnerService> {
    const service = new HermesPartnerService(config);
    void service.initializeRuntimeInBackground();
    return service;
  }

  private async initializeRuntimeInBackground(): Promise<void> {
    try {
      await this.runtime.initialize();
      const health = await this.runtime.health();
      activityTracker.record(
        'PARTNER',
        health.status === 'available' ? 'success' : 'info',
        health.status === 'available' ? 'Hermes partner bridge initialized' : 'Hermes partner bridge degraded',
        'partner-start',
        {
          status: health.status,
          transport: health.transport,
          issueCount: health.issueCount,
          version: health.version ?? '',
        },
      );
    } catch (error) {
      activityTracker.captureFailure('PARTNER', error, 'partner-service-background-start-failure');
    }
  }

  async health(): Promise<HermesPartnerHealth> {
    return this.runtime.health();
  }

  async status(collaborationId?: string, runId?: string): Promise<unknown> {
    const health = await this.health();
    const collaboration = collaborationId ? this.collaborations.get(collaborationId) : undefined;
    const run = runId ? await this.client.status(runId) : undefined;
    return {
      health,
      collaboration: collaboration ? this.publicContract(collaboration) : undefined,
      run,
      activeCollaborations: this.collaborations.size,
      authority: {
        lead: 'Agent Core connected AI/controller',
        partner: 'Hermes',
        finalDecision: 'lead',
      },
    };
  }

  async align(input: AlignInput): Promise<unknown> {
    this.assertAvailable();
    const collaborationId = input.collaborationId?.trim() || randomUUID();
    const existing = this.collaborations.get(collaborationId);
    if (existing) throw new Error('PARTNER_COLLABORATION_ALREADY_EXISTS');

    const workspacePath = path.resolve(input.workspacePath?.trim() || this.config.projectRoot);
    const now = new Date().toISOString();
    const contract: CollaborationContract = {
      collaborationId,
      task: cleanText(input.task, 'task'),
      workspacePath,
      leadWorkstream: cleanText(input.leadWorkstream, 'leadWorkstream'),
      partnerWorkstream: cleanText(input.partnerWorkstream, 'partnerWorkstream'),
      constraints: uniqueStrings(input.constraints),
      allowedPaths: uniqueStrings(input.allowedPaths),
      expectedDeliverable: cleanText(input.expectedDeliverable, 'expectedDeliverable'),
      leadShare: 50,
      partnerShare: 50,
      sessionKey: `agent-core-partner:${collaborationId}`,
      discussionRounds: 1,
      alignmentPending: false,
      alignmentApproved: false,
      createdAt: now,
      updatedAt: now,
    };

    const started = await this.client.startRun({
      prompt: [
        contractPrompt(contract),
        '',
        'Reply with:',
        '1. your understanding of the overall task and your exact half,',
        '2. dependencies on the lead workstream,',
        '3. ambiguities or likely misunderstandings,',
        '4. proposed execution approach for your half,',
        '5. any suggestion that would improve integration.',
        'Do not execute yet.',
      ].join('\n'),
      instructions: partnerSystemInstructions('alignment'),
      sessionKey: contract.sessionKey,
      idempotencyKey: `align:${collaborationId}:1:${digest(contract)}`,
    });
    contract.alignmentRunId = started.runId;
    contract.alignmentPending = true;
    contract.updatedAt = new Date().toISOString();
    this.collaborations.set(collaborationId, contract);

    const run = input.wait === true
      ? await this.client.wait(started.runId, input.waitTimeoutMs ?? 120_000)
      : started.status;
    this.applyAlignmentRun(contract, run);

    activityTracker.record(
      'PARTNER',
      contract.alignmentPending ? 'info' : 'success',
      contract.alignmentPending ? 'Hermes alignment dispatched' : 'Hermes alignment proposal received',
      contract.alignmentPending ? 'partner-alignment-dispatched' : 'partner-alignment',
      {
        collaborationId,
        round: 1,
        runId: started.runId,
        pending: contract.alignmentPending,
      },
    );
    return {
      collaboration: this.publicContract(contract),
      run,
      nextAction: contract.alignmentPending
        ? 'Continue the lead-side analysis/work that does not depend on alignment; collect this alignment run later.'
        : 'Review the Hermes proposal. Use discuss if needed; otherwise call approve_alignment before delegate.',
    };
  }

  async discuss(collaborationId: string, message: string, wait = false, waitTimeoutMs = 120_000): Promise<unknown> {
    const contract = this.requireCollaboration(collaborationId);
    if (contract.alignmentPending) throw new Error('PARTNER_ALIGNMENT_PENDING');
    if (!contract.proposal) throw new Error('PARTNER_ALIGNMENT_PROPOSAL_MISSING');
    if (contract.discussionRounds >= Math.min(this.config.discussionRounds, MAX_DISCUSSION_ROUNDS)) {
      throw new Error('PARTNER_DISCUSSION_ROUND_LIMIT_REACHED');
    }
    contract.discussionRounds += 1;
    contract.alignmentApproved = false;
    contract.updatedAt = new Date().toISOString();
    const round = contract.discussionRounds;
    const started = await this.client.startRun({
      prompt: [
        'ALIGNMENT FOLLOW-UP FROM LEAD',
        cleanText(message, 'message'),
        '',
        'Review this against the collaboration contract. Do not execute yet.',
        'State what changed in your understanding, remaining ambiguity, and your revised proposal.',
      ].join('\n'),
      instructions: partnerSystemInstructions('alignment'),
      sessionKey: contract.sessionKey,
      idempotencyKey: `discuss:${contract.collaborationId}:${round}:${digest(message)}`,
    });
    contract.proposal = undefined;
    contract.alignmentRunId = started.runId;
    contract.alignmentPending = true;
    contract.updatedAt = new Date().toISOString();
    const run = wait ? await this.client.wait(started.runId, waitTimeoutMs) : started.status;
    this.applyAlignmentRun(contract, run);
    activityTracker.record(
      'PARTNER',
      contract.alignmentPending ? 'info' : 'success',
      contract.alignmentPending ? 'Hermes alignment discussion dispatched' : 'Hermes alignment discussion completed',
      contract.alignmentPending ? 'partner-discussion-dispatched' : 'partner-discussion',
      {
        collaborationId,
        round,
        runId: started.runId,
        pending: contract.alignmentPending,
      },
    );
    return {
      collaboration: this.publicContract(contract),
      run,
      nextAction: contract.alignmentPending
        ? 'Collect the alignment run later; approval remains locked while alignment is pending.'
        : 'Review the revised proposal. Discuss again if needed, or approve_alignment.',
    };
  }

  approveAlignment(collaborationId: string, note?: string): unknown {
    const contract = this.requireCollaboration(collaborationId);
    if (contract.alignmentPending) throw new Error('PARTNER_ALIGNMENT_PENDING');
    if (!contract.proposal) throw new Error('PARTNER_ALIGNMENT_PROPOSAL_MISSING');
    contract.alignmentApproved = true;
    contract.updatedAt = new Date().toISOString();
    activityTracker.record('PARTNER', 'success', 'Lead approved Hermes alignment', 'partner-alignment-approved', {
      collaborationId,
      rounds: contract.discussionRounds,
      notePresent: Boolean(note?.trim()),
    });
    return {
      collaboration: this.publicContract(contract),
      approvedBy: 'Agent Core connected AI/controller',
      ...(note?.trim() ? { note: note.trim() } : {}),
      nextAction: 'delegate',
    };
  }

  async delegate(collaborationId: string, extraInstruction?: string, wait = false, waitTimeoutMs = 120_000): Promise<unknown> {
    const contract = this.requireCollaboration(collaborationId);
    if (contract.alignmentPending) throw new Error('PARTNER_ALIGNMENT_PENDING');
    if (!contract.alignmentApproved) throw new Error('PARTNER_ALIGNMENT_NOT_APPROVED');

    const executionPrompt = [
      contractPrompt(contract),
      '',
      'ALIGNMENT STATUS: explicitly approved by the lead.',
      'Begin ONLY the Hermes-owned workstream now.',
      extraInstruction?.trim() ? `Additional execution instruction from lead: ${extraInstruction.trim()}` : '',
      '',
      'Do not perform the lead-owned workstream unless needed only to inspect an interface/dependency.',
      'Do not claim overall task completion. Return evidence that the lead can independently verify.',
    ].filter(Boolean).join('\n');

    const started = await this.client.startRun({
      prompt: executionPrompt,
      instructions: partnerSystemInstructions('execution'),
      sessionKey: contract.sessionKey,
      idempotencyKey: `delegate:${contract.collaborationId}:${digest(executionPrompt)}`,
    });
    contract.lastRunId = started.runId;
    contract.updatedAt = new Date().toISOString();
    activityTracker.record('PARTNER', 'success', 'Hermes partner workstream dispatched', 'partner-delegated', {
      collaborationId,
      runId: started.runId,
      wait,
    });
    return {
      collaboration: this.publicContract(contract),
      run: wait ? await this.client.wait(started.runId, waitTimeoutMs) : started.status,
      runId: started.runId,
      leadInstruction: wait
        ? 'Verify Hermes evidence independently before integrating.'
        : 'Continue the lead-owned workstream now; collect or steer Hermes later.',
    };
  }

  async collect(collaborationId: string, runId?: string, wait = true, waitTimeoutMs = 120_000): Promise<unknown> {
    const contract = this.requireCollaboration(collaborationId);
    const effectiveRunId = runId?.trim() || contract.lastRunId || contract.alignmentRunId;
    if (!effectiveRunId) throw new Error('PARTNER_RUN_ID_REQUIRED');
    const run = wait
      ? await this.client.wait(effectiveRunId, waitTimeoutMs)
      : await this.client.status(effectiveRunId);

    if (effectiveRunId === contract.alignmentRunId) {
      this.applyAlignmentRun(contract, run);
      return {
        collaboration: this.publicContract(contract),
        run,
        alignment: true,
        nextAction: contract.alignmentPending
          ? 'Alignment is still running; continue lead-side work and collect later.'
          : contract.proposal
            ? 'Review the Hermes proposal. Discuss again if needed, or approve_alignment.'
            : 'Alignment did not complete successfully; inspect the run error and resolve before approval.',
        finalAuthority: 'Agent Core connected AI/controller',
      };
    }

    return {
      collaboration: this.publicContract(contract),
      run,
      verificationRequired: true,
      finalAuthority: 'Agent Core connected AI/controller',
    };
  }

  async steer(collaborationId: string, runId: string | undefined, message: string): Promise<unknown> {
    const contract = this.requireCollaboration(collaborationId);
    const effectiveRunId = runId?.trim() || contract.lastRunId;
    if (!effectiveRunId) throw new Error('PARTNER_RUN_ID_REQUIRED');
    const result = await this.client.steer(effectiveRunId, cleanText(message, 'message'));
    activityTracker.record('PARTNER', 'info', 'Hermes partner run steered by lead', 'partner-steered', {
      collaborationId,
      runId: effectiveRunId,
    });
    return { runId: effectiveRunId, result };
  }

  async approveRun(collaborationId: string, runId: string | undefined, requestId: string, choice: 'once' | 'deny'): Promise<unknown> {
    const contract = this.requireCollaboration(collaborationId);
    const effectiveRunId = runId?.trim() || contract.lastRunId;
    if (!effectiveRunId) throw new Error('PARTNER_RUN_ID_REQUIRED');
    const result = await this.client.approve(
      effectiveRunId,
      cleanText(requestId, 'requestId', 512),
      choice,
    );
    activityTracker.record('PARTNER', 'info', 'Hermes partner approval resolved by lead', 'partner-approval', {
      collaborationId,
      runId: effectiveRunId,
      choice,
    });
    return { runId: effectiveRunId, result };
  }

  async stop(collaborationId: string, runId?: string): Promise<unknown> {
    const contract = this.requireCollaboration(collaborationId);
    const effectiveRunId = runId?.trim() || contract.lastRunId;
    if (!effectiveRunId) throw new Error('PARTNER_RUN_ID_REQUIRED');
    const result = await this.client.stop(effectiveRunId);
    activityTracker.record('PARTNER', 'info', 'Hermes partner run stop requested by lead', 'partner-stopped', {
      collaborationId,
      runId: effectiveRunId,
    });
    return { runId: effectiveRunId, result };
  }

  closeCollaboration(collaborationId: string): unknown {
    const existed = this.collaborations.delete(collaborationId);
    return { collaborationId, closed: existed };
  }

  async close(): Promise<void> {
    await this.runtime.close();
  }

  private requireCollaboration(collaborationId: string): CollaborationContract {
    const normalized = collaborationId.trim();
    const contract = this.collaborations.get(normalized);
    if (!contract) throw new Error('PARTNER_COLLABORATION_NOT_FOUND');
    return contract;
  }

  private assertAvailable(): void {
    if (!this.config.enabled) throw new Error('HERMES_PARTNER_DISABLED');
  }

  private applyAlignmentRun(contract: CollaborationContract, run: HermesRunStatus | Record<string, unknown>): void {
    const status = String(run.status ?? '').toLowerCase();
    if (!TERMINAL_RUN_STATUSES.has(status)) {
      contract.alignmentPending = true;
      contract.updatedAt = new Date().toISOString();
      return;
    }

    contract.alignmentPending = false;
    contract.updatedAt = new Date().toISOString();
    if (status === 'completed') {
      const proposal = this.extractRunOutput(run as HermesRunStatus);
      contract.proposal = proposal.trim() ? proposal : undefined;
    } else {
      contract.proposal = undefined;
      contract.alignmentApproved = false;
    }
  }

  private extractRunOutput(status: HermesRunStatus): string {
    const output = status.output;
    if (typeof output === 'string') return output.trim();
    if (output !== undefined) return JSON.stringify(output);
    if (status.error !== undefined) return `Hermes run error: ${JSON.stringify(status.error)}`;
    return JSON.stringify(status);
  }

  private publicContract(contract: CollaborationContract): Omit<CollaborationContract, 'sessionKey'> {
    const { sessionKey: _secretlessInternalSessionKey, ...publicValue } = contract;
    return { ...publicValue };
  }
}
