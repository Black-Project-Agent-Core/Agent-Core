import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

const roots:string[]=[];
async function api(){ return import('../scripts/inspect/context-footprint.mjs'); }
async function tempRoot(){ const root=await mkdtemp(path.join(os.tmpdir(),'agent-core-context-footprint-')); roots.push(root); return root; }
afterEach(async()=>{ await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true}))); });

it('measures exact bytes and preserves conservative markdown blocks',async()=>{
  const {inspectInstructionBytes}=await api();
  const text=['# Head','', '- item','  continuation','', '````ts','```','x','````','', '|a|b|','|--|--|','|1|2|',''].join('\r\n');
  const bytes=Buffer.from(text,'utf8');
  const report=inspectInstructionBytes(bytes,'fixture.md');
  expect(report.bytes).toBe(bytes.length);
  expect(report.unicodeScalars).toBe([...text].length);
  expect(report.blocks.map((b:any)=>b.kind)).toEqual(['heading','bullet','fence','paragraph']);
  expect(report.blocks[2].rawBytes).toBe(Buffer.byteLength('````ts\r\n```\r\nx\r\n````\r\n'));
  expect(report.sourceMutated).toBe(false);
});
it('reports exact duplicates only and keeps malformed fence opaque',async()=>{
  const {inspectInstructionBytes}=await api();
  const text='# A\n\nkeep me\n\n# B\n\nkeep me\n\n```ts\nunclosed';
  const report=inspectInstructionBytes(Buffer.from(text),'fixture.md');
  expect(report.duplicates).toHaveLength(1);
  expect(report.duplicates[0].locations).toEqual([[3,3],[7,7]]);
  expect(report.blocks.at(-1).kind).toBe('opaque-fence');
});

it('uses identity-safe bounded reads and refuses oversized input',async()=>{
  const {inspectInstructionFile}=await api();
  const root=await tempRoot(), small=path.join(root,'small.md'), large=path.join(root,'large.md');
  await import('node:fs/promises').then(fs=>fs.writeFile(small,'hello Ω\n'));
  await import('node:fs/promises').then(fs=>fs.writeFile(large,Buffer.alloc(1024*1024+1,0x61)));
  const result=await inspectInstructionFile(small);
  expect(result.bytes).toBe(Buffer.byteLength('hello Ω\n'));
  await expect(inspectInstructionFile(large)).rejects.toThrow();
});
