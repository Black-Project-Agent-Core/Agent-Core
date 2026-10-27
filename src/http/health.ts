/** Bound diagnostic probes independently so one slow owner cannot take liveness down. */
export function boundedHealthProbe<T extends object>(
  collect: () => Promise<T>,
  options: { timeoutMs?: number; cacheMs?: number } = {},
): () => Promise<T | { status: 'unavailable'; issue: string; issueCount: number }> {
  const timeoutMs = options.timeoutMs ?? 2_000;
  const cacheMs = options.cacheMs ?? 5_000;
  let pending: Promise<T | { status: 'unavailable'; issue: string; issueCount: number }> | undefined;
  let startedAt = 0;
  let completedAt = 0;
  let cached: T | { status: 'unavailable'; issue: string; issueCount: number } | undefined;
  return async () => {
    if (cached && Date.now() - completedAt < cacheMs) return cached;
    if (!pending) {
      startedAt = Date.now();
      pending = Promise.resolve().then(collect).catch(() => ({
        status: 'unavailable' as const, issue: 'HEALTH_PROBE_FAILED', issueCount: 1,
      })).then(result => {
        cached = result;
        completedAt = Date.now();
        pending = undefined;
        return result;
      });
    }
    const remainingMs = timeoutMs - (Date.now() - startedAt);
    const unavailable = { status: 'unavailable' as const, issue: 'HEALTH_PROBE_TIMEOUT', issueCount: 1 };
    if (remainingMs <= 0) return unavailable;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        pending,
        new Promise<typeof unavailable>(resolve => { timer = setTimeout(() => resolve(unavailable), remainingMs); }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
}
