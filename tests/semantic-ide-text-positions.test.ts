import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { planWorkspaceEdit, applyWorkspaceEdit } from '../src/semantic-ide/transaction.js';
import { SemanticIdeService } from '../src/semantic-ide/service.js';
const roots: string[]=[];
afterEach(async()=>{await Promise.all(roots.splice(0).map(r=>rm(r,{recursive:true,force:true})));});
const pos=(line:number,character:number)=>({line,character});
async function fixture(text:string|Buffer){const root=await mkdtemp(path.resolve('runtime/tmp/text-pos-'));roots.push(root);const file=path.join(root,'a.ts');await writeFile(file,text);return {root,file,uri:pathToFileURL(file).href};}
async function symbolBody(text:string,range:any){
 const service:any=Object.create(SemanticIdeService.prototype); service.resolveFile=async()=>'/fixture/a.ts';service.definitionForFile=()=>({languageId:'typescript'});
 const session={id:'typescript',assertCapability:()=>{},ensureDocument:async()=>({uri:'file:///fixture/a.ts',text}),request:async()=>[{name:'target',kind:12,range}],normalizeSymbol:(name:string)=>({name})};
 service.withRecovery=async(_c:any,_f:any,run:any)=>run(session);
 return (await service.symbolsForFile({root:'/fixture'},'a.ts')).symbols;
}
describe('S6 actual read and edit consumers',()=>{
 it.each([['LF','a\nb',1,0,1],['CRLF','a\r\nb',1,0,1],['CR','a\rb',1,0,1],['mixed','a\r\nb\rc\nd',2,0,1],['UTF16 columns','😀name',0,2,6]])('%s read and plan select identical spans',async(_label,text,line,start,end)=>{
  const range={start:pos(Number(line),Number(start)),end:pos(Number(line),Number(end))}; const t=String(text);const f=await fixture(t);const plans:any[]=await planWorkspaceEdit(f.root,{changes:{[f.uri]:[{range,newText:'X'}]}});
  const body=(await symbolBody(t,range))[0].body;expect(body).toBe(t.includes('name')?'name':t.includes('c')?'c':'b');
  expect(plans[0].staged).toBe(t.replace(body,'X'));expect(await readFile(f.file,'utf8')).toBe(t);
 });
 it('CRLF delimiter is not part of line content width',async()=>{
  const range={start:pos(0,1),end:pos(0,2)}, f=await fixture('a\r\nb');
  await expect(planWorkspaceEdit(f.root,{changes:{[f.uri]:[{range,newText:'X'}]}})).rejects.toThrow('SEMANTIC_EDIT_POSITION_OUT_OF_RANGE');
  await expect(symbolBody('a\r\nb',range)).rejects.toThrow('SEMANTIC_PROVIDER_RANGE_INVALID');
 });
 it.each([NaN,Infinity,-1,0.5])('invalid coordinate %s never becomes a slice',async value=>{
  const range={start:pos(0,value),end:pos(0,2)}, f=await fixture('abcd');
  await expect(planWorkspaceEdit(f.root,{changes:{[f.uri]:[{range,newText:'X'}]}})).rejects.toThrow('SEMANTIC_EDIT_POSITION_INVALID');
  expect(await symbolBody('abcd',range)).toEqual([]);expect(await readFile(f.file,'utf8')).toBe('abcd');
 });
 it.each([['CR','a\rb','a\rX\rYb'],['first LF','a\nb\r\nc','a\nX\nYb\r\nc']])('%s determines inserted EOL without rewriting other spans',async(_label,input,expected)=>{
  const f=await fixture(input);const range={start:pos(1,0),end:pos(1,0)};await applyWorkspaceEdit(f.root,{changes:{[f.uri]:[{range,newText:'X\nY'}]}});expect(await readFile(f.file,'utf8')).toBe(expected);
 });
 it.each(['','x','x\n'])('EOF compatibility retained for %j',async input=>{
  const f=await fixture(input);const line=input.endsWith('\n')?2:1;const range={start:pos(line,0),end:pos(line,0)};
  const plans:any[]=await planWorkspaceEdit(f.root,{changes:{[f.uri]:[{range,newText:'!'}]}});expect(plans[0].staged).toBe(input+'!');
  await expect(planWorkspaceEdit(f.root,{changes:{[f.uri]:[{range:{start:pos(line+1,0),end:pos(line+1,0)},newText:'!'}]}})).rejects.toThrow();
 });
 it('reversed and overlapping ranges remain errors',async()=>{
  const f=await fixture('abcd');await expect(planWorkspaceEdit(f.root,{changes:{[f.uri]:[{range:{start:pos(0,3),end:pos(0,2)},newText:''}]}})).rejects.toThrow('SEMANTIC_EDIT_RANGE_INVALID');
  await expect(planWorkspaceEdit(f.root,{changes:{[f.uri]:[ {range:{start:pos(0,0),end:pos(0,2)},newText:''}, {range:{start:pos(0,1),end:pos(0,3)},newText:''} ]}})).rejects.toThrow('SEMANTIC_EDIT_OVERLAP');
 });
 it.each(['utf8','utf16le'] as const)('dry-run and %s BOM bytes remain intact',async encoding=>{
  const prefix=encoding==='utf8'?Buffer.from([239,187,191]):Buffer.from([255,254]);const input=Buffer.concat([prefix,Buffer.from('a\rb',encoding)]);const f=await fixture(input);const edit={changes:{[f.uri]:[{range:{start:pos(1,0),end:pos(1,1)},newText:'c'}]}};
  await applyWorkspaceEdit(f.root,edit,true);expect(await readFile(f.file)).toEqual(input);await applyWorkspaceEdit(f.root,edit);expect(await readFile(f.file)).toEqual(Buffer.concat([prefix,Buffer.from('a\rc',encoding)]));
 });
});
