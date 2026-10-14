# Progressive disclosure on v1

Verified on cloud Linux, 7 October 2026. This additive controller facade supports compact discovery and exact selected-record paging without an embedder, model, or API key. Legacy `search()` and its full-record return remain available.

## Use

The host chooses the store root and binds scope. Model-supplied arguments cannot override that scope.

```ts
import { initializeStandaloneMemory } from 'agent-core-memory';

const memory = await initializeStandaloneMemory({ baseDir: process.cwd() });
const controller = memory.controller({
  workspaceKey: 'agent-core',
  taskId: 'repair-task',
  controllerId: 'controller-a',
});

const page = await controller.recall({ query: 'repair lesson', budget: { maxBytes: 8192 } });
if (page.status !== 'insufficient-budget' && page.data.hits.length) {
  const hit = page.data.hits[0];
  const opened = await controller.expand({
    source: { kind: 'memory', id: hit.id, revision: hit.revision },
    view: 'record',
    budget: { maxBytes: 8192 },
  });
  // If opened.data.nextCursor exists, repeat expand with the same source/view.
  // Concatenate page text in offset order, then JSON.parse the completed text.
}
```

- `capabilities()` reports contract version 1, `map`/`abstract`/`record`, legacy-read write mode, advisory status, and unsupported temporal queries.
- Query recall defaults to `abstract`: a deterministic prefix of at most 240 Unicode code points. It is a preview, not a semantic summary. Query-free recall uses `map` and exposes no body. Explicit query-free `abstract` is rejected.
- Public hits contain IDs, semantic revisions, conservative statuses, expansion views, and receipt-compatible retrieval evidence. They never contain a nested `MemoryRecord`. Long titles and exact IDs are preserved whole; an oversized first hit produces explicit overflow rather than losing metadata silently.
- `expand()` reads only the requested ID with access tracking disabled. Its text is canonical v1 JSON containing body, title, context, keywords, tags, category, links, provenance, source, pin, and expiry where present. Access statistics, derived history, and host-absolute source/repo/workspace pointers are omitted. Opaque v1 link references are not invented into exact source refs; `sourceRefs` is empty in this increment.
- Revisions include meaning/applicability/provenance fields. Access-only reads do not change them; metadata-only correction does. Semantic revision, feedback content digest, and legacy record fingerprint are separate identities. None verifies the truth of the text.
- A cursor binds root, workspace, task, query/filter/view, actual snapshot/source revision, and position. Ranking time is fixed across recall pages so current-time recency rounding cannot reshuffle an unchanged result set. Eligibility is still checked at current time. Controller/session handoff within the same host task is allowed; changing the root, workspace, or task fails explicitly. The checksum is an unkeyed integrity hint that a caller can recompute. Actual host scope/source/query/revision/position checks enforce the read boundary; the cursor is not an authenticated or tamper-proof token.
- Only the canonical pinned `agent-core-foundational` crosses workspace filters. Arbitrary pinned notes do not. Notes lacking a workspace are excluded from a workspace-bound session. Missing, corrupt, or unreadable canonical/visibility state fails closed on the facade. A legitimate complete foundation-only store initializes empty visibility under the writer lock after a fresh canonical recheck. Existing-note stores never receive an automatic empty replacement.
- Exposure telemetry records the actual disclosure view, final-envelope payload digest/bytes, and returned versus omitted records. It does not treat a preview or a terminal continuation suffix as full-record exposure, use, success, or semantic verification. Only a single complete record response starting at offset zero receives full exposure disposition. Ledger failure is a typed error rather than a false success.

## Budget and overflow

`maxBytes` defaults to 8192 and accepts integers from 512 through 65536. Measurement covers the entire final UTF-8 JSON envelope, including fields, warnings, cursors, and the metrics themselves. `payloadBytes` equals the actual serialized size. `estimatedTokens` is the final JSON's Unicode code-point count divided by four, rounded up; its estimator is `unicode-codepoints/4-v1`. It is not a tokenizer-specific hard token cap.

Oversized hit metadata is not silently truncated. Paging emits only whole hits. Record expansion chunks the view at Unicode code-point boundaries. When even the minimum page cannot fit, the result is `insufficient-budget` with `requiredBytes`, measured metrics, and warnings. A 512-byte budget can return explicit overflow; it does not promise that a complete hit or continuation envelope fits. Metadata beyond the maximum supported budget needs a narrower query or the legacy host read path.

## Limits and typed errors

This is the first read-only experience increment. There is no retained historical revision lookup, episode/evidence expansion, capsule, v2 write, or temporal fact query yet. A changed exact v1 source returns `MEMORY_REVISION_CONFLICT`; it never redirects to latest. Default recall/expansion excludes currently forgotten, expired, or superseded records. Store reads are not claimed to be linearizable multi-file snapshots; stronger transaction/archive guarantees belong to the next increment.

`retention: 'archive'` returns an empty partial page with `archiveSearchAvailable: false` and `archive-not-enabled`. `retention: 'all'` also declares incomplete archive coverage. Episode-related methods reject `MEMORY_EXPERIENCE_NOT_ENABLED` without write effects. Facade `asOf` rejects `MEMORY_TEMPORAL_UNSUPPORTED`.

Other errors are `MEMORY_INPUT_INVALID`, `MEMORY_SCOPE_MISMATCH`, `MEMORY_CURSOR_INVALID`, `MEMORY_CURSOR_STALE`, `MEMORY_SOURCE_UNAVAILABLE`, and `MEMORY_DISCLOSURE_LEDGER_UNAVAILABLE`. Messages expose only the code, not source bodies or validation inputs. Legacy stores that never wrote a visibility file are indistinguishable from stores whose visibility was lost: the facade reports unavailable until deliberate host restoration/repair. No repair operation is added here. Legacy methods retain their previous missing-state fallback. Workspace filtering is host scoping, not multi-tenant authentication. Memory and its statuses never grant permission to act.

## Verification

```sh
npm ci --ignore-scripts
npm test -- tests/memory-disclosure.test.ts tests/memory-controller-scope.test.ts
npm run build
npm test
npm run verify
```

Node 24.19.0, npm 11.9.0, Debian 13.6 Linux x86_64; existing lockfile unchanged. No new dependencies.

- RED: all 23 initial targeted tests failed because the controller facade was missing, after correcting one test-draft parenthesis.
- Additional RED regressions reproduced recency-clock cursor instability, inactive contradiction labeling, and an incorrect telemetry candidate count, legacy per-candidate clock compatibility, and typed errors after canonical health failure. All are green after their bounded fixes.
- Final targeted run: 40/40 tests across two files, exit 0.
- Final full suite: 59/59 across six files, including all 19 baseline tests, exit 0. No skipped/pending tests in the full run.
- Final build and `npm run verify`: exit 0. An inherited npm `http-proxy` environment-config warning remains; it is not a compiler/test failure.
- Assertions cover final JSON bytes at 512/8192, ASCII/Unicode/escaping, long metadata, exact selected expansion, source and cursor tampering, metadata/access revisions, more than 50 candidates, host scope, and pinned-foundation policy.
- Windows and live-controller/model execution: NOT RUN. The later E13 episode→original-evidence chain and E11 mandatory capsule invariants are not claimed here.

## Synthetic payload measurement

Same five-record synthetic corpus, query and selected body; ten local trials. Both modes return all five discovery hits; only one body is opened through the facade. Legacy uses its existing 100000-character projection limit so all five results are retained; the facade uses an 8192-byte per-response limit. These are different budget mechanisms, not equivalent token caps. Every facade response is within its byte budget and selected body reconstruction is checked.

| Metric | Legacy | Facade |
|---|---:|---:|
| Median discovery bytes | 168290 | 4814 |
| Median total bytes, including selected expansion | 168290 | 23859 |
| Calls | 1 | 4 (recall + 3 expansion pages) |
| Median discovery latency | 36.24 ms | 8.61 ms |
| Median total latency | 36.24 ms | 36.91 ms |
| p95 total latency, ten samples | 46.37 ms | 42.01 ms |

Legacy bytes grow across trials because its full-record result includes access history. Facade discovery varied from 4811 to 4814 bytes. Selected expansion totaled 19045 bytes. Dataset revision: `sha256:abac528fadac6cad6c2e6c3106962e297df9206fe4a0946ded40c96c10246014`.

This is a small correctness-checked sample, not a broad performance guarantee or lifecycle evaluation. Opening every body can remove the selective-disclosure advantage. Additional expansion calls and their latency/bytes are included above; no fixed saving percentage is promised.

## Review round 1

Two exposure-boundary findings were reproduced before fixing: terminal expansion suffixes were incorrectly counted as full records, and missing visibility state could re-expose a forgotten record. The complete RED run had seven expected failures. Narrow fixes now pass 40 targeted and 59 full-suite tests, including missing-after-forget recall/expand before and after restart, absent state before first facade use, corrupt/unreadable state, valid empty visibility, and a complete one-page exposure control. A damaged existing store is never silently reset to empty. The payload sample above was rerun after these fixes.
