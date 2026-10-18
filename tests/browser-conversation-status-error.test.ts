import {afterEach, expect, it} from 'vitest';
import {ExtensionBrowserClient} from '../src/rdc/browser-control/extension-bridge.js';
const URL='https://chatgpt.com/c/status-fixture', ORIGIN='chrome-extension://'+'a'.repeat(32);
const clients:ExtensionBrowserClient[]=[];
afterEach(()=>{for(const c of clients.splice(0))c.close();});
const coverage={kind:'loaded-visible-DOM-window',completeHistory:false,truncated:true,observedAt:'2026-10-18T00:00:00Z'};
async function reply(action:'conversation_read'|'conversation_status',value:unknown){
  const c=new ExtensionBrowserClient(URL,1000,Date.now,'conversation');clients.push(c);
  const token=c.pair(c.code,ORIGIN,7,URL);await c.poll(ORIGIN,token,[],[],undefined,0);
  const result=c.conversation(action);const batch:any=await c.poll(ORIGIN,token,[],[],undefined,0);
  await c.poll(ORIGIN,token,[{id:batch.commands[0].id,result:value}],[],undefined,0);
  return result;
}
for(const state of [{paused:true,error:null},{paused:false,error:'DOM_UNSUPPORTED'},{paused:true,error:'Debugger timeout; result unknown'}]){
  it('status current=false for '+JSON.stringify(state),async()=>{
    const out=await reply('conversation_status',{url:URL,revision:0,busy:false,...state,coverage,draft:null,receipt:null});
    expect(out).toMatchObject({current:false,connectionState:'attached',revision:0,...state,coverage});
  });
}
it('read preserves a schema-valid error with initial revision and coverage',async()=>{
  const out=await reply('conversation_read',{url:URL,revision:0,busy:false,paused:false,error:'DOM_UNSUPPORTED',coverage,changed:false,reset:false,messages:[],windowExits:[]});
  expect(out).toMatchObject({current:false,revision:0,messages:[],error:'DOM_UNSUPPORTED',coverage});
});
it('healthy status remains current',async()=>{
  expect(await reply('conversation_status',{url:URL,revision:1,busy:false,paused:false,error:null,coverage,draft:null,receipt:null})).toMatchObject({current:true,revision:1});
});
const diagnostic={schema:1,diagnosticRevision:'userbody-structure-v1',targetMatches:true,mainFrame:true,
  readyState:'complete',visibility:'visible',counts:{role:0,candidate:0,markdown:0,userBody:14,turnRole:0,iframes:1},
  userBodyStructure:{selector:'.whitespace-pre-wrap',matched:14,sampled:0,complete:false,roleInferred:false,idsRedacted:true,nodes:[],paths:[],limits:{matches:16,ancestors:12,nodes:96,structureChars:16000},referenceScope:'this-report-only-not-message-identity'},
  samples:[],shadowSample:{visited:0,openShadowRoots:0,tags:[],complete:false},elapsedMs:1,budgetReached:false,contentIncluded:false};
for(const action of ['conversation_read','conversation_status'] as const){
  it(action+' forwards bounded structural diagnostics on an error',async()=>{
    const value={url:URL,revision:0,busy:false,paused:false,error:'DOM_UNSUPPORTED',coverage,diagnostics:diagnostic,
      ...(action==='conversation_read'?{changed:false,reset:false,messages:[],windowExits:[]}:{draft:null,receipt:null})};
    expect(await reply(action,value)).toMatchObject({current:false,error:'DOM_UNSUPPORTED',diagnostics:diagnostic});
  });
}
it('diagnostics cannot carry arbitrary page text or unknown fields',async()=>{
  await expect(reply('conversation_status',{url:URL,revision:0,busy:false,paused:false,error:'DOM_UNSUPPORTED',coverage,draft:null,receipt:null,
    diagnostics:{...diagnostic,pageText:'UNAUTHORIZED_PAGE_DUMP'}})).rejects.toThrow('RESULT_INVALID');
});