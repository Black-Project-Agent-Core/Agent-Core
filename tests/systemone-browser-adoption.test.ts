import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { BrowserControlService } from '../src/rdc/browser-control/service.js';
const servers: Server[] = [];
const sessions: Array<{service: BrowserControlService; id:string}> = [];
afterEach(async () => {
  while (sessions.length) { const x=sessions.pop()!; await x.service.close(x.id).catch(()=>undefined); }
  while (servers.length) await new Promise<void>(resolve=>servers.pop()!.close(()=>resolve()));
},30000);
async function page(html:(url:string)=>string) {
  const s=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html(req.url??'/'));});
  await new Promise<void>(resolve=>s.listen(Number(process.env.AGENT_CORE_BROWSER_TEST_PORT ?? 0),'127.0.0.1',resolve)); servers.push(s);
  return 'http://127.0.0.1:'+(s.address() as any).port;
}
async function opened(url:string, capabilities:string[]=[]) {
  const service=new BrowserControlService();
  const o=await (service as any).open(url,true,{interactionCapabilities:capabilities});
  const id=String(o.sessionId);sessions.push({service,id});return {s:service as any,id};
}
async function evaluate(s:any,id:string,expression:string) {
  return s.sessions.get(id).client.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
}
const choose=(o:any,op:string,predicate:(a:any)=>boolean=()=>true)=>{
  const a=o.actions.find((a:any)=>a.operation===op&&predicate(a));expect(a,'observed '+op).toBeTruthy();return a;
};
const canvasPage='<!doctype html><body><canvas id="picture" width="640" height="320"></canvas><canvas hidden width="10" height="10"></canvas></body>';
describe('SystemOne native browser adoption',()=>{
  it('P1 independently observes selected-only/readonly/disabled controls without secret values',async()=>{
    const url=await page(()=>`<!doctype html><body><select aria-label="Only"><option selected>Only selection</option></select>
      <input aria-label="Read only" readonly value="readable"><input aria-label="Disabled" disabled value="visible disabled">
      <input aria-label="Duplicate" value="one"><input aria-label="Duplicate" value="two">
      <input id="mixed" type="checkbox" aria-label="Mixed">
      <input type="password" value="never-leak-password"><input type="hidden" value="never-leak-hidden">
      <textarea hidden>never-leak-hidden-text</textarea><input type="file" aria-label="File"></body>`);
    const {s,id}=await opened(url); await evaluate(s,id,'mixed.indeterminate=true'); const o=await s.observe(id);
    expect(o.controlStates).toBeDefined(); const items=o.controlStates.items;
    expect(items.find((x:any)=>x.label==='Only')).toMatchObject({selectedLabels:['Only selection']});
    expect(items.find((x:any)=>x.label==='Read only')).toMatchObject({value:'readable',readOnly:true});
    expect(items.find((x:any)=>x.label==='Disabled')).toMatchObject({value:'visible disabled',disabled:true});
    expect(items.find((x:any)=>x.label==='Mixed').checked).toBe('mixed');
    expect(new Set(items.filter((x:any)=>x.label==='Duplicate').map((x:any)=>x.id)).size).toBe(2);
    expect(JSON.stringify(o)).not.toContain('never-leak');
    expect(o.actions.some((x:any)=>x.label==='Disabled')).toBe(false);
  },30000);
  it('P1 budgets records/text and reports omission without losing default actions',async()=>{
    const url=await page(()=>'<body>'+Array.from({length:150},(_,i)=>`<input style="width:20px;height:10px" aria-label="${'L'.repeat(550)}${i}" value="${'x'.repeat(600)}">`).join('')+'</body>');
    const {s,id}=await opened(url);const o=await s.observe(id);
    expect(o.controlStates).toBeDefined();expect(o.controlStates.items.length).toBeLessThanOrEqual(128);
    expect(JSON.stringify(o.controlStates).length).toBeLessThanOrEqual(8000);
    expect(o.controlStates.omitted).toBeGreaterThan(0);expect(o.controlStates.truncated).toBe(true);
    expect(o.actions.length).toBeLessThanOrEqual(250);
  },30000);
  it('P2 samples only a previously inventoried canvas and preserves named rare colors',async()=>{
    const url=await page(()=>canvasPage); const {s,id}=await opened(url);
    await evaluate(s,id,'const c=picture.getContext("2d");c.fillStyle="#5599ff";c.fillRect(0,0,640,320);c.fillStyle="#cc4400";c.fillRect(0,240,640,80);c.fillStyle="#ff0000";c.fillRect(100,200,40,40);');
    const normal=await s.observe(id); expect(normal.canvas).toBeUndefined();
    const inv=await s.observe(id,{canvas:{mode:'inventory'}});
    expect(inv.canvas?.state).toBe('available');expect(inv.canvas.items).toHaveLength(1);
    const sample=await s.observe(id,{canvas:{mode:'sample',canvasId:inv.canvas.items[0].id,columns:32,rows:16,paletteSize:3,labels:{'#ff0000':'operator-marker'}}});
    expect(sample.canvas.state).toBe('available');expect(sample.canvas.grid).toHaveLength(16);
    expect(sample.canvas.grid.every((x:string)=>x.length===32)).toBe(true);
    expect(sample.canvas.source).toMatchObject({width:640,height:320});
    expect(sample.canvas.labels[0]).toMatchObject({label:'operator-marker',status:'matched'});
    expect(sample.canvas.lossy).toBe(true);expect(JSON.stringify(sample.canvas).length).toBeLessThanOrEqual(20000);
    await evaluate(s,id,'picture.width=320');
    const stale=await s.observe(id,{canvas:{mode:'sample',canvasId:inv.canvas.items[0].id}});
    expect(stale.canvas.state).toBe('unavailable');expect(stale.actions.length).toBeGreaterThan(0);
  },30000);
  it('P2 rejects foreign IDs, invalid bounds and treats transparent pixels explicitly',async()=>{
    const url=await page(()=>'<body><canvas id="picture" width="32" height="16"></canvas></body>');
    const a=await opened(url), b=await opened(url);
    const inv=await a.s.observe(a.id,{canvas:{mode:'inventory'}});expect(inv.canvas).toBeDefined();
    const foreign=await b.s.observe(b.id,{canvas:{mode:'sample',canvasId:inv.canvas.items[0].id}});
    expect(foreign.canvas.state).toBe('unavailable');
    const sample=await a.s.observe(a.id,{canvas:{mode:'sample',canvasId:inv.canvas.items[0].id}});
    expect(sample.canvas.palette.some((p:any)=>p.alpha===0)).toBe(true);
    await expect(a.s.observe(a.id,{canvas:{mode:'sample',canvasId:inv.canvas.items[0].id,columns:129}})).rejects.toThrow();
  },30000);
  it('P3 scopes observations to one task-created tab and refuses foreign action IDs',async()=>{
    const url=await page(()=>'<body>Task<button>Continue</button></body>');
    const a=await opened(url),b=await opened(url);
    const first=await a.s.observe(a.id),second=await b.s.observe(b.id);
    expect(first.tabs.scope).toBe('task-created-tab');expect(first.tabs.items).toHaveLength(1);
    expect(second.tabs.items[0].id).not.toBe(first.tabs.items[0].id);
    expect(first.actions.some((x:any)=>x.operation==='SWITCH_TAB')).toBe(false);
    await expect(a.s.act(a.id,second.observationId,choose(second,'CLICK').id)).rejects.toThrow(/OBSERVATION/);
  },30000);
  it('P4 is opt-in, binds key actions to focus and releases a bounded held key',async()=>{
    const url=await page(()=>'<body><input id="field"><input id="other"><input id="secret" type="password"><p id="out"></p></body>');
    const off=await opened(url);let o=await off.s.observe(off.id);expect(o.actions.some((a:any)=>/KEY/.test(a.operation))).toBe(false);
    const {s,id}=await opened(url,['keyboard','held-key','history']);await evaluate(s,id,'out.textContent="";document.addEventListener("keydown",e=>out.textContent+="down:"+e.key+";");document.addEventListener("keyup",e=>out.textContent+="up:"+e.key+";");field.focus()');
    o=await s.observe(id);const key=choose(o,'PRESS_KEY',a=>a.key==='Escape');
    await evaluate(s,id,'other.focus()');await expect(s.act(id,o.observationId,key.id)).rejects.toThrow(/STALE|FOCUS/);
    o=await s.observe(id);await s.act(id,o.observationId,choose(o,'PRESS_KEY',a=>a.key==='Escape').id);
    o=await s.observe(id);expect(o.text).toContain('down:Escape;up:Escape;');
    const hold=choose(o,'HOLD_KEY',a=>a.key==='ArrowRight'&&a.durationMs===150);
    expect(o.actions.filter((a:any)=>a.operation==='HOLD_KEY').every((a:any)=>a.durationMs<=800)).toBe(true);
    await s.act(id,o.observationId,hold.id);o=await s.observe(id);expect(o.text).toContain('down:ArrowRight;up:ArrowRight;');
    await evaluate(s,id,'secret.focus()');o=await s.observe(id);expect(o.actions.some((a:any)=>/KEY/.test(a.operation))).toBe(false);
  },30000);
  it('P4 history back targets observed same-session history and leaves a new observation',async()=>{
    const url=await page(u=>u.includes('next')?'<body>NEXT</body>':'<body>START<a href="/next">Next</a></body>');
    const {s,id}=await opened(url,['history']);let o=await s.observe(id);
    await s.act(id,o.observationId,choose(o,'CLICK',a=>a.label==='Next').id);o=await s.observe(id);
    const back=choose(o,'BACK');await s.act(id,o.observationId,back.id);
    o=await s.observe(id);expect(o.text).toContain('START');
  },30000);
});

import { vi } from 'vitest';
import { KeyboardActions, PRESS_KEYS, HOLD_KEYS, HOLD_DURATIONS } from '../src/rdc/browser-control/keyboard-actions.js';
import { CanvasObserver, canvasOptionsSchema, projectRaster } from '../src/rdc/browser-control/canvas-observation.js';
import { browserControl } from '../src/mcp/rdc-schemas.js';
import { BrowserControlArgsSchema } from '../src/rdc/tools/schemas.js';
import { handleBrowserControl } from '../src/rdc/handlers/browser-control-handlers.js';
import { browserControlService } from '../src/rdc/browser-control/service.js';
it.each(PRESS_KEYS)('P4 dispatches exactly one down/up pair for %s',async key=>{
  const send=vi.fn(async()=>({}));await new KeyboardActions().execute({send},key);
  expect(send.mock.calls.map((x:any)=>x[1].type)).toEqual(['keyDown','keyUp']);
});
it('P4 rejects arbitrary keys/durations and reports uncertain transport without replay',async()=>{
  const input=new KeyboardActions(),send=vi.fn(async()=>({}));
  for(const [key,duration] of [['Control+V',0],['ArrowLeft',801],['a',0],['Enter',150]])
    await expect(input.execute({send},String(key),Number(duration))).rejects.toThrow(/KEY_INVALID/);
  expect(send).not.toHaveBeenCalled();
  const broken=vi.fn(async()=>{throw new Error('transport-lost');});
  await expect(input.execute({send:broken},'Escape')).rejects.toThrow('MUTATION_UNCERTAIN');
  expect(broken.mock.calls.map((x:any)=>x[1].type)).toEqual(['keyDown','keyUp']);
});
it('P4 close interrupts a held key with one idempotent release',async()=>{
  const input=new KeyboardActions(),send=vi.fn(async()=>({}));
  const pending=input.execute({send},'ArrowRight',800);
  const assertion=expect(pending).rejects.toThrow('INPUT_CANCELLED');
  await Promise.resolve();await input.close();await assertion;
  expect(send.mock.calls.map((x:any)=>x[1].type)).toEqual(['keyDown','keyUp']);
});
it('P2 contracts reject selector injection and excessive grid/palette/labels',()=>{
  for(const args of [{mode:'inventory',selector:'canvas'},{mode:'sample'},{mode:'sample',canvasId:'bad'},
    {mode:'sample',canvasId:'00000000-0000-4000-8000-000000000001',rows:65},
    {mode:'sample',canvasId:'00000000-0000-4000-8000-000000000001',paletteSize:17},
    {mode:'sample',canvasId:'00000000-0000-4000-8000-000000000001',columns:NaN},
    {mode:'sample',canvasId:'00000000-0000-4000-8000-000000000001',paletteSize:2,labels:{'#ff0000':'r','#00ff00':'g','#0000ff':'b'}}])
    expect(canvasOptionsSchema.safeParse(args).success).toBe(false);
});
it('P2 taint/resize/document errors are unavailable, not successful empty rasters',async()=>{
  const observer=new CanvasObserver(),doc=[1,'http://fixture/'];
  const inventory=await observer.observe(async()=>({documentKey:doc,total:1,items:[{node:1,width:10,height:10}]}),doc,'target',{mode:'inventory'});
  const id=(inventory as any).items[0].id;
  const tainted=await observer.observe(async()=>({error:'canvas-tainted'}),doc,'target',{mode:'sample',canvasId:id});
  expect(tainted).toMatchObject({state:'unavailable',reason:'canvas-tainted'});
  const changed=await observer.observe(async()=>{throw new Error('must not read pixels');},[2,'http://fixture/'],'target',{mode:'sample',canvasId:id});
  expect(changed).toMatchObject({state:'unavailable',reason:'canvas-id-not-current'});
});
it('P2 reports a named colour absent rather than claiming an object and keeps palette deterministic',()=>{
  const raster={width:4,height:1,pixels:[255,0,0,255,0,0,255,255,255,0,0,255,0,0,0,0]};
  const options:any={mode:'sample',columns:4,rows:1,paletteSize:2,labels:{'#00ff00':'claimed-object'}};
  const a=projectRaster(raster,options),b=projectRaster(raster,options);
  expect(a).toEqual(b);expect(a.labels[0].status).toBe('absent');expect(a.palette.some((p:any)=>p.alpha===0)).toBe(true);
});
it('public and handler schemas agree on browser option validity',()=>{
  const id='00000000-0000-4000-8000-000000000001';
  const inputs=[{action:'open',url:'http://fixture',interactionCapabilities:['keyboard','held-key','history']},
    {action:'observe',sessionId:id,canvas:{mode:'inventory'}},{action:'observe',sessionId:id,canvas:{mode:'sample',canvasId:id,columns:128,rows:64,paletteSize:16}},
    {action:'open',url:'http://fixture',canvas:{mode:'inventory'}},{action:'observe',sessionId:id,interactionCapabilities:['keyboard']},
    {action:'open',url:'http://fixture',interactionCapabilities:['keyboard','keyboard']},
    {action:'observe',sessionId:id,canvas:{mode:'sample',canvasId:id,rows:65}},
    {action:'observe',sessionId:id,canvas:{mode:'inventory',selector:'secret'}}];
  expect(inputs.map(x=>browserControl.safeParse(x).success)).toEqual([true,true,true,false,false,false,false,false]);
  for(const x of inputs)expect(browserControl.safeParse(x).success).toBe(BrowserControlArgsSchema.safeParse(x).success);
});
it('actual handler passes new options to the existing singleton',async()=>{
  const open=vi.spyOn(browserControlService,'open').mockResolvedValue({sessionId:'fixture'});
  const observe=vi.spyOn(browserControlService,'observe').mockResolvedValue({canvas:{state:'available'}});
  const assertOwner=vi.spyOn(browserControlService,'assertOwner').mockReturnValue();
  try{
    const a=await handleBrowserControl({action:'open',url:'http://fixture',interactionCapabilities:['keyboard']});
    expect(a.isError).not.toBe(true);expect(open).toHaveBeenCalledWith('http://fixture',true,{interactionCapabilities:['keyboard']});
    const b=await handleBrowserControl({action:'observe',sessionId:'fixture',canvas:{mode:'inventory'}});
    expect(b.isError).not.toBe(true);expect(observe).toHaveBeenCalledWith('fixture',{canvas:{mode:'inventory'}});
  }finally{open.mockRestore();observe.mockRestore();assertOwner.mockRestore();}
});
it('P4 timing boundary releases at the hold deadline even while keyDown acknowledgement is delayed',async()=>{
  vi.useFakeTimers();let finishDown!:(v:any)=>void;
  const send=vi.fn((_method:string,params:any)=>params.type==='keyDown'?new Promise(resolve=>{finishDown=resolve;}):Promise.resolve({}));
  try{
    const pending=new KeyboardActions().execute({send},'ArrowRight',150);
    await vi.advanceTimersByTimeAsync(150);
    const atDeadline=send.mock.calls.map(x=>x[1].type);
    finishDown({});await vi.advanceTimersByTimeAsync(150);await pending;
    expect(atDeadline).toEqual(['keyDown','keyUp']);
  }finally{vi.useRealTimers();}
});
it('P2 document identity is explicit and distinct across document generations',async()=>{
  const observer=new CanvasObserver(),doc=[1,'http://fixture/'];
  const inventory=await observer.observe(async()=>({documentKey:doc,total:0,items:[]}),doc,'target',{mode:'inventory'});
  expect((inventory as any).documentId).toMatch(/^sha256:[a-f0-9]{64}$/);
  const nextDoc=[2,'http://fixture/'];
  const next=await observer.observe(async()=>({documentKey:nextDoc,total:0,items:[]}),nextDoc,'target',{mode:'inventory'});
  expect((next as any).documentId).not.toBe((inventory as any).documentId);
});
it('P2 projection rejects zero-grid and overlarge palette bounds before raster work',()=>{
  expect(()=>projectRaster({width:10,height:10,pixels:[]},{mode:'sample',columns:0,rows:1} as any)).toThrow();
  expect(()=>projectRaster({width:10,height:10,pixels:[255,0,0,255]},{mode:'sample',columns:1,rows:1,paletteSize:17} as any)).toThrow();
});
