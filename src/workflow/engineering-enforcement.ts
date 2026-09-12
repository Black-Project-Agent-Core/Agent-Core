import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { WorkspacePolicy } from '../runtime/workspace.js';
import { EngineeringDiscovery } from './engineering-discovery.js';
import { ENGINEERING_CHOICES, ENGINEERING_POLICY_VERSION, analyzeEngineeringComplexity, engineeringCallerId, engineeringIdentity, engineeringLimitationId, engineeringReviewInputSchema, type EngineeringAssessment, type EngineeringEvidence, type EngineeringReviewInput } from './engineering-policy.js';
import type { EngineeringFacilities, EngineeringInventory } from './engineering-types.js';
import { sourceClass, type WorkflowSources } from './source.js';
import type { WorkflowStore } from './store.js';
import { WorkflowError, type WorkflowRecord, type WorkflowScope, type WorkflowSourceInput, type WorkflowPlanInput } from './types.js';
import type { WorkflowActiveWriter } from './operation-ledger.js';

const canonical = (p: string) => process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p);
const contains = (root: string, p: string) => canonical(p) === canonical(root) || canonical(p).startsWith(canonical(root) + path.sep);
function fail(code: string, message: string, details?: Record<string, unknown>): never { throw new WorkflowError(code, message, details); }

function expectedFacilities(record: WorkflowRecord, baseline: EngineeringFacilities): EngineeringFacilities {
  const state = record.engineering!, acknowledged = state.acknowledgedFacilities;
  if (acknowledged) {
    if (state.facilitiesHash !== engineeringIdentity(acknowledged)) fail('ENGINEERING_FACILITIES_BASELINE_UNAVAILABLE', 'Acknowledged facility values do not match their recorded hash');
    return acknowledged;
  }
  if (!state.facilitiesHash || state.facilitiesHash === engineeringIdentity(baseline)) return baseline;
  // Preserve hash-only historical receipts only when their exact server-captured values still exist.
  const historical = state.evidence.find(evidence => engineeringIdentity(evidence.data.inventory.facilities) === state.facilitiesHash);
  if (!historical) fail('ENGINEERING_FACILITIES_BASELINE_UNAVAILABLE', 'Historical facility receipt has no matching captured values; collect a new assessment');
  return historical.data.inventory.facilities;
}

/** A sibling may defer its own manifest only; acknowledgement never imports its unfinished values. */
function reconcileFacilities(expected: EngineeringFacilities, actual: EngineeringFacilities, acknowledged: readonly string[], active: readonly string[]): EngineeringFacilities {
  const native = (value: EngineeringFacilities) => ({ nodeVersion: value.nodeVersion, platform: value.platform, builtins: [...value.builtins].sort() });
  if (engineeringIdentity(native(expected)) !== engineeringIdentity(native(actual))) fail('ENGINEERING_FACILITIES_STALE', 'Runtime identity changed outside a source operation');
  const key = (value: EngineeringFacilities['dependencies'][number]) => `${canonical(value.manifestPath)}\0${value.name}`;
  const previous = new Map(expected.dependencies.map(value => [key(value), value])), current = new Map(actual.dependencies.map(value => [key(value), value]));
  const next = new Map(expected.dependencies.map(value => [key(value), structuredClone(value)]));
  const change = (paths: string[], apply: () => void) => {
    const unique = [...new Set(paths.map(canonical))];
    if (!unique.length) fail('ENGINEERING_FACILITIES_BASELINE_UNAVAILABLE', 'Changed dependency facts have no captured manifest path');
    if (unique.every(file => acknowledged.some(root => contains(root, file)))) { apply(); return; }
    if (unique.every(file => active.some(root => contains(root, file)))) return;
    fail('ENGINEERING_FACILITIES_STALE', 'Dependency manifest changed outside its acknowledged or active write path', { paths: unique });
  };
  const declaration = (value: EngineeringFacilities['dependencies'][number]) => ({ name:value.name, declaredVersion:value.declaredVersion, manifestPath:value.manifestPath, manifestHash:value.manifestHash });
  const installed = (value: EngineeringFacilities['dependencies'][number]) => ({ installedVersion:value.installedVersion, installedManifestPath:value.installedManifestPath, installedManifestHash:value.installedManifestHash });
  for (const id of [...new Set([...previous.keys(), ...current.keys()])].sort()) {
    const before = previous.get(id), after = current.get(id);
    if (!before && after) {
      change([after.manifestPath, ...(after.installedManifestPath ? [after.installedManifestPath] : [])], () => { next.set(id, structuredClone(after)); });
    } else if (before && !after) {
      // Removing the declaration removes this facility from the inspected set; it does not prove an uninstall.
      change([before.manifestPath], () => { next.delete(id); });
    } else if (before && after) {
      if (engineeringIdentity(declaration(before)) !== engineeringIdentity(declaration(after))) {
        change([before.manifestPath, after.manifestPath], () => { next.set(id, { ...next.get(id)!, ...declaration(after) }); });
      }
      if (engineeringIdentity(installed(before)) !== engineeringIdentity(installed(after))) {
        const manifestPaths = [before.installedManifestPath, after.installedManifestPath].filter((value): value is string => Boolean(value));
        change(manifestPaths, () => {
          const value = next.get(id)!; delete value.installedVersion; delete value.installedManifestPath; delete value.installedManifestHash;
          if (after.installedVersion !== undefined) value.installedVersion = after.installedVersion;
          if (after.installedManifestPath !== undefined) value.installedManifestPath = after.installedManifestPath;
          if (after.installedManifestHash !== undefined) value.installedManifestHash = after.installedManifestHash;
        });
      }
    }
  }
  return { ...structuredClone(expected), dependencies: [...next.values()] };
}

/** Internal workflow authority: facts come from collectors; interpretation remains with the controlling AI. */
export class EngineeringEnforcement {
  readonly discovery: EngineeringDiscovery;
  constructor(private readonly options: { workspace: WorkspacePolicy; store: WorkflowStore; sources: WorkflowSources; cacheRoot: string; protectedRoots: string[]; now: () => number }) {
    this.discovery = new EngineeringDiscovery({ workspace: options.workspace, protectedRoots: options.protectedRoots });
  }
  async activate(scope: WorkflowScope, reason: string): Promise<WorkflowRecord> {
    const record = await this.options.store.read(scope);
    if (!record) fail('WORKFLOW_NOT_FOUND', 'A scoped workflow is required');
    if (record.engineering || record.phase === 'CLOSED') return record;
    return this.options.store.update(scope, record.version, current => {
      if (!current) fail('WORKFLOW_NOT_FOUND', 'A scoped workflow is required');
      current.engineering = { policyVersion: ENGINEERING_POLICY_VERSION, required: true, reason, activatedAt: this.options.now(), evidence: [] };
      current.planRequired = true;
      return current;
    });
  }
  async capture(scope: WorkflowScope, input: WorkflowSourceInput) {
    const record = await this.options.store.read(scope);
    if (!record) fail('WORKFLOW_NOT_FOUND', 'A scoped workflow is required');
    if (input.expectedVersion !== undefined && input.expectedVersion !== record.version) {
      fail('WORKFLOW_VERSION_CONFLICT', 'Workflow changed; reload its current version', { expectedVersion: input.expectedVersion, actualVersion: record.version });
    }
    if (record.phase === 'CLOSED' || record.phase === 'CLOSURE_PENDING') fail('WORKFLOW_CLOSED', 'Closed work cannot acquire implementation evidence');
    if (input.role !== 'target' || input.donorId) fail('ENGINEERING_TARGET_REQUIRED', 'Engineering discovery operates on the routed target; donor reads use registered craft sources');
    let evidence: EngineeringEvidence;
    let finalImpact: EngineeringEvidence | undefined;
    if (input.operation === 'discover') {
      const data = await this.discovery.discover(record.targetRoot, input.query?.trim() || record.brief);
      evidence = { id: randomUUID(), kind: 'discovery', issuedAt: this.options.now(), data };
    } else if (input.operation === 'impact') {
      const targets = input.targetPaths ?? (input.path ? [input.path] : []);
      if (!targets.length) fail('ENGINEERING_TARGET_REQUIRED', 'Declare the actual implementation targets before caller analysis');
      const data = await this.discovery.impact(record.targetRoot, targets);
      evidence = { id: randomUUID(), kind: 'impact', issuedAt: this.options.now(), data };
    } else {
      if (!record.plan || !record.engineering?.assessment) fail('ENGINEERING_ASSESSMENT_REQUIRED', 'Accept a source-backed assessment and plan before final review');
      const current = await this.assertCurrent(record);
      const baseline = this.assessmentEvidence(record).discovery.data.inventory;
      const before = new Map<string, string>();
      for (const entry of baseline.entries) {
        try { before.set(entry.path, await this.cachedText(entry.hash)); }
        catch { fail('ENGINEERING_BASELINE_UNAVAILABLE', 'Pre-change source cache is unavailable; do not fabricate earlier source evidence', { path: entry.path }); }
      }
      const old = new Map(baseline.entries.map(entry => [canonical(entry.path), entry.hash]));
      const next = new Map(current.entries.map(entry => [canonical(entry.path), entry.hash]));
      const changedPaths = [...new Set([...baseline.entries, ...current.entries].filter(entry => old.get(canonical(entry.path)) !== next.get(canonical(entry.path))).map(entry => entry.path))];
      const impact = this.assessmentEvidence(record).impact;
      const latestImpact = await this.discovery.impact(record.targetRoot, impact.data.targets);
      if (!latestImpact.coverage.complete || latestImpact.coverage.truncated || latestImpact.inventory.coverage.inventoryHash !== current.coverage.inventoryHash) fail('ENGINEERING_COVERAGE_INCOMPLETE', 'Final caller-impact analysis is incomplete or changed during collection');
      finalImpact = {id:randomUUID(),kind:'impact',issuedAt:this.options.now(),data:latestImpact};
      const impactPaths = [...new Set([...impact.data.callers,...latestImpact.callers].map(caller => caller.path))];
      const wholeProject = /\b(?:audit|review)\b[\s\S]*\b(?:whole|entire|seluruh|semua|repo-wide)\b|\b(?:seluruh|whole|entire|repo-wide)\b[\s\S]*\b(?:audit|review)\b/i.test(record.brief + ' ' + (record.context ?? ''));
      const analysis = analyzeEngineeringComplexity({ before, after: current.documents, changedPaths, impactPaths, wholeProject });
      evidence = { id: randomUUID(), kind: 'review', issuedAt: this.options.now(), data: {
        planHash: record.plan.hash, planRevision: record.plan.revision,
        inventory: { root: current.root, entries: current.entries, coverage: current.coverage, facilities: current.facilities },
        changedPaths, impactPaths, ...analysis, impactReceiptId: finalImpact.id,
      } };
    }
    const inventory = evidence.kind === 'discovery' || evidence.kind === 'impact' ? evidence.data.inventory : evidence.data.inventory;
    // The existing content-addressed source cache keeps the immutable pre-change bytes.
    const captured = await this.discovery.collect(record.targetRoot);
    if (captured.coverage.inventoryHash !== inventory.coverage.inventoryHash) fail('ENGINEERING_SOURCE_CHANGED', 'Source changed during evidence acquisition; repeat only the affected analysis');
    for (const [file, text] of captured.documents) {
      const expected = captured.entries.find(entry => entry.path === file);
      if (expected) {
        const saved = await this.options.sources.cache(Buffer.from(text, 'utf8'));
        if (saved !== expected.hash) fail('ENGINEERING_SOURCE_CHANGED', 'Captured source bytes do not match the inventory');
      }
    }
    // Activation and the first receipt share one OCC commit. Failed collection
    // or a concurrent update must not leave an empty activation behind.
    const updated = await this.options.store.update(scope, record.version, current => {
      if (!current || current.phase === 'CLOSED' || current.phase === 'CLOSURE_PENDING') fail('WORKFLOW_CLOSED', 'Evidence no longer belongs to open work');
      if (!current.engineering) {
        current.engineering = { policyVersion: ENGINEERING_POLICY_VERSION, required: true,
          reason: 'Engineering evidence requested for the scoped task', activatedAt: this.options.now(), evidence: [] };
        current.planRequired = true;
      }
      if (finalImpact) current.engineering.evidence.push(finalImpact);
      current.engineering.evidence.push(evidence); current.updatedAt = this.options.now(); return current;
    });
    return { version: updated.version, engineeringPolicy: ENGINEERING_POLICY_VERSION, receipt: evidence,
      ...(finalImpact?.kind === 'impact' ? {finalImpact, limitationIds:finalImpact.data.limitations.map(limit => ({...limit,id:engineeringLimitationId(limit)}))} : {}),
      ...(evidence.kind === 'impact' ? { callerIds: evidence.data.callers.map(caller => ({ ...caller, id: engineeringCallerId(caller) })), limitationIds: evidence.data.limitations.map(limit => ({ ...limit, id: engineeringLimitationId(limit) })) } : {}) };
  }
  private async cachedText(hash: string): Promise<string> {
    // WorkflowSources owns the cache layout and validates the content against its hash.
    return this.options.sources.cachedContent(hash);
  }
  private assessmentEvidence(record: WorkflowRecord) {
    const state = record.engineering, assessment = state?.assessment;
    if (!state || !assessment) fail('ENGINEERING_ASSESSMENT_REQUIRED', 'Discovery, caller impact and reuse decisions must be accepted before implementation');
    const discovery = state.evidence.find(e => e.id === assessment.discoveryReceiptId);
    const impact = state.evidence.find(e => e.id === assessment.impactReceiptId);
    if (discovery?.kind !== 'discovery' || impact?.kind !== 'impact') fail('ENGINEERING_EVIDENCE_REQUIRED', 'Assessment references unavailable engineering evidence');
    return { discovery, impact };
  }
  private validateReferences(record: WorkflowRecord, ids: string[]): void {
    for (const id of ids) {
      const evidence = record.engineering?.evidence.find(e => e.id === id);
      const receipt = record.receipts.find(r => r.id === id && r.complete);
      if (!evidence && !receipt) fail('ENGINEERING_EVIDENCE_REQUIRED', 'Decision must reference a server-issued receipt owned by this task', { receiptId: id });
    }
  }
  private async validateCurrentReferences(record: WorkflowRecord, ids: string[], inventory: EngineeringInventory): Promise<void> {
    this.validateReferences(record, ids);
    for (const id of ids) {
      const evidence = record.engineering?.evidence.find(e => e.id === id);
      if (evidence && evidence.data.inventory.coverage.inventoryHash !== inventory.coverage.inventoryHash) fail('ENGINEERING_EVIDENCE_STALE', 'Decision references superseded analysis');
      const receipt = record.receipts.find(r => r.id === id);
      if (receipt) {
        const snapshot = record.snapshots.find(s => s.id === receipt.snapshotId);
        if (!snapshot || !await this.options.sources.current(snapshot)) fail('ENGINEERING_EVIDENCE_STALE', 'Decision source receipt no longer matches source');
        const delivered = await this.options.sources.receiptContent(snapshot, receipt);
        if (snapshot.contentClass === 'code' && !delivered.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(?:#|\/\/).*$/gm, '').trim()) fail('ENGINEERING_SOURCE_READ_REQUIRED', 'Code decisions require implementation content, not blank or comment-only ranges');
      }
    }
  }
  async validateAssessment(record: WorkflowRecord, plan: WorkflowPlanInput): Promise<EngineeringAssessment> {
    const assessment = plan.assessment;
    if (!assessment) fail('ENGINEERING_ASSESSMENT_REQUIRED', 'Supply discovery, caller impact and evidence-backed reuse decisions with the plan');
    const discovery = record.engineering?.evidence.find(e => e.id === assessment.discoveryReceiptId);
    const impact = record.engineering?.evidence.find(e => e.id === assessment.impactReceiptId);
    if (discovery?.kind !== 'discovery' || impact?.kind !== 'impact') fail('ENGINEERING_EVIDENCE_REQUIRED', 'Use this task\'s discovery and impact receipts');
    if (!discovery.data.coverage.complete || !impact.data.coverage.complete || discovery.data.coverage.truncated || impact.data.coverage.truncated) fail('ENGINEERING_COVERAGE_INCOMPLETE', 'Resolve failed or truncated required coverage before accepting a coding plan');
    const current = await this.discovery.collect(record.targetRoot);
    if (!current.coverage.complete || [discovery, impact].some(e => e.data.inventory.coverage.inventoryHash !== current.coverage.inventoryHash)) fail('ENGINEERING_EVIDENCE_STALE', 'Source inventory, caller set or dependency facts changed after analysis');
    const allPaths = new Set(plan.steps.flatMap(step => step.paths ?? []).map(canonical));
    const targets = new Set(assessment.targets.map(target => canonical(path.resolve(record.targetRoot, target.path))));
    if (targets.size !== assessment.targets.length || [...allPaths].some(p => !targets.has(p)) || [...targets].some(p => !allPaths.has(p))) fail('ENGINEERING_TARGET_COVERAGE_REQUIRED', 'Every planned mutation target requires one evidence-backed scope decision');
    if ([...targets].some(p => !impact.data.targets.some(target => contains(target, p) || contains(p, target)))) fail('ENGINEERING_IMPACT_REQUIRED', 'Caller analysis does not cover every planned target');
    for (const target of assessment.targets) {
      if (target.requirementIndexes.some(index => index >= assessment.decisions.length)) fail('ENGINEERING_REQUIREMENT_INVALID', 'Target refers to an unknown requirement');
      await this.validateCurrentReferences(record, target.evidenceReceiptIds, current);
      const existing = current.entries.find(entry => canonical(entry.path) === canonical(path.resolve(record.targetRoot, target.path)));
      let existingFile=false;
      try { existingFile=(await stat(path.resolve(record.targetRoot,target.path))).isFile(); } catch(error) { if((error as NodeJS.ErrnoException).code!=='ENOENT') throw error; }
      if (existingFile && !target.evidenceReceiptIds.some(id => {
        const receipt=record.receipts.find(r=>r.id===id && r.complete), source=record.snapshots.find(s=>s.id===receipt?.snapshotId);
        return source?.role==='target' && canonical(source.path)===canonical(path.resolve(record.targetRoot,target.path));
      })) fail('ENGINEERING_SOURCE_READ_REQUIRED','Read each existing mutation target, including explicitly selected documentation', {path:target.path});
      if (existing && !target.evidenceReceiptIds.some(id => {
        const receipt = record.receipts.find(r => r.id === id && r.complete);
        const source = record.snapshots.find(s => s.id === receipt?.snapshotId);
        return source?.role === 'target' && canonical(source.path) === canonical(existing.path) && source.contentHash === existing.hash;
      })) fail('ENGINEERING_SOURCE_READ_REQUIRED', 'Read each existing mutation target and reference its current target source receipt', { path: target.path });
      if (!existingFile && current.entries.some(e => sourceClass(e.path)==='code') && !target.evidenceReceiptIds.some(id => {
        const receipt = record.receipts.find(r => r.id === id); const source = record.snapshots.find(s => s.id === receipt?.snapshotId);
        return source?.role === 'target' && source.contentClass === 'code' && current.entries.some(e => e.path === source.path && e.hash === source.contentHash);
      })) fail('ENGINEERING_SEAM_REQUIRED', 'A new target needs a current existing integration seam receipt');
    }
    for (const decision of assessment.decisions) {
      await this.validateCurrentReferences(record, decision.evidenceReceiptIds, current);
      const earlier = ENGINEERING_CHOICES.slice(0, ENGINEERING_CHOICES.indexOf(decision.choice));
      if (new Set(decision.alternatives.map(option => option.choice)).size !== decision.alternatives.length || earlier.some(option => !decision.alternatives.some(item => item.choice === option))) fail('ENGINEERING_ALTERNATIVES_REQUIRED', 'Explain with evidence why earlier reuse/native/installed options are insufficient or inapplicable');
      for (const alternative of decision.alternatives) await this.validateCurrentReferences(record, alternative.evidenceReceiptIds, current);
      if (decision.choice === 'native' && (!decision.facility || !current.facilities.builtins.includes('node:' + decision.facility.replace(/^node:/, '')) || !decision.evidenceReceiptIds.includes(discovery.id))) fail('ENGINEERING_FACILITY_UNAVAILABLE', 'Name a native facility present in the server inventory and reference its discovery receipt');
      if (decision.choice === 'installed' && (!decision.facility || !current.facilities.dependencies.some(dependency => dependency.name === decision.facility && dependency.installedVersion && dependency.installedManifestHash) || !decision.evidenceReceiptIds.includes(discovery.id))) fail('ENGINEERING_FACILITY_UNAVAILABLE', 'Name an installed dependency with verified manifest evidence');
      if (decision.choice === 'existing' && !decision.evidenceReceiptIds.some(id => {
        const receipt = record.receipts.find(r => r.id === id && r.complete); const source = record.snapshots.find(s => s.id === receipt?.snapshotId);
        return source?.role === 'target' && source.contentClass === 'code' && current.entries.some(e => canonical(e.path) === canonical(source.path) && e.hash === source.contentHash);
      })) fail('ENGINEERING_SOURCE_READ_REQUIRED', 'An existing implementation choice needs its current implementation read receipt');
      if (decision.choice === 'donor' && !record.craftRequired) fail('ENGINEERING_DONOR_MAPPING_REQUIRED', 'Register donor requirements and mappings before choosing donor adaptation');
    }
    const callerIds = new Set(impact.data.callers.map(engineeringCallerId));
    if (new Set(assessment.callerDispositions.map(c => c.callerId)).size !== assessment.callerDispositions.length || assessment.callerDispositions.length !== callerIds.size) fail('ENGINEERING_CALLER_DISPOSITION_REQUIRED', 'Provide a decision for every observed caller without duplicates');
    for (const disposition of assessment.callerDispositions) {
      if (!callerIds.has(disposition.callerId)) fail('ENGINEERING_CALLER_INVALID', 'Caller decision does not belong to the impact receipt');
      await this.validateCurrentReferences(record, disposition.evidenceReceiptIds, current);
      const caller = impact.data.callers.find(c => engineeringCallerId(c) === disposition.callerId)!;
      if (disposition.disposition === 'planned_change' && ![...targets].some(target => contains(target, caller.path))) fail('ENGINEERING_CALLER_NOT_PLANNED', 'A caller marked for change must be covered by the plan');
    }
    for (const limitation of impact.data.limitations) {
      const disposition = assessment.limitations.find(item => item.limitationId === engineeringLimitationId(limitation));
      if (!disposition || disposition.checkIds.some(id => !plan.checks.some(c => c.id === id))) fail('ENGINEERING_LIMITATION_UNRESOLVED', 'Analysis limitations require inspected evidence and applicable behavior checks', { path: limitation.path, reason: limitation.reason });
      await this.validateCurrentReferences(record, disposition.evidenceReceiptIds, current);
    }
    return assessment;
  }
  async assertCurrent(record: WorkflowRecord, activeWriters: readonly WorkflowActiveWriter[] = []): Promise<EngineeringInventory> {
    const { discovery } = this.assessmentEvidence(record);
    if (!record.plan || record.engineering!.assessment!.planHash !== record.plan.hash || record.engineering!.assessment!.planRevision !== record.plan.revision) fail('ENGINEERING_ASSESSMENT_STALE', 'Assessment is not bound to the accepted plan');
    const current = await this.discovery.collect(record.targetRoot);
    const active = activeWriters.filter(w => w.planHash === record.plan!.hash && w.planRevision === record.plan!.revision).flatMap(w => w.writes);
    reconcileFacilities(expectedFacilities(record, discovery.data.inventory.facilities), current.facilities, [], active);
    if (current.coverage.truncated || current.coverage.gaps.some(gap => !active.some(root => contains(root, gap.path)))) fail('ENGINEERING_COVERAGE_INCOMPLETE', 'Required source coverage cannot be checked');
    const baseline = new Map(discovery.data.inventory.entries.map(entry => [canonical(entry.path), { path:entry.path, hash:entry.hash as string | null }]));
    for (const output of record.engineering?.outputs ?? []) baseline.set(canonical(output.path), output);
    const actual = new Map(current.entries.map(entry => [canonical(entry.path), entry]));
    const changed = [...new Set([...baseline.keys(), ...actual.keys()])].filter(key => (baseline.get(key)?.hash ?? null) !== (actual.get(key)?.hash ?? null));
    for (const file of changed) {
      if (active.some(root => contains(root, file))) continue;
      fail('ENGINEERING_UNPLANNED_CHANGE', 'Source differs from its reconciled planned output', { path: actual.get(file)?.path ?? baseline.get(file)?.path });
    }
    return current;
  }
  async recordOutputs(record: WorkflowRecord, paths: string[], activeWriters: readonly WorkflowActiveWriter[] = []): Promise<void> {
    if (!record.engineering?.assessment) return; // Reconciliation may record historical work without inventing a prior assessment.
    const { discovery } = this.assessmentEvidence(record);
    const current = await this.discovery.collect(record.targetRoot);
    const outputs = new Map((record.engineering.outputs ?? []).map(item => [canonical(item.path), item]));
    const actual = new Map(current.entries.map(item => [canonical(item.path), item]));
    for (const entry of [...discovery.data.inventory.entries, ...current.entries, ...(record.engineering.outputs ?? [])]) {
      if (paths.some(root => contains(root, entry.path))) outputs.set(canonical(entry.path), {path:entry.path, hash:actual.get(canonical(entry.path))?.hash ?? null});
    }
    record.engineering.outputs = [...outputs.values()];
    const active = activeWriters.filter(writer => writer.planHash === record.plan?.hash && writer.planRevision === record.plan?.revision).flatMap(writer => writer.writes);
    const facilities = reconcileFacilities(expectedFacilities(record, discovery.data.inventory.facilities), current.facilities, paths, active);
    record.engineering.acknowledgedFacilities = facilities;
    record.engineering.facilitiesHash = engineeringIdentity(facilities);
    await this.assertCurrent(record, activeWriters);
    delete record.engineering.review;
  }
  async acceptReview(scope: WorkflowScope, input: EngineeringReviewInput): Promise<WorkflowRecord> {
    const parsed = engineeringReviewInputSchema.safeParse(input);
    if (!parsed.success) fail('ENGINEERING_REVIEW_INVALID', 'Review decisions do not satisfy the required schema');
    const record = await this.options.store.read(scope); if (!record?.plan || !record.engineering) fail('ENGINEERING_ASSESSMENT_REQUIRED', 'An accepted engineering plan is required');
    const proof = record.engineering.evidence.find(e => e.id === input.reviewReceiptId);
    if (proof?.kind !== 'review' || proof.data.planHash !== record.plan.hash || proof.data.planRevision !== record.plan.revision) fail('ENGINEERING_REVIEW_STALE', 'Review receipt belongs to missing or superseded output/plan');
    if (proof.data.truncated || !proof.data.inventory.coverage.complete) fail('ENGINEERING_COVERAGE_INCOMPLETE', 'Final review is incomplete');
    const current = await this.assertCurrent(record);
    if (current.coverage.inventoryHash !== proof.data.inventory.coverage.inventoryHash) fail('ENGINEERING_REVIEW_STALE', 'Source changed after final review');
    const finalImpact = record.engineering.evidence.find(e => e.id === proof.data.impactReceiptId);
    if (finalImpact?.kind !== 'impact' || finalImpact.data.inventory.coverage.inventoryHash !== current.coverage.inventoryHash) fail('ENGINEERING_REVIEW_STALE', 'Final review needs current caller-impact evidence');
    for (const limitation of finalImpact.data.limitations) {
      const decision = input.limitations?.find(d => d.limitationId === engineeringLimitationId(limitation));
      if (!decision || !decision.evidenceReceiptIds.includes(finalImpact.id) || decision.checkIds.some(id => !record.plan!.checks.some(c => c.id === id))) fail('ENGINEERING_LIMITATION_UNRESOLVED', 'Resolve final analysis limitations with source inspection and applicable checks');
      this.validateReferences(record,decision.evidenceReceiptIds);
    }
    const decisions = new Map(input.dispositions.map(d => [d.findingId, d]));
    const historical = record.engineering.evidence.flatMap(e => e.kind === 'review' && e.data.planHash === record.plan!.hash ? e.data.findings : []);
    const resolved = historical.filter(old => !proof.data.findings.some(now => now.id === old.id || now.kind === old.kind && now.path === old.path && now.message === old.message));
    const required = new Map([...proof.data.findings, ...resolved].map(finding => [finding.id, finding]));
    if (decisions.size !== input.dispositions.length || decisions.size !== required.size) fail('ENGINEERING_FINDING_UNRESOLVED', 'Every current or repaired historical finding needs one evidence-backed disposition');
    for (const finding of proof.data.findings) {
      const decision = decisions.get(finding.id); if (!decision) fail('ENGINEERING_FINDING_UNRESOLVED', 'A final finding has no disposition');
      if (decision.disposition === 'fixed') fail('ENGINEERING_FINDING_STILL_PRESENT', 'A finding still present in the current review cannot be marked fixed; fix and collect a fresh review');
      this.validateReferences(record, decision.evidenceReceiptIds);
      if (!decision.evidenceReceiptIds.includes(proof.id)) fail('ENGINEERING_EVIDENCE_REQUIRED', 'Retained findings must reference the current review receipt');
      if (decision.checkIds.some(id => !record.plan!.checks.some(check => check.id === id))) fail('ENGINEERING_CHECK_INVALID', 'Review references an unknown verification check');
    }
    for (const finding of resolved) {
      const decision = decisions.get(finding.id);
      if (decision?.disposition !== 'fixed') fail('ENGINEERING_FINDING_UNRESOLVED', 'Record the evidenced repair of a finding absent from the new review');
      this.validateReferences(record, decision.evidenceReceiptIds);
      if (!decision.evidenceReceiptIds.includes(proof.id) || decision.checkIds.some(id => !record.plan!.checks.some(check => check.id === id))) fail('ENGINEERING_EVIDENCE_REQUIRED', 'A repaired finding must reference current review evidence and valid checks');
    }
    return this.options.store.update(scope, input.expectedVersion, latest => {
      if (!latest?.plan || !latest.engineering || latest.plan.hash !== proof.data.planHash) fail('ENGINEERING_REVIEW_STALE', 'Workflow changed before review acceptance');
      latest.engineering.review = { ...input, planHash: latest.plan.hash, planRevision: latest.plan.revision, inventoryHash: current.coverage.inventoryHash, acceptedAt: this.options.now() };
      return latest;
    });
  }
  async assertReviewed(record: WorkflowRecord): Promise<void> {
    if (!record.engineering) return;
    const current = await this.assertCurrent(record), review = record.engineering.review;
    if (!review || review.planHash !== record.plan?.hash || review.planRevision !== record.plan?.revision || review.inventoryHash !== current.coverage.inventoryHash) fail('ENGINEERING_REVIEW_REQUIRED', 'Accept an evidence-backed complexity review of the current final output before completion');
  }
}
