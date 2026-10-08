import ExcelJS from 'exceljs';
import PizZip from 'pizzip';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm, mkdir, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dirs:string[]=[];
afterEach(async()=>{vi.restoreAllMocks(); for(const d of dirs.splice(0)) await rm(d,{recursive:true,force:true});});
const hash=(b:Uint8Array)=>'sha256:'+createHash('sha256').update(b).digest('hex');
const load=()=>import('../src/verification/workbook-assertions.js');
async function fixture() {
  const w=new ExcelJS.Workbook(),s=w.addWorksheet('Data Ω'); w.addWorksheet('Other');
  s.getCell('A1').value='private-cell-value'; s.getCell('B1').value=0; s.getCell('C1').value=false; s.getCell('D1').value='';
  s.getCell('A2').value={formula:'1+1',result:2}; s.getCell('B2').value={formula:'0',result:0};
  s.getCell('C2').value={formula:'1+2'}; s.getCell('D2').value=new Date('2024-01-02T00:00:00Z');
  s.getCell('E2').value={formula:'FALSE()',result:false} as any;
  s.views=[{state:'frozen',xSplit:1,ySplit:2}];
  const bytes=Buffer.from(await w.xlsx.writeBuffer());
  return {bytes,spec:(rules:any[])=>({version:1,workbookDigest:hash(bytes),rules})};
}
it('requires a strict nonempty bounded specification rather than vacuous success',async()=>{
  const m=await load().catch(()=>null); expect(m?.evaluateWorkbookAssertions).toBeTypeOf('function');
  const f=await fixture(); const report=await m!.evaluateWorkbookAssertions(f.bytes,f.spec([]));
  expect(report.status).toBe('unavailable'); expect(report.errorCode).toBe('WORKBOOK_SPEC_INVALID');
});
it('checks selected stored values, exact formula text, cache and frozen panes without revealing cell text',async()=>{
  const f=await fixture(),m=await load(); const rules:any[]=[
    {id:'sheets',kind:'sheet-names',names:['Data Ω','Other']},
    ...[['A1','private-cell-value'],['B1',0],['C1',false],['D1',''],['Z99',null]].map(([cell,expected],i)=>({id:'v'+i,kind:'cell-value',sheet:'Data Ω',cell,expected})),
    {id:'formula',kind:'cell-formula',sheet:'Data Ω',cell:'A2',expected:'=1+1'},
    {id:'cache',kind:'cached-result',sheet:'Data Ω',cell:'B2',expected:0},
    {id:'freeze',kind:'freeze',sheet:'Data Ω',rows:2,columns:1}];
  const original=hash(f.bytes),report=await m.evaluateWorkbookAssertions(f.bytes,f.spec(rules));
  expect(report.status).toBe('pass'); expect(report.counts.pass).toBe(9); expect(hash(f.bytes)).toBe(original);
  expect(JSON.stringify(report)).not.toContain('private-cell-value'); expect(report.runsFormulas).toBe(false);
  expect(report.rules.find(r=>r.id==='cache')?.cacheFreshness).toBe('not-established');
});
it.each([
  ['cell-value','A2',2,'unavailable'],['cached-result','C2',3,'unavailable'],['cell-value','D2','2024-01-02','unavailable'],
  ['cell-value','B1',false,'fail'],['cell-value','C1',0,'fail'],['cell-value','D1',null,'fail'],['cell-formula','A2','2','fail'],
  ['cached-result','B2',0,'pass'],['cached-result','E2',false,'pass'],['cell-value','Z99',null,'pass'],
])('preserves typed semantics for %s %s',async(kind,cell,expected,status)=>{
  const f=await fixture(),m=await load(); const report=await m.evaluateWorkbookAssertions(f.bytes,f.spec([{id:'one',kind,sheet:'Data Ω',cell,expected}]));
  expect(report.status).toBe(status);
});
it('missing sheet fails rather than becoming blank; unavailable dominates a separate mismatch',async()=>{
  const f=await fixture(),m=await load();
  const report=await m.evaluateWorkbookAssertions(f.bytes,f.spec([
    {id:'missing',kind:'cell-value',sheet:'Absent',cell:'A1',expected:null},
    {id:'no-cache',kind:'cached-result',sheet:'Data Ω',cell:'C2',expected:3}]));
  expect(report.status).toBe('unavailable'); expect(report.counts).toMatchObject({fail:1,unavailable:1});
});
it.each(['unknown-kind','unknown-field','duplicate','bad-cell','nonfinite','wrong-digest','sheet-order'])('rejects invalid or mismatched specification: %s',async mode=>{
  const f=await fixture(),m=await load(); const spec:any=f.spec([{id:'one',kind:'cell-value',sheet:'Data Ω',cell:'B1',expected:0}]);
  if(mode==='unknown-kind') spec.rules[0].kind='execute'; if(mode==='unknown-field') spec.extra=true;
  if(mode==='duplicate') spec.rules.push({...spec.rules[0]}); if(mode==='bad-cell') spec.rules[0].cell='XFE1048577';
  if(mode==='nonfinite') spec.rules[0].expected=Infinity; if(mode==='wrong-digest') spec.workbookDigest='sha256:'+'0'.repeat(64);
  if(mode==='sheet-order') spec.rules=[{id:'order',kind:'sheet-names',names:['Other','Data Ω']}];
  const report=await m.evaluateWorkbookAssertions(f.bytes,spec); expect(report.status).toBe(mode==='sheet-order'?'fail':'unavailable');
});
it.each(['macro','external','traversal','duplicate-part','oversize-member','declaration','inflated-size-lie','shared-formula'])('refuses unsafe or unsupported archive: %s',async mode=>{
  const f=await fixture(),m=await load(),zip=new PizZip(f.bytes);
  if(mode==='macro')zip.file('xl/vbaProject.bin','fake');
  if(mode==='external')zip.file('xl/_rels/workbook.xml.rels','<Relationships><Relationship TargetMode="External" Target="https://example.org/book.xlsx" /></Relationships>');
  if(mode==='traversal')zip.file('../outside.xml','fake');
  if(mode==='duplicate-part')zip.file('XL/WORKBOOK.XML','<workbook/>');
  if(mode==='oversize-member')zip.file('xl/large.xml','x'.repeat(16*1024*1024+1));
  if(mode==='declaration')zip.file('xl/extra.xml','<!DOCTYPE evil [<!ENTITY e SYSTEM "file:///secret">]><evil>&e;</evil>');
  if(mode==='inflated-size-lie')zip.file('xl/lie.xml','x'.repeat(100000));
  if(mode==='shared-formula') {
    const xml=zip.file('xl/worksheets/sheet1.xml')!.asText(); zip.file('xl/worksheets/sheet1.xml',xml.replace('<f>1+1</f>','<f t="array" ref="A2:A3">1+1</f>'));
  }
  const bytes=zip.generate({type:'nodebuffer',compression:'DEFLATE'});
  if(mode==='inflated-size-lie') for(let i=0;i<bytes.length-46;i++) if(bytes.readUInt32LE(i)===0x02014b50) {
    const n=bytes.readUInt16LE(i+28); if(bytes.subarray(i+46,i+46+n).toString()==='xl/lie.xml')bytes.writeUInt32LE(1,i+24);
  }
  const spec=f.spec([{id:'one',kind:'cell-formula',sheet:'Data Ω',cell:'A2',expected:'1+1'}]); spec.workbookDigest=hash(bytes);
  const report=await m.evaluateWorkbookAssertions(bytes,spec); expect(report.status).toBe('unavailable');
});
it('snapshots local input once and detects concurrent growth without exposing payloads',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'aios-input-'));dirs.push(dir); const file=path.join(dir,'test.json');await writeFile(file,'{"safe":true}');
  const m=await import('../src/verification/workbook-input.js'); const first=await m.readWorkbookSnapshot(file,1024,'.json');
  expect(first.digest).toBe(hash(first.bytes));
  const regular=await import('../src/rdc/utils/files/safe-regular-file.js'),original=regular.openRegularFile;
  vi.spyOn(regular,'openRegularFile').mockImplementation(async(...args)=>{
    const g=await original(...args),read=g.handle.read.bind(g.handle);let changed=false;
    vi.spyOn(g.handle,'read').mockImplementation(async(...params:any[])=>{
      const r=await (read as any)(...params);if(!changed){changed=true;await writeFile(file,'{"safe":false,"more":1}');}return r;
    });return g;
  });
  await expect(m.readWorkbookSnapshot(file,1024,'.json')).rejects.toThrow(/CHANGED/);
});
it('compiled CLI provides pass/fail/unavailable exits, exclusive reports and immutable inputs',async()=>{
  const script=path.join(root,'scripts/verify/verify-workbook.mjs');
  expect(await readFile(script,'utf8').catch(()=>null)).not.toBeNull();
  const f=await fixture(),dir=await mkdtemp(path.join(os.tmpdir(),'aios-cli-'));dirs.push(dir);
  const workbook=path.join(dir,'fixture.xlsx');await writeFile(workbook,f.bytes);
  for(const [kind,cell,expected,exit] of [['cell-value','B1',0,0],['cell-value','B1',999,1],['cached-result','C2',3,2]] as const) {
    const spec=path.join(dir,'spec-'+exit+'.json'),out=path.join(dir,'report-'+exit+'.json');
    const text=JSON.stringify(f.spec([{id:'check',kind,sheet:'Data Ω',cell,expected}]));await writeFile(spec,text);
    const args=[script,'--workbook',workbook,'--spec',spec,'--output',out];
    const run=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:40000});
    expect(run.status,run.stderr+run.stdout).toBe(exit); const reportBytes=await readFile(out),report=JSON.parse(reportBytes.toString('utf8'));
    expect(JSON.parse(run.stdout.trim()).reportDigest).toBe(hash(reportBytes));
    expect(report.status).toBe(exit===0?'pass':exit===1?'fail':'unavailable');expect(hash(await readFile(workbook))).toBe(hash(f.bytes));
    expect(await readFile(spec,'utf8')).toBe(text);const before=await readFile(out,'utf8');
    expect(spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:40000}).status).toBe(2);expect(await readFile(out,'utf8')).toBe(before);
  }
},30000);
it.each(['partial-number','invalid-boolean','duplicate-cell','invalid-pane','sparse-allocation'])('does not let parser coercion or amplification certify malformed input: %s',async mode=>{
  const f=await fixture(),zip=new PizZip(f.bytes),m=await load();let xml=zip.file('xl/worksheets/sheet1.xml')!.asText();
  if(mode==='partial-number')xml=xml.replace('<v>0</v>','<v>0garbage</v>');
  if(mode==='invalid-boolean')xml=xml.replace(/(<c r="C1"[^>]*>)<v>0<\/v>/,'$1<v>nonsense</v>');
  if(mode==='duplicate-cell')xml=xml.replace('</row>','<c r="B1"><v>0</v></c></row>');
  if(mode==='invalid-pane')xml=xml.replace('xSplit="1"','xSplit="NaN"');
  if(mode==='sparse-allocation') {
    const rows=Array.from({length:160},(_,i)=>'<row r="'+(i+1)+'"><c r="XFD'+(i+1)+'"><v>0</v></c></row>').join('');
    xml=xml.replace(/<sheetData>[\s\S]*?<\/sheetData>/,'<sheetData>'+rows+'</sheetData>');
  }
  zip.file('xl/worksheets/sheet1.xml',xml);const bytes=zip.generate({type:'nodebuffer',compression:'DEFLATE'});
  const report=await m.evaluateWorkbookAssertions(bytes,{version:1,workbookDigest:hash(bytes),rules:[{id:'zero',kind:'cell-value',sheet:'Data Ω',cell:'B1',expected:0}]});
  expect(report.status).toBe('unavailable');expect(report.errorCode).toBeDefined();
});
it('refuses an actual symlink/junction ancestor and unsupported input formats',async()=>{
  const base=process.platform==='win32'&&process.env.SystemRoot?path.join(process.env.SystemRoot,'Temp'):os.tmpdir();
  const dir=await mkdtemp(path.join(base,'agent-core-aios-link-'));dirs.push(dir);
  const target=path.join(dir,'target'),link=path.join(dir,'link');await mkdir(target);await writeFile(path.join(target,'input.json'),'{}');
  await symlink(target,link,process.platform==='win32'?'junction':'dir');
  const {readWorkbookSnapshot}=await import('../src/verification/workbook-input.js');
  await expect(readWorkbookSnapshot(path.join(link,'input.json'),1024,'.json')).rejects.toThrow(/LINK/);
  await expect(readWorkbookSnapshot(path.join(dir,'input.xlsm'),1024,'.xlsx')).rejects.toThrow(/LOCAL_INPUT/);
  await expect(readWorkbookSnapshot('https://example.org/input.xlsx',1024,'.xlsx')).rejects.toThrow(/LOCAL_INPUT/);
});
