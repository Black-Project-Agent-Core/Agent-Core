import { useCallback, useEffect, useRef, useState } from 'react';
import { postHost, subscribeHost, type TaskChanges } from './host';

const requestId = () => globalThis.crypto?.randomUUID?.() ?? `task-changes-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const REPLY_TIMEOUT_MS = 25000;
const REFRESH_THROTTLE_MS = 5000;

export type UseTaskChangesState = 'idle' | 'loading' | 'ready' | 'error';

/** Manual by default (call reload). With refreshKey, loads on every key change, at most once per REFRESH_THROTTLE_MS. */
export function useTaskChanges(taskId?: string, refreshKey?: string) {
  const [state, setState] = useState<UseTaskChangesState>('idle');
  const [data, setData] = useState<TaskChanges | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const pending = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | undefined>(undefined);
  const loadRef = useRef<(() => void) | undefined>(undefined);
  const lastLoadAt = useRef(0);

  const finish = useCallback(() => {
    if (pending.current) {
      clearTimeout(pending.current.timer);
      pending.current = undefined;
    }
  }, []);

  const load = useCallback(() => {
    if (!taskId) return;
    finish();
    const id = requestId();
    setState('loading');
    setError(undefined);
    pending.current = {
      id,
      timer: setTimeout(() => {
        pending.current = undefined;
        setState('error');
        setError('The request timed out. Use Refresh to retry.');
      }, REPLY_TIMEOUT_MS),
    };
    postHost({ type: 'task-changes-get', requestId: id, taskId });
  }, [taskId, finish]);

  useEffect(() => {
    const unsubscribe = subscribeHost((message) => {
      if ((message.type !== 'task-changes-result' && message.type !== 'task-changes-error') || message.requestId !== pending.current?.id) return;
      finish();
      if (message.type === 'task-changes-error') {
        setState('error');
        setError(message.error);
        return;
      }
      const value = message.result;
      if (!value || value.taskId !== taskId || !Array.isArray(value.requests) || !value.applied || !Array.isArray(value.applied.items) || !value.external || !Array.isArray(value.external.items)) {
        setState('error');
        setError('The response was not a valid task changes report.');
        return;
      }
      setData(value);
      setState('ready');
    });
    return () => {
      finish();
      unsubscribe();
    };
  }, [taskId, finish]);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    if (refreshKey === undefined || !taskId) return;
    const wait = Math.max(0, lastLoadAt.current + REFRESH_THROTTLE_MS - Date.now());
    const timer = setTimeout(() => { lastLoadAt.current = Date.now(); loadRef.current?.(); }, wait);
    return () => clearTimeout(timer);
  }, [taskId, refreshKey]);

  const reload = useCallback(() => {
    loadRef.current?.();
  }, []);

  return { data, state, error, reload };
}
