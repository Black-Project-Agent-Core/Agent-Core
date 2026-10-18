import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../../../anatomy/kit/iso-kit.mjs";
import { kitScript } from "../../../../anatomy/scripts/inline-kit.mjs";

const HERE=dirname(fileURLToPath(import.meta.url));
const W=1230,H=760;
const BASE={x:-248,y:-166,w:500,d:336,r:13};
const P=k.fitProjection([...k.boxCorners(BASE,-20,0),[-202,-143,106],[212,-143,113],[222,141,100],[-212,141,100]],W,H,{pad:75,azimuth:42,elevation:32});
const slab=(p,z,h,tone="mid",lit=false)=>k.solidSvg(k.slabOf(p,z,h,P,6,Math.min(h/5,.8)),{tone,lit});
const disk=(x,y,r,z,h,tone="mid",lit=false)=>k.solidSvg(k.cylinder(x,y,r,z,h,P,36,Math.min(h/4,.6)),{tone,lit});
const wire=(points,tone="lo",flow=false)=>k.lineSvg(k.onTop(points,1.2,P),{tone,flow,free:true});
const line=(d,tone="lo")=>k.lineSvg(d,{tone,free:true});
const dot=(pts,z,tone="hi",size=.5)=>k.dotsSvg(pts.map(([x,y])=>k.iso([x,y,z],P)),{size,tone});
const bolts=(pts,z)=>line(pts.map(([x,y])=>k.ring(x,y,2,z,P,18)).join(""),"lo")+dot(pts,z);
const zone=(id,title,at,html)=>({id,at,html:'<g data-zone="'+id+'" class="machine-zone"><title>'+title+'</title>'+html+'</g>'});
function chassis(){
 const out=['<path class="iso-halo" d="'+k.haloOf(BASE,-20,14,P)+'"/>'];
 for(const [x,y] of k.corners(BASE,18).sort((a,b)=>k.depthOf([a[0],a[1],0],P)-k.depthOf([b[0],b[1],0],P))){out.push(disk(x,y,8,-20,5,"lo"),disk(x,y,5,-15,4,"mid"));}
 out.push(slab(BASE,-12,12,"mid"),line(k.planOutline(k.insetPlan(BASE,8),0,P),"faint"),bolts(k.corners(BASE,12),0));
 for(let x=-216;x<=212;x+=12)out.push(disk(x,152,1.3,0,1.1,"lo"));
 for(const [a,b] of [[[-126,-91],[-52,-23]],[[0,-124],[0,-46]],[[140,-88],[50,-25]],[[160,32],[55,5]],[[136,102],[46,43]],[[-142,106],[-43,42]],[[-169,14],[-50,6]]]){
  const dx=b[0]-a[0],dy=b[1]-a[1],mid=[a[0]+dx*.55,a[1]];
  out.push(wire([a,mid,b],"blue",true));
  out.push(disk(a[0],a[1],2.4,1,1.2,"hi"),disk(b[0],b[1],2.1,1,1.2,"hi"));
 }
 out.push(slab({x:-228,y:149,w:459,d:5,r:1},0,1.3,"lo"));
 const ruler=k.topTicks(-211,212,10,5,150,1.4,[1,2.4],P);
 out.push(line(ruler.minor,"lo"),line(ruler.major,"mid"));
 return out.join("");
}
function center(){
 const o=[disk(0,0,51,0,8,"mid"),disk(0,0,44,8,5,"lo"),line(k.ring(0,0,42,13,P,64),"hi")];
 for(let i=0;i<16;i++){const a=i*Math.PI/8,xy=[Math.cos(a)*37,Math.sin(a)*37];o.push(disk(xy[0],xy[1],2.1,13,2,"mid"));}
 o.push('<g data-part="core-piston">'+disk(0,0,32,13,17,"mid",true)+disk(0,0,25,30,6,"hi",true)+line(k.ring(0,0,18,36,P,56),"hi")+disk(0,0,13,36,9,"hi",true)+disk(0,0,7,45,5,"mid",true)+'</g>');
 for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){const x=Math.cos(a)*48,y=Math.sin(a)*48;o.push(disk(x,y,4,5,8,"lo"),disk(x,y,2.6,13,2,"hi"));}
 return zone("core","Central controller & policy nucleus",[0,0],o.join(""));
}
function memory(){
 const o=[],box={x:-224,y:-146,w:100,d:86,r:5};
 o.push(slab(box,0,13,"mid"),slab(box,13,54,"mid"),slab({x:-220,y:-141,w:91,d:77,r:4},67,4,"hi"));
 for(let row=0;row<4;row++){const z=18+row*12;
  const d=[slab({x:-222,y:-144,w:96,d:10,r:1.3},z,7,"mid"),line(k.lineOnTop([-209,-140],[-158,-140],z+7,P),"faint"),disk(-180,-138,2.2,z+7,1.1,"hi")].join("");
  o.push('<g data-part="drawer-'+row+'">'+d+'</g>');
 }
 for(let i=0;i<8;i++)o.push(disk(-212+i*11,-75,1.2,13,1.2,i%3===0?"hi":"lo"));
 o.push(bolts(k.corners(box,8),67));
 return zone("memory","Canonical Markdown & experience-v2 archive",[-171,-102],o.join(""));
}
function code(){
 const o=[],base={x:-77,y:-147,w:102,d:83,r:6};
 o.push(slab(base,0,14,"mid"),slab({x:-72,y:-143,w:93,d:76,r:3},14,4,"lo"));
 const loc=[];for(let row=0;row<3;row++)for(let col=0;col<3;col++)loc.push([-63+32*col,-132+29*row]);
 for(const [a,b] of [[0,1],[1,2],[0,3],[1,4],[2,5],[3,4],[4,5],[3,6],[4,7],[5,8],[6,7],[7,8],[0,4],[4,8]])o.push(line(k.lineOnTop(loc[a],loc[b],18,P),a%2?"blue":"green"));
 loc.forEach(([x,y],i)=>o.push(disk(x,y,6,18,i===4?12:6,i===4?"hi":"mid",i===4)));
 o.push(slab({x:-69,y:-139,w:5,d:69,r:1},14,2,"hi"));
 return zone("code","Grafel code graph & semantic IDE",[-27,-101],o.join(""));
}
function verification(){
 const o=[],b={x:111,y:-147,w:105,d:88,r:5};
 o.push(slab(b,0,12,"mid"),slab({x:117,y:-141,w:93,d:77,r:4},12,3,"lo"));
 for(const y of [-133,-77])o.push(slab({x:119,y,w:88,d:5,r:1},15,5,"hi"));
 for(let i=0;i<8;i++){const x=123+i*11;o.push(disk(x,-104,1.8,15,1.5,i%2?"lo":"hi"));}
 o.push('<g data-part="scanner">'+slab({x:149,y:-128,w:16,d:56,r:2},20,12,"hi",true)+disk(157,-102,9,32,4,"mid",true)+disk(157,-102,3.3,36,2,"hi",true)+'</g>');
 o.push(bolts(k.corners(b,8),12));
 return zone("verify","Evidence scanner & source verification",[163,-101],o.join(""));
}
function interfaces(){
 const o=[],b={x:115,y:-13,w:107,d:86,r:5};
 o.push(slab(b,0,13,"mid"),slab({x:120,y:-8,w:98,d:76,r:4},13,4,"lo"));
 for(let row=0;row<3;row++)for(let col=0;col<3;col++){
  const x=137+26*col,y=2+23*row;
  o.push(slab({x:x-8,y:y-6,w:17,d:15,r:2},17,4,"mid",row===1&&col===1));
  o.push(disk(x,y,3,21,2,"hi",row===1&&col===1));
 }
 o.push('<g data-part="io-tower">'+slab({x:121,y:52,w:18,d:13,r:1},17,25,"hi")+disk(130,59,5,42,4,"hi")+'</g>');
 return zone("interfaces","MCP interfaces, browser and external tools",[167,30],o.join(""));
}
function learning(){
 const o=[],b={x:109,y:87,w:108,d:67,r:5};
 o.push(slab(b,0,13,"mid"),slab({x:115,y:92,w:96,d:55,r:3},13,4,"lo"));
 for(const [x,y] of [[141,118],[184,118]]){
  o.push(disk(x,y,16,17,9,"mid"),line(k.ring(x,y,12,26,P,40),"lo"));
  const tk=k.radialTicks(x,y,12,30,5,26,[.5,1.8],P);o.push(line(tk.minor,"faint"),line(tk.major,"hi"));
  o.push(disk(x,y,5,26,3,"hi",true));
 }
 o.push('<g data-part="learn-piston">'+slab({x:148,y:105,w:30,d:5,r:1},29,9,"hi")+disk(165,108,3,38,3,"mid")+'</g>');
 o.push(bolts(k.corners(b,8),13));
 return zone("learning","Checkpoint, review and verified promotion",[163,118],o.join(""));
}
function machine(){
 const o=[],b={x:-224,y:83,w:132,d:71,r:5};
 o.push(slab(b,0,12,"mid"),slab({x:-218,y:89,w:120,d:58,r:3},12,4,"lo"));
 for(const y of [94,134])o.push(slab({x:-216,y,w:113,d:5,r:1},16,5,"hi"));
 o.push(slab({x:-211,y:96,w:7,d:39,r:1},21,18,"mid"));
 o.push(slab({x:-118,y:96,w:7,d:39,r:1},21,18,"mid"));
 o.push('<g data-part="gantry">'+slab({x:-188,y:94,w:44,d:41,r:3},37,7,"hi")+slab({x:-171,y:105,w:12,d:20,r:2},44,21,"mid")+disk(-165,115,6,65,5,"hi",true)+'</g>');
 o.push(disk(-200,143,6,16,8,"mid"),line(k.knurl(-200,143,6,19,24,24,P),"lo"));
 return zone("machine","Machine control, process, files & GUI",[-160,118],o.join(""));
}
function governance(){
 const o=[],b={x:-223,y:-10,w:108,d:85,r:4};
 o.push(slab(b,0,13,"mid"),slab({x:-218,y:-5,w:97,d:75,r:3},13,3,"lo"));
 for(let i=0;i<4;i++){
  o.push(slab({x:-208+i*2,y:7+i*3,w:64,d:44,r:1.5},16+i*5,3,i===3?"hi":"mid"));
  o.push(line(k.lineOnTop([-199+i*2,17+i*3],[-174+i*2,17+i*3],19+i*5,P),"faint"));
 }
 o.push(disk(-132,44,9,16,19,"mid"),disk(-132,44,5,35,2,"hi"));
 o.push(line(k.ring(-132,44,6.4,37,P,28),"hi"));
 o.push(bolts(k.corners(b,8),13));
 return zone("governance","Operating contract, CODEBASE, releases",[-169,32],o.join(""));
}
const zones=[center(),memory(),code(),verification(),interfaces(),learning(),machine(),governance()];
const svg=k.figureSvg({width:W,height:H,className:"system-machine",label:"Interactive isometric Agent Core system machine. A central controller connects to memory, code intelligence, verification, interfaces, learning, machine control and governance. Mechanical drawers, scanner, pistons and gantry move in real time.",body:[chassis(),...zones.sort((a,b)=>k.depthOf([a.at[0],a.at[1],0],P)-k.depthOf([b.at[0],b.at[1],0],P)).map(z=>z.html)]});
const steps=[["core","00","CONTROLLER","Tool decisions & host policy"],["memory","01","MEMORY","Canonical + recall"],["code","02","CODE INTELLIGENCE","Graph + LSP"],["verify","03","VERIFICATION","Evidence + audit"],["interfaces","04","INTERFACES","MCP + web + apps"],["learning","05","LEARNING","Checkpoint + review"],["machine","06","MACHINE CONTROL","Local process + GUI"],["governance","07","GOVERNANCE","CODEBASE + release"]];
const nav=steps.map((s,i)=>'<button type="button" data-step="'+i+'" aria-pressed="'+(i===0)+'" class="nav-step'+(i===0?' is-active':'')+'"><span class="nav-no">'+s[1]+'</span><span><b>'+s[2]+'</b><small>'+s[3]+'</small></span><span class="nav-chevron">↗</span></button>').join("");
const plate=k.plateHtml({fig:"FIG 01 · FULL SYSTEM",title:"AGENT CORE / MACHINE ANATOMY",hint:"KLIK MODUL ATAU PILIH SUBSYSTEM",readout:"00 / CONTROLLER",keys:[{mark:"raised",label:"Physical subsystem analogies"},{mark:"lit",label:"Selected mechanism"},{mark:"blue",label:"Tool/data connections"}],caption:"Representasi mekanis berdasarkan source code Agent Core. Gerak pada diagram adalah ilustrasi arsitektur, bukan telemetri atau operasi sebenarnya.",body:'<div tabindex="0" role="group" class="iso-stage" aria-label="Agent Core interactive machine. Use arrow keys to switch subsystems.">'+svg+'</div>'});
const css=readFileSync(join(HERE,"design.css"),"utf8");
const js=readFileSync(join(HERE,"live.js"),"utf8").replaceAll("__PROJECTION__",JSON.stringify(P));
const body='<style>'+css+'</style><header class="ac-mast"><span><i></i> ANATOMY / AGENT CORE / SYSTEM</span><span>ISOMETRIC INTERACTIVE EXPLAINER · OFFLINE</span></header>'+
'<div class="ac-hero"><div><div class="ac-eyebrow">01 / WHOLE SYSTEM</div><h1>Sistem yang<br><em>terlihat bekerja.</em></h1><p>Delapan mekanisme utama Agent Core divisualkan sebagai sebuah mesin presisi. Lihat bagaimana Memory, Learning, Code Intelligence, Verification, tools, dan eksekusi lokal saling terhubung.</p></div><div class="ac-facts"><div><strong>08</strong><small>SUBSYSTEMS</small></div><div><strong>01</strong><small>CONTROLLER</small></div><div><strong>3D</strong><small>ISOMETRIC</small></div><p>Arsitektur dari source Agent Core · bukan monitoring live.</p></div></div>'+
'<main class="ac-layout"><section class="ac-plate">'+plate+'<div class="ac-controls"><button type="button" id="toggle-animation" aria-pressed="true">⏸ JEDA ANIMASI</button><button type="button" id="toggle-explode" aria-pressed="false">◈ EXPLODED VIEW</button><span id="fps-status">MECHANICAL MOTION · ACTIVE</span></div></section><aside class="ac-side"><div class="ac-side-head">EXPLORE THE MACHINE <span>08 MODUL</span></div><nav class="ac-nav" aria-label="Subsystem Agent Core">'+nav+'</nav><div class="ac-detail" aria-live="polite"><span data-phase-n>00 / CONTROLLER</span><h2 data-phase-title>Inti orkestrasi</h2><p data-phase-desc>Controller mengarahkan tool dan menjaga batas otorisasi.</p><div class="ac-code" data-phase-code>host policy → tools → evidence</div></div><p class="ac-help">Klik modul pada mesin atau pilih daftar. Tombol ← →, Home, dan End juga bisa digunakan.</p></aside></main>'+
'<section class="ac-bottom"><article><b>SOURCE AUTHORITY</b><span>Exact source code outranks graph &amp; documentation</span></article><article><b>MEMORY</b><span>Canonical Markdown + experience v2; derived index</span></article><article><b>LEARNING</b><span>Verified candidate promotion; separate sibling</span></article><article><b>RUNTIME</b><span>Machine control and MCP tool execution are separate authorities</span></article></section>'+
'<footer>Generated with wheresryan22/anatomy original iso-kit. Files under Agent Core docs only; no runtime integration, secrets, or live telemetry.</footer>';
const html=k.pageHtml({title:"Agent Core — Full Anatomy",width:1370,theme:"dark",body,script:kitScript()+"\n"+js});
writeFileSync(join(HERE,"Agent-Core-Full-Anatomy.html"),html,"utf8");
console.log("GENERATED",join(HERE,"Agent-Core-Full-Anatomy.html"),"bytes",Buffer.byteLength(html));
