import { useEffect, useReducer, useRef, useState } from 'react';
import { observatoryApi } from './api';
import { activityReducer, initialActivityState } from './activity-reducer';
import { createGraphRefreshScheduler, isGraphChangingEvent } from './graph-convergence';
import type { ObservatoryActivity, ObservatoryHealth, ObservatoryNodeDetail, ObservatorySnapshot } from './types';
import { ActivityTracker } from '../components/ActivityTracker';
import { ConflictView } from '../components/ConflictView';
import { FailureSolutionView } from '../components/FailureSolutionView';
import { MemoryGraph } from '../components/MemoryGraph';
import { NodeInspector } from '../components/NodeInspector';
import { RecallView } from '../components/RecallView';
import { SessionTaskView } from '../components/SessionTaskView';
import { TimelineView } from '../components/TimelineView';

type ObservatoryLens = 'graph' | 'timeline' | 'recall' | 'failure' | 'conflict' | 'session';

interface ActivityHighlight {
  memoryIds: string[];
  kind: 'recalled' | 'expanded';
}

function parseSseActivity(event: MessageEvent): ObservatoryActivity | null {
  try {
    const value = JSON.parse(String(event.data)) as ObservatoryActivity;
    return Number.isSafeInteger(value.sequence) && value.sequence >= 1 && typeof value.event === 'string' ? value : null;
  } catch {
    return null;
  }
}

export function MemoryObservatoryApp() {
  const [health, setHealth] = useState<ObservatoryHealth | null>(null);
  const [snapshot, setSnapshot] = useState<ObservatorySnapshot | null>(null);
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ObservatoryNodeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lens, setLens] = useState<ObservatoryLens>('graph');
  const [activity, dispatchActivity] = useReducer(activityReducer, initialActivityState);
  const [highlight, setHighlight] = useState<ActivityHighlight | null>(null);
  const [graphConvergence, setGraphConvergence] = useState({ lastLatencyMs: null as number | null, samples: 0 });
  const lastSequenceRef = useRef(0);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pulseActivity = (record: ObservatoryActivity) => {
    if (!record.memoryIds?.length) return;
    const kind = record.event === 'memory.remember_more_expanded'
      ? 'expanded'
      : record.event === 'memory.recalled'
        ? 'recalled'
        : null;
    if (!kind) return;
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlight({ memoryIds: [...new Set(record.memoryIds)], kind });
    highlightTimerRef.current = setTimeout(() => {
      setHighlight(null);
      highlightTimerRef.current = null;
    }, 1_800);
  };

  useEffect(() => {
    let active = true;
    let source: EventSource | null = null;
    let recovering = false;
    const graphScheduler = createGraphRefreshScheduler(async (firstEventAt) => {
      try {
        const fresh = await observatoryApi.snapshot();
        if (!active) return;
        setSnapshot(fresh);
        const appliedAt = typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
        const latency = Math.max(0, appliedAt - firstEventAt);
        setGraphConvergence((current) => ({ lastLatencyMs: latency, samples: current.samples + 1 }));
      } catch {
        // A failed observer refresh does not mutate or replace the last authoritative graph.
      }
    }, { debounceMs: 50, maxWaitMs: 250 });

    const appendReplay = (records: ObservatoryActivity[]) => {
      for (const record of records) {
        if (!active) return;
        dispatchActivity({ type: 'append', record });
        lastSequenceRef.current = Math.max(lastSequenceRef.current, record.sequence);
      }
    };

    const recoverRetained = async () => {
      if (!active || recovering) return;
      recovering = true;
      try {
        const replay = await observatoryApi.activity(lastSequenceRef.current, 250);
        if (!active) return;
        appendReplay(replay.records);
      } catch {
        // A failed retained replay is not interpreted as an empty history.
      } finally {
        recovering = false;
      }
    };

    const resyncAfterGap = async () => {
      dispatchActivity({ type: 'gap' });
      await recoverRetained();
      try {
        const fresh = await observatoryApi.snapshot();
        if (active) setSnapshot(fresh);
      } catch {
        // Keep the explicit gap visible; never fabricate a snapshot.
      }
    };

    const bootstrap = async () => {
      try {
        const [healthValue, snapshotValue] = await Promise.all([observatoryApi.health(), observatoryApi.snapshot()]);
        if (!active) return;
        setHealth(healthValue);
        setSnapshot(snapshotValue);
        setError(null);

        const initialAfter = Math.max(0, healthValue.auditSequence - 250);
        try {
          const replay = await observatoryApi.activity(initialAfter, 250);
          if (!active) return;
          dispatchActivity({ type: 'replace', records: replay.records });
          lastSequenceRef.current = Math.max(initialAfter, replay.latestSequence, ...replay.records.map((record) => record.sequence));
          for (const record of replay.records) pulseActivity(record);
        } catch {
          lastSequenceRef.current = initialAfter;
        }

        if (!active || typeof EventSource === 'undefined') return;
        source = new EventSource(`/api/stream?after=${lastSequenceRef.current}`);
        source.addEventListener('activity', (event) => {
          const record = parseSseActivity(event as MessageEvent);
          if (!record || !active || record.sequence <= lastSequenceRef.current) return;
          lastSequenceRef.current = record.sequence;
          dispatchActivity({ type: 'append', record });
          pulseActivity(record);
          if (isGraphChangingEvent(record.event)) graphScheduler.schedule();
        });
        source.addEventListener('stream.gap', () => { void resyncAfterGap(); });
        source.onerror = () => { void recoverRetained(); };
      } catch (reason: unknown) {
        if (active) setError(reason instanceof Error ? reason.message : 'OBSERVATORY_UNAVAILABLE');
      }
    };

    void bootstrap();
    return () => {
      active = false;
      source?.close();
      graphScheduler.dispose();
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }
    };
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
          <nav className="lens-tabs" aria-label="Memory Observatory views">
            {[
              ['graph', 'Graph'],
              ['timeline', 'Timeline'],
              ['recall', 'Recall'],
              ['failure', 'Failure/Solution'],
              ['conflict', 'Conflict'],
              ['session', 'Session'],
            ].map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={lens === value ? 'lens-tab lens-tab--active' : 'lens-tab'}
                aria-pressed={lens === value}
                onClick={() => setLens(value as ObservatoryLens)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="lens-surface">
            {lens === 'graph' ? (
              <div className="graph-lens">
                <MemoryGraph
                  snapshot={snapshot}
                  selectedMemoryId={selectedMemoryId}
                  onSelectMemory={selectMemory}
                  highlightedMemoryIds={highlight?.memoryIds}
                  highlightKind={highlight?.kind}
                  convergenceLatencyMs={graphConvergence.lastLatencyMs}
                  convergenceSamples={graphConvergence.samples}
                />
                <NodeInspector detail={detail} loading={detailLoading} />
              </div>
            ) : null}
            {lens === 'timeline' ? <TimelineView snapshot={snapshot} detail={detail} records={activity.records} /> : null}
            {lens === 'recall' ? <RecallView snapshot={snapshot} records={activity.records} /> : null}
            {lens === 'failure' ? <FailureSolutionView snapshot={snapshot} /> : null}
            {lens === 'conflict' ? <ConflictView snapshot={snapshot} /> : null}
            {lens === 'session' ? <SessionTaskView records={activity.records} /> : null}
          </div>
        </div>
        <ActivityTracker records={activity.records} gap={activity.gap} />
      </section>
    </main>
  );
}
