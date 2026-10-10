// Pairwise dominance/orientation adapted from ShinkaEvolve fd583c15, Apache-2.0.
// Native validation, grouping, missingness and evidence projection by Agent Core.
import { createHash } from 'node:crypto';
import * as z from 'zod/v4';
import { paretoAnalysisSchema, type RetrievalSeriesManifest, type RunEvidence } from './retrieval-series.js';
import { profileComparisonKey, validateRetrievalProfile } from './retrieval-profile.js';
import type { NumericProvenanceKind } from './verified-value-registry.js';
export type ParetoConfig = z.infer<typeof paretoAnalysisSchema>;
export interface ParetoMetric { value: number | null; kind: NumericProvenanceKind; evidenceRefs: string[] }
export interface ParetoCandidate {
  runId: string; reportId?: string; comparisonKey?: string;
  status: 'attempted' | 'invalid' | 'failed' | 'incomplete' | 'evaluable';
  reason?: string; resourceContext?: { id: string; evidenceRefs: string[] };
  metrics: Record<string, ParetoMetric | undefined>;
}
const id = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,199}$/;
const evidenceRef = /^(file|source|verification|tool|activity|memory|grafel|user-correction):\S/;
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const hash = (x: unknown) => 'sha256:' + createHash('sha256').update(JSON.stringify(x)).digest('hex');
function refsOK(refs: unknown): refs is string[] {
  return Array.isArray(refs) && refs.length > 0 && refs.length <= 16
    && refs.every(x => typeof x === 'string' && x.length <= 1000 && evidenceRef.test(x));
}
export function analyzeRetrievalPareto(candidates: ParetoCandidate[], configValue: unknown) {
  const config = paretoAnalysisSchema.parse(configValue);
  if (!Array.isArray(candidates) || candidates.length > 100) throw new Error('PARETO_CANDIDATE_LIMIT');
  const runIds = new Set<string>(), reportIds = new Set<string>();
  const excluded: Array<{runId: string; status: string; reason: string}> = [];
  const unknown: Array<{runId: string; reasons: string[]}> = [];
  const inputs: Array<Record<string, unknown>> = [];
  const resource = config.objectives.some(o => o.id.startsWith('resource.'));
  const partitions = new Map<string, Array<{runId: string; reportId: string; values: number[]; metrics: Record<string, ParetoMetric>}>>();
  for (const c of [...candidates].sort((a,b) => compare(a.runId ?? '', b.runId ?? ''))) {
    if (!id.test(c.runId)) throw new Error('PARETO_INVALID_RUN_ID');
    if (runIds.has(c.runId)) throw new Error('PARETO_DUPLICATE_RUN_ID'); runIds.add(c.runId);
    if (c.reportId !== undefined) {
      if (!id.test(c.reportId)) throw new Error('PARETO_INVALID_REPORT_ID');
      if (reportIds.has(c.reportId)) throw new Error('PARETO_DUPLICATE_REPORT_ID'); reportIds.add(c.reportId);
    }
    if (!['attempted','invalid','failed','incomplete','evaluable'].includes(c.status)) throw new Error('PARETO_INVALID_STATUS');
    if (c.reason !== undefined && !/^[A-Za-z0-9_-]{1,200}$/.test(c.reason)) throw new Error('PARETO_INVALID_REASON');
    const selected = config.objectives.map(o => {
      const m = c.metrics?.[o.id];
      return [o.id, m ? {value: typeof m.value === 'number' && Number.isFinite(m.value) ? m.value :
        m.value == null ? null : String(m.value).slice(0,32), kind:m.kind, evidenceRefs:m.evidenceRefs} : null];
    });
    inputs.push({runId:c.runId,reportId:c.reportId ?? null,status:c.status,reason:c.reason ?? null,
      comparisonKey:c.comparisonKey ?? null,resourceContext:c.resourceContext ?? null,metrics:selected});
    if (c.status !== 'evaluable') { excluded.push({runId:c.runId,status:c.status,reason:c.reason ?? 'not-evaluable'}); continue; }
    const reasons: string[] = [];
    if (!c.reportId) reasons.push('missing-report-identity');
    if (!c.comparisonKey || c.comparisonKey.length > 1000) reasons.push('missing-comparison-identity');
    if (resource && (!c.resourceContext || !id.test(c.resourceContext.id) || !refsOK(c.resourceContext.evidenceRefs))) reasons.push('missing-resource-context');
    const values: number[] = [], metrics: Record<string, ParetoMetric> = {};
    for (const o of config.objectives) {
      const m = c.metrics?.[o.id];
      if (!m || m.value == null) { reasons.push('missing-metric:' + o.id); continue; }
      if (typeof m.value !== 'number' || !Number.isFinite(m.value)) { reasons.push('nonfinite-metric:' + o.id); continue; }
      if (!refsOK(m.evidenceRefs) || !['verified-input','operator-supplied','analysis-derived'].includes(m.kind)) {
        reasons.push('missing-metric-provenance:' + o.id); continue;
      }
      if (o.id.startsWith('resource.') && (m.value < 0 || m.value > Number.MAX_SAFE_INTEGER)) {
        reasons.push('invalid-resource:' + o.id); continue;
      }
      values.push(m.value); metrics[o.id] = {value:m.value,kind:m.kind,evidenceRefs:[...m.evidenceRefs]};
    }
    if (reasons.length) { unknown.push({runId:c.runId,reasons}); continue; }
    const key = JSON.stringify([c.comparisonKey, resource ? config.resourceBasis : null, resource ? c.resourceContext!.id : null]);
    const group = partitions.get(key) ?? [];
    group.push({runId:c.runId,reportId:c.reportId!,values,metrics}); partitions.set(key,group);
  }
  const groups = [...partitions].sort(([a],[b]) => compare(a,b)).map(([key,rows]) => {
    const frontierRunIds: string[] = [];
    const dominated: Array<{runId:string;dominatedBy:Array<{runId:string;strictDimensions:string[]}>}> = [];
    const equivalents = new Map<string,string[]>();
    for (const a of rows) {
      const vector = JSON.stringify(a.values), equal = equivalents.get(vector) ?? [];
      equal.push(a.runId); equivalents.set(vector,equal);
      const witnesses = rows.filter(b => b.runId !== a.runId).flatMap(b => {
        const strictDimensions = config.objectives.filter((o,i) => o.direction === 'maximize' ? b.values[i] > a.values[i] : b.values[i] < a.values[i]).map(o => o.id);
        const noWorse = config.objectives.every((o,i) => o.direction === 'maximize' ? b.values[i] >= a.values[i] : b.values[i] <= a.values[i]);
        return noWorse && strictDimensions.length ? [{runId:b.runId,strictDimensions}] : [];
      });
      if (witnesses.length) dominated.push({runId:a.runId,dominatedBy:witnesses}); else frontierRunIds.push(a.runId);
    }
    return {key,rows,frontierRunIds,dominated,equivalentGroups:[...equivalents.values()].filter(x => x.length > 1)
      .sort((a,b) => compare(a[0],b[0])),comparisonCount:rows.length};
  });
  return {schemaVersion:1,kind:'retrieval-pareto-evidence',config,inputsDigest:hash({config,inputs}),configurationDigest:hash(config),
    candidateCount:candidates.length,groups,excluded,unknown,
    status:groups.length ? 'available' : 'no-comparable-observations',
    semantics:'non-dominated-among-supplied-eligible-observations',
    resourceContextTrust:'operator-declared-not-authenticated',statisticalSignificance:'not-established',
    launchesExperiments:false,approvalAuthority:false,deploymentRecommendation:false,memoryPersisted:false};
}
export function buildParetoCandidates(manifest: RetrievalSeriesManifest, evidence: RunEvidence[]): ParetoCandidate[] {
  const byId = new Map(evidence.map(e => [e.id,e]));
  return manifest.runs.map(run => {
    const e = byId.get(run.id), p = e?.profile ? validateRetrievalProfile(e.profile) : undefined;
    const status = e?.status ?? 'invalid';
    const metrics: Record<string,ParetoMetric> = {};
    if (p) for (const key of ['candidateRate','objective','regressionFraction'] as const) {
      metrics[key] = {value:key === 'regressionFraction' ? p.regressionFraction.value : p[key],
        kind:'verified-input',evidenceRefs:['verification:' + p.reportId]};
    }
    const source = manifest.analysis?.pareto?.resourceBasis === 'cumulative' ? run.cumulativeResources : run.resources;
    for (const item of source ?? []) metrics['resource.' + item.dimension] = {
      value:item.value,kind:'operator-supplied',evidenceRefs:[...item.evidenceRefs],
    };
    return {runId:run.id,reportId:p?.reportId,comparisonKey:p && run.split ? profileComparisonKey(p)+'/'+run.split : undefined,
      status,reason:e?.reason ?? (e ? undefined : 'missing-run-evidence'),resourceContext:run.resourceContext,metrics};
  });
}
