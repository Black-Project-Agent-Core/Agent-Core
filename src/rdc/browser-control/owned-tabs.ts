import { randomUUID } from 'node:crypto';
import { redactSensitiveString } from '../../security/redaction.js';
export interface PageTarget {id:string;type:string;url:string;title:string;webSocketDebuggerUrl:string}
export function isPageUrl(value:string):boolean {
  try {const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;} catch{return false;}
}
export function safeTabUrl(value:string):string {
  if(value==='about:blank')return value;
  try {const u=new URL(value);u.username='';u.password='';u.search='';u.hash='';return redactSensitiveString(u.toString()).slice(0,600);}catch{return '';}
}
export async function listOwnedPageTargets(port:number):Promise<PageTarget[]> {
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('BROWSER_CONTROL_PORT_INVALID');
  const response=await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error('BROWSER_CONTROL_TARGET_LIST_UNAVAILABLE');
  const text=await response.text();if(text.length>1024*1024)throw new Error('BROWSER_CONTROL_TARGET_LIST_TOO_LARGE');
  const values=JSON.parse(text);if(!Array.isArray(values)||values.length>256)throw new Error('BROWSER_CONTROL_TARGET_LIST_INVALID');
  return values.filter((p:any)=>{
    if(p?.type!=='page'||typeof p.id!=='string'||p.id.length>256||typeof p.url!=='string'||p.url.length>8000||typeof p.webSocketDebuggerUrl!=='string')return false;
    try {const u=new URL(p.webSocketDebuggerUrl);return u.protocol==='ws:'&&['127.0.0.1','localhost'].includes(u.hostname)&&Number(u.port)===port&&u.pathname==='/devtools/page/'+p.id;}catch{return false;}
  }).map((p:any)=>({id:p.id,type:'page',url:p.url,title:String(p.title??''),webSocketDebuggerUrl:p.webSocketDebuggerUrl}));
}
export class OwnedTabs {
  private ids=new Map<string,string>();
  async inventory(port:number,active:string){
    const all=await listOwnedPageTargets(port),present=new Set(all.map(t=>t.id));
    for(const id of this.ids.keys())if(!present.has(id))this.ids.delete(id);
    const eligible=all.filter(t=>isPageUrl(t.url)||t.url==='about:blank').sort((a,b)=>a.id<b.id?-1:1);
    // Keep the active tab visible, then a stable bounded inventory of sibling page targets.
    eligible.sort((a,b)=>Number(b.id===active)-Number(a.id===active));
    const selected=eligible.slice(0,16);
    const entries=selected.map(target=>{let id=this.ids.get(target.id);if(!id){id=randomUUID();this.ids.set(target.id,id);}
      return {id,target,active:target.id===active,pending:target.url==='about:blank'};});
    return {entries,public:{state:'available',items:entries.map(e=>({id:e.id,title:redactSensitiveString(e.target.title).slice(0,200),
      url:safeTabUrl(e.target.url),active:e.active,pending:e.pending})),total:eligible.length,omitted:all.length-selected.length}};
  }
  async resolve(port:number,targetId:string,expectedUrl:string){
    const found=(await listOwnedPageTargets(port)).find(t=>t.id===targetId);
    if(!found)throw new Error('BROWSER_CONTROL_TAB_CLOSED');
    if(!this.ids.has(targetId)||found.url!==expectedUrl||!isPageUrl(found.url))throw new Error('BROWSER_CONTROL_TAB_CHANGED');
    return found;
  }
}
