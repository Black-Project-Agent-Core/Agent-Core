import * as z from 'zod/v4';

export const HARNESS_LIMITS = Object.freeze({
  maxInputBytes: 256 * 1024, maxReportBytes: 64 * 1024,
  maxClaims: 32, maxObligations: 64, maxReceipts: 128, maxEdges: 8,
  maxCases: 5, maxContradictions: 32,
});
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/);
const tool = z.string().regex(/^[a-z][a-z0-9_]{0,119}$/);
export const caseKind = z.enum(['positive','negative','malformed','cancellation','teardown']);
export const authority = z.enum(['tool-terminal','static-identity','unit','integration','protocol',
  'renderer','controlled-replay','packaged-process','native-abi','live-observation','external']);
const unique = (items: readonly string[]) => new Set(items).size === items.length;
export const claimSchema = z.strictObject({
  id, title: z.string().min(1).max(160),
  kind: z.enum(['tool-completion','artifact-identity','behavior']),
  requiredAuthority: authority,
  obligationIds: z.array(id).min(1).max(HARNESS_LIMITS.maxObligations).refine(unique),
});
export const obligationSchema = z.strictObject({
  id, claimId: id, required: z.boolean(), ownerTool: tool,
  requiredCases: z.array(caseKind).min(1).max(HARNESS_LIMITS.maxCases).refine(unique),
  dependsOn: z.array(id).max(HARNESS_LIMITS.maxEdges).refine(unique),
});
export const selectionSchema = z.strictObject({
  obligationId: id, caseKind, receiptRef: z.string().regex(/^tool:[a-f0-9]{32}$/),
});
export const contradictionSchema = z.strictObject({
  obligationId: id, reasonCode: id,
  evidenceRefs: z.array(z.string().max(200)).min(1).max(8),
});
export const manifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  coverage: z.enum(['complete','partial','unknown']),
  claims: z.array(claimSchema).min(1).max(HARNESS_LIMITS.maxClaims),
  obligations: z.array(obligationSchema).max(HARNESS_LIMITS.maxObligations),
  selections: z.array(selectionSchema).max(HARNESS_LIMITS.maxReceipts),
  contradictions: z.array(contradictionSchema).max(HARNESS_LIMITS.maxContradictions),
}).superRefine((v,ctx)=>{
  for(const [label,values] of [
    ['claims',v.claims.map(x=>x.id)],['obligations',v.obligations.map(x=>x.id)],
    ['selections',v.selections.map(x=>x.receiptRef)],
  ] as const)if(!unique(values))ctx.addIssue({code:'custom',path:[label],message:'Duplicate identity'});
});
export const harnessAction = z.enum(['preview','assess','readiness']);
export const toolInputSchema = z.strictObject({action:harnessAction,manifest:manifestSchema});
export type HarnessManifest = z.infer<typeof manifestSchema>;
export type HarnessAction = z.infer<typeof harnessAction>;
export type ProofAuthority = z.infer<typeof authority>;
export type ProofCase = z.infer<typeof caseKind>;
export type ProofStatus = 'pass'|'fail'|'unknown';
export interface HostScope {
  readonly taskId:string;readonly workspace:string;readonly origin:'native'|'external';
  readonly ownerId?:string;readonly workspaceIdentityKey?:string;readonly processSessionId?:string;
}
export interface HostProof {
  readonly ref:string;readonly tool:string;readonly authority:ProofAuthority;
  readonly status:ProofStatus;readonly purpose:'tool-completion';
}
export type ReceiptResolver = (refs:readonly string[],scope:HostScope)=>ReadonlyMap<string,HostProof>;
export function parseManifest(input:unknown):HarnessManifest {
  let bytes:number;
  try {bytes=Buffer.byteLength(JSON.stringify(input),'utf8');}
  catch {throw new Error('HARNESS_INPUT_INVALID');}
  if(bytes>HARNESS_LIMITS.maxInputBytes)throw new Error('HARNESS_INPUT_LIMIT');
  const parsed=manifestSchema.safeParse(input);
  if(!parsed.success)throw new Error('HARNESS_INPUT_INVALID');
  return parsed.data;
}