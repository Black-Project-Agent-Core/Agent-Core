import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it } from 'vitest';
import { createHttpHandler } from '../src/http/app.js';
import { FileKeyStore } from '../src/auth/key-store.js';
const servers:Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(s=>new Promise<void>(r=>s.close(()=>r()))));});
async function setup(){let calls=0;const server=createServer(createHttpHandler({keyStore:new FileKeyStore('/unused'),mcpHandler:async()=>{},agentUiToken:'secret-ui-token',workflows:()=>{calls++;return {status:'ready',html:'<html>canvas</html>',limitations:[]};}}));servers.push(server);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));return {url:`http://127.0.0.1:${(server.address() as AddressInfo).port}/agent/workflows`,calls:()=>calls};}
it('requires existing UI token and returns cached workflow only after authentication',async()=>{
 const {url,calls}=await setup();expect((await fetch(url)).status).toBe(401);expect(calls()).toBe(0);
 const response=await fetch(url,{headers:{'x-agent-core-ui-token':'secret-ui-token'}});expect(response.status).toBe(200);expect(await response.json()).toMatchObject({status:'ready'});expect(calls()).toBe(1);
});
it('rejects unexpected methods before requesting a canvas',async()=>{
 const {url,calls}=await setup();const response=await fetch(url,{method:'POST',headers:{'x-agent-core-ui-token':'secret-ui-token'}});expect(response.status).toBe(405);expect(calls()).toBe(0);
});
