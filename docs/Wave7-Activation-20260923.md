# Wave7 activation — 23 September 2026

**Status: COMPLETE — LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED WITH EXPLICIT HOST SKIPS.**

The user explicitly approved activation. Installation, scoped process restart and live readback completed in the same session without requiring manual user action. Product version remains 0.12.0; this was not a release/version bump.

## Installed scope

PY7-P1, TS7-P1, TS7-P2 and S6-P1 are active together with the previously unactivated PY6-P1, TS6-P1 and S5-P1 closure. The Grafel provider now contains G26/G27/G29/G30, including the qualified correction to actual incremental JS import finalization. Earlier selected behavior was preserved.

Exactly 24 selected artifact paths were installed: 11 JavaScript programs, 11 source maps, the Grafel executable and provider metadata. Four paths were additions. All 20 pre-existing files were backed up and verified before replacement. Twenty-seven dependency/package/launcher artifacts were checked and preserved; no whole-dist replacement occurred.

## Direct evidence after installation

| Check | Result |
| --- | --- |
| Installed file hashes versus qualified manifest | 24/24 match |
| Preserved artifact hashes | 27/27 unchanged |
| Installed-dist tests, 15 selected test files | 178 cases: 172 PASS, 0 FAIL, 6 SKIP/excluded; exit 0 |
| Loaded-module provenance | All 11 changed programs loaded from installed dist; 33 installed modules recorded |
| Node Core | PID 5600; created 2026-09-22T17:10:50.2023090Z, after installation |
| Launcher | PID 13928; created after file installation |
| Core /health | HTTP 200, status ok, version 0.12.0 |
| Execution / Memory / Learning | available; memory issueCount 0 |
| Grafel | available/current, issueCount 0; wire 0.1.0 compatible |
| Fresh live provider MCP handshake | 22 tools; input schemas identical to qualified candidate |
| Live code_orient | current/clean graph status and successful CodeIntelligenceService search |
| Old launcher/Core/Grafel processes | All eight initial owned PIDs absent after cutover |

The native test cases are the same qualified cases rerun against installed bytes, not additional distinct tests. No broad regression suite was added.

## Provider identity and qualification boundary

Installed binary: `runtime/grafel/bin/grafel.exe`.
SHA-256: `7c83af3dd0a8870abd07174792b8f1666319b20111ec4bfda06bb2e18d4bcff3`.
Build label: `v0.3.3-agentcore-g26g27g29g30-candidate`. The retained build label does not mean activation is pending.

The installed binary is byte-identical to the candidate that passed the 24/24 cold/watched graph obligations. Those graph fixtures were qualified in the previous task, not re-run against the production workspace here. The original baseline-and-candidate matrix remains historical 23/24 with one defect in the unchanged old baseline; no historical failure was relabeled PASS.

## Explicit remaining limitations

Six native cases remain unverified: two prior host skips and four exact-name exclusions after EISDIR symlink/junction setup failures. They are not counted as passes. Prior provider qualification also retains its documented skip cases.

Semantic IDE health still reports the same three missing managed-provider entrypoint issues observed before activation: Python, C# and PowerShell. Installing native semantic improvements does not repair those managed language-server installations. No live phone command, unrelated source/Git recovery, OAuth reset, reference deletion, release apply, commit, push or publication was performed.

## Evidence, rollback and continuity

Evidence: `runtime/tmp/wave7-activation-20260923/`.
Backup: `runtime/backups/wave7-activation-20260923/`.
Primary evidence: `manifest.json`, `activation-result.json`, `installed-hash-readback.json`, `installed-native-tests.json`, `installed-native-tests.exit.json`, `installed-native-provenance.json`, `post-restart-health.json`, `provider-live-handshake.json`, `activation-verification.json`, `docs-memory-readback.json`.

The offline installer `ACTIVATE-WAVE7-ADOPTION.cmd` is retained for explicit operator use and refuses to write while related processes are active. No rerun or user restart is needed after this verified activation. The old `ACTIVATE-APPROVED-ADOPTION.cmd` belongs to a previous wave.

Canonical activation record: `561784e7-96b0-4b24-964a-940751b5e86e`; implementation record: `1b2416e6-d8e3-4964-bf29-6e2775ed196f`. Both are synchronized with this result and the four existing plans/CODEBASE. Previous qualification evidence remains historical and intact.

**Outstanding activation work for this selected scope: NONE.**
