# Agent Core — Maintenance Record

> **Created:** 2026-09-17
> **Executed:** 2026-09-17
> **Scope:** Agent Core maintenance record. The first section covers native memory hardening; the later section tracks codebase authenticity and functional-integrity findings.
> **Embedding model decision:** Keep Cloudflare Workers AI `@cf/google/embeddinggemma-300m` at 768 dimensions. The model was not replaced or changed.
> **Overall status:** All Agent Core **root** maintenance findings recorded in this file are **CLOSED** based on source fixes plus functional verification. Full root Node, launcher, and desktop-UI acceptance has been executed. Unrelated SubProjects and explicitly protected reference areas remain outside Agent Core root acceptance by design.
> **External-tool boundary correction (2026-09-17):** Remote Desktop Commander is a separate operator tool, not an Agent Core subsystem. `Start-Desktop-Commander.bat --check`, external RDC Device IDs/sessions/channels, external RDC version, and external RDC profile/allowlist health are **excluded from Agent Core verification evidence**. References in this maintenance record to `src/rdc`, `runtime/rdc`, RDC-derived config, or the 26 machine-control tools refer only to Agent Core's internal vendored machine-control implementation.

## Verification evidence

- Final Agent Core root regression: **15 / 15 Vitest files, 84 / 84 tests PASS**.
- Agent Core internal machine-control bridge regression: **7 / 7 PASS**, including PDF create/read/modify. This is the vendored `src/rdc` handler surface inside Agent Core; it does not test external Remote Desktop Commander.
- Memory-maintenance regression: **15 / 15 PASS**; lock stress previously completed at **150 / 150 assertions PASS** across ten consecutive runs.
- Root TypeScript build: PASS.
- React desktop UI: **3 / 3 PASS**, typecheck PASS, Vite production build PASS.
- Native launcher: **9 / 9 PASS**; launcher test and publish both report `MSB3277=0`.
- Live memory stack after final activation: canonical/index/embedding/intelligence `available`, `issueCount=0`.
- Embedding remains Cloudflare Workers AI `@cf/google/embeddinggemma-300m`, 768 dimensions.
- Full pre-maintenance filesystem backup: `<PROJECT_ROOT>-backup-20260917-150614`.
- Documentation cleanup backup: `<PROJECT_ROOT>-docs-backup-20260917-193021`.

## Closed findings

| Status | Severity | Temuan | Resolution / evidence |
| --- | --- | --- | --- |
| **CLOSED** | **HIGH** | Cross-process memory lock dapat kehilangan mutual exclusion. | `src/memory/lock.ts` sekarang memakai existing `proper-lockfile` dependency untuk atomic lock-directory lease, 5-second heartbeat, 30-second stale recovery, dan cross-process retry semantics. Legacy file locks tetap dimigrasikan secara kompatibel dengan local PID-liveness + type-safe unlink sehingga live legacy owner tidak dicuri. Regression mencakup live-owner legacy protection, stale-directory contention, 8 concurrent contenders, separate Node processes, dan 10-run stress (150/150). |
| **CLOSED** | **HIGH** | Semantic index dapat stale terhadap canonical memory. | `search()`, `evolve()`, dan `consolidate()` sekarang memastikan index sesuai canonical snapshot sebelum semantic use; index APIs juga menolak snapshot fingerprint yang stale. External canonical rewrite regression membuktikan vector dibangun ulang sebelum search. |
| **CLOSED** | **HIGH** | `/health` memory bukan live truth setelah startup. | `MemoryService.refreshHealth()` membaca ulang canonical state dan melakukan read-only index inspection; `/health` dan `memory_status` memakai jalur ini. Missing bootstrap menghasilkan canonical `error`; missing index menghasilkan derived `degraded` tanpa merusak canonical store. |
| **CLOSED** | **MEDIUM** | `budgetChars` tidak benar-benar membatasi hasil pertama. | Retrieval sekarang menerapkan hard budget pada setiap result termasuk result pertama; oversized first result dilewati. Regression hard-budget PASS. |
| **CLOSED** | **MEDIUM** | Validasi persisted embedding terlalu lemah. | Persisted/provider/query vectors sekarang divalidasi exact dimension + finite numeric values + file/embedder identity sebelum digunakan. Wrong-shape persisted vector regression PASS. |
| **CLOSED** | **MEDIUM** | `semanticSimilarity` sebenarnya bukan similarity. | `components.semanticSimilarity` sekarang raw/clamped cosine `0..1`; semantic weight `Ã—4` hanya diterapkan saat menghitung total ranking score. Regression memastikan field tidak >1. |
| **CLOSED** | **MEDIUM** | Relationship evolution tidak memperkuat link existing dan bersifat satu arah. | Intelligence sekarang boleh mengusulkan target existing; dedup memilih strength tertinggi; evolution mencatat `link_strengthened`; ordinary `related` link disinkronkan reciprocal ke neighbor dengan bounded store mutation. Regression membuktikan reciprocal link dan weak-link strengthening. |
| **CLOSED** | **MEDIUM** | `review-supersedes` tidak punya bukti supersession. | Non-directional overlap sekarang dilabel `review-overlap`; hanya high-confidence duplicate tetap `review-merge`. Tidak ada directional supersession claim tanpa evidence. |
| **CLOSED** | **LOW** | MCP schema dan service contract tidak sinkron untuk link timestamp. | `createdAt` pada MCP link input sekarang optional; service tetap menjadi owner default timestamp. Schema regression PASS. |
| **CLOSED** | **COVERAGE GAP** | Test otomatis memory terlalu sempit untuk durability claims. | Added `tests/memory-maintenance.test.ts` dengan coverage lock liveness/concurrency, stale index, hard budget, raw similarity semantics, persisted-vector validation, reciprocal/strengthening relations, consolidation semantics, MCP timestamp contract, delete/link repair, pinned protection, post-start health drift, malformed notes, ordinary CRUD/retrieval metadata, dan missing-index degradation. |

## Current maintenance state

- **Open maintenance items: NONE.**
- Closed findings below are audit history, not future tasks.
- All maintenance-cycle verification and memory UX work is complete; no queued work remains.
- A new maintenance task exists only when the user explicitly requests work or a newly verified defect is recorded as OPEN.

## 2026-09-17 - Codebase authenticity & functional-integrity maintenance

> **Status:** CLOSED for the findings listed below. Verification is functional/authenticity-focused; no speed or latency benchmark was used.
> **Scope:** active Agent Core Node/MCP, internal machine-control layer (`src/rdc`), native memory, auth/OAuth, launcher, desktop UI, tunnel wiring, production `dist`, and runtime truth surfaces. External Remote Desktop Commander is outside this scope.

### Closure evidence

- Pre-fix authenticity regression reproduced the six directly testable defects as **6 / 6 FAIL** before source changes. Separate RED contracts also reproduced UI-origin usage overcounting, the extra `track_ui_event` schema residue, stale desktop UI expectations, and launcher overall-status mismatch when execution was unavailable.
- Final root functional regression: **15 Vitest files / 84 tests PASS**, including authenticity, memory, auth/OAuth, HTTP security, key store, RDC parity, desktop health, and the authenticated PDF create/read/modify path.
- Agent Core internal machine-control regression: **7 / 7 PASS**, including tool publication, config/filesystem/edit/search/process/history/usage behavior, UI-origin accounting, and PDF create/read/modify. External RDC is not exercised by this regression.
- Native launcher regression: **9 / 9 PASS**. The unused WebView2 WPF reference was removed from the launcher compile graph and its transitive injection was stopped; both launcher test and publish report **MSB3277 count = 0**.
- React desktop UI: **3 / 3 PASS**, `tsc --noEmit` PASS, and production Vite build PASS.
- Root TypeScript production build: `npm run build` PASS.
- Production `dist` now contains `dist/rdc/data/onboarding-prompts.json`; direct `get_prompts(onb2_01)` returned success and the expected prompt content.
- Production `dist` PDF smoke produced a real file with `%PDF-` header and `isError=false`; the temporary file was removed.
- Root `Agent Core.exe` was republished again after the portability update as self-contained `win-x64` single-file output. Current installed SHA-256 is `521760CE1B88C066BEA5F00B20E868B07163E14207FD8A83FCD45CAE5485EF50`; it exactly matched the newly published artifact. The launcher derives child runtime/cache/home paths from the resolved Agent Core root and repairs the Windows autostart command to the current Agent Core location.
- Live post-activation readback: Node Core PID `5852`, bridge `status=ok`, Execution `available / rdc-direct`, Memory/canonical/index/embedding/intelligence all `available`, memory `issueCount=0`, EmbeddingGemma provider/model/dimensions unchanged at Cloudflare `@cf/google/embeddinggemma-300m` / 768. Tunnel was running on PID `20668` after the historical activation used for this evidence; `/readyz` stayed ready and continued rejecting unauthenticated MCP initialize.

### Closed authenticity / truthfulness findings

| Status | Severity | Finding | Resolution / evidence |
| --- | --- | --- | --- |
| **CLOSED** | **HIGH** | **Agent Core internal machine-control config (`src/rdc`) could fail open to permissive in-memory defaults.** | `ConfigManager.init()` now clears partial state and rethrows initialization/persistence errors. `get_config` reports `isError=true`; filesystem config lookup no longer converts config failure into an empty/unrestricted allowlist. `ConfigManager.health()` performs a live disk readback. A failed `set_config_value` persistence attempt now says the update was **not committed** and does not claim an in-memory change; negative malformed-config and failed-write regressions PASS. |
| **CLOSED** | **HIGH** | **`/health.execution.status` was hardcoded `available`.** | `/health` now derives execution readiness from live Agent Core internal machine-control config health. Healthy execution preserves the compatibility shape `{status:'available', mode:'rdc-direct'}`; unavailable execution includes issue diagnostics. Launcher overall state now becomes `degraded` when Execution is unavailable. Negative health regression and launcher regression PASS. |
| **CLOSED** | **HIGH** | **Public `get_prompts` was broken in production packaging.** | Root TypeScript config now enables JSON modules and `prompts.ts` imports the onboarding JSON as a build dependency, so it is emitted into `dist`. Legacy `list_prompts` guidance was removed. Production-dist regression/direct readback PASS. |
| **CLOSED** | **MEDIUM** | **`edit_block` advisory non-edits could be counted as success.** | Fuzzy/no-match advisory paths and non-applied edit mismatch paths return `isError=true`; no content mutation is claimed. Production-dist fuzzy regression confirms unchanged target plus error result. |
| **CLOSED** | **MEDIUM** | **Usage/telemetry accounting used stale tool names and counted UI-origin calls.** | Category map now uses current terminal tools and includes `write_pdf`; the MCP wrapper excludes `origin:'ui'` from history/usage/activity accounting. Tracking persistence failures are captured diagnostically without replacing the actual tool result. Regression PASS. |
| **CLOSED** | **MEDIUM** | **Activity Monitor label overstated a one-shot snapshot action.** | User-visible desktop action is now named **System Snapshot**; internal action still records the actual CPU-thread/working-set snapshot. UI lifecycle test verifies the button/action bridge. |
| **CLOSED** | **LOW** | **No-target stop/terminate operations were counted as success.** | `stop_search` for missing/completed sessions and `force_terminate` for missing sessions now return `isError=true`. Regression PASS. |
| **CLOSED** | **LOW** | **Opening the retained feedback form was treated as if feedback had been submitted, and automatic-open failure could be counted as success.** | Browser-open success now stores `feedbackFormOpenedAt` only; Agent Core does not claim survey submission. The unused submission marker method was removed. Automatic browser-open failure returns `isError=true` while still providing the manual URL. Regression verifies form-open state does not set legacy `feedbackGiven=true`. |
| **CLOSED** | **COVERAGE GAP** | **Desktop UI tests targeted the retired clickable status indicators.** | Tests now assert host-driven passive `data-active` indicators, verify they are non-interactive, and cover System Snapshot/lifecycle actions. UI suite is 3 / 3 PASS. |

### Intentional abstractions / retained legacy that are not fake core execution

- `src/rdc/utils/capture.ts` remains an intentional no-op cloud-telemetry adapter. It disables upstream Desktop Commander telemetry; it does not substitute mock filesystem/process/memory behavior.
- `node:local` retains documented virtual negative session IDs while executing real fresh Node scripts. It is not a persistent OS-process session and must not be described as one.
- `featureFlagManager` retains a remote-fetch implementation but is not initialized by the active Agent Core path; dependent onboarding/survey injection remains dormant/default-off.
- Retained RDC HTML/CSS widget assets are not wired as the Agent Core desktop UI. The active desktop UI remains `src/ui -> dist/ui` hosted by WebView2.
- The dead `track_ui_event` schema/handler residue found by the audit was removed; the Agent Core internal machine-control schema map now matches the 26 registered machine-control tools exactly. Dead legacy prompt-list/analytics helpers were also removed so `get_prompts` contains only the advertised `get_prompt` path.

### 2026-09-17 - Portability and RDC/Agent Core boundary correction

- Agent Core runtime path construction is based on the resolved `<PROJECT_ROOT>` rather than a fixed machine/drive location. Launcher child-process environment for temp, npm cache/prefix/userconfig, isolated home/AppData, Playwright, internal machine-control config, and Puppeteer cache is rooted under `<PROJECT_ROOT>\runtime`.
- Windows autostart uses the current resolved `<PROJECT_ROOT>\Agent Core.exe`; when an existing autostart entry points to an old location, the launcher repairs it to the current Agent Core location.
- The current root `Agent Core.exe` was republished from this source and hash-matched to the publish artifact (`521760CE1B88C066BEA5F00B20E868B07163E14207FD8A83FCD45CAE5485EF50`). Native launcher tests remain **9 / 9 PASS** and root Node tests remain **84 / 84 PASS**.
- External Remote Desktop Commander portability/self-repair work is maintained separately. Its `Start-Desktop-Commander.bat --check` result and any temporary-drive relocation check are external-tool evidence only and are deliberately **not** counted as Agent Core portability or health verification.
### Current actionability

- **Open authenticity / functional-integrity findings: NONE.**
- Historical closed findings are retained only as evidence and must not be interpreted as queued work.
- No speed/performance benchmark was used for closure.
- Embedding model remains `@cf/google/embeddinggemma-300m`; no model replacement is planned or implied.

## 2026-11-01 - Helper consolidation and entry-point inventory

- Explicit `/maintenance` pass over `src`, `tests` and `scripts`: seven groups of identical helper functions were merged into one owner each (22 files edited, 3 modules added). No unused candidate was deleted: 839 exports and 5 files are retained as `UNREFERENCED`, `TEST-ONLY` or `UNCERTAIN`.
- **OPEN, pre-existing:** three targeted tests fail identically at `HEAD 055a856` without the consolidation (`mcp-manifest-contract` manifest 132,791 bytes against a 131,072 budget; `semantic-ide-provisioning` and `game-mode-advanced` exceed the 15 s test timeout during dynamic imports). They need their own task.
- **CLOSED 2026-11-01:** `GET /agent/skills` and `POST /agent/skills/:name/native-enabled` were declared inside the `/agent/chat/` branch of `src/http/app.ts` and always answered 404. They now sit before that branch, return an 8-character digest without the `sha256:` prefix, and are covered by `tests/agent-skills-http.test.ts`.
- Full evidence, candidate tables, the `OPEN` duplicate groups and the route/page/tool inventory: [docs/verification/Maintenance-Pass-20261101.md](docs/verification/Maintenance-Pass-20261101.md).

## 2026-11-02 - Second pass: two more helper owners and the skills read-only table

- Explicit `/maintenance` pass run as a delta against the 2026-11-01 pass. No unused candidate was deleted: 829 exports are retained as `UNREFERENCED` (415), `TEST-ONLY` (175) or `UNCERTAIN` (239); the five files not reachable from production roots are the same as yesterday.
- Consolidated: the path-containment test (four copies, now `pathInside` in `src/portability/paths.ts`) and the Native turn digest (two copies, now `sha256Digest` in `src/agent-context-compaction.ts`). Remaining duplicate groups stay `OPEN` with reasons.
- **CLOSED 2026-11-02:** Plan mode and the mutation journal refused seven read-only `skills` actions (`status`, `validate`, `list_revisions`, `list_retired`, `proposals`, `self_awareness`, `explain_improvement`) because `mutation-safety.ts` and `skills-tools.ts` kept two different read-only tables. There is now one table, pinned by `tests/mutation-safety-skills-actions.test.ts`.
- **OPEN, pre-existing:** the three red tests of 2026-11-01 were red again at `HEAD 8b77ff8` before any edit (manifest 132,877 bytes against a 131,072 budget; two 15 s timeouts), plus six failures at pure `HEAD` in `agent-controller`, `agent-chat-service` and `agent-chat-attachments-wiring`. `.anchor/` and `.recall/` (untracked plugin state) are undeclared in `docs/PROJECT-STRUCTURE.md`, so `npm run structure:check` fails; neither was touched.
- Full evidence, candidate tables, the delta against yesterday and the refreshed route, tool, launcher and page inventory: [docs/verification/Maintenance-Pass-20261102.md](docs/verification/Maintenance-Pass-20261102.md).
