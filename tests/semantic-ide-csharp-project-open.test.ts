import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { LanguageServerSession } from '../src/semantic-ide/language-server.js';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fixture=path.join(repoRoot,'tests','fixtures','semantic-second-wave-lsp.mjs');
const roots:string[]=[];
async function temp(){const root=await mkdtemp(path.join(os.tmpdir(),'agent-core-csharp-open-'));roots.push(root);return root;}
async function touch(file:string){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,'<Project />\n','utf8');}
function session(root:string,logFile:string){return new LanguageServerSession({
  id:'csharp',adapter:'csharp',extensions:['.cs'],languageIds:{'.cs':'csharp'},
  command:process.execPath,args:[fixture,'rich',logFile],readinessTimeoutMs:1000,
},root,3000);}
async function inbound(logFile:string){
  const rows=(await readFile(logFile,'utf8')).trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  return rows.filter(row=>row.direction==='in').map(row=>row.message);
}
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
it('opens the deterministic solution and bounded project set only after initialized',async()=>{
  const root=await temp(),logFile=path.join(root,'lsp.jsonl');
  await touch(path.join(root,'root.sln'));await touch(path.join(root,'nested','other.sln'));
  await touch(path.join(root,'src','App.csproj'));await touch(path.join(root,'src','Lib.csproj'));
  await touch(path.join(root,'obj','Ignored.csproj'));
  await touch(path.join(root,'DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT','Protected.csproj'));
  const s=session(root,logFile);
  try{
    await s.start();
    const messages=await inbound(logFile),methods=messages.map((message:any)=>message.method);
    const initialized=methods.indexOf('initialized'),solution=methods.indexOf('solution/open'),projects=methods.indexOf('project/open');
    expect(initialized).toBeGreaterThan(-1);expect(solution).toBeGreaterThan(initialized);expect(projects).toBeGreaterThan(initialized);
    expect(messages[solution].params).toEqual({solution:pathToFileURL(path.join(root,'root.sln')).href});
    expect(messages[projects].params.projects).toEqual([
      pathToFileURL(path.join(root,'src','App.csproj')).href,
      pathToFileURL(path.join(root,'src','Lib.csproj')).href,
    ]);
    expect(s.postInitializeEvidence).toMatchObject({status:'complete',complete:true,solution:'root.sln',projectCount:2,projectsOmitted:0});
    expect(methods.some((method:string)=>/restore|msbuild/i.test(method))).toBe(false);
  }finally{await s.close();}
});
it('reports partial evidence when the project-open set is truncated',async()=>{
  const root=await temp(),logFile=path.join(root,'lsp.jsonl');
  for(let i=0;i<130;i+=1)await touch(path.join(root,'projects','p'+String(i).padStart(3,'0')+'.csproj'));
  const s=session(root,logFile);
  try{
    await s.start();
    const messages=await inbound(logFile),project=messages.find((message:any)=>message.method==='project/open');
    expect(project.params.projects).toHaveLength(128);
    expect(s.postInitializeEvidence).toMatchObject({status:'partial',complete:false,projectCount:128,projectsOmitted:2,truncated:true});
  }finally{await s.close();}
});
it('records a complete no-op when no C# solution or project metadata exists',async()=>{
  const root=await temp(),logFile=path.join(root,'lsp.jsonl');await writeFile(path.join(root,'note.txt'),'nothing\n','utf8');
  const s=session(root,logFile);
  try{
    await s.start();
    const methods=(await inbound(logFile)).map((message:any)=>message.method);
    expect(methods).not.toContain('solution/open');expect(methods).not.toContain('project/open');
    expect(s.postInitializeEvidence).toMatchObject({status:'complete',complete:true,solution:null,projectCount:0,projectsOmitted:0});
  }finally{await s.close();}
});
