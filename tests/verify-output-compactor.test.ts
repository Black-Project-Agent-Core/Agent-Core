import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const helper=path.join(root,'scripts','verify','compact-output.mjs');
const run=(args:string[])=>spawnSync(process.execPath,[helper,...args],{cwd:root,encoding:'utf8',windowsHide:true,timeout:10000});
async function tempResidue(){
  return (await readdir(path.join(root,'runtime','tmp'))).filter(name=>name.startsWith('verify-output-'));
}

it('suppresses successful output while preserving success result',async()=>{
  const r=run(['--label','compact-pass','--',process.execPath,'-e',"console.log('NOISY_SUCCESS'); console.error('NOISY_ERR')"]);
  expect(r.status,r.stderr).toBe(0);
  expect(r.stdout).toMatch(/^PASS: compact-pass/);
  expect(r.stdout).not.toContain('NOISY_SUCCESS');
  expect(r.stderr).not.toContain('NOISY_ERR');
  expect(await tempResidue()).toEqual([]);
});

it('preserves non-zero exit code and bounded failure tail',async()=>{
  const code="for(let i=0;i<12;i++)console.log('line-'+i);console.error('stderr-marker');process.exit(7)";
  const r=run(['--label','compact-fail','--max-lines','4','--',process.execPath,'-e',code]);
  expect(r.status).toBe(7);
  expect(r.stderr).toContain('output truncated');
  expect(r.stderr).toContain('stderr-marker');
  expect(r.stderr).toContain('FAIL(7): compact-fail');
  expect(r.stderr).not.toContain('line-0');
  expect(await tempResidue()).toEqual([]);
});

it('transparent debug mode forwards successful child output without changing the result',()=>{
  const r=run(['--debug','--',process.execPath,'-e',"console.log('debug-visible')"]);
  expect(r.status,r.stderr).toBe(0);
  expect(r.stdout).toContain('debug-visible');
  expect(r.stdout).toContain('PASS: verification');
});
it('reports a zero-output success without inventing captured output',async()=>{
  const r=run(['--label','silent-pass','--',process.execPath,'-e','']);
  expect(r.status,r.stderr).toBe(0);
  expect(r.stdout).toContain('PASS: silent-pass — 0 lines / 0 bytes suppressed');
  expect(await tempResidue()).toEqual([]);
});

it('caps temporary capture without failing a successful command',async()=>{
  const code="process.stdout.write('x'.repeat(20000))";
  const r=run(['--max-capture-bytes','4096','--',process.execPath,'-e',code]);
  expect(r.status,r.stderr).toBe(0);
  expect(r.stdout).toContain('capture capped');
  expect(await tempResidue()).toEqual([]);
});