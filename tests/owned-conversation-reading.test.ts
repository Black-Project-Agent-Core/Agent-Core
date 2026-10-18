import {createServer} from 'node:http';
import {afterEach,expect,it} from 'vitest';
import {BrowserControlService} from '../src/rdc/browser-control/service.js';
import {browserControl,externalBrowserControl} from '../src/mcp/rdc-schemas.js';

const cleanups:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{while(cleanups.length)await cleanups.pop()!();});
const CHAT='https://chatgpt.com/c/owned-reading-synthetic';
async function fixture(html:string){
 const server=createServer((_req,res)=>res.end('<!doctype html><body>isolated fixture'));
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 cleanups.push(()=>new Promise<void>(r=>server.close(()=>r())));
 const service=new BrowserControlService();
 const opened=await service.open(`http://127.0.0.1:${(server.address() as any).port}`,true),id=String(opened.sessionId);
 const session=(service as any).sessions.get(id),client=session.client;
 session.openBrowserUse={background:true,closed:false,assertForeground:async()=>{}};
 cleanups.push(async()=>{delete session.openBrowserUse;await service.close(id);});
 const original=client.onEvent;
 client.onEvent=(method:string,params:any)=>{
   original?.(method,params);
   if(method==='Fetch.requestPaused')void client.send('Fetch.fulfillRequest',{requestId:params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html; charset=utf-8'}],body:Buffer.from('<!doctype html><body>'+html).toString('base64')});
 };
 await client.send('Fetch.enable',{patterns:[{urlPattern:'https://chatgpt.com/*',requestStage:'Request'}]});
 await client.send('Page.navigate',{url:CHAT});
 const evaluate=async(expression:string)=>(await client.send('Runtime.evaluate',{expression,returnByValue:true})).result?.value;
 for(let i=0;i<100;i++){if(await evaluate(`location.href===${JSON.stringify(CHAT)}&&document.readyState==='complete'`))break;await new Promise(r=>setTimeout(r,20));}
 const commands:string[]=[];const send=client.send.bind(client);
 client.send=(method:string,params:any)=>{commands.push(method);return send(method,params);};
 return {service,id,evaluate,commands,client,read:(read?:any)=>service.conversation(id,'conversation_read',read?{read}:{})};
}
const turn=(id:string,role:string,text:string)=>`<article data-message-id="${id}" data-message-author-role="${role}"><div class="${role==='user'?'whitespace-pre-wrap':'markdown'}">${text}</div></article>`;

it('indexes every loaded turn beyond80 and reconstructs a long message including its tail',async()=>{
 const long='Long answer '+('abc😀 '.repeat(7000))+' FINAL-TAIL-SENTINEL';
 const h=await fixture(Array.from({length:105},(_,i)=>turn('id'+i,i%2?'assistant':'user',i===104?long:'Turn '+i)).join(''));
 let index:any=await h.read({kind:'index'}),all:any[]=[...index.messages];
 expect(index.coverage.completeHistory).toBe(false);
 while(index.nextCursor){index=await h.read({kind:'index',cursor:index.nextCursor});all.push(...index.messages);}
 expect(all).toHaveLength(105);expect(all[0].role).toBe('user');
 const ref=all.at(-1).messageRef;let body='',offset=0;
 for(let i=0;i<10;i++){const page:any=await h.read({kind:'message',messageRef:ref,offset});body+=page.text;if(page.eof)break;expect(page.nextOffset).toBeGreaterThan(offset);offset=page.nextOffset;}
 expect(body.trim()).toBe(long);expect(body).not.toContain('\ufffd');
},30_000);

it('rejects a changed tail and leaves composer, focus and scroll untouched while reading code',async()=>{
 const code='    first line\n\n\tsecond line  \n';
 const h=await fixture('<div contenteditable="true" id="prompt-textarea">Human draft remains</div>'+turn('long','assistant','x'.repeat(16000)+'<pre><code>'+code+'</code></pre>TAIL-OLD'));
 await h.evaluate(`document.querySelector('#prompt-textarea').focus();window.scrollTo(0,0)`);
 const before=await h.evaluate(`JSON.stringify([document.activeElement.id,scrollX,scrollY,document.querySelector('#prompt-textarea').textContent])`);
 const index:any=await h.read({kind:'index'}),ref=index.messages[0].messageRef;
 const first:any=await h.read({kind:'message',messageRef:ref});expect(first.nextOffset).toBeGreaterThan(0);
 await h.evaluate(`document.querySelector('[data-message-id="long"] .markdown').lastChild.textContent='TAIL-NEW'`);
 await expect(h.read({kind:'message',messageRef:ref,offset:first.nextOffset})).rejects.toThrow(/STALE|CHANGED/);
 const next:any=await h.read({kind:'index'});let text='',offset=0;
 for(let i=0;i<5;i++){const p:any=await h.read({kind:'message',messageRef:next.messages[0].messageRef,offset});text+=p.text;if(p.eof)break;offset=p.nextOffset;}
 expect(text).toContain(code);expect(text).toContain('TAIL-NEW');
 expect(await h.evaluate(`JSON.stringify([document.activeElement.id,scrollX,scrollY,document.querySelector('#prompt-textarea').textContent])`)).toBe(before);
 expect(h.commands.some(m=>m.startsWith('Input.')||m==='Page.bringToFront'||m==='Page.navigate')).toBe(false);
},30_000);

it('rejects foreign refs, index continuation after branch changes, and refs after navigation/reload',async()=>{
 const h=await fixture(Array.from({length:30},(_,i)=>turn('id'+i,'user','Turn '+i)).join(''));
 const index:any=await h.read({kind:'index'}),ref=index.messages[0].messageRef;
 await expect(h.read({kind:'message',messageRef:'foreign-ref'})).rejects.toThrow(/REF|STALE|INVALID/);
 await h.evaluate(`document.querySelector('article').remove()`);
 await expect(h.read({kind:'index',cursor:index.nextCursor})).rejects.toThrow(/STALE|CHANGED/);
 await h.client.send('Page.navigate',{url:'https://chatgpt.com/c/other-synthetic'});
 await new Promise(r=>setTimeout(r,100));
 await expect(h.read({kind:'message',messageRef:ref})).rejects.toThrow(/STALE|CHANGED/);
 const fresh:any=await h.read({kind:'index'});expect(fresh.url).toBe('https://chatgpt.com/c/other-synthetic');
 await h.client.send('Page.reload');await new Promise(r=>setTimeout(r,100));
 await expect(h.read({kind:'message',messageRef:fresh.messages[0].messageRef})).rejects.toThrow(/STALE|CHANGED/);
},30_000);

it('reads modern role evidence and reports unsupported content without guessing author order',async()=>{
 const h=await fixture(`<nav>${turn('sidebar','user','Not the conversation')}</nav>
   <div data-user-message-bubble><div class="whitespace-pre-wrap">Modern user</div></div>
   <section data-chatgpt-selection-conversation-id="owned-reading-synthetic" data-chatgpt-selection-message-id="modern-answer"><div data-markdown-text-style><div class="markdown">Paragraph one</div></div><div data-markdown-text-style>Paragraph two</div></section>
   <div class="markdown">Unattributed formatting</div><div id="prompt-textarea" contenteditable="true">Private draft</div>`);
 const index:any=await h.read({kind:'index'});
 expect(index.messages.map((m:any)=>m.role)).toEqual(['user','assistant']);
 let text='';for(const m of index.messages){const p:any=await h.read({kind:'message',messageRef:m.messageRef});text+=p.text;}
 expect(text).toContain('Modern user');expect(text).toContain('Paragraph one');expect(text).toContain('Paragraph two');
 expect(text).not.toMatch(/Private draft|Unattributed formatting|Not the conversation/);
 expect(index.coverage.completeHistory).toBe(false);
},30_000);

it('rejects same-content author changes while hashing without mixing the old role',async()=>{
 const h=await fixture(turn('one','assistant','Identical text'));
 const index:any=await h.read({kind:'index'});
 await h.evaluate(`(()=>{const digest=crypto.subtle.digest.bind(crypto.subtle);let once=true;crypto.subtle.digest=async(...args)=>{const result=await digest(...args);if(once){once=false;document.querySelector('article').setAttribute('data-message-author-role','user');}return result;};})()`);
 await expect(h.read({kind:'message',messageRef:index.messages[0].messageRef})).rejects.toThrow(/STALE|CHANGED/);
},30_000);

it('returns unassigned app-turn text as unknown author while excluding unrelated formatting',async()=>{
 const h=await fixture(`<main aria-label="Conversation"><div data-content-search-turn-key="fallback-turn-9"><div data-talvt-turn-state="in_progress">
  <h4 class="sr-only">You said:</h4><div data-user-message-bubble><div class="whitespace-pre-wrap">Question one</div></div>
  <div><div data-markdown-text-style>Unassigned paragraph one</div><div data-markdown-text-style>Unassigned paragraph two</div></div>
 </div></div><div class="markdown">Unrelated format</div></main>`);
 const index:any=await h.read({kind:'index'});
 expect(index.messages.map((m:any)=>m.role)).toEqual(['user','unknown']);
 const body:any=await h.read({kind:'message',messageRef:index.messages[1].messageRef});
 expect(body.role).toBe('unknown');expect(body.text).toContain('Unassigned paragraph one');expect(body.text).toContain('Unassigned paragraph two');
 expect(body.text).not.toMatch(/Question one|Unrelated format/);
 expect(index.coverage.truncated).toBe(true);
 await h.evaluate(`(()=>{const part=document.querySelector('[data-markdown-text-style]');part.replaceWith(part.cloneNode(true));})()`);
 await expect(h.read({kind:'message',messageRef:index.messages[1].messageRef})).rejects.toThrow(/STALE|CHANGED/);
},30_000);

it('invalidates refs across a SPA navigation round trip to the same visible document',async()=>{
 const h=await fixture(turn('one','user','Stable content'));
 const index:any=await h.read({kind:'index'});
 await h.evaluate(`history.pushState(null,'','/c/other-synthetic');history.pushState(null,'','/c/owned-reading-synthetic')`);
 await expect(h.read({kind:'message',messageRef:index.messages[0].messageRef})).rejects.toThrow(/STALE|CHANGED/);
},30_000);

it('waits for a real conversation URL and keeps unchanged turns readable while the human types',async()=>{
 const h=await fixture(turn('stable','user','Stable turn')+'<div id="prompt-textarea" contenteditable="true">Draft</div>');
 await h.client.send('Page.navigate',{url:'https://chatgpt.com/'});await new Promise(r=>setTimeout(r,80));
 const empty:any=await h.read({kind:'index'});expect(empty.status).toBe('no-conversation');
 await h.client.send('Page.navigate',{url:CHAT});await new Promise(r=>setTimeout(r,80));
 const index:any=await h.read({kind:'index'});
 await h.evaluate(`document.querySelector('#prompt-textarea').textContent+=' typing'`);
 const body:any=await h.read({kind:'message',messageRef:index.messages[0].messageRef});expect(body.text).toContain('Stable turn');
 await expect(h.service.conversation(h.id,'conversation_draft',{url:CHAT,text:'Do not send',revision:1})).rejects.toThrow('READ_ONLY');
},30_000);

it('exposes paged selectors externally and rejects wrong actions/mixed legacy cursors',()=>{
 const sessionId=crypto.randomUUID();
 expect(externalBrowserControl.safeParse({action:'conversation_read',sessionId,read:{kind:'index'}}).success).toBe(true);
 expect(externalBrowserControl.safeParse({action:'conversation_read',sessionId,read:{kind:'message',messageRef:'observed-ref',offset:12000}}).success).toBe(true);
 for(const args of [
   {action:'observe',sessionId,read:{kind:'index'}},
   {action:'conversation_read',sessionId,read:{kind:'index',offset:1}},
   {action:'conversation_read',sessionId,read:{kind:'message'}},
   {action:'conversation_read',sessionId,read:{kind:'message',messageRef:'x',offset:-1}},
   {action:'conversation_read',sessionId,sinceRevision:0,read:{kind:'index'}},
   {action:'conversation_read',sessionId,read:{kind:'index',selector:'body'}},
 ])expect(externalBrowserControl.safeParse(args).success).toBe(false);
 expect(browserControl.safeParse({action:'conversation_read',sessionId,read:{kind:'index'}}).success).toBe(false);
});
