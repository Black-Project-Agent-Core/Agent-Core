import { expect, it } from 'vitest';
import { readFile, utimes, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './skill-proposal-fixture.js';
import { ExternalControllerLearningService } from '../src/learning/external-controller.js';

/** Guards ExternalControllerLearningService.load()'s mtime-keyed state cache
 * (see commit 5093940): a read must reuse the already-parsed state while the
 * file's mtime is unchanged, and must reparse after a real write changes it. */
it('trusts the cached state while the file mtime is unchanged, and refreshes after a real write', async () => {
  const f = await fixture();
  const stateDir = path.join(f.root, 'external');
  const service = await ExternalControllerLearningService.initialize({ stateDir, memory: f.memory, learning: f.learning, skills: f.skills });
  const stateFile = path.join(stateDir, 'external-controller.json');

  await service.startEpisode('session-1', { taskKey: 'task-1', workspace: 'agent-core' });
  const before = await service.getEpisode('session-1');
  expect(before?.taskKey).toBe('task-1');

  // Simulate the file being altered outside save() while keeping its mtime identical,
  // so a correct cache must still return the known-good in-memory state, not these bytes.
  const originalStat = await stat(stateFile);
  const originalContent = await readFile(stateFile, 'utf8');
  await writeFile(stateFile, originalContent.replace('task-1', 'POISONED'));
  await utimes(stateFile, originalStat.atime, originalStat.mtime);

  const cached = await service.getEpisode('session-1');
  expect(cached?.taskKey).toBe('task-1');

  // A real write through the service changes mtime, so the next read must reparse.
  await service.startEpisode('session-2', { taskKey: 'task-2', workspace: 'agent-core' });
  // eslint-disable-next-line no-console
  const refreshed = await service.getEpisode('session-2');
  expect(refreshed?.taskKey).toBe('task-2');
});
