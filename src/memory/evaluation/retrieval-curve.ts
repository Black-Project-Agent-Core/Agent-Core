// Independent implementation of the reviewed A-Evolve metric conventions; no donor source copied.
import { createHash } from 'node:crypto';
import { parseRetrievalSeriesManifest, summarizeRetrievalSeries, curveAnalysisSchema, type RunEvidence } from './retrieval-series.js';
import { profileComparisonKey, validateRetrievalProfile } from './retrieval-profile.js';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([name, item]) => [name, canonical(item)]));
  return value;
}
const hash = (value: unknown) => 'sha256:' + createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

/** Supplied profiles are structurally validated; the CLI independently recomputes their sealed bundles. */
export function analyzeRetrievalCurve(value: unknown, evidence: RunEvidence[], rawConfig?: unknown) {
  const manifest = parseRetrievalSeriesManifest(value);
  const config = curveAnalysisSchema.parse(rawConfig ?? manifest.analysis?.curve);
  if (!Array.isArray(evidence) || evidence.length > 100) throw new Error('CURVE_EVIDENCE_LIMIT');
  const reports = new Set<string>();
  const normalized: RunEvidence[] = evidence.map(item => {
    if (!item || typeof item !== 'object') throw new Error('CURVE_EVIDENCE_INVALID');
    if (item.profile?.reportId) {
      if (reports.has(item.profile.reportId)) throw new Error('DUPLICATE_REPORT_ID');
      reports.add(item.profile.reportId);
    }
    if (item.status !== 'evaluable' || !item.profile) return item;
    const metric = config.metric === 'regressionFraction' ? item.profile.regressionFraction?.value : item.profile[config.metric];
    if (typeof metric === 'number' && !Number.isFinite(metric))
      return { ...item, status: 'invalid', profile: undefined, reason: 'curve-nonfinite-metric' };
    validateRetrievalProfile(item.profile);
    return item;
  });
  const series = summarizeRetrievalSeries(manifest, normalized);
  const rows = new Map(series.rows.map(row => [row.id, row]));
  const byId = new Map(normalized.map(item => [item.id, item]));
  const assigned = new Set(config.streams.flatMap(stream => stream.runIds));
  const streams = config.streams.map(stream => {
    let priorIteration = -1;
    const identities = new Set<string>();
    const points = stream.runIds.map(runId => {
      const row = rows.get(runId);
      if (!row) throw new Error('CURVE_UNKNOWN_RUN');
      if (row.iteration <= priorIteration) throw new Error('CURVE_NONMONOTONE_ITERATION');
      priorIteration = row.iteration;
      const profile = row.status === 'evaluable' ? byId.get(runId)?.profile : undefined;
      const comparisonKey = profile ? profileComparisonKey(profile) : null;
      if (comparisonKey) identities.add(comparisonKey);
      const metric = profile ? config.metric === 'regressionFraction' ? profile.regressionFraction.value : profile[config.metric] : null;
      return { runId, iteration: row.iteration, checkpoint: row.checkpoint, split: row.split, seed: row.seed,
        declaredStatus: row.declaredStatus, status: row.status, value: metric,
        reason: row.status !== 'evaluable' ? row.reason ?? row.status : metric === null ? 'metric-unavailable' : null,
        comparisonKey, reportId: profile?.reportId ?? null, inputsDigest: profile?.inputsDigest ?? null,
        manifestDigest: row.manifestDigest, evidenceValidation: profile ? 'profile-counts-validated' : 'unavailable' };
    });
    if (identities.size > 1 || new Set(points.map(point => point.seed)).size > 1
      || new Set(points.map(point => point.split)).size > 1) throw new Error('CURVE_INCOMPARABLE_STREAM');
    const available = points.every(point => point.status === 'evaluable' && point.value !== null);
    let metrics: { initial: number; latest: number; best: number; bestRunId: string; latestMinusInitial: number; prefixMeanScore: number } | null = null;
    if (available && points.length >= 2) {
      let prefix = 0, prefixMeans = 0, best = points[0];
      points.forEach((point, index) => {
        prefix += point.value!; prefixMeans += prefix / (index + 1);
        if (config.direction === 'maximize' ? point.value! > best.value! : point.value! < best.value!) best = point;
      });
      metrics = { initial: points[0].value!, latest: points.at(-1)!.value!, best: best.value!, bestRunId: best.runId,
        latestMinusInitial: points.at(-1)!.value! - points[0].value!, prefixMeanScore: prefixMeans / points.length };
    }
    return { ...stream, points, comparisonKey: [...identities][0] ?? null,
      seedEvidence: points[0].seed === null ? 'not-established' : 'operator-declared',
      iterationGaps: points.slice(1).map((point, index) => point.iteration - points[index].iteration),
      status: !available ? 'unavailable' : points.length < 2 ? 'insufficient-trajectory' : 'available', metrics };
  });
  const unassigned = series.rows.filter(row => !assigned.has(row.id)).map(row => ({ id: row.id, status: row.status, reason: 'not-assigned-to-stream' }));
  return { schemaVersion: 1, algorithmRevision: 'agent-core-retrieval-curve/v1', kind: 'explicit-retrieval-curve',
    axis: 'checkpoint-order', prefixMeanConvention: 'a-evolve-AULC-mean-of-prefix-means-not-trapezoidal-area',
    metric: config.metric, direction: config.direction, configDigest: hash(config),
    inputDigest: hash({ manifest, evidence: normalized, config }), streams, unassigned,
    orderingEvidence: 'operator-declared-not-authenticated-lineage', attemptHistory: 'not-established',
    statisticalSignificance: 'not-established', causalAttribution: 'not-established',
    launchesExperiments: false, stopsExecution: false, approvalAuthority: false, deploymentRecommendation: false, memoryPersisted: false };
}
