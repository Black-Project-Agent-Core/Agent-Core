import * as z from 'zod/v4';
import type { TrackerEvent } from '../tracker/activity-tracker.js';
import { safeEvidenceRefSchema, safeMetadataSchema } from './evaluation.js';
import { scoreControlledOutcome } from './controlled-outcome.js';
import type {LearningCuratorProposal} from './types.js';

const metadata = safeMetadataSchema(200);
const timestamp = z.iso.datetime({ offset: true });
const contextSchema = z.strictObject({
  purpose: z.enum(['production', 'exploration']), population: metadata,
  controllerId: metadata, model: metadata, loadedAssetRevision: metadata, loadedConfigRevision: metadata,
  evaluatorRevision: metadata, collectorRevision: metadata,
});
const armSchema = contextSchema.extend({
  window: z.strictObject({ start: timestamp, end: timestamp }).refine(value => Date.parse(value.end) >= Date.parse(value.start)),
  opportunityUnit: z.literal('task'), eligibleOpportunities: z.number().int().min(1).max(100),
  opportunities: z.array(z.strictObject({ taskId: metadata, caseId: metadata })).min(1).max(100),
});
export const externalEvaluationManifestSchema = z.strictObject({
  schemaVersion: z.literal(1), minimumSamples: z.number().int().min(1).max(100).default(2),
  baseline: armSchema, candidate: armSchema,
});
export type ExternalEvaluationManifest = z.infer<typeof externalEvaluationManifestSchema>;
export type ExternalEvaluationOutcome = 'goal-success' | 'method-failure' | 'infrastructure-failure'
  | 'evidence-unavailable' | 'interrupted' | 'not-exercised' | 'unknown';
const observationSchema = contextSchema.extend({
  arm: z.enum(['baseline', 'candidate']), taskId: metadata, caseId: metadata,
  observedAt: timestamp, evidenceRef: safeEvidenceRefSchema(),
  cause: z.enum(['infrastructure-failure', 'evidence-unavailable', 'interrupted', 'not-exercised', 'unknown']).optional(),
  measuredCostUsd: z.number().finite().min(0).optional(), measuredTimeMs: z.number().finite().min(0).optional(),
});
/** Internal host/harness facts. Never populate this argument from the external manifest. */
export type ExternalEvaluationObservation = z.infer<typeof observationSchema>;
export interface ExternalEvaluationEpisode {
  id: string; startedAt: string;
  terminalOutcome?: 'verified' | 'failed'; verificationStatus?: 'pass' | 'fail' | 'unavailable';
}
export interface ExternalEvaluationOptions {
  selection?: { baselineEpisodeIds?: readonly string[]; candidateEpisodeIds?: readonly string[] };
  observations?: readonly ExternalEvaluationObservation[];
}
export const EXTERNAL_EVALUATION_GUIDE = {
  revision: 'external-evaluation/v1', schemaVersion: 1,
  payload: 'baseline and candidate each require purpose (production/exploration), population, controllerId, model, loadedAssetRevision, loadedConfigRevision, evaluatorRevision, collectorRevision, window {start,end} (ISO timestamps), opportunityUnit=task, eligibleOpportunities and opportunities [{taskId,caseId}]; minimumSamples defaults to 2.',
  authority: 'Payload metadata is declared. Actual model, loaded state and complete attempt coverage require independent internal host/harness observations; a supplied verification or observed flag cannot establish them.',
  interpretation: 'Comparability precedes signed rate differences. Every selected task remains in all-attempts; method rates use only independently verified goal successes/failures. Exploration never supplies a production score. Missing cost/time remains unavailable. Rate differences do not establish causal benefit.',
} as const;

const contextKeys = Object.keys(contextSchema.shape) as Array<keyof z.infer<typeof contextSchema>>;
function sameMembers(a: readonly string[], b: readonly string[]) {
  const left = [...a].sort(), right = [...b].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
function outcome(episode?: ExternalEvaluationEpisode, cause?: ExternalEvaluationObservation['cause']): ExternalEvaluationOutcome {
  if (cause && cause !== 'unknown') return cause;
  if (episode?.verificationStatus === 'pass' && episode.terminalOutcome === 'verified') return 'goal-success';
  if (episode?.verificationStatus === 'fail') return 'method-failure';
  return episode?.terminalOutcome || episode?.verificationStatus === 'unavailable' ? 'evidence-unavailable' : 'unknown';
}
function summarize(ids: readonly string[], episodes: Map<string, ExternalEvaluationEpisode>, observations: readonly ExternalEvaluationObservation[]) {
  const counts: Record<ExternalEvaluationOutcome, number> = {
    'goal-success': 0, 'method-failure': 0, 'infrastructure-failure': 0, 'evidence-unavailable': 0,
    interrupted: 0, 'not-exercised': 0, unknown: 0,
  };
  const tasks = [...new Set(ids)];
  for (const id of tasks) counts[outcome(episodes.get(id), observations.find(item => item.taskId === id)?.cause)]++;
  const measured = (key: 'measuredCostUsd' | 'measuredTimeMs') => {
    const values = tasks.map(id => observations.find(item => item.taskId === id)?.[key]);
    return values.length && values.every(value => value !== undefined) ? (values as number[]).reduce((a, b) => a + b, 0) / values.length : null;
  };
  return { allAttempts: tasks.length, verifiedOpportunities: counts['goal-success'] + counts['method-failure'], outcomes: counts,
    costUsdPerTask: measured('measuredCostUsd'), timeMsPerTask: measured('measuredTimeMs') };
}

/** Pure external projection: declarations never become observations or benefit proof. */
export function evaluateExternalComparison(episodes: readonly ExternalEvaluationEpisode[], manifest?: unknown, options: ExternalEvaluationOptions = {}) {
  const parsed = externalEvaluationManifestSchema.safeParse(manifest);
  const observations = z.array(observationSchema).max(200).safeParse(options.observations ?? []);
  const actual = observations.success ? observations.data : [];
  const byId = new Map(episodes.map(episode => [episode.id, episode]));
  const ids = (arm: 'baseline' | 'candidate') => options.selection?.[arm === 'baseline' ? 'baselineEpisodeIds' : 'candidateEpisodeIds']
    ?? (parsed.success ? parsed.data[arm].opportunities.map(item => item.taskId) : []);
  const baselineIds = ids('baseline'), candidateIds = ids('candidate');
  const baseline = summarize(baselineIds, byId, actual), candidate = summarize(candidateIds, byId, actual);
  const missing = new Set<string>(), mismatches = new Set<string>();
  if (!parsed.success) missing.add(manifest === undefined ? 'manifest-unavailable' : 'manifest-invalid');
  if (!observations.success) missing.add('host-observations-invalid');
  if (!actual.length) missing.add('actual-model-loaded-state-and-coverage-unavailable');
  if (new Set([...baselineIds, ...candidateIds]).size !== baselineIds.length + candidateIds.length) mismatches.add('duplicate-or-overlapping-tasks');
  if (parsed.success) {
    const value = parsed.data;
    for (const key of ['purpose', 'population', 'controllerId', 'model', 'evaluatorRevision', 'collectorRevision'] as const)
      if (value.baseline[key] !== value.candidate[key]) mismatches.add('declared-' + key + '-mismatch');
    if (value.baseline.window.start !== value.candidate.window.start || value.baseline.window.end !== value.candidate.window.end)
      mismatches.add('declared-time-window-mismatch');
    if (!sameMembers(value.baseline.opportunities.map(item => item.caseId), value.candidate.opportunities.map(item => item.caseId)))
      mismatches.add('case-population-coverage-mismatch');
    for (const arm of ['baseline', 'candidate'] as const) {
      const declaration = value[arm], selected = arm === 'baseline' ? baselineIds : candidateIds;
      if (contextKeys.some(key => /^(?:unknown|unavailable|unobserved)$/i.test(declaration[key]))) missing.add(arm + '-metadata-unavailable');
      const declaredIds = declaration.opportunities.map(item => item.taskId);
      if (!sameMembers(selected, declaredIds)) missing.add(arm + '-membership-mismatch');
      if (declaration.eligibleOpportunities !== new Set(declaredIds).size) missing.add(arm + '-attempt-coverage-incomplete');
      const observed = actual.filter(item => item.arm === arm);
      if (!sameMembers(observed.map(item => item.taskId), declaredIds)) missing.add(arm + '-observed-coverage-incomplete');
      for (const opportunity of declaration.opportunities) {
        const episode = byId.get(opportunity.taskId), observation = observed.find(item => item.taskId === opportunity.taskId);
        if (!episode) missing.add(arm + '-episode-unavailable');
        if (!observation) continue;
        if (contextKeys.some(key => observation[key] !== declaration[key]) || observation.caseId !== opportunity.caseId)
          mismatches.add(arm + '-observed-context-mismatch');
        const start = Date.parse(declaration.window.start), end = Date.parse(declaration.window.end);
        if (Date.parse(observation.observedAt) < start || Date.parse(observation.observedAt) > end
          || !episode || !Number.isFinite(Date.parse(episode.startedAt)) || Date.parse(episode.startedAt) < start || Date.parse(episode.startedAt) > end)
          mismatches.add(arm + '-time-window-mismatch');
        if (observation.cause && episode && (episode.verificationStatus === 'pass'
          || observation.cause === 'not-exercised' && episode.verificationStatus === 'fail'))
          mismatches.add(arm + '-outcome-evidence-conflict');
      }
      const summary = arm === 'baseline' ? baseline : candidate;
      if (summary.allAttempts < value.minimumSamples || summary.verifiedOpportunities < value.minimumSamples) missing.add(arm + '-insufficient-samples');
    }
  }
  const status = mismatches.size ? 'incomparable' as const : missing.size ? 'insufficient' as const : 'comparable' as const;
  const delta = (candidateValue: number | null, baselineValue: number | null) => candidateValue === null || baselineValue === null ? null : candidateValue - baselineValue;
  const score = (verifiedOnly: boolean) => scoreControlledOutcome({ testsPassed: true, attributionComplete: true, eligibleIdentityVerified: true,
    substantiveActions: baseline.allAttempts + candidate.allAttempts, minimumSamples: parsed.success ? parsed.data.minimumSamples : 1,
    baseline: { successes: baseline.outcomes['goal-success'], opportunities: verifiedOnly ? baseline.verifiedOpportunities : baseline.allAttempts },
    candidate: { successes: candidate.outcomes['goal-success'], opportunities: verifiedOnly ? candidate.verifiedOpportunities : candidate.allAttempts },
  }).objective;
  const differences = status === 'comparable' ? {
    allAttemptsSuccessRateDelta: score(false), verifiedSuccessRateDelta: score(true),
    costUsdPerTaskDelta: delta(candidate.costUsdPerTask, baseline.costUsdPerTask), timeMsPerTaskDelta: delta(candidate.timeMsPerTask, baseline.timeMsPerTask),
  } : null;
  return {
    revision: EXTERNAL_EVALUATION_GUIDE.revision, status, reasons: [...mismatches, ...missing],
    metadataAuthority: status === 'comparable' ? 'host-observations-cross-checked' : actual.length ? 'partial-host-observations' : 'declaration-only',
    purpose: parsed.success && parsed.data.baseline.purpose === parsed.data.candidate.purpose ? parsed.data.baseline.purpose : null,
    declaredManifest: parsed.success ? parsed.data : null,
    baseline, candidate, differences,
    productionScore: status === 'comparable' && parsed.success && parsed.data.baseline.purpose === 'production' ? differences?.verifiedSuccessRateDelta ?? null : null,
    benefitVerdict: 'withheld' as const,
    limitations: ['Host observation arguments must come from independent owners, never the manifest.',
      'Complete coverage is limited to the supplied host/harness attempt inventory.', 'Signed observational differences do not establish causal or held-out benefit.'],
  };
}

/** External-only review evidence; legacy event verbosity is never independent support. */
export function projectExternalFeatureOutcomes(events: readonly TrackerEvent[], episodes: readonly ExternalEvaluationEpisode[] = []) {
  const byId = new Map(episodes.map(episode => [episode.id, episode]));
  const groups = new Map<string, { featureId: string; artifactRevision: string; taskIds: Set<string>; evidence: Map<string, Set<ExternalEvaluationOutcome>> }>();
  let legacyUnknownEvents = 0;
  for (const event of events) {
    if (!event.featureOutcome) continue;
    const taskId = event.context?.binding === 'bound' ? event.context.taskId : undefined;
    const revision = event.featureOutcome.properties?.artifactRevision;
    if (typeof taskId !== 'string' || typeof revision !== 'string' || !safeMetadataSchema(200).safeParse(revision).success) { legacyUnknownEvents++; continue; }
    const featureId = event.featureOutcome.featureId, key = JSON.stringify([featureId, revision]);
    const group = groups.get(key) ?? { featureId, artifactRevision: revision, taskIds: new Set<string>(), evidence: new Map<string, Set<ExternalEvaluationOutcome>>() };
    const raw = event.featureOutcome.outcome;
    const cause = /^(?:provider-outage|infrastructure-failure)$/.test(raw) ? 'infrastructure-failure'
      : /^(?:unavailable|evidence-unavailable)$/.test(raw) ? 'evidence-unavailable'
        : raw === 'interrupted' || raw === 'not-exercised' ? raw : undefined;
    const observed = outcome(byId.get(taskId), cause);
    const kind = cause ? observed : observed === 'goal-success' && /^(?:success|pass|passed|improved|resolved)$/.test(raw)
      ? observed : observed === 'method-failure' && /^(?:failure|fail|failed|regressed|error)$/.test(raw) ? observed : 'unknown';
    group.taskIds.add(taskId);
    const evidence = group.evidence.get(taskId) ?? new Set<ExternalEvaluationOutcome>(); evidence.add(kind); group.evidence.set(taskId, evidence);
    groups.set(key, group);
  }
  return { revision: EXTERNAL_EVALUATION_GUIDE.revision, legacyUnknownEvents, benefitVerdict: 'withheld' as const,
    groups: [...groups.values()].map(group => ({ featureId: group.featureId, artifactRevision: group.artifactRevision,
      revisionAuthority: 'declared' as const, opportunities: group.taskIds.size,
      outcomes: Object.fromEntries((['goal-success', 'method-failure', 'infrastructure-failure', 'evidence-unavailable', 'interrupted', 'not-exercised', 'unknown'] as const)
        .map(kind => [kind, [...group.evidence.values()].filter(kinds => kinds.size === 1 ? kinds.has(kind) : kind === 'unknown').length])) })),
  };
}

export function externalFeatureOutcomeProposals(events:readonly TrackerEvent[],episodes:readonly ExternalEvaluationEpisode[]):LearningCuratorProposal[]{
  return projectExternalFeatureOutcomes(events,episodes).groups.flatMap(group=>{
    const positive=group.outcomes['goal-success'],negative=group.outcomes['method-failure'],total=positive+negative;
    const score=(positive-negative)/(total+2);
    if(total<2||Math.abs(score)<0.25)return [];
    return [{recommendation:'review-feature-outcome' as const,featureId:group.featureId,
      evidenceRefs:events.filter(event=>event.featureOutcome?.featureId===group.featureId&&event.featureOutcome.properties?.artifactRevision===group.artifactRevision).slice(-16).map(event=>'activity:'+event.id),
      support:{positive,negative,score},reason:`External task/revision review only (${group.artifactRevision}); positive=${positive}, method-negative=${negative}, all-attempts=${group.opportunities}. Infrastructure/missing/unknown are excluded from method support; benefit is unproven.`}];
  });
}
