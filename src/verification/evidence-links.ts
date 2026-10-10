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
const spec=z.strictObject({schemaVersion:z.literal(1),documents:z.array(z.strictObject({id,path:z.string().min(1).max(2000),
  digest:z.string().regex(/^sha256:[a-f0-9]{64}$/)})).min(1).max(128),links:z.array(z.strictObject({
  id,from:id,to:id,sourceLine:line,literal:z.string().min(1).max(2000),basis:z.enum(['root','source-directory']),
  targetLines:z.strictObject({start:line,end:line}).refine(r=>r.end>=r.start).optional(),
})).min(1).max(512)});
interface DocumentResult {
  id:string;path:string;digest:string;actualDigest:string|null;bytes:number|null;lineCount:number|null;
  identity:EvidenceFileIdentity|null;status:Status;reason:string|null;
}
export interface EvidenceLinkReport {
  schemaVersion:1;algorithmRevision:'agent-core-evidence-links/v1';status:Status;reason:string|null;
  manifestDigest:string|null;rootIdentity:EvidenceFileIdentity|null;
  documents:DocumentResult[];links:Array<{id:string;from:string;to:string;status:Status;reason:string|null}>;
  selectedDocuments:number;checkedDocuments:number;selectedLinks:number;checkedLinks:number;snapshotBytes:number;
  semanticSupport:'not-established';automaticApproval:false;memoryPersisted:false;mutatesSources:false;
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
function emptyReport():EvidenceLinkReport {
  return {schemaVersion:1,algorithmRevision:'agent-core-evidence-links/v1',status:'unavailable',reason:null,manifestDigest:null,
    rootIdentity:null,documents:[],links:[],selectedDocuments:0,checkedDocuments:0,selectedLinks:0,checkedLinks:0,snapshotBytes:0,
    semanticSupport:'not-established',automaticApproval:false,memoryPersisted:false,mutatesSources:false};
}
function conclude(report:EvidenceLinkReport):EvidenceLinkReport {
  const all=[...report.documents,...report.links];
  report.checkedDocuments=report.documents.filter(d=>d.status!=='unavailable').length;
  report.checkedLinks=report.links.filter(l=>l.status!=='unavailable').length;
  report.status=all.some(r=>r.status==='unavailable')?'unavailable':all.some(r=>r.status==='fail')?'fail':'pass';
  if(!all.length)report.status='unavailable';return report;
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
  const report=emptyReport();const parsed=spec.safeParse(manifest);
  if(!parsed.success){report.reason='EVIDENCE_MANIFEST_INVALID';return report;}
  const m=parsed.data;report.selectedDocuments=m.documents.length;report.selectedLinks=m.links.length;
  const docById=new Map(m.documents.map(d=>[d.id,d]));
  if(docById.size!==m.documents.length||new Set(m.links.map(l=>l.id)).size!==m.links.length||m.links.some(l=>!docById.has(l.from)||!docById.has(l.to))) {
    report.reason='EVIDENCE_MANIFEST_IDENTITIES_INVALID';return report;
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
  return conclude(report);
}
