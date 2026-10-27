# LeanREA: source-first comparison and bounded external fast path

Date: 2026-10-22
Status: SELECTIVE ADOPTION — external instruction source edited; NOT BUILT, NOT LIVE-VERIFIED, performance NOT MEASURED.

## Sources and scope
- Donor checkout: `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/leanrea`, `main` HEAD `09ba4aa0217f82cd880f855a60b877f59f39b22b`, clean at readback.
- Donor files inspected: `README.md`, `leanrea/SKILL.md`, `bench/BENCHMARK.md`, `bench/ctx.sh`, `bench/setup.sh`; no donor commands were executed.
- The original 2026-10-22 comparison used the source layout before collection consolidation on 2026-10-24. **Current locator after the 2026-10-27 storage correction:** [runtime/skills/capability-packs/reverse-engineer-anything/SKILL.md](../runtime/skills/capability-packs/reverse-engineer-anything/SKILL.md). This locator update preserves the dated comparison and recorded digests; it does not claim that the current revision was inspected in 2026-10-22.
- Native Agent changes remain forbidden. All recommendations here target the existing EXTERNAL controller workflow.

## What LeanREA actually is
LeanREA is a single roughly 8 KB instruction Skill, not a decompiler, MCP server, runtime or new analyzer. Its routing table maps artifact formats to existing CLI tools. It teaches byte-first classification, bounded output, hidden-file search, batching independent probes, evidence labeling, and stopping when the question is answered.
Donor benchmarks compare Claude Code Sonnet 5.5 on macOS arm64: 4 reverse-engineering tasks, 3 repetitions per arm (36 runs total). Donor totals: LeanREA 388s / $2.17 / 55 turns / 2.40M tokens / 74 of 75 points; REA-MCP 627s / $3.36 / 124 turns / 5.93M tokens / 75 of 75 points. These figures are donor-reported, not Agent Core measurements. The donor also says on-demand MCP tool search largely avoids full MCP-context cost.

## Source-grounded capability comparison
| LeanREA mechanism | Existing Agent Core owner | Decision |
|---|---|---|
| Read actual file signature / cheap metadata first | REA Skill target routes and `artifact_inspect` static snapshot; no explicit cheap-first phrase in external bootstrap | **ADOPT** as external instruction preference |
| Group independent probes; slice minified/big output | `start_process`, bounded reads, REA targeted Evidence views | **ADOPT** as bounded operating guidance, not new executor |
| Mark observed/inferred/unknown | Existing REA Skill and AGENTS evidence protocol | **REUSE**, no duplicate layer |
| No 207-tool REA MCP registration | Existing pinned 6.5.0 CLI Skill needs no MCP install | **ALREADY MET** |
| Electron/PE/Go/Rust/.NET/SQLite and more | Current REA Skill target-specific routing and artifact analysis | **REUSE existing**; donor does not prove superior coverage |
| macOS `file`, `otool`, `lipo`, `brew`, `head`, `rm -rf`, auto `npx` | Agent Core runs Windows and isolates tool execution | **REJECT direct transplant**; platform and destructive/network effects differ |
| Skip permits and tool gates | Agent Core scope/approval and operator-lease boundaries | **REJECT**; fast path must honor existing permissions |

## Selected improvement (smallest coherent change)
- Updated `src/skills/external-guidance.ts` for `reverse-engineer-anything`: classify from bytes, use bounded read-only metadata first, batch independent checks, slice minified output, stop when sufficient, escalate to pinned REA for unresolved questions, preserve permits, and separate observed/inferred/unknown.
- The route remains an **advisory for external controllers only**. It does not execute tools, install binaries, grant permissions, modify Native registration, change public MCP schemas or touch the REA runtime.
- Existing capability owners are reused; no LeanREA Skill import or additional standalone agent is created. The protected donor checkout remains unmodified.
- A small amount of additional bootstrap text is the tradeoff; the target is fewer unnecessary downstream tool calls, not fewer fixed tokens. This benefit is hypothetical until measured.

## Limits and follow-up verification
- Source edit was applied and manually read back; no TypeScript build, automated tests, native-freeze check, resident restart, CLI inspection run, deployment, or end-to-end RE task was performed in this task.
- Therefore this does **not** establish runtime activation, performance improvement or equivalence for a particular shipped artifact.
- Before activation, obtain approval for `native:check`, focused type/build verification, and an external-only activation/readback; do not assume a pass from static source inspection.
- For performance claims, compare the same Windows tasks (e.g., PE metadata, Go module inventory, Electron IPC, minified JS) with the existing external route versus the revised route. Record wall time, number of tool calls, returned bytes/tokens, evidence completeness, correctness, unknowns, and authorization behavior. Hold model, target hashes and tool availability constant; repeat runs and disclose variance.
- Retain/revert the guidance only if actual behavior improves without reduced coverage, permission bypass or accuracy loss.

## Outcome boundary
Implemented at the external instruction source only. Documentation reflects that candidate state, not a live new RE engine. Nothing in the protected checkout, Native Agent, user-profile Skill catalog, credentials, or installed REA runtime was changed.
