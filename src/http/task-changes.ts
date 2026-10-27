import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileCheckpointService } from '../rdc/checkpoints/service.js';
import { computeTaskChanges, type TaskChanges } from '../rdc/checkpoints/task-changes.js';

export type TaskChangesReader = (taskId: string) => Promise<TaskChanges>;
export const defaultTaskChangesReader: TaskChangesReader = taskId => computeTaskChanges(fileCheckpointService, taskId);

function send(response: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  response.end(JSON.stringify(value));
}

/**
 * Called only after the existing loopback/UI-token authorization. Read-only: the single input is a
 * task id (same grammar as checkpoint task ids); no path ever comes from the caller.
 */
export async function handleTaskChanges(request: IncomingMessage, response: ServerResponse,
  reader: TaskChangesReader, url: URL): Promise<void> {
  if (request.method !== 'GET') { send(response, 405, { error: 'method_not_allowed' }, { allow: 'GET' }); return; }
  const keys = [...url.searchParams.keys()], taskId = url.searchParams.get('taskId') ?? '';
  if (keys.length !== 1 || keys[0] !== 'taskId' || url.searchParams.getAll('taskId').length !== 1
    || !/^[A-Za-z0-9._:-]{1,200}$/.test(taskId)) { send(response, 400, { error: 'TASK_CHANGES_INPUT_INVALID' }); return; }
  try { send(response, 200, await reader(taskId)); }
  catch { send(response, 503, { error: 'TASK_CHANGES_UNAVAILABLE' }); }
}
