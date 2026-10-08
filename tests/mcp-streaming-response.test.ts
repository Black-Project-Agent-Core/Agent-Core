import { describe, expect, it, vi, afterEach } from 'vitest';
import * as rpc from '../src/mcp/streamable-http.js';
import { readResponseTextBounded } from '../src/net/bounded-response.js';
import { GatewayTransport } from '../src/phone/gateway.js';
const opt={expectedId:1,maxBytes:1048576,maxFrameBytes:1048576};
// RED uses the actual existing buffered reader/parser chain, not a copied parser.
const read=(r:Response,o=opt):Promise<any>=>typeof (rpc as any).readJsonRpcHttpResponse==='function'?(rpc as any).readJsonRpcHttpResponse(r,o):readResponseTextBounded(r,o.maxBytes).then(t=>rpc.parseJsonRpcHttpResponse(t,r.headers.get('content-type')??''));
const env=(id:any=1,result:any={ok:true})=>({jsonrpc:'2.0',id,result});
const frame=(o:any,eol='\n')=>'data: '+JSON.stringify(o)+eol+eol;
function stream(text:string,{open=false,split=false,type='text/event-stream',status=200}={}){
 const bytes=new TextEncoder().encode(text);let controller!:ReadableStreamDefaultController<Uint8Array>; const cancel=vi.fn();
 const body=new ReadableStream<Uint8Array>({start(c){controller=c;if(split){for(const b of bytes)c.enqueue(Uint8Array.of(b));}else c.enqueue(bytes);if(!open)c.close();},cancel});
 return {response:new Response(body,{status,headers:{'content-type':type}}),cancel,finish(){try{controller.close();}catch{}}};
}
afterEach(()=>vi.restoreAllMocks());
describe('TS7-P1 bounded correlated response reader',()=>{
 it('returns before EOF and cancels the owned reader once',async()=>{
  const f=stream(frame(env()),{open:true});try{expect(await Promise.race([read(f.response),new Promise(r=>setTimeout(()=>r('WAITED_FOR_EOF'),100))])).toEqual(env());expect(f.cancel).toHaveBeenCalledTimes(1);expect(f.response.body!.locked).toBe(false);}finally{f.finish();}
 });
 it.each(['\n','\r\n','\r'])('retains byte-split Unicode and %j frames',async eol=>{
  const f=stream(': comment'+eol+frame(env(1,{text:'😀漢字'}),eol),{split:true});expect(await read(f.response)).toEqual(env(1,{text:'😀漢字'}));expect(f.response.body!.locked).toBe(false);
 });
 it('returns first matching result, not a later different response',async()=>{const f=stream(frame(env(2))+frame(env())+frame(env(3)));expect(await read(f.response)).toEqual(env());});
 it('does not coerce numeric and string response ids',async()=>{const f=stream(frame(env('1')));await expect(read(f.response)).rejects.toThrow();});
 it('ignores result-like notification params',async()=>{const f=stream(frame({jsonrpc:'2.0',method:'notifications/progress',params:{result:'fake'}})+frame(env()));expect(await read(f.response)).toEqual(env());});
 it.each([{id:1,result:{}},{jsonrpc:'1.0',id:1,result:{}},{jsonrpc:'2.0',id:1,result:{},error:{}},{jsonrpc:'2.0',id:false,result:{}},{jsonrpc:'2.0',result:{}}])('rejects malformed envelope %j',async value=>{await expect(read(stream(frame(value)).response)).rejects.toThrow();});
 it('matching RPC error is sanitized, not returned as success',async()=>{await expect(read(stream(frame({jsonrpc:'2.0',id:1,error:{code:-1,message:'PRIVATE_RESPONSE_PAYLOAD'}})).response)).rejects.toThrow(/MCP_JSONRPC_ERROR/);});
 it('unscoped protocol error fails explicitly',async()=>{await expect(read(stream(frame({jsonrpc:'2.0',id:null,error:{code:-32700,message:'private'}})).response)).rejects.toThrow(/UNSCOPED/);});
 it('unfinished SSE frame is not invented at EOF',async()=>{await expect(read(stream('data: '+JSON.stringify(env())+'\n').response)).rejects.toThrow();});
 it('multiline data and trailing incomplete frame cannot replace success',async()=>{const f=stream('data: {"jsonrpc":"2.0",\ndata: "id":1,"result":42}\n\ndata: {');expect(await read(f.response)).toEqual(env(1,42));});
 it.each(['maxBytes','maxFrameBytes'])('%s overflow cancels and releases once',async key=>{const f=stream(frame(env(1,'X'.repeat(1000))),{open:true});try{await expect(read(f.response,{...opt,[key]:80})).rejects.toThrow(/exceed|LIMIT/i);expect(f.cancel).toHaveBeenCalledTimes(1);expect(f.response.body!.locked).toBe(false);}finally{f.finish();}});
 it('caller abort interrupts a pending read without payload leakage',async()=>{const f=stream(':ping\n',{open:true}), controller=new AbortController();const p=read(f.response,{...opt,signal:controller.signal} as any);controller.abort('PRIVATE_REASON');try{const outcome=await Promise.race([p.catch(e=>String(e)),new Promise(r=>setTimeout(()=>r('NO_ABORT'),100))]);expect(outcome).toMatch(/ABORT/);expect(outcome).not.toContain('PRIVATE');expect(outcome).not.toBe('NO_ABORT');expect(f.cancel).toHaveBeenCalledTimes(1);}finally{f.finish();}});
 it('plain JSON validates matching id',async()=>{expect(await read(stream(JSON.stringify(env()),{type:'application/json'}).response)).toEqual(env());await expect(read(stream(JSON.stringify(env(9)),{type:'application/json'}).response)).rejects.toThrow();});
 it('non-2xx response never returns a result or raw body',async()=>{await expect(read(stream(JSON.stringify(env(1,'PRIVATE_RESPONSE_PAYLOAD')),{type:'application/json',status:503}).response)).rejects.toThrow(/HTTP/);});
 it('gateway consumes matching response once with an open stream',async()=>{
  let f:ReturnType<typeof stream>|undefined;const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{const id=JSON.parse(String(init?.body)).id;f=stream(frame(env(id,{structuredContent:{online:true}})),{open:true});return f.response;});
  const gateway=new GatewayTransport({url:'http://127.0.0.1/not-contacted'} as any,'synthetic',{} as any);
  try{const status:any=await Promise.race([gateway.status(),new Promise(r=>setTimeout(()=>r({online:false,late:true}),150))]);expect(status.online).toBe(true);expect(fetch).toHaveBeenCalledTimes(1);expect(f!.cancel).toHaveBeenCalledTimes(1);}finally{f?.finish();}
 });
});
