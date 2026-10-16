import { createHash } from 'node:crypto';

export interface DiversityDimension {
  id: string;
  min: number;
  max: number;
  bins: number;
}
export interface DiversityCandidate {
  reportId: string;
  comparisonKey: string;
  fitness: number;
  features: Record<string, number>;
}
export interface DiversityCell {
  coordinates: number[];
  key: string;
  winner: string;
  fitness: number;
  candidateIds: string[];
}

const safeId = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,199}$/;
const digest = (value: unknown) =>
  'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');

function binIndex(value: number, dimension: DiversityDimension): number {
  if (!Number.isFinite(value)) throw new Error('DIVERSITY_NONFINITE_FEATURE');
  if (!(dimension.max > dimension.min)) throw new Error('DIVERSITY_RANGE_INVALID');
  if (!Number.isSafeInteger(dimension.bins) || dimension.bins < 1 || dimension.bins > 100) {
    throw new Error('DIVERSITY_BIN_COUNT_INVALID');
  }
  const normalized = Math.max(0, Math.min(1, (value - dimension.min) / (dimension.max - dimension.min)));
  return Math.min(dimension.bins - 1, Math.floor(normalized * dimension.bins));
}

export function createRetrievalDiversityArchive(
  candidates: DiversityCandidate[],
  dimensions: DiversityDimension[],
) {
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > 100) {
    throw new Error('DIVERSITY_CANDIDATE_COUNT_INVALID');
  }
  if (!Array.isArray(dimensions) || dimensions.length < 1 || dimensions.length > 8) {
    throw new Error('DIVERSITY_DIMENSION_COUNT_INVALID');
  }
  if (new Set(dimensions.map(item => item.id)).size !== dimensions.length) throw new Error('DIVERSITY_DUPLICATE_DIMENSION');
  for (const dimension of dimensions) {
    if (!safeId.test(dimension.id)) throw new Error('DIVERSITY_DIMENSION_ID_INVALID');
    if (!Number.isFinite(dimension.min) || !Number.isFinite(dimension.max)) throw new Error('DIVERSITY_RANGE_NONFINITE');
  }
  const comparisonKeys = new Set(candidates.map(candidate => candidate.comparisonKey));
  if (comparisonKeys.size !== 1) throw new Error('DIVERSITY_INCOMPARABLE_CANDIDATES');
  const reportIds = candidates.map(candidate => candidate.reportId);
  if (new Set(reportIds).size !== reportIds.length || reportIds.some(id => !safeId.test(id))) {
    throw new Error('DIVERSITY_REPORT_ID_INVALID');
  }

  const cells = new Map<string, { coordinates: number[]; candidates: DiversityCandidate[] }>();
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.fitness)) throw new Error('DIVERSITY_NONFINITE_FITNESS');
    const coordinates = dimensions.map(dimension => {
      if (!(dimension.id in candidate.features)) throw new Error('DIVERSITY_FEATURE_MISSING:' + dimension.id);
      return binIndex(candidate.features[dimension.id], dimension);
    });
    const key = coordinates.join(':');
    const cell = cells.get(key) ?? { coordinates, candidates: [] };
    cell.candidates.push(candidate);
    cells.set(key, cell);
  }

  const archive: DiversityCell[] = [...cells.entries()].map(([key, cell]) => {
    const ordered = [...cell.candidates].sort((a, b) =>
      b.fitness - a.fitness || a.reportId.localeCompare(b.reportId),
    );
    return {
      coordinates: cell.coordinates,
      key,
      winner: ordered[0].reportId,
      fitness: ordered[0].fitness,
      candidateIds: ordered.map(item => item.reportId),
    };
  }).sort((a, b) => a.key.localeCompare(b.key));

  return {
    schemaVersion: 1,
    kind: 'quality-diversity-archive',
    comparisonKey: candidates[0].comparisonKey,
    dimensions: dimensions.map(item => ({ ...item })),
    candidateCount: candidates.length,
    occupiedCells: archive.length,
    archive,
    inputsDigest: digest(candidates.map(candidate => ({
      reportId: candidate.reportId,
      fitness: candidate.fitness,
      features: Object.fromEntries(Object.entries(candidate.features).sort(([a], [b]) => a.localeCompare(b))),
    }))),
    semantics: 'descriptive-best-observed-per-declared-cell',
    deploymentRecommendation: false,
    generatesCandidates: false,
  };
}
