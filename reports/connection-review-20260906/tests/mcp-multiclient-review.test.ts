import {createServer,type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {afterEach,describe,expect,it} from 'vitest';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {FileKeyStore} from '../src/auth/key-store.js';
import {loadConfig} from '../src/config.js';
import {createHttpHandler} from '../src/http/app.js';
import {HttpSecurityPolicy} from '../src/http/security-policy.js';
import {createMcpHttpHandler} from '../src/mcp/handler.js';
import {OAuthService} from '../src/oauth/service.js';
import {FileOAuthStore} from '../src/oauth/store.js';
import {createRuntimeServices,type RuntimeServices} from '../src/runtime/services.js';
const roots:string[]=[];const servers:Server[]=[];const runtimes:RuntimeServices[]=[];const clients:Client[]=[];
afterEach(async()=>{
 for(const c of clients.splice(0))await c.close().catch(()=>{});
 for(const s of servers.splice(0))await new Promise<void>(resolve=>s.close(()=>resolve()));
 for(const r of runtimes.splice(0)){await r.telemetry.close();await r.execution.close();await r.memory.close();await r.operatorDirectives.close();}
 for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});
});
describe('Independent MCP clients using OAuth',()=>{
 it.each(['legacy','modern'] as const)('keeps %s clients usable after repeated calls, peer close, refresh and new connection',async era=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'agent-core-multiclient-review-'));roots.push(root);
  const keys=new FileKeyStore(path.join(root,'data'));const key=await keys.create('synthetic-review');
  const store=new FileOAuthStore(path.join(root,'data'));
  const registered=await store.registerClient({clientName:'review',redirectUris:['https://review.invalid/callback'],grantTypes:['authorization_code','refresh_token'],responseTypes:['code'],tokenEndpointAuthMethod:'client_secret_post'});
  const principal={clientId:registered.client_id,resource:'https://review.invalid/mcp',scopes:['mcp:tools'],keyId:key.metadata.id,keyName:'synthetic-review'};
  const a=await store.issueTokens(principal);const b=await store.issueTokens(principal);
  const security=new HttpSecurityPolicy({publicBaseUrl:'https://review.invalid',trustProxy:false,allowedOrigins:[]});
  const runtime=createRuntimeServices([root],path.join(root,'capabilities'),undefined,{...loadConfig({},root).memory,enabled:false});runtimes.push(runtime);
  const server=createServer(createHttpHandler({keyStore:keys,oauthService:new OAuthService(keys,store,security),security,auditLogger:{log:async()=>{}},mcpHandler:createMcpHttpHandler(runtime)}));
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));servers.push(server);const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  async function connect(name:string,token:string){const client=new Client({name,version:'1.0.0'},era==='modern'?{versionNegotiation:{mode:'auto'}}:undefined);clients.push(client);await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{authProvider:{token:async()=>token}}));expect(client.getProtocolEra()).toBe(era);return client;}
  const ca=await connect('review-client-a',a.accessToken);const cb=await connect('review-client-b',b.accessToken);
  for(let i=0;i<5;i++){
   const statuses=await Promise.all([ca,cb].map(c=>c.callTool({name:'agent_core_status',arguments:{}})));
   expect(statuses.every(s=>s.structuredContent?.authentication==='oauth2')).toBe(true);
   expect((await cb.listTools()).tools.some(t=>t.name==='agent_core_status')).toBe(true);
  }
  await ca.close();expect((await cb.callTool({name:'agent_core_status',arguments:{}})).isError).not.toBe(true);
  const response=await fetch(base+'/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:registered.client_id,client_secret:registered.client_secret,refresh_token:a.refreshToken,resource:principal.resource})});
  expect(response.status).toBe(200);const refreshed=await response.json();
  const cc=await connect('review-client-new-session',refreshed.access_token);
  expect((await cc.callTool({name:'agent_core_status',arguments:{}})).isError).not.toBe(true);
  expect((await cb.callTool({name:'agent_core_status',arguments:{}})).isError).not.toBe(true);
 });
});
