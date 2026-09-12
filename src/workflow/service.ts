import { randomUUID } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { WorkspacePolicy } from '../runtime/workspace.js';
import { WorkflowSources, snapshotMatchesDonor } from './source.js';
import { WorkflowStore, workflowHash } from './store.js';
import { executionContentManifest } from '../execution/provenance.js';
import { classificationProvenance, classifyWorkflowInput } from './classification.js';
import { EngineeringEnforcement } from './engineering-enforcement.js';
import { ENGINEERING_POLICY_VERSION, isEngineeringPath, type EngineeringReviewInput } from './engineering-policy.js';
import { assertWorkflowBaselinesCurrent, reconcileWorkflowOperation, type WorkflowActiveWriter } from './operation-ledger.js';
import { sanitizeStructured, stableJson } from '../memory/record-types.js';
import { WORKFLOW_POLICY_VERSION, WorkflowError, workflowPlanInputSchema, type WorkflowAuthorizeInput, type WorkflowBindInput, type WorkflowExecutionBinding, type WorkflowExecutionRequest, type WorkflowPlanInput, type WorkflowReceipt, type WorkflowRecord, type WorkflowRunEvidence, type WorkflowScope, type WorkflowSourceInput, type WorkflowStep, type WorkflowMapping, type WorkflowCheck, type WorkflowPathState } from './types.js';
export * from './types.js';

const READ_TOOLS = new Set(['read_file','read_multiple_files','get_file_info','list_directory','search_files','workspace_info','execution_status','execution_wait','execution_logs','execution_artifact_find','execution_workflow_advice','stop_process','execution_cancel','read_process_output','list_processes','workflow_status','workflow_source','workflow_plan','craft_status','craft_source','craft_plan']);
const EXECUTION_TOOLS = new Set(['execution_create','execution_start','execution_add_nodes','execution_retry']);
const COMMAND_TOOLS = new Set(['execute_command','start_process']);
const zeroHash = '0'.repeat(64);
function fail(code: string, message: string, details?: Record<string, unknown>): never { throw new WorkflowError(code, message, details); }
function requireRecord(record: WorkflowRecord | null): WorkflowRecord { if (!record) fail('WORKFLOW_NOT_FOUND', 'No workflow is bound to this continuity task'); return record; }
function unique(values: readonly string[], label: string): void { if (new Set(values).size !== values.length) fail('WORKFLOW_PLAN_INVALID', `${label} must be unique`); }
function inside(root: string, value: string): boolean { const rel = path.relative(root, value); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); }
function canonical(value: string): string { const resolved = path.resolve(value); return process.platform === 'win32' ? resolved.toLowerCase() : resolved; }
function codingPolicyRequired(classification: ReturnType<typeof classifyWorkflowInput>, text: string): boolean {
  const documentOnlyAtomic=classification.reasons.includes('ATOMIC_EDIT_REQUEST') && /\.(?:md|mdx|txt|rst|adoc)\b/i.test(text)
    && !/\.(?:[cm]?[jt]sx?|py|go|rs|java|json|yaml|yml|toml|ps1|sh)\b/i.test(text);
  return classification.result.craftRequired || !documentOnlyAtomic && classification.reasons.some(reason=>['IMPLEMENTATION_REQUEST','ATOMIC_EDIT_REQUEST'].includes(reason));
}
function engineeringCommandRequired(command: string): boolean {
  const normalized = command.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!normalized) return false;
  return /\b(?:rewrite|refactor|codegen|compile|bundle|migrat(?:e|ion)|scaffold|generate[-_ ]?(?:code|source|schema)|apply[-_ ]?patch)\b/i.test(normalized)
    || /\b(?:Set-Content|Add-Content|Out-File)\b/i.test(normalized)
    || /\bgit\s+(?:apply|am)\b/i.test(normalized)
    || /(?:^|\s)(?:patch|sed\s+-i|perl\s+-pi)(?:\s|$)/i.test(normalized)
    || /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:build|compile|bundle|codegen|migrate)\b/i.test(normalized)
    || /\b(?:cargo|go|dotnet|mvn|gradle|cmake)\s+(?:build|compile|generate)\b/i.test(normalized);
}
function directOperationalCommand(command: string): boolean {
  return Boolean(command.trim()) && !engineeringCommandRequired(command);
}
function directOperationalOperation(input: WorkflowAuthorizeInput): boolean {
  if (input.toolName === 'github_git' && ['clone','fetch','pull'].includes(input.operation ?? '')) return true;
  if (input.toolName === 'create_directory' || input.toolName === 'move_file') return true;
  const declaredEngineeringTarget = [input.path, ...(input.paths ?? [])]
    .filter((value): value is string => typeof value === 'string').some(isEngineeringPath);
  return COMMAND_TOOLS.has(input.toolName) && !declaredEngineeringTarget
    && typeof input.command === 'string' && directOperationalCommand(input.command);
}
export interface WorkflowServiceOptions { workspace: WorkspacePolicy; stateRoot: string; cacheRoot: string; projectRoot?: string; protectedRoots?: string[]; now?: () => number }

export class WorkflowService {
  readonly store: WorkflowStore;
  private readonly sources: WorkflowSources;
  private readonly now: () => number;
  private readonly engineering: EngineeringEnforcement;
  constructor(private readonly options: WorkflowServiceOptions) {
    this.store = new WorkflowStore(options.stateRoot, path.join(options.cacheRoot, 'locks'));
    this.sources = new WorkflowSources(options.workspace, path.resolve(options.cacheRoot));
    this.now = options.now ?? Date.now;
    this.engineering = new EngineeringEnforcement({ workspace: options.workspace, store: this.store, sources: this.sources, cacheRoot: options.cacheRoot,
      protectedRoots: [options.stateRoot, options.cacheRoot, ...(options.protectedRoots ?? [])], now: this.now });
  }
  async bind(scope: WorkflowScope, input: WorkflowBindInput): Promise<WorkflowRecord> {
    if (!input.brief?.trim() || input.brief.length > 20_000) fail('WORKFLOW_BRIEF_INVALID', 'A nonempty brief of at most 20,000 characters is required');
    if (input.context !== undefined && (typeof input.context !== 'string' || input.context.length > 20_000)) fail('WORKFLOW_BRIEF_INVALID', 'Context must be at most 20,000 characters');
    if (stableJson(input) !== stableJson(sanitizeStructured(input)) || /\bhttps?:\/\/[^/\s"'<>]*@/i.test(JSON.stringify(input))) {
      fail('WORKFLOW_INPUT_SENSITIVE', 'Remove credential values from the workflow brief, context, and structured source request');
    }
    const policyText = [input.brief, input.context].filter(Boolean).join('\n');
    const targetRoot = await this.options.workspace.validateProjectRoot(this.options.workspace.resolveProjectRoot({ explicitRoot: scope.projectId === 'agent-core://self' ? this.options.projectRoot ?? this.options.workspace.roots[0] : scope.projectId }));
    const classification = classifyWorkflowInput(input, this.now());
    const { craftRequired, dagRequired, planRequired } = classification.result;
    const engineeringRequired = codingPolicyRequired(classification,policyText);
    if (input.craft) { unique(input.craft.donors.map(d => d.id), 'Donor IDs'); unique(input.craft.requirements.map(r => r.id), 'Requirement IDs'); }
    return this.store.update(scope, undefined, current => {
      if (current) {
        if (current.phase === 'CLOSED') return current;
        current.classification = classificationProvenance(current.classification, { craftRequired: current.craftRequired,
          dagRequired: current.dagRequired, planRequired: current.planRequired, version: current.version, stateHash: current.stateHash }, classification);
        const changedCraft = input.craft && JSON.stringify({ requirements: current.requirements, donors: current.donors }) !== JSON.stringify(input.craft);
        if (changedCraft) { current.requirements = input.craft!.requirements; current.donors = input.craft!.donors; current.phase = 'DISCOVERY'; delete current.plan; delete current.verification; }
        if (input.context !== undefined && input.context !== current.context) { current.context = input.context; current.briefHash = workflowHash([current.brief,input.context].filter(Boolean).join('\n')); current.phase = 'DISCOVERY'; delete current.plan; delete current.verification; }
        current.craftRequired ||= craftRequired; current.dagRequired ||= dagRequired; current.planRequired ||= planRequired;
        if (engineeringRequired && !current.engineering) current.engineering = { policyVersion: ENGINEERING_POLICY_VERSION, required: true, reason: classification.reasons.join(', '), activatedAt: this.now(), evidence: [] };
        if (current.engineering) current.planRequired = true;
        current.updatedAt = this.now(); return current;
      }
      return {
        schemaVersion: 1, ...scope, version: 1, stateHash: zeroHash, targetRoot,
        brief: input.brief, ...(input.context !== undefined ? {context:input.context}:{}), briefHash: workflowHash(policyText), createdAt: this.now(), updatedAt: this.now(),
        phase: 'DISCOVERY', planRequired: planRequired || engineeringRequired, craftRequired, dagRequired, blockers: [],
        requirements: input.craft?.requirements ?? [], donors: input.craft?.donors ?? [], snapshots: [], receipts: [],
        classification: classificationProvenance(undefined, null, classification),
        ...(engineeringRequired ? { engineering: { policyVersion: ENGINEERING_POLICY_VERSION, required: true as const, reason: classification.reasons.join(', '), activatedAt: this.now(), evidence: [] } } : {}),
      };
    });
  }
  async status(scope: WorkflowScope): Promise<(WorkflowRecord & { observedBlockers: Array<{code:string;detail:string}> }) | null> {
    const record = await this.store.read(scope); if (!record) return null;
    const observedBlockers:Array<{code:string;detail:string}>=[];
    if (!record.engineering && record.phase !== 'CLOSED' && (record.craftRequired || record.plan?.steps.some(step => step.paths.some(isEngineeringPath) || Boolean(step.command)) || codingPolicyRequired(classifyWorkflowInput({brief:record.brief,context:record.context},this.now()), record.brief+' '+(record.context??'')))) {
      observedBlockers.push({code:'ENGINEERING_UPGRADE_REQUIRED',detail:'This active historical task needs engineering-v1 assessment before its next coding mutation. Completed historical operations may still be reconciled.'});
    }
    if (record.engineering && record.phase !== 'CLOSED') {
      if (!record.engineering.assessment || record.engineering.assessment.planHash !== record.plan?.hash) observedBlockers.push({code:'ENGINEERING_ASSESSMENT_REQUIRED',detail:'Collect discovery and impact evidence, read selected sources, then submit a plan with reuse and scope decisions.'});
      else {
        try {
          const inventory=await this.engineering.assertCurrent(record);
          if(record.engineering.review && record.engineering.review.inventoryHash!==inventory.coverage.inventoryHash) observedBlockers.push({code:'ENGINEERING_REVIEW_STALE',detail:'Final inventory changed; collect and accept a new complexity review.'});
        } catch (error) { observedBlockers.push({code:error instanceof WorkflowError ? error.code : 'ENGINEERING_EVIDENCE_UNAVAILABLE', detail:error instanceof Error ? error.message : 'Engineering evidence cannot be verified'}); }
        if (!record.engineering.review || record.engineering.review.planHash !== record.plan?.hash) observedBlockers.push({code:'ENGINEERING_REVIEW_REQUIRED',detail:'Collect a final complexity review and resolve its findings before completion.'});
      }
    }
    if (record.plan && !['VERIFIED','CLOSURE_PENDING','CLOSED'].includes(record.phase)) {
      const stale = await this.staleSources(record); if (stale.length) observedBlockers.push({ code: 'WORKFLOW_SOURCE_STALE', detail: `Source evidence changed or cache unavailable: ${stale.join(', ')}` });
    }
    return { ...record, observedBlockers };
  }
  async source(scope: WorkflowScope, input: WorkflowSourceInput) {
    if (['discover', 'impact', 'review'].includes(input.operation)) return this.engineering.capture(scope, input);
    const current = requireRecord(await this.store.read(scope));
    if (current.phase === 'CLOSED') fail('WORKFLOW_CLOSED', 'Closed workflows cannot add source receipts');
    const captured = await this.sources.capture(current, input);
    if (captured.entries) return { ...captured, version: current.version, entries: captured.entries, receipt: null };
    const bytes = captured.bytes!;
    const filename = path.basename(captured.path);
    if (/^\.env(?:\.|$)|^(?:credentials|secrets)(?:\.|$)/i.test(filename)) fail('WORKFLOW_SOURCE_SENSITIVE', 'Credential files cannot be copied into workflow source receipts');
    const contentHash = await this.sources.cache(bytes), lines = bytes.toString('utf8').split(/\r?\n/);
    const start = input.startLine ?? 1, count = input.lineCount ?? lines.length;
    const maxBytes = input.maxBytes ?? 128 * 1024;
    if (!Number.isSafeInteger(start) || start < 1 || start > lines.length || !Number.isSafeInteger(count) || count < 1 || count > 100_000 || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 2*1024*1024) fail('WORKFLOW_SOURCE_RANGE_INVALID', 'Source bounds are invalid');
    const selected = lines.slice(start - 1, start - 1 + count).join('\n');
    // Never issue a read receipt for a truncated response. The caller can request a narrower range.
    if (Buffer.byteLength(selected, 'utf8') > maxBytes) fail('WORKFLOW_SOURCE_TRUNCATED', 'Requested source range exceeds maxBytes; request a narrower line range');
    const snapshotId = randomUUID(), receipt: WorkflowReceipt = { id: randomUUID(), snapshotId, contentHash, startLine: start, endLine: Math.min(lines.length, start + count - 1), deliveredHash: workflowHash(selected), complete: true, issuedAt: this.now() };
    const result = await this.store.update(scope, input.expectedVersion, record => {
      const r = requireRecord(record);
      if (JSON.stringify(r.donors) !== JSON.stringify(current.donors)) fail('WORKFLOW_VERSION_CONFLICT', 'Donor registration changed during source acquisition');
      const configuredDonor = r.donors.find(d => d.id === input.donorId);
      if (captured.commit && configuredDonor && r.snapshots.some(s => snapshotMatchesDonor(s, configuredDonor) && s.commit && s.commit !== captured.commit)) fail('WORKFLOW_SOURCE_CHANGED', 'Concurrent reads resolved different donor commits; retry against the pinned commit');
      r.snapshots.push({ id: snapshotId, role: input.role, ...(input.donorId ? { donorId: input.donorId } : {}), source: captured.source, path: captured.path, contentHash, bytes: bytes.length, acquiredAt: this.now(), ...(captured.commit ? { commit: captured.commit } : {}), ...(captured.ref !== undefined ? { ref: captured.ref } : {}), contentClass: captured.contentClass!,language:captured.language!,analysisLevel:captured.analysisLevel! });
      r.receipts.push(receipt); r.updatedAt = this.now(); return r;
    });
    return { version: result.version, source: captured.source, path: captured.path, ...(captured.commit ? { commit: captured.commit } : {}), ...(captured.ref !== undefined ? { ref: captured.ref } : {}), content: selected, receipt, snapshotId, contentHash,language:captured.language,analysisLevel:captured.analysisLevel };
  }
  async submitPlan(scope: WorkflowScope, input: WorkflowPlanInput): Promise<WorkflowRecord> {
    const parsed = workflowPlanInputSchema.safeParse(input);
    if (!parsed.success) fail('WORKFLOW_PLAN_INVALID', 'Plan does not satisfy the workflow schema');
    const plan = parsed.data;
    const existing = requireRecord(await this.store.read(scope));
    const codingPaths = await Promise.all(plan.steps.flatMap(step => step.paths).map(p => this.couldMutateSource(existing,p)));
    if (!existing.engineering && (plan.steps.some(step => Boolean(step.command)) || codingPaths.some(Boolean))) {
      await this.engineering.activate(scope, 'Coding operations in the submitted plan require engineering assessment');
      fail('ENGINEERING_ASSESSMENT_REQUIRED', 'This active workflow now requires engineering-v1 evidence; inspect its new version and collect assessment evidence before submitting');
    }
    return this.store.update(scope, plan.expectedVersion, async current => {
      const record = requireRecord(current); if (record.phase === 'CLOSED') fail('WORKFLOW_CLOSED', 'Closed workflow cannot accept a new plan');
      unique(plan.steps.map(s => s.id), 'Step IDs'); unique(plan.checks.map(c => c.id), 'Check IDs');
      const steps = new Map(plan.steps.map(s => [s.id, s]));
      const paths = new Set<string>();
      for (const step of plan.steps) {
        if (step.kind === 'edit' && !step.paths.length) fail('WORKFLOW_PLAN_INVALID', 'Edit steps must declare target paths');
        if (step.kind !== 'edit' && !step.command) fail('WORKFLOW_PLAN_INVALID', 'Command and verification steps must declare their exact command');
        step.paths = await Promise.all(step.paths.map(p => this.targetPath(record, p)));
        for (const p of step.paths) paths.add(p);
      }
      for (const check of plan.checks) {
        if (!check.stepIds.every(id => steps.get(id)?.kind === 'verification')) fail('WORKFLOW_PLAN_INVALID', 'Checks must reference verification steps in the plan');
        check.artifactPaths = await Promise.all(check.artifactPaths.map(p => this.targetPath(record, p)));
        for (const artifact of check.artifactPaths) if (await this.couldMutateSource(record,artifact) && !paths.has(artifact)) fail('WORKFLOW_ARTIFACT_SOURCE_CONFLICT', 'A source-writing check must declare that source as a planned step target; use a generated report directory for verification artifacts', {path:artifact});
      }
      if (!plan.checks.some(c => c.kind === 'integration')) fail('WORKFLOW_INTEGRATION_REQUIRED', 'A runnable target integration check is required');
      for (const mapping of plan.mappings) {
        mapping.targetPaths = await Promise.all(mapping.targetPaths.map(p => this.targetPath(record, p)));
        if (mapping.integrationSeamPaths) mapping.integrationSeamPaths = await Promise.all(mapping.integrationSeamPaths.map(p => this.targetPath(record, p)));
        for (const p of [...mapping.targetPaths, ...(mapping.integrationSeamPaths ?? [])]) paths.add(p);
      }
      if (record.craftRequired) await this.validateMappings(record, plan.mappings, plan.checks, steps);
      if (plan.assessment) for (const target of plan.assessment.targets) target.path = await this.targetPath(record, target.path);
      const assessment = record.engineering ? await this.engineering.validateAssessment(record, plan) : undefined;
      const targetBaseline = await Promise.all([...paths].sort().map(async p => { const state = await this.pathState(p); return {path:p,hash:state.hash,expectedKind:state.kind}; }));
      record.plan = { revision: (record.plan?.revision ?? 0) + 1, hash: workflowHash(JSON.stringify(plan)), acceptedAt: this.now(), steps: plan.steps, mappings: plan.mappings, checks: plan.checks, targetBaseline };
      record.planRequired = true;
      if (assessment && record.engineering) {
        record.engineering.assessment = { ...assessment, planHash: record.plan.hash, planRevision: record.plan.revision };
        delete record.engineering.review; delete record.engineering.outputs; delete record.engineering.facilitiesHash;
        delete record.engineering.acknowledgedFacilities;
      }
      record.phase = 'READY_TO_IMPLEMENT'; record.blockers = []; delete record.verification; record.updatedAt = this.now();
      return record;
    });
  }
  async submitReview(scope: WorkflowScope, input: EngineeringReviewInput): Promise<WorkflowRecord> {
    return this.engineering.acceptReview(scope, input);
  }
  async authorize(scope: WorkflowScope, input: WorkflowAuthorizeInput): Promise<WorkflowRecord | null> {
    let record = await this.store.read(scope);
    if (!record) fail('WORKFLOW_NOT_FOUND', 'Workflow binding is required before an operational tool');
    if (READ_TOOLS.has(input.toolName)) return record;
    if (record.phase === 'CLOSED' || record.phase === 'CLOSURE_PENDING') fail('WORKFLOW_CLOSED', 'Workflow closure grants no implementation permission');
    const mutationTargets = [...(input.path ? [input.path] : []), ...(input.paths ?? [])];
    const possibleCodeTargets = await Promise.all(mutationTargets.map(p => this.couldMutateSource(record!,p)));
    const directOperational = !record.engineering && !record.craftRequired && !record.dagRequired && directOperationalOperation(input);
    if (!record.engineering && !EXECUTION_TOOLS.has(input.toolName) && !directOperational && (COMMAND_TOOLS.has(input.toolName) || possibleCodeTargets.some(Boolean))) {
      record = await this.engineering.activate(scope, 'Actual source mutation or general command requires engineering assessment');
    }
    if (directOperational) {
      for (const p of mutationTargets) await this.operationalTargetPath(record, p);
      return record;
    }
    if (!record.planRequired) { for (const p of mutationTargets) await this.targetPath(record, p); return record; }
    await this.assertPlanCurrent(record, input.planVersion);
    if (record.engineering) await this.engineering.assertCurrent(record);
    if (record.dagRequired && COMMAND_TOOLS.has(input.toolName) && !input.viaExecution) fail('WORKFLOW_DAG_REQUIRED', 'Run this task through its declared execution DAG');
    const selected = this.selectedSteps(record, input.stepIds ?? (input.stepId ? [input.stepId] : []));
    if (!selected.length && !EXECUTION_TOOLS.has(input.toolName)) fail('WORKFLOW_STEP_REQUIRED', 'Supply the accepted plan step for this operation');
    const targets = [...(input.path ? [input.path] : []), ...(input.paths ?? [])];
    for (const p of targets) {
      const target = await this.targetPath(record, p);
      if (!selected.some(s => s.paths.some(p => canonical(p) === canonical(target)))) fail('WORKFLOW_PATH_NOT_PLANNED', 'Mutation target is outside the accepted step', { path: target });
    }
    if (input.command && !selected.some(s => s.command === input.command)) fail('WORKFLOW_COMMAND_NOT_PLANNED', 'Command differs from the accepted plan');
    if (!EXECUTION_TOOLS.has(input.toolName) && input.planVersion === undefined) fail('WORKFLOW_PLAN_VERSION_REQUIRED', 'Planned operations must identify the accepted plan revision');
    return record;
  }
  /** Called only by the runtime after a guarded operation actually succeeded. It cannot authorize a new operation. */
  async recordOperation(scope: WorkflowScope, input: WorkflowAuthorizeInput): Promise<WorkflowRecord | null> {
    const existing = requireRecord(await this.store.read(scope));
    if (!existing.planRequired || READ_TOOLS.has(input.toolName)) return existing;
    return this.store.update(scope, undefined, async r => {
      const record = requireRecord(r);
      if (!record.plan || input.planVersion !== record.plan.revision) fail('WORKFLOW_PLAN_STALE', 'Completed operation belongs to a missing or superseded plan revision');
      const steps = this.selectedSteps(record, input.stepIds ?? (input.stepId ? [input.stepId] : []));
      if (input.command && !steps.some(step => step.command === input.command)) fail('WORKFLOW_COMMAND_NOT_PLANNED', 'Completed command differs from the accepted plan');
      const paths = await Promise.all([...(input.path ? [input.path] : []), ...(input.paths ?? [])].map(p => this.targetPath(record, p)));
      const changed = new Set(paths.map(canonical));
      if (!steps.length || paths.some(p => !steps.some(s => s.paths.some(v => canonical(v) === canonical(p))))) fail('WORKFLOW_PATH_NOT_PLANNED', 'Completed mutation is outside its accepted step');
      const currentStates = await Promise.all(record.plan.targetBaseline.map(baseline => this.pathState(baseline.path)));
      if (input.operationReceipt) {
        const receipt = input.operationReceipt;
        if (receipt.planHash !== record.plan.hash || receipt.planRevision !== record.plan.revision) fail('WORKFLOW_PLAN_STALE', 'Attempt receipt belongs to a different plan');
        if (receipt.outputStates.length !== changed.size || receipt.outputStates.some(state => !changed.has(canonical(state.path)))) fail('WORKFLOW_OPERATION_RECEIPT_INVALID', 'Attempt output paths differ from the selected operation');
        const result = reconcileWorkflowOperation({baselines:record.plan.targetBaseline, receipts:record.plan.operationReceipts ?? [], operation:receipt, currentStates, activeWriters:input.executionTrust?.activeWriters});
        if (result.duplicate) return record;
        record.plan.targetBaseline = result.baselines; record.plan.operationReceipts = result.receipts;
      } else for (const baseline of record.plan.targetBaseline) {
        const state = await this.pathState(baseline.path);
        if (changed.has(canonical(baseline.path))) { baseline.hash = state.hash; baseline.expectedKind = state.kind; baseline.operationRecorded = true; }
        else if (state.hash !== baseline.hash || (baseline.expectedKind && state.kind !== baseline.expectedKind)) fail('WORKFLOW_TARGET_STALE', 'An unrelated target changed during the operation', { path:baseline.path });
      }
      await this.engineering.recordOutputs(record, paths, input.executionTrust?.activeWriters);
      record.phase = 'IMPLEMENTING'; delete record.verification; record.updatedAt = this.now(); return record;
    });
  }
  /** A successful command with no declared source outputs must still leave the captured source intact. */
  async assertCommandOutputsUnchanged(scope: WorkflowScope, activeWriters?: WorkflowActiveWriter[]): Promise<void> {
    const record=requireRecord(await this.store.read(scope));
    if(record.engineering)await this.engineering.assertCurrent(record,activeWriters);
  }
  async assertExecution(scope: WorkflowScope, input: WorkflowExecutionRequest): Promise<WorkflowExecutionBinding> {
    let record = requireRecord(await this.store.read(scope));
    const nodes = input.nodes ?? [];
    const reconciliation = input.operation === 'reconcile';
    if (record.planRequired && !record.plan) fail('WORKFLOW_PLAN_REQUIRED', 'Read relevant source and submit a plan before creating or dispatching execution');
    const declaredCodingWrites = await Promise.all(nodes.flatMap(node => {
      const resources=node.resources as {writes?:string[]} | undefined;
      return (resources?.writes ?? []).map(p => this.couldMutateSource(record,path.resolve(node.cwd ?? record.targetRoot,p)));
    }));
    // A verification label does not prove an arbitrary shell command is read-only.
    // Capture the same before/after source authority for every managed command.
    if (!reconciliation && !record.engineering && (declaredCodingWrites.some(Boolean) || nodes.length > 0)) {
      record = await this.engineering.activate(scope, 'Managed commands require engineering assessment regardless of their declared step kind');
    }
    if (!record.planRequired) return { policyVersion: WORKFLOW_POLICY_VERSION, planRevision: '0', planHash: workflowHash(record.brief), requiredStepIds: [] };
    if (!record.plan) fail('WORKFLOW_PLAN_REQUIRED', 'Read relevant source and submit a plan before creating or dispatching execution');
    const selectedPaths = nodes.flatMap(node => {
      const resources = node.resources as {reads?:string[]} | undefined;
      const inputs = Array.isArray(node.inputs) ? node.inputs.filter((value):value is string => typeof value === 'string') : [];
      return [...this.selectedSteps(record,node.stepIds ?? []).flatMap(step => step.paths), ...(resources?.reads ?? []), ...inputs].map(value => path.resolve(node.cwd ?? record.targetRoot,value));
    });
    await Promise.all(selectedPaths.map(value => this.options.workspace.resolveTargetInProject(record.targetRoot, value)));
    await this.assertPlanCurrent(record, input.planVersion, !reconciliation, input.executionTrust?.activeWriters, selectedPaths);
    if (record.engineering && !reconciliation) await this.engineering.assertCurrent(record, input.executionTrust?.activeWriters);
    for (const node of nodes) {
      const steps = this.selectedSteps(record, node.stepIds ?? []);
      if (!steps.length) fail('WORKFLOW_STEP_REQUIRED', 'Each execution node must bind an accepted workflow step');
      if (node.command && !steps.some(s => s.command === node.command)) fail('WORKFLOW_COMMAND_NOT_PLANNED', 'Execution command differs from its accepted step');
      if (node.cwd) await this.targetPath(record, node.cwd);
      const requiredWrites = [...steps.flatMap(s => s.paths), ...record.plan!.checks.filter(c => c.stepIds.some(id => steps.some(s => s.id === id))).flatMap(c => c.artifactPaths)];
      const resources = node.resources as { writes?: unknown; exclusive?: unknown } | undefined;
      if (resources?.writes !== undefined && (!Array.isArray(resources.writes) || resources.writes.some(p => typeof p !== 'string'))) fail('WORKFLOW_RESOURCE_INVALID', 'Execution write claims must be path strings');
      const writes = await Promise.all(((resources?.writes ?? []) as string[]).map(p => this.targetPath(record, path.isAbsolute(p) ? p : path.resolve(node.cwd ?? record.targetRoot, p))));
      const allowed = new Set(requiredWrites.map(canonical));
      if (writes.some(p => !allowed.has(canonical(p)))) fail('WORKFLOW_PATH_NOT_PLANNED', 'Execution write claim is outside the accepted steps and check artifacts');
      if (requiredWrites.some(p => !writes.some(w => canonical(w) === canonical(p)))) fail('WORKFLOW_RESOURCE_COVERAGE_REQUIRED', 'Execution writes must claim every target and check artifact declared by its steps');
      // Exclusive claims are named mutexes in the existing executor, not paths. They cannot replace file write claims.
    }
    if (record.dagRequired && /create/.test(input.operation)) {
      const covered = new Set(nodes.flatMap(n => n.stepIds ?? []));
      const required = record.plan!.steps.filter(s => s.kind !== 'edit').map(s => s.id);
      if (required.some(id => !covered.has(id))) fail('WORKFLOW_DAG_COVERAGE_REQUIRED', 'The execution DAG must cover all accepted command and verification steps');
    }
    if (/start|retry/.test(input.operation)) await this.store.update(scope, record.version, r => { const current = requireRecord(r); current.phase = 'IMPLEMENTING'; current.updatedAt = this.now(); return current; });
    return { policyVersion: WORKFLOW_POLICY_VERSION, planRevision: String(record.plan!.revision), planHash: record.plan!.hash, requiredStepIds: record.plan!.steps.filter(s => s.kind !== 'edit').map(s => s.id) };
  }
  async prepareCompletion(scope: WorkflowScope, input: { runs: WorkflowRunEvidence[] }): Promise<WorkflowRecord | null> {
    const record = requireRecord(await this.store.read(scope));
    if (!record.planRequired) return record;
    if (record.phase === 'CLOSED') return record;
    await this.assertPlanCurrent(record, undefined, false);
    const plan = record.plan!;
    const verified = input.runs.filter(run => run.taskId === scope.taskId && run.planHash === plan.hash && run.state === 'completed' && run.verification === 'verified');
    if (input.runs.some(run => ['planned','running'].includes(run.state))) fail('WORKFLOW_EXECUTION_ACTIVE', 'Cannot complete workflow while execution is active');
    await this.engineering.assertReviewed(record);
    const targetStates: WorkflowPathState[] = [];
    for (const baseline of plan.targetBaseline) {
      const state = await this.pathState(baseline.path), expectedKind = baseline.expectedKind ?? 'file';
      if (state.kind === 'missing' && expectedKind !== 'missing') fail('WORKFLOW_TARGET_MISSING', 'A required implementation target is missing', {path:baseline.path});
      if (state.kind !== expectedKind) fail('WORKFLOW_TARGET_STALE', 'Implementation target kind differs from its recorded state', {path:baseline.path});
      if (state.kind !== 'file' && !baseline.operationRecorded) fail('WORKFLOW_TARGET_OPERATION_REQUIRED', 'A directory or intentional absence requires a recorded successful planned operation', {path:baseline.path});
      targetStates.push(state);
    }
    const requiredEntries = (await executionContentManifest(this.options.workspace, plan.targetBaseline.map(baseline => baseline.path))).map(entry => ({path:entry.path,kind:entry.kind,hash:entry.sha256??null}));
    for (const check of plan.checks) {
      for (const stepId of check.stepIds) {
        const candidates = verified.flatMap(run => run.nodes).filter(n => n.stepIds.includes(stepId) && n.state === 'succeeded' && n.verification === 'verified');
        let passed = false;
        for (const node of candidates) {
          const inputEntries = node.inputEntries ?? (node.inputHashes ?? []).map(entry => ({...entry,kind:'file' as const}));
          if (requiredEntries.some(expected => !inputEntries.some(entry => canonical(entry.path) === canonical(expected.path) && entry.kind === expected.kind && entry.hash === expected.hash))) continue;
          let artifactsValid = true;
          for (const expected of check.artifactPaths) {
            const artifact = node.artifacts.find(a => canonical(a.path) === canonical(expected) && a.verification === 'verified');
            if (!artifact?.sha256 || await this.fileHash(expected) !== artifact.sha256) { artifactsValid = false; break; }
          }
          if (artifactsValid) { passed = true; break; }
        }
        if (!passed) fail('WORKFLOW_VERIFICATION_REQUIRED', 'A current verified run must prove every required integration and behavior check', { checkId: check.id, stepId });
      }
    }
    return this.store.update(scope, record.version, r => {
      const current = requireRecord(r); current.phase = 'VERIFIED'; current.updatedAt = this.now();
      current.verification = { checkedAt: this.now(), planHash: plan.hash, runIds: verified.map(r => r.runId), outputHashes: targetStates.flatMap(state => state.kind === 'file' && state.hash ? [{path:state.path,hash:state.hash}] : []), outputStates: targetStates };
      return current;
    });
  }
  async markClosed(scope: WorkflowScope, input: { checkpointId: string; synchronized?: boolean }): Promise<WorkflowRecord> {
    const existing = requireRecord(await this.store.read(scope));
    if (existing.closure?.checkpointId === input.checkpointId) return existing;
    await this.engineering.assertReviewed(existing);
    return this.store.update(scope, existing.version, r => {
      const record = requireRecord(r);
      if (record.closure || (record.planRequired && record.phase !== 'VERIFIED')) fail('WORKFLOW_VERIFICATION_REQUIRED', 'Verified work is required before recording logical completion');
      record.closure = { checkpointId: input.checkpointId }; record.phase = 'CLOSED'; record.updatedAt = this.now(); return record;
    });
  }
  private async validateMappings(record: WorkflowRecord, mappings: WorkflowMapping[], checks: WorkflowCheck[], steps: Map<string, WorkflowStep>) {
    if (!record.donors.length || !record.requirements.length) fail('WORKFLOW_CRAFT_INPUT_REQUIRED', 'Explicit donor sources and feature requirements must be registered before implementation');
    const receipt = (id: string) => { const r = record.receipts.find(r => r.id === id); const s = record.snapshots.find(s => s.id === r?.snapshotId); if (!r || !s || !r.complete || r.contentHash !== s.contentHash) fail('WORKFLOW_RECEIPT_INVALID', 'Mapping must use server-issued complete source-read receipts'); return { r, s }; };
    for (const requirement of record.requirements) if (!mappings.some(m => m.requirementId === requirement.id)) fail('WORKFLOW_MAPPING_REQUIRED', 'Every requested behavior must map donor evidence to target implementation');
    for (const donor of record.donors) if (!mappings.some(m => m.donorId === donor.id)) fail('WORKFLOW_DONOR_UNUSED', 'Every explicitly requested donor must have an integration mapping');
    const groundedMutationPaths = new Set<string>();
    for (const mapping of mappings) {
      if (!record.requirements.some(r => r.id === mapping.requirementId) || !record.donors.some(d => d.id === mapping.donorId)) fail('WORKFLOW_MAPPING_INVALID', 'Mapping references an unknown requirement or donor');
      const donor = record.donors.find(d => d.id === mapping.donorId)!;
      const sources = mapping.donorReceiptIds.map(receipt);
      if (!sources.some(({s}) => s.role === 'donor' && s.donorId === mapping.donorId && s.contentClass === 'code')) fail('WORKFLOW_CODE_EVIDENCE_REQUIRED', 'A README or summary cannot substitute for reading donor implementation code');
      if (sources.some(({s}) => s.role !== 'donor' || s.donorId !== mapping.donorId)) fail('WORKFLOW_RECEIPT_SCOPE_MISMATCH', 'Source receipts belong to another donor');
      if (sources.some(({s}) => !snapshotMatchesDonor(s, donor))) fail('WORKFLOW_SOURCE_STALE', 'Donor receipts belong to a superseded source or Git ref');
      const sourceSlices = await Promise.all(sources.filter(({s}) => s.contentClass === 'code').map(({s,r}) => this.sources.receiptContent(s,r)));
      const containsSource = (content: string) => content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, '').split(/\r?\n/).some(line => /[A-Za-z0-9_]/.test(line) && !/^\s*(?:#|\/\/|--|;|\*|REM\b)/i.test(line));
      if (!sourceSlices.some(containsSource)) fail('WORKFLOW_CODE_EVIDENCE_REQUIRED', 'Reading only blank lines or comment headers does not establish implementation evidence');
      const targets = mapping.targetReceiptIds.map(receipt);
      if (targets.some(({s}) => s.role !== 'target')) fail('WORKFLOW_RECEIPT_SCOPE_MISMATCH', 'Target receipts must belong to the current target project');
      if (!targets.some(({s}) => s.role === 'target' && s.contentClass === 'code')) fail('WORKFLOW_TARGET_EVIDENCE_REQUIRED', 'Read the target implementation seam before planning a transplant');
      for (const {s} of [...sources,...targets]) if (!await this.sources.current(s)) fail('WORKFLOW_SOURCE_STALE', 'Source or target changed after its read receipt was issued', { path: s.path });
      if (!mapping.stepIds.every(id => steps.has(id))) fail('WORKFLOW_MAPPING_INVALID', 'Mapping references an unknown implementation step');
      const mappedPaths = new Set([...mapping.targetPaths, ...mapping.stepIds.flatMap(id => steps.get(id)!.paths)]);
      const targetAt = (p: string) => targets.find(({s}) => canonical(s.path) === canonical(p));
      for (const p of mappedPaths) {
        const state = await this.pathState(p);
        if (state.kind === 'file' && !targetAt(p)) fail('WORKFLOW_TARGET_EVIDENCE_REQUIRED', 'Every existing edited file needs its own current target read receipt', {path:p});
        groundedMutationPaths.add(canonical(p));
      }
      const explicitSeams = mapping.integrationSeamPaths ?? [];
      for (const seam of explicitSeams) {
        if ((await this.pathState(seam)).kind !== 'file' || targetAt(seam)?.s.contentClass !== 'code') fail('WORKFLOW_TARGET_EVIDENCE_REQUIRED', 'An explicit integration seam must be an existing code file with its own target read receipt', {path:seam});
      }
      const seamReceipts = targets.filter(({s}) => s.contentClass === 'code' && [...mapping.targetPaths, ...explicitSeams].some(p => canonical(p) === canonical(s.path)));
      if (!seamReceipts.length || !(await Promise.all(seamReceipts.map(({s,r}) => this.sources.receiptContent(s,r)))).some(containsSource)) fail('WORKFLOW_TARGET_EVIDENCE_REQUIRED', 'Map an existing target code seam, or declare integrationSeamPaths when creating new targets');
      if (!checks.some(c => c.kind === 'behavior' && c.requirementIds.includes(mapping.requirementId)) || !checks.some(c => c.kind === 'integration' && c.requirementIds.includes(mapping.requirementId))) fail('WORKFLOW_BEHAVIOR_CHECK_REQUIRED', 'Each feature requires behavior and target integration checks');
      if (mapping.license.mode === 'literal_reuse') {
        const licenses = mapping.license.receiptIds.map(receipt);
        if (licenses.some(({s}) => !snapshotMatchesDonor(s, donor))) fail('WORKFLOW_SOURCE_STALE', 'License receipts belong to a superseded donor source or Git ref');
        for (const {s} of licenses) if (!await this.sources.current(s)) fail('WORKFLOW_SOURCE_STALE', 'Donor license changed after its receipt was issued', {path:s.path});
        if (!mapping.license.attribution || !licenses.some(({s}) => /^(license|copying)(\.|$)/i.test(path.basename(s.path)))) fail('WORKFLOW_LICENSE_EVIDENCE_REQUIRED', 'Literal reuse requires a donor license read receipt and attribution');
      }
    }
    for (const step of steps.values()) for (const p of step.paths) if (!groundedMutationPaths.has(canonical(p))) fail('WORKFLOW_MAPPING_REQUIRED', 'Every transplant mutation path must belong to a source-grounded mapping', {path:p,stepId:step.id});
  }
  private selectedSteps(record: WorkflowRecord, ids: string[]): WorkflowStep[] {
    return ids.map(id => { const step = record.plan?.steps.find(s => s.id === id); if (!step) fail('WORKFLOW_STEP_INVALID', 'Operation references a step outside the accepted plan', { stepId:id }); return step; });
  }
  private async staleSources(record: WorkflowRecord): Promise<string[]> {
    const ids = new Set(record.plan?.mappings.flatMap(m => [...m.donorReceiptIds,...m.license.receiptIds]) ?? []), stale: string[] = [];
    for (const r of record.receipts.filter(r => ids.has(r.id))) {
      const snapshot = record.snapshots.find(s => s.id === r.snapshotId)!;
      const donor = record.donors.find(d => d.id === snapshot.donorId);
      if (!donor || !snapshotMatchesDonor(snapshot, donor) || !await this.sources.current(snapshot)) stale.push(snapshot.path);
    }
    return stale;
  }
  private async assertPlanCurrent(record: WorkflowRecord, revision?: number, checkBaseline = true, activeWriters: readonly WorkflowActiveWriter[] = [], selectedPaths: string[] = []): Promise<void> {
    if (!record.plan) fail('WORKFLOW_PLAN_REQUIRED', 'Read the relevant sources and submit an integration plan before implementation');
    if (record.phase === 'CLOSED' || record.phase === 'CLOSURE_PENDING') fail('WORKFLOW_CLOSED', 'Closed workflow does not authorize execution');
    if (revision !== undefined && record.plan.revision !== revision) fail('WORKFLOW_PLAN_STALE', 'Operation references a superseded plan revision');
    const stale = await this.staleSources(record); if (stale.length) fail('WORKFLOW_SOURCE_STALE', 'Donor evidence is no longer current', { paths:stale });
    if (checkBaseline) assertWorkflowBaselinesCurrent({ baselines:record.plan.targetBaseline,
      currentStates:await Promise.all(record.plan.targetBaseline.map(baseline => this.pathState(baseline.path))),
      planRevision:record.plan.revision, planHash:record.plan.hash, activeWriters, selectedPaths });
  }
  private async targetPath(record: WorkflowRecord, value: string, protectReference = true): Promise<string> {
    const resolved = path.isAbsolute(value) ? path.resolve(value) : path.resolve(record.targetRoot, value);
    const checked = await this.options.workspace.resolveTargetInProject(record.targetRoot, resolved);
    const stateParent = path.dirname(path.resolve(this.options.stateRoot));
    const authorityRoot = path.basename(stateParent) === '.agent-core' ? stateParent : this.options.stateRoot;
    for (const root of [...(protectReference ? [path.join(record.targetRoot,'referensi')] : []), authorityRoot, this.options.cacheRoot, ...(this.options.protectedRoots ?? [])]) if (inside(canonical(root), canonical(resolved)) || inside(canonical(root), canonical(checked))) fail('WORKFLOW_TARGET_PROTECTED', 'Workflow mutation cannot target reference or authority storage');
    return checked;
  }
  /** Direct operational work (clone, download, mkdir, move) may land in referensi; authority and cache storage stay protected. */
  private operationalTargetPath(record: WorkflowRecord, value: string): Promise<string> {
    return this.targetPath(record, value, false);
  }
  private async couldMutateSource(record: WorkflowRecord, value: string): Promise<boolean> {
    const target = path.resolve(record.targetRoot,value);
    // Declared generated artifacts outside source discovery do not become implementation targets.
    if (['reports','dist','coverage','release','releases'].some(folder => inside(path.join(record.targetRoot,folder),target))) return false;
    if (isEngineeringPath(target)) return true;
    try { if ((await stat(target)).isDirectory()) return true; } catch(error) { if((error as NodeJS.ErrnoException).code!=='ENOENT') throw error; }
    return !/\.(?:md|mdx|txt|rst|adoc|png|jpe?g|gif|webp|svg|pdf|zip)$/i.test(target);
  }
  private async fileHash(file: string): Promise<string | null> {
    try { await realpath(file); return workflowHash(await readFile(file)); }
    catch (error) { if (['ENOENT','EISDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return null; throw error; }
  }
  private async pathState(target: string): Promise<WorkflowPathState> {
    try {
      const info = await stat(target);
      if (info.isDirectory()) return {path:target,kind:'directory',hash:null};
      if (info.isFile()) return {path:target,kind:'file',hash:await this.fileHash(target)};
      fail('WORKFLOW_TARGET_KIND_UNSUPPORTED', 'Implementation targets must be files, directories, or planned absences', {path:target});
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {path:target,kind:'missing',hash:null}; throw error; }
  }
}
