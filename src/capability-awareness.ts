import { createHash } from 'node:crypto';
import { AGENT_CAPABILITY_CATALOG } from './agent-capability-catalog.js';
import { redactSensitiveString } from './security/redaction.js';
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
 'code.intelligence':'Code Intelligence', 'code.modify':'Code Intelligence', 'semantic.ide':'Semantic IDE',
 'web.research':'Web Research', 'browser.navigate':'Browser Control', 'browser.act':'Browser Control',
 'phone.observe':'Phone Control', 'phone.act':'Phone Control', 'process.execute':'Process Execution', 'process.admin':'Process Execution',
};
export function buildCapabilityExposure(input: { availableTools?: readonly string[]; artifacts: CapabilityArtifact[]; owners: Record<string,string> }) {
 const known = Array.isArray(input.availableTools);
 const names = [...new Set(input.availableTools ?? [])].filter(n => /^[A-Za-z0-9_-]{1,128}$/.test(n)).sort();
 const available = new Set(names);
 const mapped = new Set(AGENT_CAPABILITY_CATALOG.flatMap(f => f.tools.map(t=>t.name)));
 const families: CapabilityDescriptor[] = AGENT_CAPABILITY_CATALOG.map(f => {
  const memberTools = f.tools.map(t=>t.name).filter(n=>available.has(n));
  return { capabilityId:'family:'+f.family, kind:'tool-family', displayName:CAPABILITY_LABELS[f.family] ?? f.family,
   description:f.description, revision:hash([f,memberTools]), availability:known ? memberTools.length ? 'available' : 'unavailable' : 'unknown',
   availabilityBasis:'registered-tools-only; connection/effectiveness not established', memberTools,
   disclosurePolicy:CAPABILITY_LABELS[f.family] ? 'grouped-family' : 'silent-internal', sourceOwner:'MCP / AGENT_CAPABILITY_CATALOG' };
 });
 const artifacts: CapabilityDescriptor[] = input.artifacts.map(a=>({capabilityId:a.kind+':'+a.id,kind:a.kind,
  displayName:clean(a.id,200),description:clean(a.description,500),revision:a.revision,
  availability:'available',availabilityBasis:'owner-catalog; exposure is not use',
  disclosurePolicy:'announce-on-material-use',sourceOwner:a.kind==='skill'?'SkillService':'LearningService'}));
 const inventory = [...families,...artifacts];
 const counts = { 'tool-family':families.length, skill:artifacts.filter(a=>a.kind==='skill').length,
  pattern:artifacts.filter(a=>a.kind==='pattern').length, procedure:artifacts.filter(a=>a.kind==='procedure').length };
 const tools = {status:known?'observed':'unknown',count:names.length,unclassified:names.filter(n=>!mapped.has(n))};
 const revision = hash([names,inventory,input.owners]);
 const lines = ['CAPABILITY EXPOSURE — registered inventory, not a permission grant or usage claim.',
  'revision='+revision+' | counts='+JSON.stringify(counts),
  'Tools='+tools.status+' | count='+names.length+' | unclassified='+tools.unclassified.join(','),
  'Owners='+JSON.stringify(input.owners)+' | host plugins=unknown (no host registration bridge).',
  'Discover omitted Skills with skills(list/inspect); use task-relevant descriptors below.'];
 let used=lines.join('\n').length, shown=0;
 for(const item of inventory) {
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
 if(['code_graph','code_surface','code_analysis','code_patterns','code_repair','code_refactor'].includes(name))family='code.intelligence';
 else if(name==='code_orient' && args.action!=='status')family='code.intelligence';
 else if(name==='code_workspace' && !['list','resolve','status','refs'].includes(String(args.action)))family='code.intelligence';
 else if(name==='code_symbol' && args.action!=='status')family='semantic.ide';
 else if(['web_search','web_open'].includes(name))family='web.research';
 else if(name==='browser_control' && args.action!=='status' || name==='read_file' && args.isUrl===true)family='browser.navigate';
 else if(name.startsWith('phone_') && name!=='phone_status' && name!=='phone_list_named_actions')family='phone.act';
 else if(['start_process','interact_with_process','kill_process','force_terminate'].includes(name))family='process.execute';
 if(!family)return null;
 const purposes:Record<string,string>={'code.intelligence':'menelusuri struktur dan hubungan kode','semantic.ide':'memeriksa simbol dan referensi kode','web.research':'mencari serta membaca sumber web','browser.navigate':'berinteraksi dengan halaman yang relevan','phone.act':'mengerjakan langkah pada perangkat','process.execute':'menjalankan langkah proses yang relevan'};
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
  const values=Array.isArray(value)?value:[value];
  return values.slice(0,500).filter(v=>v && typeof v.name==='string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v.name)
   && v.name.length<=64 && typeof v.digest==='string' && /^sha256:[a-f0-9]{64}$/.test(v.digest))
   .map(v=>({name:v.name,digest:v.digest}));
 }catch{return [];}
}
