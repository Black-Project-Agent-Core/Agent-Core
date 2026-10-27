import { createHash } from 'node:crypto';
import { AGENT_CAPABILITY_CATALOG } from './agent-capability-catalog.js';
import { redactSensitiveString } from './security/redaction.js';
import { normalizeSkillReadResource, skillReadCoverageKey } from './skills/resource-path.js';
import type { ExternalPartnerCapability } from './external-partner-capability.js';
import type { AgentModelMessage } from './agent-provider.js';
export type CapabilityDisclosurePolicy = 'silent-internal' | 'grouped-family' | 'announce-on-material-use';
export type CapabilityKind = 'tool-family' | 'skill' | 'pattern' | 'procedure' | 'helper' | 'external';
export interface CapabilityDescriptor {
 capabilityId: string; kind: CapabilityKind; displayName: string; description: string; revision: string;
 availability: 'available' | 'degraded' | 'unavailable' | 'unknown'; availabilityBasis: string;
 disclosurePolicy: CapabilityDisclosurePolicy; sourceOwner: string; memberTools?: string[];
}
export interface CapabilityArtifact { kind: 'skill' | 'pattern' | 'procedure'; id: string; description: string; revision: string; }
const clean = (s: unknown, max = 160) => redactSensitiveString(String(s ?? '')).replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g,' ').trim().slice(0,max);
const hash = (value: unknown) => 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const CAPABILITY_LABELS: Record<string,string> = {
 'reconstruction.harness':'Reconstruction Harness', 'artifact.inspect':'Artifact Inspection', 'code.intelligence':'Code Intelligence', 'code.modify':'Code Intelligence', 'semantic.ide':'Semantic IDE',
 'web.research':'Web Research', 'browser.navigate':'Browser Control', 'browser.act':'Browser Control',
 'phone.observe':'Phone Control', 'phone.act':'Phone Control', 'process.execute':'Process Execution', 'process.admin':'Process Execution',
};
export function buildCapabilityExposure(input: { availableTools?: readonly string[]; artifacts: CapabilityArtifact[]; owners: Record<string,string>; externalController?: boolean; externalPartners?: readonly ExternalPartnerCapability[] }) {
 const known = Array.isArray(input.availableTools);
 const names = [...new Set(input.availableTools ?? [])].filter(n => /^[A-Za-z0-9_-]{1,128}$/.test(n)).sort();
 const available = new Set(names);
 const mapped = new Set(AGENT_CAPABILITY_CATALOG.flatMap(f => f.tools.map(t=>t.name)));
 const families: CapabilityDescriptor[] = AGENT_CAPABILITY_CATALOG.map(f => {
  const memberTools = f.tools.map(t=>t.name).filter(n=>available.has(n));
  const definition = input.externalController && f.family === 'reconstruction.harness'
   ? {...f, description:'External task-bound REA proof obligations; schema discovery and host receipt assessment. Tool completion is not goal correctness.'}
   : input.externalController && (f.family === 'browser.navigate' || f.family === 'browser.act')
    ? {...f, description:'Browser Control: task-created tabs through the installed Open Browser Use extension/native host (default); observed actions and bounded evidence.'} : f;
  return { capabilityId:'family:'+f.family, kind:'tool-family', displayName:CAPABILITY_LABELS[f.family] ?? f.family,
   description:definition.description, revision:hash([definition,memberTools]), availability:known ? memberTools.length ? 'available' : 'unavailable' : 'unknown',
   availabilityBasis:'registered-tools-only; connection/effectiveness not established', memberTools,
   disclosurePolicy:CAPABILITY_LABELS[f.family] ? 'grouped-family' : 'silent-internal', sourceOwner:'MCP / AGENT_CAPABILITY_CATALOG' };
 });
 const artifacts: CapabilityDescriptor[] = input.artifacts.map(a=>({capabilityId:a.kind+':'+a.id,kind:a.kind,
  displayName:clean(a.id,200),description:clean(a.description,500),revision:a.revision,
  availability:'available',availabilityBasis:'owner-catalog; exposure is not use',
  disclosurePolicy:'announce-on-material-use',sourceOwner:a.kind==='skill'?'SkillService':'LearningService'}));
 const partners = input.externalController ? [...input.externalPartners ?? []] : [];
 const inventory = [...partners,...families,...artifacts];
 const counts = { 'tool-family':families.length, skill:artifacts.filter(a=>a.kind==='skill').length,
  pattern:artifacts.filter(a=>a.kind==='pattern').length, procedure:artifacts.filter(a=>a.kind==='procedure').length,
  ...(input.externalController ? {external:partners.length} : {}) };
 const tools = {status:known?'observed':'unknown',count:names.length,unclassified:names.filter(n=>!mapped.has(n))};
 const revision = hash([names,inventory,input.owners]);
 const lines = ['CAPABILITY EXPOSURE — registered inventory, not a permission grant or usage claim.',
  'revision='+revision+' | counts='+JSON.stringify(counts),
  'Tools='+tools.status+' | count='+names.length+' | unclassified='+tools.unclassified.join(','),
  'Owners='+JSON.stringify(input.owners)+' | host plugins=unknown (no host registration bridge).',
  'Discover Skills with skills(search), check applicability, then skills(read) with the selected digest; list/inspect remain available.'];
 // Host-partner instructions precede ordinary rows so a crowded catalog cannot hide how to invoke Raka.
 for(const partner of partners) lines.push(...partner.contextRows);
 let used=lines.join('\n').length, shown=partners.length;
 for(const item of [...families,...artifacts]) {
  if(item.kind==='tool-family' && item.availability!=='available') continue;
  const line='- '+clean(item.capabilityId,220)+' | revision='+item.revision+' | '+item.availability;
  if(used+line.length+1>4650)continue;
  lines.push(line);used+=line.length+1;shown++;
 }
 const omittedFromText=inventory.length-shown;
 lines.push('Omitted descriptors='+omittedFromText+'; full structured inventory is available; unseen is not absent.');
 return {revision,inventory,counts,tools,owners:input.owners,external:{status:'unknown',reason:'no-host-registration-bridge'},
  omittedFromText,text:lines.join('\n').slice(0,5000),executionAuthority:false as const};
}
export type CapabilityExposure = ReturnType<typeof buildCapabilityExposure>;

export interface CapabilityUse {
 capabilityId: string; kind:'tool-family'|'skill'|'pattern'|'procedure'; displayName:string;
 revision:string; purpose:string; evidenceRef:string; evidenceKind:'observed-tool'|'declared-artifact';
}
export const capabilityUseKey=(u:CapabilityUse)=>u.capabilityId+'|'+u.revision;
export function toolCapabilityUse(name:string,args:Record<string,unknown>,success:boolean,evidenceRef:string):CapabilityUse|null {
 if(!success || !evidenceRef) return null;
 let family='';
 if(name==='reconstruction_harness' && ['assess','readiness'].includes(String(args.action)))family='reconstruction.harness';
 else if(name==='artifact_inspect' && args.action==='inspect')family='artifact.inspect';
 else if(['code_graph','code_surface','code_analysis','code_patterns','code_repair','code_refactor'].includes(name))family='code.intelligence';
 else if(name==='code_orient' && args.action!=='status')family='code.intelligence';
 else if(name==='code_workspace' && !['list','resolve','status','refs'].includes(String(args.action)))family='code.intelligence';
 else if(name==='code_symbol' && args.action!=='status')family='semantic.ide';
 else if(['web_search','web_open'].includes(name))family='web.research';
 else if(name==='browser_control' && args.action!=='status' || name==='read_file' && args.isUrl===true)family='browser.navigate';
 else if(name.startsWith('phone_') && name!=='phone_status' && name!=='phone_list_named_actions')family='phone.act';
 else if(['start_process','interact_with_process','kill_process','force_terminate'].includes(name))family='process.execute';
 if(!family)return null;
 const purposes:Record<string,string>={'reconstruction.harness':'memeriksa kelengkapan pembuktian klaim berbasis bukti host','artifact.inspect':'memeriksa deklarasi statis artefak yang telah diizinkan','code.intelligence':'menelusuri struktur dan hubungan kode','semantic.ide':'memeriksa simbol dan referensi kode','web.research':'mencari serta membaca sumber web','browser.navigate':'berinteraksi dengan halaman yang relevan','phone.act':'mengerjakan langkah pada perangkat','process.execute':'menjalankan langkah proses yang relevan'};
 return {capabilityId:'family:'+family,kind:'tool-family',displayName:CAPABILITY_LABELS[family],revision:hash(family),
  purpose:purposes[family],evidenceRef:clean(evidenceRef,500),evidenceKind:'observed-tool'};
}
export function artifactCapabilityUse(a:{kind:string;artifactId:string;contentDigest?:string;applicability:string},delivered:Record<string,string>):CapabilityUse|null {
 if(!['skill','pattern','procedure'].includes(a.kind)||!['applied','adapted'].includes(a.applicability))return null;
 const id=a.kind+':'+a.artifactId, revision=delivered[id];
 if(!revision || revision!==a.contentDigest || !/^sha256:[a-f0-9]{64}$/.test(revision))return null;
 const kind=a.kind as 'skill'|'pattern'|'procedure';
 return {capabilityId:id,kind,displayName:(kind==='skill'?'Skill ':kind==='pattern'?'Pattern ':'Procedure ')+clean(a.artifactId,120),
  revision,purpose:'memandu langkah yang relevan pada task ini',evidenceRef:'source:delivered-artifact:'+id+':'+revision,evidenceKind:'declared-artifact'};
}
export function normalizeCapabilityUses(raw:unknown):CapabilityUse[] {
 if(!Array.isArray(raw))return [];
 const unique=new Map<string,CapabilityUse>();
 for(const x of raw.slice(0,128)) {
  if(!x || !['tool-family','skill','pattern','procedure'].includes(x.kind) || typeof x.capabilityId!=='string' || !/^(family|skill|pattern|procedure):[A-Za-z0-9._:-]{1,220}$/.test(x.capabilityId)
   || !/^sha256:[a-f0-9]{64}$/.test(x.revision) || typeof x.evidenceRef!=='string' || !/^(tool|source|activity):/.test(x.evidenceRef)
   || !['observed-tool','declared-artifact'].includes(x.evidenceKind))continue;
  const u:CapabilityUse={capabilityId:x.capabilityId,kind:x.kind,displayName:clean(x.displayName,160),revision:x.revision,
   purpose:clean(x.purpose,140),evidenceRef:clean(x.evidenceRef,500),evidenceKind:x.evidenceKind};
  if(u.displayName)unique.set(capabilityUseKey(u),u);
 }
 return [...unique.values()];
}
export function renderCapabilityNotice(raw:CapabilityUse[]):string {
 const uses=normalizeCapabilityUses(raw);
 const labels=[...new Set(uses.map(u=>u.displayName))];
 if(!labels.length)return '';
 const names=labels.length<2?labels[0]:labels.slice(0,-1).join(', ')+' dan '+labels.at(-1);
 return 'Aku menggunakan '+names+' untuk membantu task ini.';
}
export function appendCapabilityNotice(response:string,uses:CapabilityUse[]):string {
 const notice=renderCapabilityNotice(uses);
 return !notice || response.startsWith(notice)?response:notice+'\n\n'+response;
}

export const CAPABILITY_USE_CONTRACT = 'Automatically select available capabilities when materially relevant to the current task, without requiring the creator to name them. Inspect the registered inventory when a needed capability is not ranked. Exposure, grants and proposals are not use. Declare applied/adapted artifacts with the exact delivered revision; do not invent use or benefit. Disclose actual meaningful use once, group related tools, and say nothing about unused capabilities or routine Memory/file/config/Learning plumbing.';

/** Parse only an actual skills tool result. Callers still recheck its active owner/digest. */
export function inspectedSkillArtifacts(text:string):Array<{name:string;digest:string}> {
 try {
  const value=JSON.parse(text.split('\n\nAGENT_CORE_EVIDENCE_REF=')[0]);
  let values:unknown[];
  if(value && !Array.isArray(value) && 'hits' in value) {
   if(value.version!==1 || !['lexical','hybrid'].includes(value.requestedMode)
    || !['lexical','hybrid'].includes(value.effectiveMode) || !Array.isArray(value.hits))return [];
   values=value.hits.slice(0,8).filter((hit:any)=>hit?.scoreKind==='rank-fusion' && hit.executionAuthority===false
    && Number.isInteger(hit.rank) && hit.rank>=1 && hit.rank<=8);
  } else if(value && !Array.isArray(value) && ('delivery' in value || 'content' in value)) {
   if(value.delivery!=='instruction-fragment' || value.executionAuthority!==false
    || typeof value.content!=='string' || typeof value.source!=='string')return [];
   // This descriptor filter must admit the same packaged resources as observeSkillRead.
   // The receipt observer separately binds the source to the requested resourcePath.
   try { if(normalizeSkillReadResource(value.source)!==value.source)return []; } catch { return []; }
   values=[value];
  } else values=Array.isArray(value)?value:[value];
  return values.slice(0,500).filter((v:any)=>v && typeof v.name==='string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v.name)
   && v.name.length<=64 && typeof v.digest==='string' && /^sha256:[a-f0-9]{64}$/.test(v.digest))
   .map((v:any)=>({name:v.name,digest:v.digest}));
 }catch{return [];}
}

export interface SkillReadCoverageEntry { digest: string; readBytes: number; totalBytes: number; complete: boolean }
export type SkillReadCoverage = Record<string, SkillReadCoverageEntry>;
const skillName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const skillDigest = /^sha256:[a-f0-9]{64}$/;
function recognizedSkillCoverageKey(key: string): boolean {
 const split = key.indexOf('#');
 const name = split < 0 ? key : key.slice(0, split);
 if (!skillName.test(name) || name.length > 64) return false;
 if (split < 0) return true;
 try {
  const resource = normalizeSkillReadResource(key.slice(split + 1));
  return resource !== 'SKILL.md' && skillReadCoverageKey(name, resource) === key;
 } catch { return false; }
}
/** Existing episode metadata only: never retain instruction text or infer reading from inventory. */
export function normalizeSkillReadCoverage(raw: unknown): SkillReadCoverage {
 const result: SkillReadCoverage = Object.create(null);
 if(!raw || typeof raw!=='object' || Array.isArray(raw))return result;
 for(const [name,value] of Object.entries(raw).slice(-128)) {
  const v=value as SkillReadCoverageEntry;
  if(!recognizedSkillCoverageKey(name)||!v||!skillDigest.test(v.digest)
    ||!Number.isSafeInteger(v.readBytes)||!Number.isSafeInteger(v.totalBytes)
    ||v.readBytes<0||v.totalBytes<0||v.totalBytes>2*1024*1024||v.readBytes>v.totalBytes
    ||typeof v.complete!=='boolean'||v.complete!==(v.readBytes===v.totalBytes))continue;
  result[name]={digest:v.digest,readBytes:v.readBytes,totalBytes:v.totalBytes,complete:v.complete};
 }
 return result;
}
/** Successful reads only. Returns envelope validity; only contiguous fragments advance coverage. */
export function observeSkillRead(coverage: SkillReadCoverage, text: string, request: unknown): boolean {
 try {
  const args=request as {action?:string;name?:string;expectedActiveDigest?:string;offset?:number;resourcePath?:string};
  const source = normalizeSkillReadResource(args?.resourcePath);
  const v=JSON.parse(text.split('\n\nAGENT_CORE_EVIDENCE_REF=')[0]);
  if(args?.action!=='read'||v?.name!==args.name||v.digest!==args.expectedActiveDigest?.toLowerCase()
    ||!skillName.test(v.name)||v.name.length>64||!skillDigest.test(v.digest)
    ||v.source!==source||v.delivery!=='instruction-fragment'||v.executionAuthority!==false
    ||typeof v.content!=='string'||!Number.isSafeInteger(v.offset)||v.offset<0||v.offset!==(args.offset??0)
    ||!Number.isSafeInteger(v.totalContentBytes)||v.totalContentBytes<0||v.totalContentBytes>2*1024*1024)return false;
  const end=v.offset+Buffer.byteLength(v.content,'utf8');
  if(end>v.totalContentBytes||end===v.offset&&end!==v.totalContentBytes
    ||v.nextOffset!==(end===v.totalContentBytes?null:end)||v.truncated!==(end<v.totalContentBytes))return false;
  const key = skillReadCoverageKey(v.name,source);
  const previous=Object.hasOwn(coverage,key)?coverage[key]:undefined;
  if(previous&&previous.digest===v.digest&&previous.totalBytes===v.totalContentBytes&&previous.readBytes>=end)return true;
  if(v.offset!==0&&(!previous||previous.digest!==v.digest||previous.totalBytes!==v.totalContentBytes||previous.readBytes!==v.offset))return true;
  coverage[key]={digest:v.digest,readBytes:end,totalBytes:v.totalContentBytes,complete:end===v.totalContentBytes};
  for(const name of Object.keys(coverage).slice(0,-128))delete coverage[name];
  return true;
 }catch{return false;/* Malformed or error tool results cannot prove instruction delivery. */}
}
export function skillInstructionsRead(coverage: SkillReadCoverage | undefined, name: string, digest: string): boolean {
 const value=coverage&&Object.hasOwn(coverage,name)?coverage[name]:undefined;
 return Boolean(value?.complete&&value.digest===digest&&value.readBytes===value.totalBytes);
}
/** Reference receipt is independent of the primary SKILL.md instruction admission. */
export function skillReferenceRead(coverage: SkillReadCoverage | undefined, name: string, reference: string, digest: string): boolean {
 try {
  const source = normalizeSkillReadResource(reference);
  if (source === 'SKILL.md') return false;
  const key = skillReadCoverageKey(name, source);
  const entry = coverage && Object.hasOwn(coverage, key) ? coverage[key] : undefined;
  return Boolean(entry?.complete && entry.digest === digest && entry.readBytes === entry.totalBytes);
 } catch { return false; }
}
/** Reconstruct from the existing durable call/result transcript; no checkpoint schema extension. */
export function skillReadCoverageFromMessages(messages: readonly AgentModelMessage[]): SkillReadCoverage {
 const coverage: SkillReadCoverage=Object.create(null), pending=new Map<string,unknown>();
 for(const message of messages){
  if(message.role==='assistant')for(const call of message.tool_calls??[])if(call.function.name==='skills'){
   try{pending.set(call.id,JSON.parse(call.function.arguments));}catch{pending.delete(call.id);}
  }
  if(message.role==='tool'&&message.name==='skills'&&message.tool_call_id){
   if(typeof message.content==='string')observeSkillRead(coverage,message.content,pending.get(message.tool_call_id));
   pending.delete(message.tool_call_id);
  }
 }
 return coverage;
}
