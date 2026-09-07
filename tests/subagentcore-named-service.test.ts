import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { MemoryService } from '../src/memory/service.js';
import { SubAgentCoreService } from '../src/subagentcore/service.js';
import { workerById } from '../src/subagentcore/team.js';
import type { ProviderInvocation, SubAgentProvider } from '../src/subagentcore/providers/types.js';
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });
async function fixture() {
 const root = await mkdtemp(path.join(os.tmpdir(), 'subagentcore-named-'));
 const memory = new MemoryService({ ...loadConfig({}, root).memory, enabled: true, dbPath: path.join(root, 'memory.sqlite') });
 cleanup.push(async () => { await memory.close(); await rm(root, { recursive:true, force:true }); });
 const scope = { principalId:'leader-test', projectId:root };
 const calls: ProviderInvocation[] = [];
 const adapter: SubAgentProvider = { async invoke(input) {
  calls.push(input);
  return { text: JSON.stringify({ summary:'ready', findings:[], proposedActions:[], toolRequests:[],
   memoryHandoff:{facts:['Unverified worker observation'],decisions:[],failures:[],nextStep:''} }), actualModel:'fixture/free:free', promptTokens:12, completionTokens:9, recordedCost:0 };
 } };
 const service = new SubAgentCoreService({ memory, projectRoot:root,
  env:{ SUBAGENTCORE_OPENROUTER_API_KEY_1:'synthetic-or-one', SUBAGENTCORE_OPENROUTER_DEFAULT_MODEL:'fixture/free:free',
   SUBAGENTCORE_NVIDIA_API_KEY_1:'synthetic-nv-one', SUBAGENTCORE_NVIDIA_DEFAULT_MODEL:'fixture/nvidia',
   SUBAGENTCORE_OPENHANDS_API_KEY_1:'synthetic-oh-one', SUBAGENTCORE_OPENHANDS_DEFAULT_MODEL:'fixture/openhands' },
  providers:{ openrouter:adapter, nvidia:adapter, openhands:adapter } });
 return { root, memory, scope, calls, service };
}
it.each(['Astra', 'Forge', 'Sentinel', 'Scribe'])('recognizes %s case-insensitively and invokes its binding', async (name) => {
 const f = await fixture();
 expect(workerById(' '+name.toUpperCase()+' ')?.id).toBe(name.toLowerCase());
 const result = await f.service.dispatch({ scope:f.scope, routeContextId:'11111111-1111-4111-8111-111111111111', workerId:name, task:'Return readiness' });
 expect(result.worker.name).toBe(name);
 expect(f.calls[0]?.systemPrompt).toContain('You are '+name);
 expect(f.calls[0]?.systemPrompt).toContain('sole leader');
 expect(result.requestedModel).toBeTruthy();
 expect(result.model).toBe('fixture/free:free');
 expect(result.usage).toMatchObject({promptTokens:12,completionTokens:9,recordedCost:0});
});
it('returns an unverified handoff for leader review without an automatic durable write', async () => {
 const f = await fixture();
 const before = await f.memory.status(f.scope);
 const result = await f.service.dispatch({ scope:f.scope, routeContextId:'11111111-1111-4111-8111-111111111111', workerId:'astra', task:'Inspect readiness' });
 expect(result.memoryHandoffStatus).toBe('PENDING_LEADER_REVIEW');
 expect(result.memoryHandoff.facts).toEqual(['Unverified worker observation']);
 expect(result.memoryHandoffId).toBeUndefined();
 expect((await f.memory.status(f.scope)).counts.active_items).toBe(before.counts.active_items);
});
it('preflights the common memory but exports only explicitly approved current records', async () => {
 const f = await fixture();
 const shared = await f.memory.commit({scope:f.scope,canonicalKey:'team.probe.shared',kind:'fact',value:'Synthetic shared marker SUNRISE-42'});
 await f.memory.commit({scope:f.scope,canonicalKey:'team.probe.private',kind:'fact',value:'Private internal marker DO-NOT-EXPORT'});
 const base = {scope:f.scope,routeContextId:'11111111-1111-4111-8111-111111111111',workerId:'astra',task:'Read team probe shared private marker'};
 await f.service.dispatch(base);
 expect(f.calls[0]?.systemPrompt).not.toContain('DO-NOT-EXPORT');
 expect(f.calls[0]?.systemPrompt).not.toContain('SUNRISE-42');
 const result = await f.service.dispatch({...base,sharedMemoryIds:[shared.memoryId]});
 expect(f.calls[1]?.systemPrompt).toContain('SUNRISE-42');
 expect(f.calls[1]?.systemPrompt).not.toContain('DO-NOT-EXPORT');
 expect(result.sharedMemory.exportedMemoryIds).toEqual([shared.memoryId]);
});
it('rejects a foreign-scope approved memory before provider invocation', async () => {
 const f = await fixture();
 const foreign = await f.memory.commit({scope:{principalId:'another-user',projectId:f.root},canonicalKey:'foreign.fact',kind:'fact',value:'Private foreign marker'});
 await expect(f.service.dispatch({scope:f.scope,routeContextId:'11111111-1111-4111-8111-111111111111',workerId:'astra',task:'Read',sharedMemoryIds:[foreign.memoryId]})).rejects.toThrow('SHARED_MEMORY_NOT_ACCESSIBLE');
 expect(f.calls).toHaveLength(0);
});
it('rejects an unknown worker without leaking selector text or calling a provider', async () => {
 const f = await fixture();
 await expect(f.service.dispatch({scope:f.scope,routeContextId:'11111111-1111-4111-8111-111111111111',workerId:'JOE',task:'must not run'})).rejects.toThrow('WORKER_UNKNOWN');
 expect(f.calls).toHaveLength(0);
});
