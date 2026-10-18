// Exact compiled registration/transport smoke: no target execution, memory or network mutation.
import {createHash} from 'node:crypto';
import {createAgentCoreMcpServer} from '../../dist/mcp/server.js';
import {AgentRuntimeToolSession} from '../../dist/agent-tool-session.js';
import {activityTracker} from '../../dist/tracker/activity-tracker.js';
import {resolveToolTerminals} from '../../dist/harness/reconstruction/receipt-adapter.js';
import {TOOL_INVOCATION_PROCESS_SESSION_ID} from '../../dist/tracker/tool-invocation.js';
import {fileURLToPath} from 'node:url';

function manifest(server){
  const registrations=server._registeredTools??server.registeredTools??{};
  const entries=registrations instanceof Map?[...registrations.entries()]:Object.entries(registrations);
  const tools=entries.map(([name,tool])=>({name,title:tool.title,description:tool.description,
    inputSchema:tool.inputSchema?.toJSONSchema?tool.inputSchema.toJSONSchema():{},
    annotations:tool.annotations??{}})).sort((a,b)=>a.name.localeCompare(b.name));
  return {names:tools.map(t=>t.name),count:tools.length,
    bytes:Buffer.byteLength(JSON.stringify({tools}),'utf8')};
}
const base={memoryService:{},learningService:{},semanticIde:{},skillsService:{},
  phoneController:{enabled:true},codeIntelligence:{},webResearch:{},artifactAuthorization:{}};
const publicCore=manifest(createAgentCoreMcpServer(undefined,base));
const nativeCore=manifest(createAgentCoreMcpServer(undefined,{...base,
  nativeTaskId:'rea-fixture-task',nativeWorkspace:'agent-core'}));
const externalFull=manifest(createAgentCoreMcpServer(undefined,{...base,
  memoryExperience:{},externalControllerLearning:{},controllerSessionId:'mock-session'}));
const report={cohort:'compiled-current',publicCore:{count:publicCore.count,bytes:publicCore.bytes,
  harness:publicCore.names.includes('reconstruction_harness')},
  nativeCore:{count:nativeCore.count,bytes:nativeCore.bytes,
  harness:nativeCore.names.includes('reconstruction_harness')},
  externalFull:{count:externalFull.count,bytes:externalFull.bytes,
    harness:externalFull.names.includes('reconstruction_harness'),
    within131072:externalFull.bytes<=131072}};
const session=await AgentRuntimeToolSession.open('rea-fixture-session',
  ['reconstruction_harness','read_file'],{nativeTaskId:'rea-fixture-task',nativeWorkspace:'agent-core'});
try {
  const preview=await session.call('reconstruction_harness',{action:'preview',manifest:{
    schemaVersion:1,coverage:'complete',
    claims:[{id:'claim.1',title:'Tool completed',kind:'tool-completion',
      requiredAuthority:'tool-terminal',obligationIds:['obl.1']}],
    obligations:[{id:'obl.1',claimId:'claim.1',required:true,ownerTool:'read_file',
      requiredCases:['positive'],dependsOn:[]}],selections:[],contradictions:[],
  }});
  const parsed=JSON.parse(preview.text);
  report.nativeToolCall={isError:preview.isError,status:parsed.status,algorithm:parsed.algorithmRevision};
  const read=await session.call('read_file',{
    path:fileURLToPath(new URL('../../package.json',import.meta.url)),offset:0,length:2,origin:'llm'});
  const terminals=activityTracker.readToolInvocationEvents({maxEvents:200,maxAgeMs:60_000});
  const terminal=terminals.filter(e=>e.kind==='tool-call'&&e.context?.taskId==='rea-fixture-task'
    &&e.context?.tool==='read_file').at(-1);
  const receiptRef=terminal?.context?.invocationId&&typeof terminal.context.invocationId==='string'
    ? 'tool:'+terminal.context.invocationId:'';
  const assessed=receiptRef?await session.call('reconstruction_harness',{action:'assess',manifest:{
    schemaVersion:1,coverage:'complete',
    claims:[{id:'claim.1',title:'Tool completed',kind:'tool-completion',
      requiredAuthority:'tool-terminal',obligationIds:['obl.1']}],
    obligations:[{id:'obl.1',claimId:'claim.1',required:true,ownerTool:'read_file',
      requiredCases:['positive'],dependsOn:[]}],
    selections:[{obligationId:'obl.1',caseKind:'positive',receiptRef}],contradictions:[],
  }}):null;
  const assessment=assessed&&!assessed.isError?JSON.parse(assessed.text):null;
  report.nativeRealReceipt={readSuccess:!read.isError,settledToolReceipt:!!receiptRef,
    assessedSuccess:assessed?.isError===false,status:assessment?.status??'unavailable',
    reason:assessment?.obligations?.[0]?.cases?.[0]?.reason??'no-case',
    evidenceKind:terminal?.kind??'missing',outcome:terminal?.context?.outcome??'missing',
    invocationSource:terminal?.context?.invocationSource??'missing',
    directMatched:receiptRef?resolveToolTerminals([receiptRef],{
      origin:'native',taskId:'rea-fixture-task',workspace:'agent-core',
      processSessionId:TOOL_INVOCATION_PROCESS_SESSION_ID},terminals).size:0,
    instanceDigestMatched:terminal?.context?.processInstanceDigest===('sha256:'+createHash('sha256').update(TOOL_INVOCATION_PROCESS_SESSION_ID).digest('hex')),
    receiptEventCount:terminal?.context?.invocationId?terminals.filter(e=>e.context?.invocationId===terminal.context.invocationId).length:0,
    freshAgeMs:terminal?.timestamp?Date.now()-Date.parse(terminal.timestamp):null};
  if(!nativeCore.names.includes('reconstruction_harness')||publicCore.names.includes('reconstruction_harness')
    ||externalFull.names.includes('reconstruction_harness')
    ||preview.isError||parsed.status!=='unknown'||read.isError
    ||!receiptRef||assessed?.isError||assessment?.status!=='ready')process.exitCode=2;
}finally{await session.close();}
console.log(JSON.stringify(report,null,2));