// Local visual regression harness. All host data here is a test fixture, never resident evidence.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer, preview } from '../../src/ui/node_modules/vite/dist/node/index.js';
import react from '../../src/ui/node_modules/@vitejs/plugin-react/dist/index.js';
import tailwind from '../../src/ui/node_modules/@tailwindcss/vite/dist/index.mjs';
import { transformSync } from '../../src/ui/node_modules/esbuild/lib/main.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const donor = process.argv[2] || path.resolve(root, '../Launcher');
const evidence = path.join(root, 'docs/verification');
const outputPrefix = process.env.AGENT_CORE_PARITY_PREFIX || 'Launcher-Prototype-';
if (!/^[A-Za-z0-9_-]+$/.test(outputPrefix)) throw Error('Invalid evidence filename prefix.');
const deps = path.join(root, 'src/ui/node_modules');
const chrome = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-win64/chrome-headless-shell.exe');
if (!fs.existsSync(chrome)) throw Error('Installed Chromium headless shell 1223 is required; no download is performed.');
const fixtureText = fs.readFileSync(path.join(root,'src/ui/src/App.test.tsx'),'utf8').match(/const onlineSnapshot: DesktopSnapshot = ([\s\S]*?\n};)/)?.[1];
if (!fixtureText) throw Error('Existing UI fixture not found.');
const context = { exports: {} };
vm.runInNewContext(transformSync('exports.snapshot = '+fixtureText,{loader:'ts'}).code,context);
const snapshot = JSON.parse(JSON.stringify(context.exports.snapshot));
snapshot.health.agentRuntime = {...snapshot.health.agentRuntime,status:'available',configuredProviderCount:1,providerCount:1};
snapshot.health.agentChat = {status:'available',conversationCount:1,activeConversationCount:1,runningTurnCount:0};
const profile = fs.mkdtempSync(path.join(os.tmpdir(),'agentcore-parity-'));
const pause = ms => new Promise(r => setTimeout(r,ms));
let donorServer, targetServer, browser, ws;
const errors = [], results = [], screenshots = [];
try {
  donorServer = await createServer({ configFile:false,envDir:false,root:donor,cacheDir:path.join(root,'runtime/tmp'),plugins:[react(),tailwind()],resolve:{alias:[...['react','react-dom','lucide-react'].map(name=>({find:name,replacement:path.join(deps,name)})),{find:'tailwindcss',replacement:path.join(deps,'tailwindcss/index.css')}]},optimizeDeps:{noDiscovery:true,include:['react','react/jsx-dev-runtime','react-dom/client','lucide-react']},server:{host:'127.0.0.1',port:18765,strictPort:true,fs:{allow:[donor,root]}} });
  await donorServer.listen();
  targetServer = await preview({configFile:false,envDir:false,root:path.join(root,'src/ui'),build:{outDir:'../../dist/ui'},preview:{host:'127.0.0.1',port:18766,strictPort:true}});
  browser = spawn(chrome,['--headless','--disable-gpu','--disable-background-networking','--remote-debugging-port=18768','--remote-debugging-address=127.0.0.1','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let targets;
  for(let i=0;i<60;i++){try{targets=await(await fetch('http://127.0.0.1:18768/json/list')).json();if(targets.length)break;}catch{}await pause(100);}
  if(!targets?.length) throw Error('Test browser did not start.');
  ws = new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let seq=0;
  const pending=new Map();
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text+': '+(m.params.exceptionDetails.exception?.description??''));};
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},10000);pending.set(id,m=>{clearTimeout(timer);m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result);});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
  const shot=async name=>{await pause(180);const {data}=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});const outputName=name.replace(/^Launcher-Prototype-/,outputPrefix);fs.writeFileSync(path.join(evidence,outputName+'.png'),Buffer.from(data,'base64'));screenshots.push(outputName);};
  const waitRoot=async()=>{for(let i=0;i<80;i++){if(await evaluate("document.querySelector('#root')?.children.length > 0"))return;await pause(100);}throw Error('UI did not mount');};
  const click=async(selector,label)=>evaluate(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>b.textContent.trim().startsWith(${JSON.stringify(label)})||b.getAttribute('aria-label')===${JSON.stringify(label)});if(!b)throw Error('Missing button: '+${JSON.stringify(label)});b.click();return true})()`);
  await call('Runtime.enable');await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:1202,height:811,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:'http://127.0.0.1:18765/'});await waitRoot();await pause(1500);
  await evaluate("document.querySelector('#root').firstElementChild.style.padding='0'");
  const donorState=await evaluate("import('/src/services/storage.ts').then(m=>m.getInitialState()).then(s=>({messages:s.messages}))");
  await shot('Launcher-Prototype-Reference-Workspace');
  for(const label of ['Dashboard','Tools Hub & MCP','AI Models','Memory Explorer','Dreaming Review','Goals & Plans','Artifacts','Core Runtime','Activity Log','Diagnostics & Recovery','Settings']){
    await click('aside button',label);await shot('Launcher-Prototype-Reference-'+label.replace(/[^a-z0-9]/gi,''));
  }
  const conversation={id:'fixture-chat',runtimeSessionId:'fixture-session',workspace:'agent-core',title:'Prototype comparison fixture',status:'active',createdAtMs:1,updatedAtMs:1};
  const detail={conversation,turns:[{id:'fixture-turn',conversationId:conversation.id,runtimeTaskId:'fixture-task',status:'finalized',createdAtMs:1,startedAtMs:1,reasoningEffort:'medium'}],messages:donorState.messages.filter(m=>m.sender==='user'||m.sender==='agent').map((m,i)=>({id:'fixture-message-'+i,conversationId:conversation.id,turnId:'fixture-turn',role:m.sender==='agent'?'assistant':'user',content:m.content,createdAtMs:1793238000000+i*60000}))};
  const init=`(()=>{const handlers=new Set();window.__fixtureRequests=[];window.__fixtureEmit=data=>handlers.forEach(h=>h({data}));window.chrome={webview:{addEventListener:(_,h)=>handlers.add(h),removeEventListener:(_,h)=>handlers.delete(h),postMessage:m=>{window.__fixtureRequests.push(m);setTimeout(()=>{const emit=window.__fixtureEmit;if(m.type==='ready')emit({type:'snapshot',snapshot:${JSON.stringify(snapshot)}});if(m.type==='agent-chat-list')emit({type:'agent-chat-list-result',result:{conversations:[${JSON.stringify(conversation)}]}});if(m.type==='agent-chat-providers')emit({type:'agent-chat-providers-result',result:{providers:[{id:'anthropic',model:'claude-sonnet-5-5',configured:true,available:true,models:[{id:'claude-opus-5-5',reasoningEfforts:['low','medium','high','max']}],reasoningEfforts:['low','medium','high','max']}]}});if(m.type==='proposals-get')emit({type:'proposals-result',requestId:m.requestId,result:{items:[],guides:[],warnings:[]}});if(m.type==='agent-chat-open')emit({type:'agent-chat-state',result:${JSON.stringify(detail)}});},0);}}};})()`;
  const changesFixture = {generatedAt:'2026-10-29T00:00:00Z',checkpointCount:1,requests:[],applied:{unchanged:0,truncated:false,items:[{path:'src/example.ts',state:'modified',before:{size:12},after:{size:24},otherCheckpointTasks:[],diff:{state:'text',text:'@@ -1 +1 @@\n-old value\n+new value',additions:1,deletions:1}}]},external:{state:'ok',items:[],total:0,truncated:false}};
  const changesInit = `;(()=>{const webview=window.chrome.webview;const original=webview.postMessage;let size={width:1202,height:811,defaultWidth:1202,defaultHeight:811,minWidth:320,minHeight:240,maxDimension:32767};webview.postMessage=m=>{if(m.type==='window-size-get'||m.type==='window-size-set'){window.__fixtureRequests.push(m);if(m.type==='window-size-set')size={...size,width:m.width,height:m.height};setTimeout(()=>window.__fixtureEmit({type:'window-size-state',requestId:m.requestId,size}),0);return;}if(m.type!=='task-changes-get')return original(m);window.__fixtureRequests.push(m);setTimeout(()=>window.__fixtureEmit({type:'task-changes-result',requestId:m.requestId,result:{...${JSON.stringify(changesFixture)},taskId:m.taskId}}),0);};})()`;
  await call('Page.addScriptToEvaluateOnNewDocument',{source:init+changesInit});
  await call('Page.navigate',{url:'http://127.0.0.1:18766/'});await waitRoot();await pause(400);
  await shot('Launcher-Prototype-Target-Empty');
  await evaluate(`window.__fixtureEmit({type:'agent-chat-state',result:${JSON.stringify(detail)}})`);await pause(100);
  await shot('Launcher-Prototype-Target-Workspace');
  await click('button','Show actual changes');await pause(150);
  if(!await evaluate("document.querySelector('.task-changes-popover [role=region]:not([hidden])')?.textContent.includes('src/example.ts')"))throw Error('Task changes preview did not render its fixture evidence.');
  if(!await evaluate("(()=>{const r=document.querySelector('.task-changes-popover [role=region]').getBoundingClientRect();const h=document.querySelector('.task-changes-popover-heading').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth&&h.top>=0})()"))throw Error('Task changes preview is outside the viewport.');
  await shot('Launcher-Prototype-Target-ModifiedFiles');
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  if(await evaluate("Boolean(document.querySelector('.task-changes-popover [role=region]:not([hidden])'))"))throw Error('Escape failed to close task changes preview.');
  await click('button','Composer actions');await shot('Launcher-Prototype-Target-Composer');await click('button','Composer actions');
  await click('button','Edit Window Size');await shot('Launcher-Prototype-Target-WindowSize');
  if(!await evaluate("document.querySelector('dialog[open] input[aria-label=\"Window width\"]')?.value==='1202'"))throw Error('Window size dialog did not load the native fixture dimensions.');
  await click('dialog button','Compact (1024 × 768)');await pause(150);
  if(!await evaluate("document.querySelector('dialog[open] input[aria-label=\"Window width\"]')?.value==='1024' && window.__fixtureRequests.some(x=>x.type==='window-size-set'&&x.width===1024&&x.height===768)"))throw Error('Window size preset did not send and show the selected dimensions.');
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  if(await evaluate("Boolean(document.querySelector('dialog[open]'))"))throw Error('Escape failed to close the dialog.');
  for(const [hash,label] of [['dashboard','Dashboard'],['systems','Tools Hub & MCP'],['models','AI Models'],['memory','Memory Explorer'],['learning','Dreaming Review'],['goals','Goals & Plans'],['artifacts','Artifacts'],['core','Core Runtime'],['activity','Activity Log'],['diagnostics','Diagnostics & Recovery'],['settings','Settings'],['wizard','Setup Wizard']]){
    await evaluate(`location.hash=${JSON.stringify(hash)}`);await pause(100);await shot('Launcher-Prototype-Target-'+label.replace(/[^a-z0-9]/gi,''));
    results.push(await evaluate(`({page:${JSON.stringify(hash)},heading:document.querySelector('main h1')?.textContent,overflow:document.documentElement.scrollWidth>innerWidth,root:document.querySelector('#root').children.length})`));
  }
  for(const width of [320,768,1024,1440]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
    for(const hash of ['chat','dashboard','systems','models','goals','settings']){
      await evaluate(`location.hash=${JSON.stringify(hash)}`);await pause(60);
      results.push(await evaluate(`({page:${JSON.stringify(hash)},width,overflow:document.documentElement.scrollWidth>innerWidth,root:document.querySelector('#root').children.length})`.replace('width,','width:'+width+',')));
    }
    await evaluate("location.hash='chat'");await shot('Launcher-Prototype-Target-Responsive-'+width);
    if(width===320){
      await click('button','Show actual changes');await pause(150);
      if(!await evaluate("(()=>{const r=document.querySelector('.task-changes-popover [role=region]').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth})()"))throw Error('Narrow task changes preview is outside the viewport.');
      await shot('Launcher-Prototype-Target-ModifiedFilesNarrow');
      await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
      await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    }
  }
  const report={generatedAt:new Date().toISOString(),kind:'synthetic-ui-fixture-not-resident-evidence',referenceRoot:donor,viewport:[1202,811],screenshots,errors,results};
  fs.writeFileSync(path.join(evidence,outputPrefix+'Browser-Checks.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({screenshots:screenshots.length,checks:results.length,errors,failed:results.filter(r=>r.overflow||r.root!==1)}));
  if(errors.length||results.some(r=>r.overflow||r.root!==1))process.exitCode=1;
} catch(error) {
  console.error(JSON.stringify({error:error.message,browserErrors:errors}));process.exitCode=1;
} finally {
  ws?.close();browser?.kill();await donorServer?.close();targetServer?.httpServer.close();
  // Keep the owned temp browser profile for failure diagnosis; never touch real browser profiles.
}
