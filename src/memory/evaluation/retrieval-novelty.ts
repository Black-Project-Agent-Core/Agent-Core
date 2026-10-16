// K-nearest task-vector cosine novelty adapted from GEA d185edffd1 (Apache-2.0).
// Native verified-input grouping, zero-vector semantics and bounds are independent.
import { reportHash, validateRetrievalProfile } from './retrieval-profile.js';
import { parseRetrievalSeriesManifest, summarizeRetrievalSeries, type RunEvidence } from './retrieval-series.js';

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export const NOVELTY_PAIR_WORK_LIMIT = 20_000_000;
interface Neighbor { runId: string; distance: number }
export interface RetrievalNoveltyRow {
  runId: string; runStatus: string; status: 'available' | 'unavailable'; reason: string | null;
  reportId: string | null; profileDigest: string | null; vectorDigest: string | null;
  candidateRate: number | null; actualNeighborCount: number; neighbors: Neighbor[];
  novelty: number | null; performanceNovelty: number | null;
}
export interface RetrievalNoveltyReport {
  schemaVersion: 1; kind: 'retrieval-task-novelty'; algorithmRevision: 'agent-core-task-novelty/v1';
  declaredNeighbors: number; manifestDigest: string; pairWork: number; pairWorkLimit: number;
  selectedCount: number; scorableVectorCount: number; availableCount: number; unavailableCount: number;
  groups: Array<{ key: string; runIds: string[]; caseCount: number; scorableCount: number }>;
  rows: RetrievalNoveltyRow[]; causalAttribution: 'not-established'; statisticalSignificance: 'not-established';
  launchesExperiments: false; selectsParents: false; mutatesMemory: false; automaticApproval: false;
}

export function summarizeRetrievalNovelty(manifest: unknown, evidence: RunEvidence[]): RetrievalNoveltyReport {
  const m = parseRetrievalSeriesManifest(manifest), config = m.analysis?.novelty;
  if (!config) throw new Error('NOVELTY_ANALYSIS_CONFIG_REQUIRED');
  // Keep the series owner's membership, status, split and identity checks authoritative.
  const series = summarizeRetrievalSeries(m, evidence), byEvidence = new Map(evidence.map(e => [e.id, e]));
  const vectors = new Map<string, { bits: boolean[]; hits: number }>();
  const rows: RetrievalNoveltyRow[] = series.rows.map(row => {
    const output: RetrievalNoveltyRow = {
      runId: row.id, runStatus: row.status, status: 'unavailable', reason: row.reason ?? 'not-evaluable',
      reportId: null, profileDigest: null, vectorDigest: null, candidateRate: null,
      actualNeighborCount: 0, neighbors: [], novelty: null, performanceNovelty: null,
    };
    if (row.status !== 'evaluable' || !row.profile) return output;
    const p = validateRetrievalProfile(byEvidence.get(row.id)!.profile);
    const cases = [...p.cases].sort((a,b) => compare(a.queryId,b.queryId));
    const bits = cases.map(c => c.candidateHit), hits = bits.filter(Boolean).length;
    vectors.set(row.id, { bits, hits });
    return { ...output, reportId: p.reportId, profileDigest: reportHash(p),
      vectorDigest: reportHash(cases.map(c => [c.queryId,c.candidateHit])), candidateRate: p.candidateRate,
      reason: hits === 0 ? 'zero-success-vector' : 'no-scorable-neighbor' };
  }).sort((a,b) => compare(a.runId,b.runId));
  const byRow = new Map(rows.map(row => [row.runId,row]));
  const groups = series.groups.map(group => {
    const runIds = [...group.runIds].sort(compare), first = vectors.get(runIds[0])!;
    return {key:group.key,runIds,caseCount:first.bits.length,
      scorableCount:runIds.filter(id => vectors.get(id)!.hits > 0).length};
  }).sort((a,b) => compare(a.key,b.key));
  // Estimate before pairwise allocation/computation. Never silently sample oversized input.
  const pairWork = groups.reduce((sum,g) => sum + g.scorableCount*(g.scorableCount-1)/2*g.caseCount,0);
  if (pairWork > NOVELTY_PAIR_WORK_LIMIT) throw new Error('NOVELTY_PAIR_WORK_LIMIT');
  for (const group of groups) {
    const ids = group.runIds.filter(id => vectors.get(id)!.hits > 0);
    const distances = new Map(ids.map(id => [id,[] as Neighbor[]]));
    for (let a=0;a<ids.length;a++) for(let b=a+1;b<ids.length;b++) {
      const left=vectors.get(ids[a])!,right=vectors.get(ids[b])!;
      let intersection=0;
      for(let q=0;q<left.bits.length;q++) if(left.bits[q] && right.bits[q]) intersection++;
      const distance=Math.max(0,Math.min(1,1-intersection/Math.sqrt(left.hits*right.hits)));
      distances.get(ids[a])!.push({runId:ids[b],distance});
      distances.get(ids[b])!.push({runId:ids[a],distance});
    }
    for(const id of ids) {
      const neighbors=distances.get(id)!.sort((a,b)=>a.distance-b.distance||compare(a.runId,b.runId)).slice(0,config.neighbors);
      if(!neighbors.length) continue;
      const row=byRow.get(id)!;
      row.status='available';row.reason=null;row.neighbors=neighbors;row.actualNeighborCount=neighbors.length;
      row.novelty=neighbors.reduce((sum,n)=>sum+n.distance,0)/neighbors.length;
      row.performanceNovelty=row.candidateRate!*Math.sqrt(row.novelty);
    }
  }
  const availableCount=rows.filter(row=>row.status==='available').length;
  return {schemaVersion:1,kind:'retrieval-task-novelty',algorithmRevision:'agent-core-task-novelty/v1',
    declaredNeighbors:config.neighbors,manifestDigest:reportHash(m),pairWork,pairWorkLimit:NOVELTY_PAIR_WORK_LIMIT,
    selectedCount:rows.length,scorableVectorCount:[...vectors.values()].filter(v=>v.hits>0).length,
    availableCount,unavailableCount:rows.length-availableCount,groups,rows,
    causalAttribution:'not-established',statisticalSignificance:'not-established',
    launchesExperiments:false,selectsParents:false,mutatesMemory:false,automaticApproval:false};
}
