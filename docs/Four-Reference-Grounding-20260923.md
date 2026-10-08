# Four numbered reference repositories â€” source grounding, 2026-09-23

**Outcome: three plans created, one existing plan updated; all four references retained. PLAN ONLY â€” user selection is pending.**

## Delivered documents

| Reference | Plan | Result |
| --- | --- | --- |
| 01-shiploop | `Shiploop-Steal-Use-Integration-Plan.md` | Created; SL-P1 open for selection. |
| 02-SecondSight | `SecondSight-Steal-Use-Integration-Plan.md` | Created; SS-P1 and optional SS-P2 open for selection; source reuse permission unresolved. |
| 03-Serena | `Serena-Second-Wave-LSP-Freshness-Multi-Language-Integration-Plan.md` | Updated in place; section 38 adds S7-P1 without reopening S4/S5/S6. |
| 04-reef | `Reef-Steal-Use-Integration-Plan.md` | Created; RF-P1 open for selection. |

All documents are under `E:/Projects/Agent-Core/docs`. `CODEBASE.md` section 0.1.8 records the same proposal-only state and the four current numbered paths.

## Inventory and source qualification

| Reference | Exact local HEAD | Regular tracked files | Working-tree bytes, excluding Git |
| --- | --- | ---: | ---: |
| Shiploop | a238ad853916fd92319c20b83646abd0cde251cc | 329 | 3,427,542 |
| SecondSight | 3f05d3f681f4b08767aa0026f02d28ab027c442d | 814 | 7,252,413 |
| Serena | 9f19a79a045f3f2681ba7b58f88938b83a81ca8f | 1,103 | 8,838,144 |
| Reef | 5ffac29acddeda199eca369aaf7edf837f642a80 | 1,753 | 16,909,105 |

Total: 3,999 regular tracked files and two additional Reef gitlinks. Both `third_party/cordis` and `third_party/reef-client` directories were empty. They were accounted separately, not read as regular files or treated as audited implementations. No submodule update/fetch was run.

The structural code-suffix indexes contain 254/311/509/936 entries respectively, including tests, recipes and frontend source where present. Python AST parsing produced no parse errors for the indexed Python set. This is structural inspection, NOT a test result or a statement that every indexed function was semantically reviewed. Selected implementation/test bodies and exact native consumers are identified in each plan.

Recent commit summaries and available ref tips were captured read-only. All refs were not semantically audited. Publication assets were inventoried/hashed, not visually analyzed. No external reference was substituted for the supplied local pinned source.

## Findings and selection boundaries

Shiploop contributes block-aware, source-bound review reporting without automatic contract trimming. SecondSight contributes loss-aware invocation/event boundaries without its daemon, model agents, SQL store or transcript hooks. Serena contributes startup readiness observation retention, not timeout-as-success. Reef contributes terminal transport failure semantics, not its training/executor platform.

These are proposed adaptations. Source ordering counterexamples are labeled as deductions, not fresh live incidents. No product tests, live fault injection, provider startup, benchmark, package installation, source implementation, build, release, commit, push, deployment or restart was performed.

The native consumer paths were inspected directly. Grafel reported current and found LspConnection, but its incoming relation list did not fully show the native session constructor. Exact source confirmed that relationship; no complete graph-coverage claim was made and no marker/workspace/reindex action was used.

## Licensing and negative decisions

Shiploop's local LICENSE/NOTICE specify Apache-2.0 attribution; Reef's local LICENSE is Apache-2.0. Serena assigns MIT to SolidLSP and GPL-3.0-or-later to the application; the proposed readiness mechanism stays within the selected MIT provider source and does not copy whole application-dependent classes.

No explicit LICENSE/COPYING/NOTICE path or grant in the checked root README/pyproject was located for SecondSight. Its plan does not authorize copying source/tests/prompts. It records independent native requirements plus a permission review before any substantive incorporation. No license is inferred from public repository visibility.

Every plan includes covered/rejected/conditional families, source caveats, owner/file mapping, post-selection verification, rollback and release boundaries. Other providers, training recipes, autonomous governors, parallel stores and new policy gates are not installed for parity. C# project-opening and other previously conditional Serena leads remain conditional rather than becoming hidden implementation tasks.

## Integrity and continuity

Final reference readback: all four HEADs match, all four worktrees remain Git-clean, and all 3,999 tracked file hashes match the initial inventory. Twenty-four selected native/source/package/notice/installed files match the pre-documentation snapshot. These are scoped checks, not a whole-system recovery or regression suite.

Pre-edit copies of CODEBASE and the existing Serena plan are preserved in `runtime/backups/four-ref-grounding-20260923/`. No reference clone was copied as a backup or deleted. Source-only inspections and planning helpers did not install any proposal.

Evidence root: `runtime/tmp/four-ref-grounding-20260923/` contains `inventory-before.json`, `source-index.json`, `family-census.json`, `native-before.json`, and `integrity-before-memory.json`. Final document/native-memory readback is recorded separately after capture.

The practical retention decision is positive: useful proposals remain in every requested reference. It does not claim universal exhaustion of every possible future use or the unaudited submodule code.

## Final native-memory and document readback

Canonical audit record `a7400e78-d45a-48e3-b965-3d51f4bd2764` was created successfully and read back through the native Memory tools. It links the new proposal audit to the already completed Wave7 work without reopening that scope. Canonical store, index, embedding and intelligence report available with issueCount 0.

Git-backed staleness for the record remains source-unavailable because a capture commit is unavailable; this is not repaired or replaced with an invented Git anchor. The scoped SHA-256 evidence in this audit remains the file-integrity basis.

Final evidence is `runtime/tmp/four-ref-grounding-20260923/docs-memory-readback.json`. Plans remain proposal-only, all four reference checkouts remain retained, and no newly proposed feature is installed.

