import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {expect,it} from 'vitest';
it('does not execute archived review source copies under reports as application tests',async()=>{
  const config=await readFile(path.resolve('vitest.config.ts'),'utf8');
  expect(config.includes("'**/reports/**'")).toBe(true);
});
