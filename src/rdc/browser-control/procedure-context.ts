import { createHash } from 'node:crypto';

/** No URL, text, labels, node IDs, selector or raw observation is retained. */
export type BrowserShapeKind = 'C' | 'F' | 'S';
export type BrowserShapeRole = 'B' | 'L' | 'T' | 'C' | 'H' | 'R' | 'O' | 'M' | 'A' | 'W';
export type BrowserShapeBucket = '0' | '1' | '2' | '5' | '17';
export interface BrowserShapeProfile {
  profileVersion: 1;
  projectionRevision: 'browser-dom-shape-v1';
  scope: 'observed-main-document-viewport';
  shapeDigest: string;
  bins: Array<[BrowserShapeKind, BrowserShapeRole, BrowserShapeBucket]>;
  coverage: { observed: number; omitted: number; complete: boolean };
}
export interface BrowserObservationUse {
  version: 1; observationUsed: true; actionKind: BrowserShapeKind;
  profile: BrowserShapeProfile;
}
const kinds: Record<string, BrowserShapeKind> = { click: 'C', fill: 'F', select: 'S' };
const roles: Record<string, BrowserShapeRole> = {
  button:'B', link:'L', textbox:'T', searchbox:'T', combobox:'C',
  checkbox:'H', radio:'R', option:'O', menuitem:'M', tab:'A', switch:'W',
};
const digest = (bins: BrowserShapeProfile['bins']) => 'sha256:' + createHash('sha256')
  .update(JSON.stringify(['browser-dom-shape-v1', bins])).digest('hex');
const bucket = (count: number): BrowserShapeBucket =>
  count < 1 ? '0' : count === 1 ? '1' : count <= 4 ? '2' : count <= 16 ? '5' : '17';
export function projectBrowserShape(
  actions: readonly {kind:string;role?:string}[], omittedDom = 0,
): BrowserShapeProfile {
  const counts = new Map<string, number>();
  let observed = 0;
  let omitted = Math.max(0, omittedDom);
  for (const action of actions) {
    const kind = kinds[action.kind];
    if (!kind) continue;
    observed++;
    const role = roles[String(action.role ?? '').toLowerCase()];
    if (!role) { omitted++; continue; }
    const key = kind + role;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const bins = [...counts].sort(([a],[b]) => a.localeCompare(b))
    .map(([key,count]): [BrowserShapeKind, BrowserShapeRole, BrowserShapeBucket] => {
      return [key[0] as BrowserShapeKind, key[1] as BrowserShapeRole, bucket(count)];
    });
  if (bins.length > 42) { omitted += bins.length - 42; bins.length = 42; }
  const profile: BrowserShapeProfile = { profileVersion:1, projectionRevision:'browser-dom-shape-v1',
    scope:'observed-main-document-viewport', shapeDigest:digest(bins), bins,
    coverage:{observed,omitted,complete:omitted===0 && observed>0 && bins.length>0} };
  while (JSON.stringify(profile).length > 1024 && bins.length) {
    bins.pop(); profile.coverage.omitted++; profile.coverage.complete=false;
    profile.shapeDigest=digest(bins);
  }
  return profile;
}
export function validBrowserShape(value: unknown): value is BrowserShapeProfile {
  if (!value || typeof value !== 'object') return false;
  const p = value as BrowserShapeProfile;
  if (p.profileVersion !== 1 || p.projectionRevision !== 'browser-dom-shape-v1'
    || p.scope !== 'observed-main-document-viewport' || !Array.isArray(p.bins)
    || p.bins.length > 42 || !p.coverage
    || !Number.isSafeInteger(p.coverage.observed) || p.coverage.observed < 0
    || !Number.isSafeInteger(p.coverage.omitted) || p.coverage.omitted < 0
    || typeof p.coverage.complete !== 'boolean') return false;
  const seen = new Set<string>();
  for (const bin of p.bins) {
    if (!Array.isArray(bin) || bin.length !== 3 || !Object.values(kinds).includes(bin[0])
      || !Object.values(roles).includes(bin[1]) || !['0','1','2','5','17'].includes(bin[2])) return false;
    const key = bin[0] + bin[1];
    if (seen.has(key)) return false;
    seen.add(key);
  }
  if (p.bins.some((v,i) => i>0 && (p.bins[i-1]![0]+p.bins[i-1]![1]) >= (v[0]+v[1])))
    return false;
  return p.shapeDigest === digest(p.bins) && JSON.stringify(p).length <= 1024
    && (p.coverage.omitted === 0 || !p.coverage.complete);
}
export function validBrowserUse(value: unknown): value is BrowserObservationUse {
  const p = value as BrowserObservationUse | null;
  return Boolean(p && p.version===1 && p.observationUsed===true
    && Object.values(kinds).includes(p.actionKind) && validBrowserShape(p.profile)
    && JSON.stringify(p).length <= 1600);
}
export function compareBrowserShapes(a: BrowserShapeProfile, b: BrowserShapeProfile):
  'same-shape' | 'different-shape' | 'unknown' {
  if (!validBrowserShape(a) || !validBrowserShape(b)
    || a.projectionRevision!==b.projectionRevision
    || !a.coverage.complete || !b.coverage.complete) return 'unknown';
  return a.shapeDigest===b.shapeDigest ? 'same-shape':'different-shape';
}
export interface BrowserReceiptContext {
  version:1; actionRef:string; sourceDigest:string; shape:BrowserShapeProfile;
  association:'controller-selected-host-observation'; semanticSupport:'not-established';
}
export function validBrowserReceipt(value:unknown):value is BrowserReceiptContext {
  const row=value as BrowserReceiptContext|null;
  return Boolean(row && row.version===1 && /^tool:[0-9a-f]{32}$/.test(row.actionRef)
    && row.association==='controller-selected-host-observation'
    && row.semanticSupport==='not-established' && validBrowserShape(row.shape)
    && row.sourceDigest===row.shape.shapeDigest);
}
export type BrowserShapeSelection = {
  status:'available';profile:BrowserShapeProfile;capturedAt:string;
  freshness:'last-observed-not-revalidated';
} | {status:'unknown';reason:string};
export interface BrowserCompatibility {
  status:'same-shape'|'different-shape'|'unknown'|'not-requested';
  contractDigest:string; projectionRevision:'browser-dom-shape-v1';
  freshness:'last-observed-not-revalidated'|'not-requested';
  selected:number; omitted:number; compared:number;
  semanticSupport:'not-established'; reason?:string;
}
export function compareProcedureBrowserContext(
  contractDigest:string,
  receipts:readonly {outcome:string;browserContext?:unknown;browserContextUnavailable?:string}[],
  selected?:BrowserShapeSelection,
):BrowserCompatibility {
  const base={contractDigest,projectionRevision:'browser-dom-shape-v1' as const,
    freshness:selected?'last-observed-not-revalidated' as const:'not-requested' as const,
    semanticSupport:'not-established' as const};
  if(!selected)return {...base,status:'not-requested',selected:0,omitted:0,compared:0};
  if(selected.status!=='available')return {...base,status:'unknown',selected:0,omitted:0,
    compared:0,reason:selected.reason};
  const candidates=receipts.filter(r=>r.outcome==='verified'
    && (r.browserContext!==undefined || r.browserContextUnavailable!==undefined));
  const recent=candidates.slice(-4), omitted=candidates.length-recent.length;
  let compared=0, incomplete=false, matched=false;
  for(const row of recent) {
    if(!validBrowserReceipt(row.browserContext)) {incomplete=true;continue;}
    const verdict=compareBrowserShapes(selected.profile,row.browserContext.shape);
    if(verdict==='unknown'){incomplete=true;continue;}
    compared++;if(verdict==='same-shape')matched=true;
  }
  return {...base, selected:recent.length,omitted,compared,
    status:matched?'same-shape':!recent.length||incomplete||omitted>0?'unknown':'different-shape',
    ...(matched?{}:{reason:!recent.length?'no-associated-receipt':
      incomplete?'partial-or-unsupported-profile':omitted?'receipt-comparison-budget':undefined})};
}
