import { readFileSync } from "node:fs";
import { Script } from "node:vm";
const html=readFileSync(new URL("./Agent-Core-Full-Anatomy.html",import.meta.url),"utf8");
const opening='<script type="module">';
const first=html.indexOf(opening),last=html.lastIndexOf("</script>");
if(first<0||last<first)throw new Error("INLINE_MODULE_MISSING");
new Script(html.slice(first+opening.length,last));
for(const part of ["core-piston","drawer-0","drawer-1","drawer-2","drawer-3","scanner","gantry","learn-piston","io-tower"]){
 if(!html.includes('data-part="'+part+'"'))throw new Error("MOTION_PART_MISSING:"+part);
}
if(!html.includes("requestAnimationFrame")||!html.includes("IntersectionObserver"))throw new Error("MOTION_CONTROLLER_MISSING");
console.log("INLINE_SYNTAX_OK; 9 MOTION PARTS PRESENT; CONTROLLER PRESENT");
