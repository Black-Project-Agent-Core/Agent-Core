import React, { useEffect, useState } from 'react';
import { formatStepDuration } from './AgentSteps';

export { formatStepDuration };

/** Ticks once per second; mounted only while the turn is running, so it never runs in the background. */
export function ElapsedSeconds({ since }: { since: string }) {
  const start = Date.parse(since);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!Number.isFinite(start)) return null;
  return <span className="chat-elapsed" aria-label="Elapsed time">{Math.max(0, Math.floor((now - start) / 1000))} s</span>;
}
