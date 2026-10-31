# Code Intelligence

[Mandatory entry](../../AGENTS.md). Global scope/safety still apply. Code-quoted paths are project-root-relative.

## Code Intelligence protocol

Agent Core exposes structural Code Intelligence through seven `code_*` tools backed by the isolated project-local Grafel provider. This is a sibling intelligence capability, not a router or execution gate.

Use it for non-trivial coding work involving architecture, dependencies, callers/callees, flow tracing, endpoint contracts, cross-repo relationships, refactor blast radius, structural debt/security/test/fitness analysis, codebase-specific implementation patterns, workspace/ref routing, or explicit graph repair.

- Start with `code_orient(action=status)` or `code_workspace(action=status)` when freshness matters; use graph evidence only when the selected workspace/ref graph is current.
- Use `code_workspace` for request-scoped workspace resolution/registration/status/index/refs. Never create a hidden global selected project. The user has explicitly pre-authorized repo-local Grafel marker creation: whenever a registration requires `.grafel/group.json`, automatically call/register with `allowRepoMarker=true` without asking again. An explicit `allowRepoMarker=false` still denies the marker for that call. Marker conflicts remain fail-closed, protected-path access still requires its own explicit authorization, and drive-recursive project discovery remains forbidden.
- Existing structural tools accept optional `workspace`, `ref`, and `worktreePath`. If Grafel cannot prove the requested ref/worktree freshness, fail soft rather than silently using the default ref.
- Use `code_orient` for status/orientation/find/inspect plus read-only provider diagnostics/quarantine visibility.
- Use `code_graph` for related callers/callees/uses, paths, bounded subgraphs, and path/data/control/def-use/effect/process traces.
- Use `code_surface` for endpoints, cross-repo links, impact radius, and graph-aware diffs.
- Use `code_analysis` only for targeted debt/security/test/fitness analysis; fitness violations are evidence and never a universal execution gate.
- Use `code_patterns` for repo/module/language/stack-specific recipes grounded in real code exemplars. The implemented lifecycle is query/record/get/refine/apply/reject/promote.
- Use `code_repair` only for Grafel residual-edge metadata. List/inspect first; before submit/abandon inspect the exact relevant current source through normal Agent Core file tools. `bind_to_entity` also requires exact target verification. A successful repair makes that workspace/ref graph dirty until an explicit index refresh proves it current again.
- Treat current source as final authority. Grafel source snippets/graph results never outrank exact current file reads.
- If Code Intelligence is stale, indexing, degraded, unavailable, or insufficient, continue through ordinary Agent Core search/read tools. Never block machine-control or coding work on Grafel readiness.
- Keep machine-control, Memory, Reflexion, Code Intelligence, Grafel Repair, and Fitness as sibling authorities. Do not introduce a Grafel approval/routing gate.
- Generic durable operational lessons belong in Agent Core Memory; task-local failure reasoning belongs in the Reflexion protocol; Grafel Patterns are codebase-specific recipes; Grafel Repair remains provider graph metadata; Fitness remains explicit architecture assertions.
- Record/apply/reject/promote a pattern only when real work/evidence supports that lifecycle event. Do not reinforce a pattern from an unverified outcome.
- Do not use Code Intelligence for unrelated non-code work or trivial direct file operations where structural graph context adds no value.
- Do not persist Grafel findings, repair history, fitness results, or calibration output as Agent Core Memory merely because they exist; durable memory still follows normal capture rules.

### Structural review protocol

Run a structural graph review when a diff changes public signatures, deletes callable entities, changes HTTP/API routes, import/module wiring, message publishers/subscribers, cross-repo contracts, or shared architectural wiring. Skip clearly non-structural formatting/comment/static-fixture-only changes.

Review sequence:

`current diff/source -> Code Intelligence freshness -> impact radius -> targeted graph/surface checks -> exact source verification of material findings -> review conclusion`

Graph evidence is a second opinion. Any material finding must be verified against exact current source before escalation or recommendation. Do not copy Grafel's severity rubric into an automatic policy engine.

### Graph-quality calibration protocol

Use targeted graph/source calibration when onboarding an unfamiliar/large codebase, preparing a high-risk refactor, graph results conflict with source, expected entities/edges are missing, results are suspiciously noisy, or cross-repo evidence is important.

Compare a bounded sample of graph findings against independent Agent Core search/read ground truth. Report only: sample size, confirmed graph hits, observed misses, observed false positives, affected capability/kind, confidence note, and recommended fallback/next action. Do not create a quality database, do not automatically persist calibration to Memory, and do not run a full benchmark pipeline unless explicitly requested.

