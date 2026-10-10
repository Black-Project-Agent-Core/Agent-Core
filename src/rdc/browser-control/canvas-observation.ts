// Bounded native raster projection inspired by SystemOneHarness ab8e8f08 (Apache-2.0).
import { randomUUID, createHash } from 'node:crypto';
import * as z from 'zod/v4';
import { redactSensitiveString } from '../../security/redaction.js';
export const canvasOptionsSchema = z.strictObject({
  mode: z.enum(['inventory','sample']), canvasId:z.string().uuid().optional(),
  columns:z.number().int().min(1).max(128).optional(), rows:z.number().int().min(1).max(64).optional(),
  paletteSize:z.number().int().min(2).max(16).optional(),
  labels:z.record(z.string().regex(/^#[0-9a-fA-F]{6}$/),z.string().min(1).max(80)).optional(),
}).superRefine((v,c)=>{
  if(v.mode==='sample'&&!v.canvasId)c.addIssue({code:'custom',message:'canvasId required for sample'});
  if(Object.keys(v.labels??{}).length>(v.paletteSize??8))c.addIssue({code:'custom',message:'labels exceed palette budget'});
  if(v.mode==='inventory'&&Object.keys(v).some(k=>k!=='mode'))c.addIssue({code:'custom',message:'inventory takes only mode'});
});
export type CanvasOptions=z.infer<typeof canvasOptionsSchema>;
interface Binding { node:number; width:number; height:number; documentKey:string; targetId:string }
interface Raster {width:number;height:number;pixels:number[]}
const alphabet='.abcdefghijklmno';
const key=(rgba:number[])=>rgba.join(',');
const distance=(a:number[],b:number[])=>a.reduce((n,x,i)=>n+(x-b[i])**2,0);
/** Pure lossy projection. Operator labels describe colours, never detected objects. */
export function projectRaster(raster:Raster, options:CanvasOptions) {
  const columns=options.columns??32,rows=options.rows??16,size=options.paletteSize??8,n=columns*rows;
  if(!Number.isInteger(columns)||columns<1||columns>128||!Number.isInteger(rows)||rows<1||rows>64
    ||!Number.isInteger(size)||size<2||size>16||Object.keys(options.labels??{}).length>size
    ||![raster.width,raster.height].every(v=>Number.isSafeInteger(v)&&v>0))throw new Error('CANVAS_INVALID_BOUNDS');
  if(!Array.isArray(raster.pixels)||raster.pixels.length!==n*4||raster.pixels.some(x=>!Number.isInteger(x)||x<0||x>255))throw new Error('CANVAS_INVALID_RASTER');
  const colors=new Map<string,{rgba:number[];count:number}>(),cells:string[]=[];
  for(let i=0;i<n;i++){
    const p=raster.pixels.slice(i*4,i*4+4),a=(p[3]>>4)*17;
    const rgba=a===0?[0,0,0,0]:[(p[0]>>4)*17,(p[1]>>4)*17,(p[2]>>4)*17,a];
    const k=key(rgba),entry=colors.get(k)??{rgba,count:0};entry.count++;colors.set(k,entry);cells.push(k);
  }
  const ranked=[...colors].sort(([ka,a],[kb,b])=>b.count-a.count||(ka<kb?-1:ka>kb?1:0));
  const selected:string[]=[];
  const transparent=ranked.find(([,c])=>c.rgba[3]===0);if(transparent)selected.push(transparent[0]);
  const labels=Object.entries(options.labels??{}).sort(([a],[b])=>a.localeCompare(b)).map(([requested,label])=>{
    const rgb=[1,3,5].map(i=>parseInt(requested.slice(i,i+2),16));
    const matches=ranked.filter(([,c])=>c.rgba[3]>0).map(([k,c])=>({key:k,distance:distance(c.rgba.slice(0,3),rgb)}))
      .sort((a,b)=>a.distance-b.distance||(a.key<b.key?-1:1));
    const nearest=matches[0];
    if(!nearest||nearest.distance>3*24**2)return {requested,label:redactSensitiveString(label),status:'absent'};
    const ambiguous=matches.length>1&&matches[1].distance===nearest.distance;
    if(!selected.includes(nearest.key)&&selected.length<size)selected.push(nearest.key);
    return {requested,label:redactSensitiveString(label),status:selected.includes(nearest.key)?(ambiguous?'ambiguous':'matched'):'omitted',
      quantizedColor:nearest.key,distanceSquared:nearest.distance};
  });
  for(const [k] of ranked)if(selected.length<size&&!selected.includes(k))selected.push(k);
  selected.sort((a,b)=>colors.get(b)!.count-colors.get(a)!.count||(a<b?-1:1));
  const symbols=new Map(selected.map((k,i)=>[k,alphabet[i]]));let remapped=0;
  const mapped=cells.map(k=>{
    if(symbols.has(k))return symbols.get(k)!;
    remapped++;const rgba=colors.get(k)!.rgba;
    const nearest=[...selected].sort((a,b)=>distance(colors.get(a)!.rgba,rgba)-distance(colors.get(b)!.rgba,rgba)||(a<b?-1:1))[0];
    return symbols.get(nearest)!;
  });
  const palette=selected.map((k,i)=>{const c=colors.get(k)!;return {symbol:alphabet[i],
    color:'#'+c.rgba.slice(0,3).map(v=>v.toString(16).padStart(2,'0')).join(''),alpha:c.rgba[3],sampledCells:c.count};});
  return {state:'available',source:{width:raster.width,height:raster.height},columns,rows,
    grid:Array.from({length:rows},(_,i)=>mapped.slice(i*columns,(i+1)*columns).join('')),palette,labels,
    lossy:true,semantics:'quantized-raster-not-object-detection',alpha:'quantized-straight-rgba; zero-alpha explicitly transparent',
    omittedColors:Math.max(0,colors.size-selected.length),remappedCells:remapped,pixelFreshness:'snapshot-only'};
}
export class CanvasObserver {
  private bindings=new Map<string,Binding>();
  clear(){this.bindings.clear();}
  async observe(evaluate:(expression:string)=>Promise<any>,documentKey:unknown,targetId:string,raw:unknown){
    const options=canvasOptionsSchema.parse(raw),observedAt=new Date().toISOString(),doc=JSON.stringify(documentKey);
    const documentId='sha256:'+createHash('sha256').update(JSON.stringify([targetId,doc])).digest('hex');
    const unavailable=(reason:string)=>({state:'unavailable',reason,observedAt,documentId,lossy:true});
    if(options.mode==='inventory'){
      this.clear();
      const found=await evaluate(`(() => {
        const c=window.__agentCoreBrowser;if(!c)return null;
        const visible=e=>{const r=e.getBoundingClientRect();return e.width>0&&e.height>0&&!e.closest('[aria-hidden="true"],[inert]')
          &&e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;};
        const all=[...document.querySelectorAll('canvas')].filter(visible);
        return {documentKey:[performance.timeOrigin,location.href],total:all.length,items:all.slice(0,8).map(e=>{
          let node=c.ids.get(e);if(!node){node=c.next++;c.ids.set(e,node);c.nodes.set(node,e);}
          return {node,width:e.width,height:e.height};})};
      })()`);
      if(!found||JSON.stringify(found.documentKey)!==doc)return unavailable('document-changed');
      const items=found.items.map((b:any)=>{const id=randomUUID();this.bindings.set(id,{...b,documentKey:doc,targetId});return {id,width:b.width,height:b.height};});
      return {state:'available',items,total:found.total,omitted:Math.max(0,found.total-items.length),observedAt,documentId};
    }
    const binding=this.bindings.get(options.canvasId!);
    if(!binding||binding.targetId!==targetId||binding.documentKey!==doc)return unavailable('canvas-id-not-current');
    const args={node:binding.node,width:binding.width,height:binding.height,documentKey,
      columns:options.columns??32,rows:options.rows??16};
    const raster=await evaluate(`(a => {
      if(JSON.stringify([performance.timeOrigin,location.href])!==JSON.stringify(a.documentKey))return {error:'document-changed'};
      const e=window.__agentCoreBrowser?.nodes.get(a.node);
      if(!e||!e.isConnected||e.tagName!=='CANVAS'||e.width!==a.width||e.height!==a.height)return {error:'canvas-changed'};
      const r=e.getBoundingClientRect();
      if(e.closest('[aria-hidden="true"],[inert]')||!e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})||!r.width||!r.height||r.bottom<=0||r.top>=innerHeight||r.right<=0||r.left>=innerWidth)return {error:'canvas-not-visible'};
      try {const off=document.createElement('canvas');off.width=a.columns;off.height=a.rows;
        const ctx=off.getContext('2d',{willReadFrequently:true});if(!ctx)return {error:'context-unavailable'};
        ctx.drawImage(e,0,0,a.columns,a.rows);const pixels=Array.from(ctx.getImageData(0,0,a.columns,a.rows).data);
        return {width:e.width,height:e.height,pixels};
      } catch(err){return {error:err?.name==='SecurityError'?'canvas-tainted':'readback-unavailable'};}
    })(${JSON.stringify(args)})`);
    if(!raster||raster.error)return unavailable(raster?.error??'readback-unavailable');
    const projected={...projectRaster(raster,options),canvasId:options.canvasId,observedAt,documentId};
    return JSON.stringify(projected).length>20000?unavailable('canvas-output-budget'):projected;
  }
}
