import { useEffect, useState } from 'react';
import { observatoryApi } from './api';
import type { ObservatoryHealth } from './types';

export function MemoryObservatoryApp() {
  const [health, setHealth] = useState<ObservatoryHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void observatoryApi.health()
      .then((value) => {
        if (!active) return;
        setHealth(value);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'OBSERVATORY_UNAVAILABLE');
      });
    return () => { active = false; };
  }, []);

  const stateLabel = health
    ? `${health.mode.toUpperCase()} · ${health.status === 'ok' ? 'OBSERVER READY' : 'OBSERVER DEGRADED'}`
    : error ?? 'CONNECTING';

  return (
    <main className="observatory-shell">
      <header className="observatory-header">
        <h1>Memory Observatory</h1>
        <span className={`status ${health?.status === 'ok' ? 'healthy' : 'waiting'}`}>{stateLabel}</span>
      </header>
      <section className="observatory-scaffold" aria-label="Memory Observatory scaffold">
        <div className="scaffold-panel">
          <strong>Memory Graph</strong>
          <span>Authoritative DMF graph arrives in Task 7.</span>
        </div>
        <div className="scaffold-panel">
          <strong>Live Activity</strong>
          <span>Ordered audit activity arrives in Task 8.</span>
        </div>
      </section>
    </main>
  );
}
