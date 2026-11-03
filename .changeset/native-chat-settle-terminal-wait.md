---
"agent-core": patch
---

The end of a Native chat turn now waits separately for the two steps that settle the runtime task of a stopped, failed or interrupted turn. The terminal write (reading the task and `markTerminal`, which syncs to disk) is bounded by the new `settleTerminalWaitMs`, and the finalization that follows by `settleWaitMs`; both are 10 seconds in production, as the single bound was before. Before, one bound covered both steps, so a shortened `settleWaitMs` could cut the disk write short and leave the task `running` when the turn returned. A hanging finalization still does not hold the turn open or block archiving. The settle stays single-flight per task and never rejects, and the sweep at startup, send and archive is unchanged.
