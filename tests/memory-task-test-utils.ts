import path from 'node:path';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { initializeStandaloneMemory } from '../SubProject/agent-core-memory/src/standalone.js';
import { ExternalControllerLearningService } from '../src/learning/external-controller.js';
import { LearningService } from '../src/learning/service.js';
export async function memoryTaskFixture() {
  const base = path.resolve('runtime/tmp'); await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'memory-task-'));
  const memory = await initializeStandaloneMemory({ baseDir: root, experience: { enabled: true } });
  const learning = await LearningService.initialize({ enabled: true, stateDir: path.join(root, 'learning'), reviewInterval: 10, curatorIntervalHours: 168 }, memory as any);
  const external = await ExternalControllerLearningService.initialize({ stateDir: path.join(root, 'external'), memory: memory as any, learning });
  const start = (ownerId: string, sessionId: string, taskKey: string, workspace = 'agent-core') =>
    (external.startEpisode as any)(sessionId, { taskKey, workspace }, { ownerId, workspaceIdentityKey: memory.registeredWorkspaceIdentity(workspace).key });
  return { root, memory, learning, external, start };
}
export function memoryToolFixture() {
  const callbacks = new Map<string, (input: any) => Promise<any>>();
  const server = { registerTool(name: string, _metadata: any, callback: any) { callbacks.set(name, callback); } };
  const invoke = (name: string, input: any) => callbacks.get(name)!(input);
  return { server, callbacks, read: (input: any) => invoke('memory_v2_read', input), write: (input: any) => invoke('memory_v2_write', input), invoke };
}
export function responseData(response: any): any {
  if (response.isError) throw new Error(JSON.stringify(response));
  return JSON.parse(response.content[0].text).result;
}
