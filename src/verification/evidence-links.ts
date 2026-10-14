// Local reference-checking mechanism informed by CORAL 0123dfb939 (Apache-2.0).
// This verifies selected byte/path/line expectations, NOT whether a source supports a claim.
import path from 'node:path';
import { lstat } from 'node:fs/promises';
import * as z from 'zod/v4';
import { evidenceDirectoryIdentity, evidenceDigest, evidenceError, evidencePathKey, readEvidenceSnapshot,
  revalidateEvidenceSnapshot, EVIDENCE_DOCUMENT_MAX, EVIDENCE_TOTAL_MAX, type EvidenceFileIdentity } from './evidence-snapshot.js';

type Status = 'pass' | 'fail' | 'unavailable';
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/);
const line=z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const documentSpec=z.strictObject({id,path:z.string().min(1).max(2000),
  digest:z.string().regex(/^sha256:[a-f0-9]{64}$/)});
const lineRange=z.strictObject({start:line,end:line}).refine(r=>r.end>=r.start);
const linkSpec=z.strictObject({
  id,from:id,to:id,sourceLine:line,literal:z.string().min(1).max(2000),basis:z.enum(['root','source-directory']),
  targetLines:lineRange.optional(),
});
const spec=z.strictObject({schemaVersion:z.literal(1),documents:z.array(documentSpec).min(1).max(128),
  links:z.array(linkSpec).min(1).max(512)});
const claimSpec=z.strictObject({id,from:id,lines:lineRange,linkIds:z.array(id).max(8)});
const specV2=z.strictObject({schemaVersion:z.literal(2),documents:z.array(documentSpec).min(1).max(128),
  links:z.array(linkSpec).max(512),expectedClaims:z.array(id).min(1).max(32),
  claims:z.array(claimSpec).max(32)});
type ClaimStatus='bound'|'unknown'|'failed'|'unavailable';
export interface ClaimCoverage {
  version:1;scope:'declared-claims-only';expected:number;supplied:number;bound:number;unknown:number;
  missing:number;evidenceMissing:number;failed:number;unavailable:number;complete:boolean;
  results:Array<{id:string;status:ClaimStatus;reason:string|null}>;
}
interface DocumentResult {
  id:string;path:string;digest:string;actualDigest:string|null;bytes:number|null;lineCount:number|null;
  identity:EvidenceFileIdentity|null;status:Status;reason:string|null;
}
export interface EvidenceLinkReport {
  schemaVersion:1|2;algorithmRevision:'agent-core-evidence-links/v1'|'agent-core-evidence-links/v2';status:Status;reason:string|null;
  manifestDigest:string|null;rootIdentity:EvidenceFileIdentity|null;
  documents:DocumentResult[];links:Array<{id:string;from:string;to:string;status:Status;reason:string|null}>;
  selectedDocuments:number;checkedDocuments:number;selectedLinks:number;checkedLinks:number;snapshotBytes:number;
  semanticSupport:'not-established';automaticApproval:false;memoryPersisted:false;mutatesSources:false;
  claimCoverage?:ClaimCoverage;
}
const errorCode=(e:unknown)=>e instanceof Error&&/^EVIDENCE_[A-Z_]+$/.test(e.message)?e.message:
  ['EACCES','EPERM'].includes((e as NodeJS.ErrnoException)?.code??'')?'EVIDENCE_INPUT_UNREADABLE':'EVIDENCE_INPUT_UNAVAILABLE';
function relativePath(raw:string,allowParent:boolean):string {
  if(/[\x00-\x1f\x7f%#?:<>"|*\\]/.test(raw)||raw.startsWith('/'))throw evidenceError('RELATIVE_PATH_REQUIRED');
  const parts=raw.split('/');
  if(parts.some(p=>!p||(!allowParent&&(p==='.'||p==='..'))||
    (p!=='.'&&p!=='..'&&(/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))))throw evidenceError('PATH_INVALID');
  return raw;
}
function contained(root:string,file:string):boolean {
  const rel=path.relative(root,file);return rel!==''&&!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep);
}
function resolveLiteral(root:string,sourcePath:string,literal:string,basis:'root'|'source-directory'):string {
  relativePath(literal,true);const file=path.resolve(basis==='root'?root:path.dirname(path.join(root,sourcePath)),literal);
  if(!contained(root,file))throw evidenceError('PATH_ESCAPE');return file;
}
function emptyReport(version:1|2=1):EvidenceLinkReport {
  return {schemaVersion:version,algorithmRevision:version===2?'agent-core-evidence-links/v2':'agent-core-evidence-links/v1',
    status:'unavailable',reason:null,manifestDigest:null,
    rootIdentity:null,documents:[],links:[],selectedDocuments:0,checkedDocuments:0,selectedLinks:0,checkedLinks:0,snapshotBytes:0,
    semanticSupport:'not-established',automaticApproval:false,memoryPersisted:false,mutatesSources:false};
}
function conclude(report:EvidenceLinkReport):EvidenceLinkReport {
  const all=[...report.documents,...report.links];
  report.checkedDocuments=report.documents.filter(d=>d.status!=='unavailable').length;
  report.checkedLinks=report.links.filter(l=>l.status!=='unavailable').length;
  report.status=all.some(r=>r.status==='unavailable')?'unavailable':all.some(r=>r.status==='fail')?'fail':'pass';
  const coverage=report.claimCoverage;
  if(coverage) {
    if(coverage.unknown>0||coverage.unavailable>0) report.status='unavailable';
    else if(coverage.failed>0&&report.status!=='unavailable') report.status='fail';
    if(!coverage.complete&&report.status==='pass') report.status='unavailable';
  }
  if(!all.length)report.status='unavailable';return report;
}
function projectClaims(m:z.infer<typeof specV2>,report:EvidenceLinkReport,lines:Map<string,string[]>):ClaimCoverage {
  const claimed=new Map(m.claims.map(c=>[c.id,c]));
  const documents=new Map(report.documents.map(d=>[d.id,d]));
  const links=new Map(report.links.map(l=>[l.id,l]));
  const results:ClaimCoverage['results']=[];
  for(const id of m.expectedClaims){
    const row=claimed.get(id);
    let status:ClaimStatus='bound',reason:string|null=null;
    if(!row){status='unknown';reason='claim-missing';}
    else if(!row.linkIds.length){status='unknown';reason='claim-evidence-missing';}
    else if(report.reason==='EVIDENCE_INPUT_CHANGED'){status='unavailable';reason='claim-source-changed';}
    else {
      const document=documents.get(row.from)!;
      if(document.status==='unavailable'){status='unavailable';reason='claim-document-unavailable';}
      else if(document.status==='fail'){status='failed';reason='claim-document-failed';}
      else if(row.lines.end>(lines.get(row.from)?.length??0)){status='failed';reason='claim-lines-missing';}
      else {
        const bindings=row.linkIds.map(linkId=>links.get(linkId)!);
        if(bindings.some(l=>l.status==='unavailable')){status='unavailable';reason='claim-link-unavailable';}
        else if(bindings.some(l=>l.status==='fail')){status='failed';reason='claim-link-failed';}
      }
    }
    results.push({id,status,reason});
  }
  const count=(s:ClaimStatus)=>results.filter(row=>row.status===s).length;
  const missing=results.filter(row=>row.reason==='claim-missing').length;
  const evidenceMissing=results.filter(row=>row.reason==='claim-evidence-missing').length;
  const bound=count('bound'),unknown=count('unknown'),failed=count('failed'),unavailable=count('unavailable');
  return {version:1,scope:'declared-claims-only',expected:results.length,supplied:m.claims.length,
    bound,unknown,missing,evidenceMissing,failed,unavailable,complete:bound===results.length,results};
}
/** Exact snapshot recheck, including digest because coarse timestamps can miss same-size writes. */
export async function revalidateEvidenceLinks(root:string,report:EvidenceLinkReport):Promise<void> {
  if(!report.rootIdentity)throw evidenceError('ROOT_UNAVAILABLE');
  const current=await evidenceDirectoryIdentity(root),prior=report.rootIdentity;
  // Directory mtime/size changes when the CLI creates its report; inode identity is the invariant.
  if(current.dev!==prior.dev||current.ino!==prior.ino||current.birthtimeNs!==prior.birthtimeNs)throw evidenceError('ROOT_CHANGED');
  for(const d of report.documents) {
    const file=path.join(root,d.path);
    if(d.identity)await revalidateEvidenceSnapshot(file,d.identity,d.actualDigest!);
    else if(d.reason==='EVIDENCE_DOCUMENT_MISSING') {
      try {await lstat(file);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')continue;throw e;}
      throw evidenceError('INPUT_CHANGED');
    }
  }
}
export async function verifyEvidenceLinks(root:string,manifest:unknown):Promise<EvidenceLinkReport> {
  const isV2=!!manifest&&typeof manifest==='object'&&'schemaVersion' in manifest&&manifest.schemaVersion===2;
  const report=emptyReport(isV2?2:1);
  const parsed=(isV2?specV2:spec).safeParse(manifest);
  if(!parsed.success){report.reason='EVIDENCE_MANIFEST_INVALID';return report;}
  const m=parsed.data;report.selectedDocuments=m.documents.length;report.selectedLinks=m.links.length;
  const docById=new Map(m.documents.map(d=>[d.id,d]));
  if(docById.size!==m.documents.length||new Set(m.links.map(l=>l.id)).size!==m.links.length||m.links.some(l=>!docById.has(l.from)||!docById.has(l.to))) {
    report.reason='EVIDENCE_MANIFEST_IDENTITIES_INVALID';return report;
  }
  if(m.schemaVersion===2) {
    const expected=new Set(m.expectedClaims),claims=new Set(m.claims.map(c=>c.id));
    const linkById=new Map(m.links.map(l=>[l.id,l]));
    if(expected.size!==m.expectedClaims.length||claims.size!==m.claims.length||
      m.claims.some(c=>!expected.has(c.id)||!docById.has(c.from)||
        new Set(c.linkIds).size!==c.linkIds.length||c.linkIds.some(linkId=>{
          const l=linkById.get(linkId);
          return !l||l.from!==c.from||l.sourceLine<c.lines.start||
            l.sourceLine>c.lines.end||!l.targetLines;
        }))||m.claims.reduce((n,c)=>n+c.linkIds.length,0)>256) {
      report.reason='EVIDENCE_CLAIM_ASSOCIATIONS_INVALID';return report;
    }
  }
  report.manifestDigest=evidenceDigest(Buffer.from(JSON.stringify(m),'utf8'));
  try {
    if(!path.isAbsolute(root))throw evidenceError('LOCAL_PATH_REQUIRED');root=path.resolve(root);
    report.rootIdentity=await evidenceDirectoryIdentity(root);
    const paths=new Set<string>();
    for(const d of m.documents) {
      relativePath(d.path,false);const key=evidencePathKey(path.join(root,d.path));
      if(paths.has(key))throw evidenceError('DUPLICATE_DOCUMENT_PATH');paths.add(key);
    }
    // Validate every literal before acquiring document contents.
    for(const l of m.links)resolveLiteral(root,docById.get(l.from)!.path,l.literal,l.basis);
  } catch(e){report.reason=errorCode(e);return report;}
  const linesById=new Map<string,string[]>();
  for(const d of m.documents) {
    const result:DocumentResult={...d,actualDigest:null,bytes:null,lineCount:null,identity:null,status:'unavailable',reason:null};
    report.documents.push(result);
    try {
      const snapshot=await readEvidenceSnapshot(path.join(root,d.path),Math.min(EVIDENCE_DOCUMENT_MAX,EVIDENCE_TOTAL_MAX-report.snapshotBytes));
      report.snapshotBytes+=snapshot.bytes.length;
      const lines=snapshot.text===''?[]:snapshot.text.split(/\r\n|\n|\r/);if(lines.length&&lines[lines.length-1]==='')lines.pop();
      linesById.set(d.id,lines);Object.assign(result,{actualDigest:snapshot.digest,bytes:snapshot.bytes.length,lineCount:lines.length,identity:snapshot.identity,
        status:d.digest===snapshot.digest?'pass':'fail',reason:d.digest===snapshot.digest?null:'EVIDENCE_DIGEST_MISMATCH'});
    } catch(e) {
      if((e as NodeJS.ErrnoException).code==='ENOENT'){result.status='fail';result.reason='EVIDENCE_DOCUMENT_MISSING';}
      else result.reason=errorCode(e);
    }
  }
  const results=new Map(report.documents.map(d=>[d.id,d]));
  for(const l of m.links) {
    const a=results.get(l.from)!,b=results.get(l.to)!;
    let status:Status='pass',reason:string|null=null;
    if(a.status==='unavailable'||b.status==='unavailable'){status='unavailable';reason='EVIDENCE_DOCUMENT_UNAVAILABLE';}
    else if(a.status==='fail'||b.status==='fail'){status='fail';reason='EVIDENCE_DOCUMENT_EXPECTATION_FAILED';}
    else {
      const sourceLine=linesById.get(l.from)![l.sourceLine-1];
      if(sourceLine===undefined){status='fail';reason='EVIDENCE_SOURCE_LINE_MISSING';}
      else if(!sourceLine.includes(l.literal)){status='fail';reason='EVIDENCE_LITERAL_MISSING';}
      else if(evidencePathKey(resolveLiteral(root,a.path,l.literal,l.basis))!==evidencePathKey(path.join(root,b.path))){status='fail';reason='EVIDENCE_TARGET_MISMATCH';}
      else if(l.targetLines&&l.targetLines.end>b.lineCount!){status='fail';reason='EVIDENCE_TARGET_LINES_MISSING';}
    }
    report.links.push({id:l.id,from:l.from,to:l.to,status,reason});
  }
  try {await revalidateEvidenceLinks(root,report);} catch(e) {
    report.reason='EVIDENCE_INPUT_CHANGED';
    for(const l of report.links){l.status='unavailable';l.reason='EVIDENCE_INPUT_CHANGED';}
  }
  if(m.schemaVersion===2) report.claimCoverage=projectClaims(m,report,linesById);
  return conclude(report);
}
