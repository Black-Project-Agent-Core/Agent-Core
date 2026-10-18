
const P=__PROJECTION__;
const PHASES=[
 {id:"core",label:"CONTROLLER",title:"Pusat orkestrasi",desc:"Controller memahami intent pengguna, menginspeksi state, mengendalikan akses tool dan menjaga agar tindakan mengikuti kebijakan serta otorisasi yang berlaku. Nukleus yang naik-turun melambangkan siklus keputusan, bukan sebuah AI kedua.",code:"User → AI Controller → Agent Core MCP"},
 {id:"memory",label:"MEMORY",title:"Arsip pengetahuan kanonis",desc:"Catatan durable, revisi, provenance dan indeks turunan dikelola oleh MemoryService. Kabinet laci bergerak menggambarkan penyimpanan dan pemanggilan catatan; indeks embedding, leksikal, dan metadata tetap bukan sumber utama.",code:"runtime/memory → FileMemoryStore → MemoryIndex"},
 {id:"code",label:"CODE INTELLIGENCE",title:"Peta struktur source",desc:"Grafel menyediakan peta dependensi, dampak perubahan, graph navigation dan pola kode, sementara Semantic IDE/LSP menyediakan identitas simbol dan operasi refactor berbasis bahasa. Keduanya bersifat sibling capability, bukan gerbang eksekusi.",code:"Grafel graph · code_symbol · code_refactor"},
 {id:"verify",label:"VERIFICATION",title:"Pemeriksaan berbasis bukti",desc:"Evidence snapshots, batas input, source binding, dan claim coverage membantu membedakan data yang diamati dari penjelasan atau asumsi. Scanner memperlihatkan proses pemeriksaan, tanpa mengklaim bahwa grafik ini melakukan verifikasi secara live.",code:"Evidence snapshots → binding → bounded report"},
 {id:"interfaces",label:"INTERFACES",title:"Gerbang alat dan aplikasi",desc:"MCP, browser, web, file, serta berbagai aplikasi terhubung melalui permukaan tool yang terbatas. Setiap konektor memiliki kontrak input, pemeriksaan akses dan hasil yang tidak otomatis memberikan otoritas baru.",code:"MCP tool surfaces → authorized app/tool calls"},
 {id:"learning",label:"LEARNING",title:"Perbaikan dengan review",desc:"Learning menerima checkpoint pekerjaan, menyiapkan review dan hanya mempromosikan kandidat yang telah memenuhi syarat verifikasi ke Memory atau pola kode. Gear kecil dan piston menggambarkan peninjauan ulang, bukan penulisan memori otomatis tanpa bukti.",code:"checkpoint → review → verified candidate → sink"},
 {id:"machine",label:"MACHINE CONTROL",title:"Tindakan nyata di Windows",desc:"Lapisan machine-control memungkinkan inspeksi direktori, proses, GUI, dan operasi berizin lainnya pada mesin lokal. Gantry yang bergerak melambangkan kontrol fisik yang terukur, terpisah dari inference atau keputusan AI.",code:"filesystem · processes · GUI · desktop operations"},
 {id:"governance",label:"GOVERNANCE",title:"Kontrak dan kesinambungan",desc:"AGENTS.md, CODEBASE.md dan kebijakan release membatasi perubahan agar tetap dapat ditelusuri. Source aktif menjadi bukti final; diagram ini merupakan dokumentasi visual dan tidak boleh dipakai sebagai authority runtime.",code:"AGENTS.md · docs/CODEBASE.md · release intent"}
];
const stage=document.querySelector(".iso-stage");
const svg=stage.querySelector("svg");
const zones=[...svg.querySelectorAll(".machine-zone")];
const buttons=[...document.querySelectorAll("[data-step]")];
const readout=document.querySelector("[data-readout]");
const phaseNo=document.querySelector("[data-phase-n]");
const phaseTitle=document.querySelector("[data-phase-title]");
const phaseDesc=document.querySelector("[data-phase-desc]");
const phaseCode=document.querySelector("[data-phase-code]");
const motionButton=document.getElementById("toggle-animation");
const explodeButton=document.getElementById("toggle-explode");
const status=document.getElementById("fps-status");
const reduced=window.matchMedia("(prefers-reduced-motion: reduce)");
const movers=Object.fromEntries(["core-piston","scanner","gantry","learn-piston","io-tower",...Array.from({length:4},(_,i)=>"drawer-"+i)].map(id=>[id,svg.querySelector('[data-part="'+id+'"]')]));
let active=0,playing=true,exploded=false,visible=false,frame=0,start=0,last=0,userAt=performance.now();
const explosionOffsets={core:7,memory:27,code:32,verify:28,interfaces:24,learning:30,machine:28,governance:26};
const liftState=Object.fromEntries(PHASES.map(p=>[p.id,0]));
function move(el,dx=0,dy=0,dz=0){if(el)el.setAttribute("transform",translateAlong(P,[dx,dy,dz]));}
function setPhase(next,manual=true){
 active=(next+PHASES.length)%PHASES.length;
 if(manual)userAt=performance.now();
 const phase=PHASES[active];
 stage.dataset.phase=phase.id;
 buttons.forEach((b,i)=>{const selected=i===active;b.classList.toggle("is-active",selected);b.setAttribute("aria-pressed",String(selected));});
 zones.forEach(z=>z.classList.toggle("is-selected",z.dataset.zone===phase.id));
 const name=String(active).padStart(2,"0")+" / "+phase.label;
 readout.textContent=name;phaseNo.textContent=name;phaseTitle.textContent=phase.title;phaseDesc.textContent=phase.desc;phaseCode.textContent=phase.code;
}
function animate(now){
 frame=0;
 if(!visible || !playing || reduced.matches)return;
 if(!start)start=now;
 const s=(now-start)/1000,dt=last?Math.min((now-last)/1000,.05):1/60;last=now;
 move(movers["core-piston"],0,0,2.7+2.7*Math.sin(s*1.9));
 move(movers["drawer-0"],7*(.5+.5*Math.sin(s*1.15)),0,0);
 move(movers["drawer-1"],5*(.5+.5*Math.sin(s*1.15-1.4)),0,0);
 move(movers["drawer-2"],8*(.5+.5*Math.sin(s*1.15-2.7)),0,0);
 move(movers["drawer-3"],6*(.5+.5*Math.sin(s*1.15-4.0)),0,0);
 move(movers["scanner"],0,12*Math.sin(s*1.2),0);
 move(movers["gantry"],13*Math.sin(s*.92),0,0);
 move(movers["learn-piston"],0,0,3.2+3.2*Math.sin(s*1.75+1));
 move(movers["io-tower"],0,0,2+2*Math.sin(s*1.44+2));
 for(const z of zones){const id=z.dataset.zone,want=exploded?explosionOffsets[id]||0:0;liftState[id]+=(want-liftState[id])*(1-Math.exp(-dt*5.5));move(z,0,0,liftState[id]);}
 if(performance.now()-userAt>13500 && Math.floor(s/8)>Math.floor((s-dt)/8))setPhase(active+1,false);
 frame=requestAnimationFrame(animate);
}
function updateControls(){
 const paused=!playing||reduced.matches;
 motionButton.textContent=playing?"⏸ JEDA ANIMASI":"▶ LANJUTKAN ANIMASI";
 motionButton.setAttribute("aria-pressed",String(playing));
 explodeButton.setAttribute("aria-pressed",String(exploded));
 explodeButton.textContent=exploded?"◈ TUTUP EXPLODED VIEW":"◈ EXPLODED VIEW";
 status.textContent=reduced.matches?"REDUCED MOTION · STATIC":playing?"MECHANICAL MOTION · ACTIVE":"MECHANICAL MOTION · PAUSED";
 document.querySelectorAll(".iso-line[data-flow]").forEach(line=>line.style.animationPlayState=paused?"paused":"running");
}
function resume(){if(frame||!visible||!playing||reduced.matches)return;last=0;frame=requestAnimationFrame(animate);}
motionButton.addEventListener("click",()=>{
 playing=!playing;userAt=performance.now();updateControls();
 if(!playing&&frame){cancelAnimationFrame(frame);frame=0;}else resume();
});
explodeButton.addEventListener("click",()=>{exploded=!exploded;userAt=performance.now();updateControls();resume();});
buttons.forEach((b,i)=>b.addEventListener("click",()=>setPhase(i)));
svg.addEventListener("click",e=>{const z=e.target.closest("[data-zone]");if(!z)return;const i=PHASES.findIndex(p=>p.id===z.dataset.zone);if(i>=0)setPhase(i);});
function changeByKey(e){
 if(["ArrowLeft","ArrowUp","ArrowRight","ArrowDown","Home","End"].includes(e.key))e.preventDefault();else return;
 if(e.key==="Home")setPhase(0);else if(e.key==="End")setPhase(PHASES.length-1);else setPhase(active+((e.key==="ArrowLeft"||e.key==="ArrowUp")?-1:1));
}
stage.addEventListener("keydown",changeByKey);
document.querySelector(".ac-nav").addEventListener("keydown",e=>{changeByKey(e);if(e.defaultPrevented)buttons[active].focus();});
new IntersectionObserver(entries=>{visible=entries.at(-1)?.isIntersecting??false;if(!visible&&frame){cancelAnimationFrame(frame);frame=0;}else resume();},{rootMargin:"130px 0px"}).observe(stage);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)resume();});
if(reduced.addEventListener)reduced.addEventListener("change",()=>{updateControls();resume();});
setPhase(0,false);updateControls();
