import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { LspConnection } from '../src/semantic-ide/protocol.js';
import { isRecoverableSemanticTransportError } from '../src/semantic-ide/service.js';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fixture=path.join(repoRoot,'tests','fixtures','semantic-protocol-lsp.mjs');
const roots:string[]=[];
async function rootFixture(){const root=await mkdtemp(path.join(os.tmpdir(),'agent-core-terminal-'));roots.push(root);return root;}
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});

it('latches a terminal pipe failure while the child stays alive',async()=>{
  const root=await rootFixture();
  const connection=new LspConnection(process.execPath,[fixture,'basic'],root,1000);
  try {
    await connection.start();
    const child=(connection as any).process;
    expect(child?.exitCode).toBeNull();
    child.stdin.emit('error',new Error('synthetic broken pipe'));
    await new Promise(resolve=>setTimeout(resolve,0));
    const first=await connection.request('after-close',{}).then(()=>null,e=>e as Error);
    const second=await connection.request('after-close-again',{}).then(()=>null,e=>e as Error);
    expect(first).toBeInstanceOf(Error); expect(second).toBeInstanceOf(Error);
    expect(second!.message).toBe(first!.message); expect(connection.state).toBe('failed');
    expect(child.exitCode).toBeNull();
  } finally { await connection.close().catch(()=>undefined); }
});
it('does not classify ordinary JSON-RPC domain errors as terminal transport failure',()=>{
  expect(isRecoverableSemanticTransportError(new Error('SEMANTIC_IDE_SERVER_PIPE_ERROR: broken pipe'))).toBe(true);
  expect(isRecoverableSemanticTransportError(new Error('SEMANTIC_IDE_LSP_ERROR: -32602 bad params'))).toBe(false);
});

it('restarts cleanly after an intentional close without inheriting terminal state',async()=>{
  const root=await rootFixture();
  const connection=new LspConnection(process.execPath,[fixture,'basic'],root,1000);
  await connection.start(); await expect(connection.request('initialize',{})).resolves.toBeNull();
  await connection.close();
  await connection.start(); await expect(connection.request('initialize',{})).resolves.toBeNull();
  expect(connection.state).toBe('running'); await connection.close();
});