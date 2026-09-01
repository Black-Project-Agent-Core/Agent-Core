import { useEffect, useState } from 'react';
import { observatoryApi } from './api';
import type { ObservatoryHealth, ObservatoryNodeDetail, ObservatorySnapshot } from './types';
import { MemoryGraph } from '../components/MemoryGraph';
import { NodeInspector } from '../components/NodeInspector';

export function MemoryObservatoryApp() {
  const [health, setHealth] = useState<ObservatoryHealth | null>(null);
  const [snapshot, setSnapshot] = useState<ObservatorySnapshot | null>(null);
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ObservatoryNodeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([observatoryApi.health(), observatoryApi.snapshot()])
      .then(([healthValue, snapshotValue]) => {
        if (!active) return;
        setHealth(healthValue);
        setSnapshot(snapshotValue);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'OBSERVATORY_UNAVAILABLE');
      });
    return () => { active = false; };
  }, []);

  const selectMemory = (memoryId: string) => {
    setSelectedMemoryId(memoryId);
    setDetailLoading(true);
    void observatoryApi.node(memoryId)
      .then((value) => {
        setDetail(value);
        setDetailLoading(false);
      })
      .catch(() => {
        setDetail(null);
        setDetailLoading(false);
      });
  };

  const stateLabel = health
    ? `${health.mode.toUpperCase()} · ${snapshot?.status.memoryHealthy ? 'MEMORY HEALTHY' : 'MEMORY DEGRADED'}`
    : error ?? 'CONNECTING';

  return (
    <main className="observatory-shell">
      <header className="observatory-header">
        <h1>Memory Observatory</h1>
        <span className={`status ${health?.status === 'ok' ? 'healthy' : 'waiting'}`}>{stateLabel}</span>
      </header>
      <section className="observatory-workspace" aria-label="Memory Observatory">
        <div className="graph-column">
          <MemoryGraph snapshot={snapshot} selectedMemoryId={selectedMemoryId} onSelectMemory={selectMemory} />
          <NodeInspector detail={detail} loading={detailLoading} />
        </div>
        <aside className="activity-scaffold" aria-label="Live activity scaffold">
          <div className="panel-heading"><strong>Live Activity</strong><span>Task 8</span></div>
          <p>Ordered audit activity arrives in Task 8.</p>
        </aside>
      </section>
    </main>
  );
}
