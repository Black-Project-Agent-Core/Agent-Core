import * as z from 'zod/v4';
const identity=z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:/+-]*$/);
const nodeSchema=z.strictObject({id:identity,revision:identity,scopeKey:identity});
// Exact revisions bind feedback to observed nodes; verifier identity alone cannot detect drift.
const outcomeSchema=z.strictObject({sourceId:identity,targetId:identity,sourceRevision:identity,targetRevision:identity,scopeKey:identity,verifiedUseful:z.boolean(),verifierRevision:identity});
export const reconsolidationFixtureSchema=z.strictObject({scopeKey:identity,corpusRevision:identity,nodes:z.array(nodeSchema).max(32),outcomes:z.array(outcomeSchema).max(64)});
export type ReconsolidationFixture=z.infer<typeof reconsolidationFixtureSchema>;
export interface RelatedEdgeProposal {sourceId:string;targetId:string;type:'related';sourceRevision:string;targetRevision:string;verifierRevision:string}
export function proposeFixtureRelations(raw:ReconsolidationFixture):ReadonlyArray<RelatedEdgeProposal> {
 const parsed=reconsolidationFixtureSchema.safeParse(raw);
 if(!parsed.success)throw new Error('RECONSOLIDATION_INPUT_INVALID');
 const input=parsed.data,nodes=new Map(input.nodes.map(node=>[node.id,node]));
 if(nodes.size!==input.nodes.length||input.nodes.some(node=>node.scopeKey!==input.scopeKey))throw new Error('RECONSOLIDATION_SCOPE_OR_IDENTITY');
 const seen=new Set<string>(),proposals:RelatedEdgeProposal[]=[];
 for(const outcome of input.outcomes){
  const source=nodes.get(outcome.sourceId),target=nodes.get(outcome.targetId);
  if(!source||!target||outcome.scopeKey!==input.scopeKey||source.revision!==outcome.sourceRevision||target.revision!==outcome.targetRevision)throw new Error('RECONSOLIDATION_STALE_OR_MISSING_NODE');
  const key=JSON.stringify([outcome.sourceId,outcome.targetId]);
  if(source.id===target.id||seen.has(key))throw new Error('RECONSOLIDATION_DUPLICATE_OR_SELF_LINK');
  seen.add(key);
  if(outcome.verifiedUseful)proposals.push({sourceId:source.id,targetId:target.id,type:'related',sourceRevision:source.revision,targetRevision:target.revision,verifierRevision:outcome.verifierRevision});
 }
 if(proposals.length>8)throw new Error('RECONSOLIDATION_EDGE_LIMIT');
 return proposals.sort((a,b)=>a.sourceId<b.sourceId?-1:a.sourceId>b.sourceId?1:a.targetId<b.targetId?-1:a.targetId>b.targetId?1:0);
}
