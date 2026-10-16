> **Historical document, superseded for current Memory placement on 16 October 2026.** Preserve the dated evidence below; do not recreate its old SubProject, MCP-owned memory files, or storage locations. Current ownership and installation status: [Memory consolidation](../CONSOLIDATION.md).

# Memory06–11 source functional verification

Status: all six source implementations are complete and functionally checked offline, with the original broad-suite timeout failures and inherited root gates explicitly retained below. This is not a resident-activation, release-publication or performance claim.

## Source and compatibility

- Base: `36e9cb3918c0f0e225fbcc18b8f92b4c8bf479f3`, existing dot Linux checkout.
- Full functional sweep: `51fe0df8fdd43fd25559aecd70f8e3025aaac8f8`.
- Subsequent bounded recovery: `95900f7` stabilizes cosine for very large/small finite vectors; `adcdaaa` isolates the historical title-only test from newly supported keyword subwords. No broad subsystem was added.
- Source prerelease: `0.15.0-beta.2`; six product-version surfaces and prerelease sequence are synchronized, with one pending minor intent. Existing intents remain unconsumed. Windows beta.1 acceptance is a separate task.
- Default record granularity preserves compatible format3 indexes without a forced embedding rebuild. Passage mode is a host-only opt-in using format4. Query caching and relevance policy remain absent by default. Semantic document representation remains version2.
- Excerpts and identifier-aware lexical tokens are additive source behavior changes. Their selector/tokenizer identities participate in existing continuation binding; old incompatible cursors must restart. No canonical schema, scope, trust or permission relaxation is introduced.

## Functional gates

| Gate | Observed result |
| --- | --- |
| Full standalone functional sweep, single worker | 807 PASS / 4 FAIL, 49 files, 811 tests; exact source `51fe0df` |
| Post-review affected semantic/index/cache/relevance/cross-plan gate | 150/150 PASS, 12 files; includes the final cosine and title-fixture changes |
| Real cross-plan integration | 3/3 PASS in the full and affected gates: excerpt plus relevance envelope budgets, identifier content-only admission, passage repair/cursor/cache/scope/forget |
| Root focused gate | 48 PASS / 1 inherited FAIL, 8 files, 49 tests |
| Root build, including standalone TypeScript and path policy | PASS at `51fe0df` and final post-recovery `adcdaaa` |
| Final rebuilt host/protocol/replay gate | 16/16 PASS, 3 files, `adcdaaa` |
| Isolated original timeout retry | 1 PASS / 2 TIMEOUT; explicit repository limits unchanged |
| Timeout-only diagnostic copies | 2/2 PASS; 67 unselected skipped; exact assertions and fixture values retained |
| Release prerelease identity | 6/6 PASS within the root focused gate |
| Read-only release plan | PASS; pending intents retained |
| Read-only compatibility report | No breaking contract evidence; existing MCP manifest budget FAIL: 123,252 bytes versus 120,000 |

The full sweep excluded `memory-lifecycle-evals.test.ts`, whose timed workload benchmarks are deferred. Deterministic operation/byte-count correctness tests remain included; their runner durations are not latency measurements. The full sweep used a 15-second test/setup allowance, retaining explicit per-test limits and every original assertion. Earlier default-5-second disclosure failures remain in the evidence; the same disclosure suite passed 34/34 in the final broad run, including the 61-record case.

### Four broad-sweep failures and recovery

1. The historical title-only test expected normalized BM25 to increase, but its `penghubung-nebula` keyword now correctly supplies the `nebula` subword. Both normalized scores were 1. The fixture now explicitly verifies absence of both query words from baseline content/keywords and their presence in the title. The original score-increase assertions remain, and separate alias coverage remains unchanged. The corrected seven-case contextual-document suite passed in the 150-case gate.
2. Existing episode sequence/reducer reconstruction exceeded the 15-second runner allowance and had a subsequent temporary-directory cleanup `ENOTEMPTY`.
3. Existing 25-event retained episode pagination exceeded its explicit 30-second limit.
4. Existing 502-record exact-byte transfer exceeded its explicit 60-second limit and had a subsequent temporary-directory cleanup `ENOTEMPTY`.

An isolated retry recovered the sequence/reducer case (1 PASS), while the two explicit 30/60-second cases remained timed out (2 FAIL; 66 unselected cases skipped). One final diagnostic uses exact copies of only those suites outside product paths, with 180-second test limits and mechanical import relocation. A reversible transform and source/copy hashes verify that no assertions or fixture values change. The first copy audit caught an accidentally relocated unused fixture path; that attempt was cancelled before acceptance and its log retained, then the import-only transform was corrected. The corrected final diagnostic passed 2/2 selected cases (67 unselected skipped), completing every original assertion. Original timeout failures remain failures, and no production deadline or repository assertion is weakened.

### Independent edge regressions

- Identifier lowercase expansion: repeated Turkish capital dotted I exceeded the normalized 256-code-point bound. RED confirmed the defect; the selector now rejects the whole oversized occurrence. Queries fail closed, documents explicitly fall back, and single-codepoint legacy behavior remains. Final Plan11 focused gate: 16/16 PASS.
- Sparse embedding arrays: hole-skipping validation admitted invalid vectors. Dense finite validation now rejects them before storage/query reuse.
- Passage aggregate means: finite extreme values could overflow or underflow during normalization. Shared-scale normalization preserves finite persisted means; focused RED/GREEN receipts cover both extremes.
- Shared cosine had the related pre-existing arithmetic defect. Independently scaling each vector preserves direction and neutral zero/dimension behavior, without overflow/underflow. Five focused assertions failed before the fix; direct numeric and actual cached-passage scores pass in the final 150-case gate.

### Root and platform residuals

The sole root focused failure is the existing legacy BM25 character-budget assertion in `tests/memory-bm25-ranking.test.ts`. Its source/test owners are unchanged from the base, and the same failure was already observed in the prior baseline. It remains a failure, not an all-green root claim. The broader root suite was not repeated: previous baseline failures and platform-specific import/PowerShell/.NET limitations remain outside this focused acceptance.

The MCP byte-budget overage is inherited. Every `src/mcp` owner matches the exact base bytes. `release:compat` serializes tool name/title/description/input schema/annotations only; changed AGENTS text is separate server instructions, and version text is server metadata. Neither changes that measured payload. The report records no breaking contract evidence, but does not waive the 120,000-byte gate.

## Per-plan evidence

- **06:** Exact original-content/code-point proof, semantic revision, head fallback and alias equality; all metadata counts toward complete response budgets. New focused cases: 47/47 PASS.
- **07:** Bounded children, parent-only ranking, format/representation/revision validation, exact scope and bounded retry owner; three constructed head/middle/tail oracle cases pass. The 512-job owner does not evict failures into fresh retries. The explicit 128-child coverage cap remains visible. Focused gate: 79/79 PASS.
- **08:** Exact-query volatile cache, copied vectors, TTL/LRU/capacity bounds, singleflight, local abort, clear/identity generations and disposal through the real host close owner. No cached ACL/result/trust or provider network-cancellation claim. Initial focused gate: 166/166 PASS; later numerical recovery is separately recorded.
- **09:** Pure 0-or-2–4-question protocol, six recalls/two expansions, 32,768-byte total, 4,096-byte per-call and 15-second dispatch boundary. Actual host schema examples, conservative exact-revision provenance/conflict merging and visible coverage are verified. Scoped gate: 30/30 PASS. No internal planner/model or production dispatcher was added.
- **10:** Immutable host policy validated before I/O; content lexical evidence or available semantic evidence from the same ranking call; accepted-only paging and exposure. Focused gate: 27/27 PASS. Frozen .75 lexical/.85 semantic policy gives TP5/FP0/TN5/FN0/unknown1 in each small synthetic development/heldout partition. These are fixture correctness counts, not live precision claims.
- **11:** Original-input scan bounds, post-normalization emission bounds, exact/subword occurrences, shared BM25/overlap and versioned continuation. A sealed ten-case corpus uses actual baseline source replay and exact ID/revision oracles with disjoint development/heldout symbol families. No real-world quality gain is inferred.

## Evidence integrity and excluded actions

Six sanitized per-plan ZIPs are prepared from synthetic fixtures, complete case results, source hashes/patches and all RED/GREEN/failure logs. Final packaging records exact membership, byte lengths and SHA-256 digests and verifies every file after a fresh extraction. The ZIP digests are external to the archives to avoid self-reference. Packaging status is recorded in the external `verification-results.json`: six archives, exact membership and all fresh-extraction hashes checked.

No private or production Memory, `.env`, secret, Windows filesystem, installed runtime, dependency installation, real embedding provider, release, deployment or second production writer was involved. Existing host tests use isolated temporary roots and ephemeral local HTTP fixtures only. Performance/latency benchmarks, real provider quality/cost, live ChatGPT/Claude protocol compliance and cumulative reasoning benefit are NOT RUN or unproven by explicit scope.
