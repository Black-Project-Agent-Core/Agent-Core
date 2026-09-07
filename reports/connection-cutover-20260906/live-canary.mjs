// Local, user-authorized post-repair canary. Uses the already registered key only on loopback.
// Never logs its value, creates OAuth grants, resets authorization, or calls external providers.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import path from 'node:path';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {loadConfig} from '../../dist/config.js';
import {verifyAuditJournal} from '../../dist/observability/audit-journal.js';
const root=process.cwd(),report='reports/connection-cutover-20260906/live-canary.json';
const c=loadConfig({},root),sha=b=>createHash('sha256').update(b).digest('hex');
const clients=[];const started=Date.now();const result={startedAt:new Date().toISOString(),transport:'loopback-only',authentication:'existing-bearer-api-key',actualChatGPTChatsTested:0,samples:[]};
function check(ok,code){if(!ok)throw Object.assign(new Error(code),{code});}
async function safeFetch(url){const r=await fetch(url,{signal:AbortSignal.timeout(8000)});check(r.ok,'HEALTH_HTTP_FAILURE');return r.json();}
async function connect(name,modern,key){const client=new Client({name,version:'1.0.0'},modern?{versionNegotiation:{mode:'auto'}}:undefined);clients.push(client);await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8765/mcp'),{authProvider:{token:async()=>key}}));return client;}
function identitySnapshot(text){const v=JSON.parse(text);return JSON.stringify({...v,keys:v.keys.map(({lastUsedAt,...record})=>record)});}
try{
 const key=(await readFile('secrets/agent-core-chatgpt-key.txt','utf8')).replace(/^\uFEFF/,'').trim();check(key.length>0,'REGISTERED_KEY_EMPTY');
 const beforeKeys=await readFile(path.join(c.dataDir,'keys.json'),'utf8');const beforeOauth=sha(await readFile(path.join(c.dataDir,'oauth.json')));
 const a=await connect('local-repair-legacy',false,key);const b=await connect('local-repair-modern',true,key);
 result.protocols=[a.getProtocolEra(),b.getProtocolEra()];check(result.protocols[0]==='legacy'&&result.protocols[1]==='modern','NEGOTIATION_FAILED');
 let calls=0;for(let i=0;i<6;i++){const statuses=await Promise.all([a,b].map(client=>client.callTool({name:'agent_core_status',arguments:{}})));check(statuses.every(s=>!s.isError&&s.structuredContent?.memory?.healthy&&s.structuredContent?.execution?.healthy),'MCP_STATUS_FAILED');calls+=2;}
 const listed=await b.listTools();result.toolCount=listed.tools.length;result.hasSubagentcore=listed.tools.some(t=>t.name==='subagentcore');
 await a.close();check(!(await b.callTool({name:'agent_core_status',arguments:{}})).isError,'PEER_CLOSE_BROKE_CLIENT');calls++;
 const next=await connect('local-repair-reconnect',false,key);check(!(await next.callTool({name:'agent_core_status',arguments:{}})).isError,'RECONNECT_FAILED');calls++;
 result.statusToolCalls=calls;result.peerCloseAndReconnect=true;
 const unauth=await fetch('http://127.0.0.1:8765/mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'unauth-canary',method:'tools/list',params:{}}),signal:AbortSignal.timeout(8000)});
 result.unauthorizedStatus=unauth.status;await unauth.text();check(unauth.status===401,'AUTH_GATE_DISABLED');
 for(let i=0;i<16;i++){
  const metrics=await safeFetch('http://127.0.0.1:8765/health/metrics');
  result.samples.push({at:new Date().toISOString(),overallHealth:metrics.overallHealth,memory:metrics.memory.healthy,execution:metrics.execution.healthy,auditWritten:metrics.audit.written,auditErrors:metrics.audit.writeErrors,sequence:metrics.audit.sequence,rotations:metrics.audit.rotatedFiles});
  check(metrics.memory.healthy&&metrics.execution.healthy&&metrics.audit.writeErrors===0,'POST_REPAIR_HEALTH_REGRESSION');
  if(i<15)await delay(2000);
 }
 const audit=await verifyAuditJournal(path.join(c.logDir,'audit'));check(audit.ok,'AUDIT_CHAIN_FAILED');result.audit=audit;
 const original=(await readFile('reports/connection-cutover-20260906/offline-deployment.json','utf8'));const migration=JSON.parse(original);
 const oldHead=migration.auditCopied.headHash;const oldSeq=migration.auditCopied.lastSequence;
 const current=(await readFile(path.join(c.logDir,'audit/audit.current.jsonl'),'utf8')).split('\n').filter(Boolean).map(l=>JSON.parse(l));
 const successor=current.find(r=>r.sequence===oldSeq+1);check(Boolean(successor&&successor.previousHash===oldHead),'AUDIT_CONTINUITY_NOT_PROVEN');
 result.firstNewSequence=successor.sequence;result.previousHeadLinked=true;
 const archives=(await readdir(path.join(c.logDir,'audit'))).filter(n=>n.startsWith('audit.1-'+oldSeq+'.'));
 check(archives.length===1,'ORIGINAL_AUDIT_SEGMENT_MISSING');result.originalAuditArchiveByteIdentical=sha(await readFile(path.join(c.logDir,'audit',archives[0])))===sha(await readFile('runtime/logs/audit/audit.current.jsonl'));check(result.originalAuditArchiveByteIdentical,'ORIGINAL_AUDIT_SEGMENT_CHANGED');
 result.keyIdentityUnchanged=identitySnapshot(beforeKeys)===identitySnapshot(await readFile(path.join(c.dataDir,'keys.json'),'utf8'));check(result.keyIdentityUnchanged,'KEY_IDENTITY_CHANGED');
 result.oauthFileUnchangedDuringCanary=beforeOauth===sha(await readFile(path.join(c.dataDir,'oauth.json')));
 result.status='PASS';result.finishedAt=new Date().toISOString();result.durationMs=Date.now()-started;
}catch(e){result.status='FAIL';result.failureCode=typeof e?.code==='string'?e.code:e?.name??'UNKNOWN';result.finishedAt=new Date().toISOString();process.exitCode=1;}
finally{for(const client of clients)await client.close().catch(()=>{});await writeFile(report,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));}