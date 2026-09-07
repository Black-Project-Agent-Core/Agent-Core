import {readFile,writeFile,stat} from 'node:fs/promises';import {createHash} from 'node:crypto';
const out='reports/connection-review-20260906';
const rows=(await readFile('runtime/logs/audit/audit.current.jsonl','utf8')).split('\n').filter(Boolean).map(l=>JSON.parse(l));
const http=rows.filter(r=>r.category==='http'&&r.data?.route).map(r=>({at:r.timestamp,method:r.data.method,route:r.data.route,status:r.data.status}));
const metrics=await(await fetch('http://127.0.0.1:8765/health/metrics')).json();
const health=await(await fetch('http://127.0.0.1:8765/health')).json();
const metadata=await(await fetch('http://127.0.0.1:8765/.well-known/oauth-protected-resource/mcp')).json();
const oauth=JSON.parse(await readFile('runtime/data/oauth.json','utf8'));
const fresh=oauth.accessTokens.filter(t=>Date.parse(t.expiresAt)>Date.now());
const auditStat=await stat('runtime/logs/audit/audit.current.jsonl');
const stats={};for(const r of http){const key=r.route+' '+r.status;stats[key]=(stats[key]??0)+1;}
const evidence={capturedAt:new Date().toISOString(),projectRoot:process.cwd(),gitHead:'6b674c1f95a677dea5cb57263bb5b8b863faff5b',live:{service:health.service,version:health.version,status:health.status,memoryHealthy:health.memory.healthy,executionHealthy:health.execution.healthy,overallHealth:metrics.overallHealth},oauth:{clients:oauth.clients.length,accessTokens:oauth.accessTokens.length,unexpiredAccess:fresh.length,unexpiredResourceMatches:fresh.filter(t=>t.resource===metadata.resource).length,resourceIsSecureTunnel:new URL(metadata.resource).pathname.startsWith('/v1/mcp/'),activeRefresh:oauth.refreshTokens.filter(t=>!t.revokedAt&&Date.parse(t.expiresAt)>Date.now()).length},audit:{...metrics.audit,firstPersistedAt:rows[0]?.timestamp,lastPersistedAt:rows.at(-1)?.timestamp,fileBytes:auditStat.size,fileMtime:auditStat.mtime.toISOString(),parsedRows:rows.length,httpStats:stats,recentTokenExchanges:http.filter(r=>r.route==='/oauth/token').slice(-15),recentMcpAuthFailures:http.filter(r=>r.route==='/mcp'&&r.status===401).slice(-15)},confirmedRoutingObservation:{code:'WORKSPACE_PROJECT_AMBIGUOUS',trigger:'One route request quoted three configured roots while also specifying projectRoot',workaround:'Retried with only target project path in task/context; succeeded',isTransportFailure:false},limitations:['No independent new ChatGPT chat was created','Historical log has a persistence gap; its 401s do not identify token failure reasons','No production source or dist changes; candidate remains isolated','In-process queue is not a cross-process lock','Persistence rename fallback still has in-place-write crash risks']};
await writeFile(out+'/diagnostics.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
const selections={
 'src/oauth/store.ts':/async (registerClient|issueTokens|consumeCode|consumeRefreshToken|resetAuthorizationState)|private async (load|save)|await this.save/,
 'src/oauth/service.ts':/authenticateAccessToken|principal.resource|consumeRefreshToken|consumeCode|sendTokens|issueTokens/,
 'src/mcp/handler.ts':/sessionIdGenerator|createAgentCoreMcpServer|finally|teardown|webHandler.close/,
 'src/runtime/persistent-file.ts':/rename\(|writeFile\(|REPLACE_BLOCKED/,
 'src/runtime/workspace.ts':/evidence.add|haystack.includes|evidence.size|WORKSPACE_PROJECT_AMBIGUOUS/,
 'src/observability/audit-journal.ts':/rotate|rotation|currentFileBytes|rename|writeErrors|lastWriteErrorCode|currentPath|currentFilePath/,
 'src/http/app.ts':/unauthorized|request.completed|auditLogger.log|status: response.statusCode/,
 'scripts/windows/agent-core-tray.ps1':/function Resolve-AgentCoreOAuthProtectedResourceUrl|AGENT_CORE_OAUTH_PROTECTED_RESOURCE_URL =/};
let findings='';for(const [file,pattern] of Object.entries(selections)){const lines=(await readFile(file,'utf8')).split('\n');findings+='\n## '+file+'\n'+lines.map((s,i)=>({s,i})).filter(x=>pattern.test(x.s)).map(x=>`${x.i+1}: ${x.s.trimEnd()}`).join('\n')+'\n';}
await writeFile(out+'/source-findings.txt',findings);console.log(findings);