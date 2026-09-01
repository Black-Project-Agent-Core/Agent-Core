export const GRAPH_CHANGING_EVENTS = new Set([
  'memory.node_created',
  'memory.revision_created',
  'memory.edge_created',
  'memory.edge_retracted',
  'memory.conflict_opened',
  'memory.conflict_resolved',
  'memory.remote_pending',
  'memory.remote_synced',
  'memory.hydration_completed',
]);

export function isGraphChangingEvent(event: string): boolean {
  return GRAPH_CHANGING_EVENTS.has(event);
}

export interface GraphRefreshSchedulerOptions {
  debounceMs?: number;
  maxWaitMs?: number;
  now?: () => number;
}

export interface GraphRefreshScheduler {
  schedule(receivedAt?: number): void;
  dispose(): void;
}

function defaultNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

export function createGraphRefreshScheduler(
  refresh: (firstEventAt: number) => void | Promise<void>,
  options: GraphRefreshSchedulerOptions = {},
): GraphRefreshScheduler {
  const debounceMs = Math.max(1, Math.min(options.debounceMs ?? 50, 250));
  const maxWaitMs = Math.max(debounceMs, Math.min(options.maxWaitMs ?? 250, 1_000));
  const now = options.now ?? defaultNow;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;
  let firstEventAt: number | null = null;
  let disposed = false;
  let inFlight = false;
  let rerunAfterFlight = false;

  const clearTimers = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (maxTimer) clearTimeout(maxTimer);
    debounceTimer = null;
    maxTimer = null;
  };

  const armTimers = () => {
    if (disposed || firstEventAt === null) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { void run(); }, debounceMs);
    if (!maxTimer) {
      const elapsed = Math.max(0, now() - firstEventAt);
      maxTimer = setTimeout(() => { void run(); }, Math.max(0, maxWaitMs - elapsed));
    }
  };

  const run = async () => {
    if (disposed || firstEventAt === null) return;
    if (inFlight) {
      rerunAfterFlight = true;
      return;
    }
    const triggerAt = firstEventAt;
    firstEventAt = null;
    clearTimers();
    inFlight = true;
    try {
      await refresh(triggerAt);
    } finally {
      inFlight = false;
      if (disposed) return;
      if (rerunAfterFlight || firstEventAt !== null) {
        rerunAfterFlight = false;
        if (firstEventAt === null) firstEventAt = now();
        const elapsed = Math.max(0, now() - firstEventAt);
        if (elapsed >= maxWaitMs) void run();
        else armTimers();
      }
    }
  };

  return {
    schedule(receivedAt = now()) {
      if (disposed) return;
      if (firstEventAt === null) firstEventAt = receivedAt;
      armTimers();
    },
    dispose() {
      disposed = true;
      clearTimers();
      firstEventAt = null;
      rerunAfterFlight = false;
    },
  };
}
