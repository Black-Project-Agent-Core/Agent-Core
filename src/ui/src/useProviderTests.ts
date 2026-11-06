import { useCallback, useEffect, useRef, useState } from 'react';
import { postHost, subscribeHost, type ProviderTestReport } from './host';

/** Core bounds one test at 5 pages x 15 s per key; the launcher gives up at 90 s. */
const REPLY_TIMEOUT_MS = 100_000;
const requestId = () => globalThis.crypto?.randomUUID?.() ?? `provider-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export type ProviderTestState =
  | { state: 'testing'; report?: ProviderTestReport }
  | { state: 'done'; report: ProviderTestReport }
  | { state: 'error'; error: string; report?: ProviderTestReport };

const BRIDGE_ERRORS: Record<string, string> = {
  agent_chat_provider_unknown: 'Agent Core does not list this provider any more. Refresh the page.',
  agent_chat_provider_test_owner_only: 'Only the owner can test provider keys.',
  agent_chat_provider_test_timeout: 'The test took longer than 90 seconds and was stopped.',
  agent_chat_provider_test_failed: 'Agent Core could not run the test. Check Activity Log.',
};
/** A failed or running retest keeps showing the last report instead of blanking the list. */
const keep = (previous?: ProviderTestState) => previous?.report ? { report: previous.report } : {};
const bridgeError = (error: string) => BRIDGE_ERRORS[error] ?? `The test could not run: ${error}`;

function validReport(value: unknown, providerId: string): value is ProviderTestReport {
  const report = value as ProviderTestReport | undefined;
  return Boolean(report) && report!.providerId === providerId && Array.isArray(report!.keys) && Array.isArray(report!.models)
    && ['ok', 'partial', 'failed'].includes(report!.status);
}

/** Owner key tests per provider, through the desktop host. The last report stays visible while a new test runs. */
export function useProviderTests() {
  const [tests, setTests] = useState<Record<string, ProviderTestState>>({});
  const pending = useRef(new Map<string, { id: string; timer: ReturnType<typeof setTimeout> }>());

  const settle = useCallback((providerId: string, next: (previous?: ProviderTestState) => ProviderTestState) => {
    const waiting = pending.current.get(providerId);
    if (waiting) clearTimeout(waiting.timer);
    pending.current.delete(providerId);
    setTests(current => ({ ...current, [providerId]: next(current[providerId]) }));
  }, []);

  const run = useCallback((providerId: string) => {
    if (pending.current.has(providerId)) return;
    const id = requestId();
    pending.current.set(providerId, { id, timer: setTimeout(() => {
      if (pending.current.get(providerId)?.id !== id) return;
      settle(providerId, previous => ({ state: 'error', error: 'No answer from the desktop host. Try again.', ...keep(previous) }));
    }, REPLY_TIMEOUT_MS) });
    setTests(current => {
      const previous = current[providerId];
      return { ...current, [providerId]: { state: 'testing', ...keep(previous) } };
    });
    postHost({ type: 'agent-provider-test', requestId: id, providerId });
  }, [settle]);

  useEffect(() => {
    const unsubscribe = subscribeHost(message => {
      if (message.type !== 'agent-provider-test-result' && message.type !== 'agent-provider-test-error') return;
      if (pending.current.get(message.providerId)?.id !== message.requestId) return;
      if (message.type === 'agent-provider-test-error') {
        settle(message.providerId, previous => ({ state: 'error', error: bridgeError(message.error), ...keep(previous) }));
        return;
      }
      const report = message.result?.test;
      settle(message.providerId, previous => validReport(report, message.providerId)
        ? { state: 'done', report }
        : { state: 'error', error: 'The answer was not a valid test report.', ...keep(previous) });
    });
    const waiting = pending.current;
    return () => {
      unsubscribe();
      for (const entry of waiting.values()) clearTimeout(entry.timer);
      waiting.clear();
    };
  }, [settle]);

  return { tests, run };
}
