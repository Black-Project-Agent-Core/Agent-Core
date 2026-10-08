# Agent Core Memory v2 — local compatibility patches

Upstream source is pinned in `UPSTREAM-SOURCE.json` to commit
`b266f62ba11b54859185cede8e61c43c4e28cb9a`.
These patches are **local integration changes**; they are not upstream claims.

## Windows exFAT lock lease

`src/memory/lock.ts` retains proper-lockfile's atomic directory ownership and
cross-process exclusion. exFAT rounds directory timestamps, which previously
caused false `MEMORY_LOCK_COMPROMISED` exceptions on heartbeat renewal.
A Windows filesystem adapter returns a precisely tracked virtual mtime only
while the underlying physical directory identity, birth/creation time,
change time and observed physical mtime remain unchanged.
Unexpected physical mutation is returned unchanged, retaining fail-closed
lease compromise detection rather than disabling the lock.

## Transfer snapshot lock lifetime

`src/memory/transfer-v2.ts` takes a complete, immutable in-memory snapshot
under the Memory lock. Validation, hashing and chunk serialization happen
only after releasing that lock. Source writes cannot mutate the copied Buffers.
This avoids synchronous serialization starving the heartbeat during a
large complete migration. The existing transfer checksum and scope
validation continue to reject corruption and unauthorized records.

## Functional acceptance (not speed benchmarks)

`tests/memory-lock-exfat.test.ts` holds a real filesystem lease across a
heartbeat while a separate process attempts to acquire the same lock.
Windows/exFAT acceptance passed; project-level host/MCP tests and isolated
activation/restore/rollback tests are documented in
the host [installation record](../../docs/Agent-Core-Memory-v2-Installation-20261008.md) and [live acceptance record](../../docs/Agent-Core-Memory-v2-Live-Acceptance-20261009.md). These are recorded, environment-scoped results, not a full Windows regression claim or tests rerun during this documentation refresh.

Legacy Memory data, credentials, original v1 backups, and runtime Memory
roots are not part of the published subproject source.
