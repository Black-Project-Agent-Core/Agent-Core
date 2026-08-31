# Stability Baseline

This document is the maintained release-facing summary of Agent Core's certified core behavior. Historical implementation checkpoints remain available in Git history, but are intentionally not carried in the current repository tree.

## Certified core

The current stable baseline covers:

- OAuth/MCP availability and custom Agent Core key authentication;
- Deterministic Memory Fabric integrity and deterministic recall;
- Local Continuity snapshot/rehydration;
- dependency-correct concurrent command execution;
- persisted event-driven wake without busy polling;
- factual per-attempt logs/result markers;
- cross-route continuation;
- restart recovery with no false success;
- secret-safe execution-to-memory promotion;
- Windows launcher/tray graceful shutdown and restart;
- legacy operational-tool regression safety.

## Wave A trust-boundary contract

Wave A narrows Agent Core HTTP/OAuth and operational-audit trust boundaries without adding any external AI model, agent provider, or model API key.

The contract is:

```text
operational audit projectId = routed/stored operation projectId
OAuth access-token resource = canonical <base>/mcp resource
missing MCP Origin          = allowed for non-browser clients
invalid/untrusted Origin    = HTTP 403 before authentication/dispatch
GET /health                 = anonymous lightweight readiness
GET /health/metrics         = loopback-only detailed diagnostics
agent_core_health_metrics   = authenticated remote-capable detailed diagnostics
X-Forwarded-* trust         = disabled by default
canonical public identity   = AGENT_CORE_PUBLIC_BASE_URL when configured
```

HTTP trust configuration:

```text
AGENT_CORE_PUBLIC_BASE_URL=<http-or-https-origin>   optional canonical issuer/resource origin
AGENT_CORE_TRUST_PROXY=true|false                   default false
AGENT_CORE_MCP_ALLOWED_ORIGINS=<origin;origin;...>  optional browser-origin hostname allowlist
```

`AGENT_CORE_PUBLIC_BASE_URL` is authoritative when set. Otherwise forwarded host/protocol are used only when `AGENT_CORE_TRUST_PROXY=true`; direct requests cannot manufacture a public OAuth identity merely by sending `X-Forwarded-*` headers. The known GitHub Codespaces reverse-proxy integration opts into trusted-proxy mode explicitly in its startup script; the Agent Core core default remains false.

Rollback is configuration-local: remove `AGENT_CORE_PUBLIC_BASE_URL` when canonical identity is not desired, keep `AGENT_CORE_TRUST_PROXY=false` for direct deployments, and use the authenticated MCP metrics tool instead of exposing detailed HTTP metrics remotely. The security fixes for cross-resource OAuth replay, browser-Origin rejection, and project audit isolation are not intended to have permissive fallback modes.

### Wave A certification evidence

Wave A was certified locally on 2026-08-31. Final evidence from the post-hardening source state:

```text
focused trust-boundary acceptance  7 files / 58 tests PASS
npm run verify                     PASS
full regression                    111 files / 527 tests PASS
intentional platform/perf skips    38 tests
npm run verify:release             PASS
release metadata consistency       PASS
document links                     PASS
live temporary-instance canary     PASS
package/dependency changes          none
external AI model/API dependency   0
```

The live canary used temporary storage and a temporary loopback port with GitHub disabled; it did not consume production secrets. It proved local readiness and detailed metrics, non-browser MCP compatibility, browser-Origin rejection, and canonical OAuth issuer/resource agreement.

## Wave B MCP dual-era contract

Wave B migrates the Agent Core core MCP layer onto the stable split MCP SDK v2 packages while deliberately preserving the existing legacy connector path.

Core dependency contract:

```text
@modelcontextprotocol/server   2.0.0
@modelcontextprotocol/node     2.0.0
@modelcontextprotocol/client   2.0.0 dev-only interoperability test client
@modelcontextprotocol/sdk      absent from root core
plugin/codespace MCP SDK       1.30.0 preserved as legacy compatibility surface
```

Protocol serving contract:

```text
AGENT_CORE_MCP_PROTOCOL_MODE=dual     default
AGENT_CORE_MCP_PROTOCOL_MODE=legacy   runtime rollback

dual mode:
  legacy 2025-era stateless MCP       supported
  modern 2026-07-28 MCP               supported
  server/discover                     supported
  modern per-request envelope         validated by official SDK v2
  Mcp-Method / Mcp-Name               validated by official SDK v2

legacy mode:
  legacy 2025-era stateless MCP       supported
  modern 2026-07-28 negotiation       rejected / auto clients may fall back to legacy
```

Agent Core intentionally retains buffered JSON responses for the certified legacy stateless path by using the official v2 `WebStandardStreamableHTTPServerTransport` with `enableJsonResponse=true`. Modern traffic remains on the official v2 `createMcpHandler` validation/serving path. Agent Core does not implement its own modern protocol parser or `server/discover` semantics.

Wave A remains authoritative ahead of either protocol era: untrusted browser `Origin` is rejected before authentication/dispatch, bearer authentication remains Agent Core-owned, OAuth access tokens remain protected-resource-bound, and detailed HTTP metrics remain loopback-only.

OAuth compatibility policy for Wave B:

```text
DCR                                 preserved for existing connector compatibility
authorization-code response iss     emitted and bound to canonical Agent Core issuer (RFC 9207)
CIMD activation                     deferred until host interoperability and safe metadata-fetch trust policy are proven
speculative auth endpoints          none
```

### Wave B certification evidence

Wave B passed isolated, merged-main, and real public-runtime gates on 2026-08-31:

```text
focused Wave B acceptance          15 files / 110 tests PASS
npm run verify                     PASS
full regression                   113 files / 542 tests PASS
intentional platform/perf skips   38 tests
legacy tool surface               55 / 55 PASS
modern tool surface               55 / 55 PASS
modern 2026-07-28 discover        PASS
legacy-only rollback              PASS
Codespace v1 compatibility        PASS
live dist/index.js dual canary    PASS
live dist/index.js rollback       PASS
fresh npm ci on merged main       PASS; 0 vulnerabilities
merged-main npm run verify        PASS
origin/main exact equality        PASS
real Codespace sourceCommit       2408d41 verified
public /health                    200
public /health/metrics            403
public /mcp no token              401
public untrusted Origin           403
public official client legacy     legacy / 55 PASS
public official client modern     modern / 2026-07-28 / 55 PASS
public OAuth issuer/resource      PASS
temporary public canary key       revoked PASS
external AI model/API dependency  0
```

This certifies Wave B as the default dual-era Agent Core core behavior. The tested configuration-only rollback remains `AGENT_CORE_MCP_PROTOCOL_MODE=legacy`; Wave A trust boundaries remain non-optional in both modes.

## Wave C execution & recovery contract

Wave C hardens the existing deterministic execution surface without adding a second execution engine or changing the 55-tool MCP surface.

Execution containment contract:

```text
command policy decision          structured/deterministic; raw command omitted from decision
shell-compatible command API     preserved
blocked nested interpreters      rejected before persistence/dispatch
process-tree termination         Windows taskkill /T; POSIX process group
wall-clock cap                   enforced
combined stdout/stderr cap       enforced; default 64 MiB, hard config ceiling 1 GiB
CPU-time hard cap                unsupported in current pure-Node adapter
memory hard cap                  unsupported in current pure-Node adapter
```

The output budget is configured with `AGENT_CORE_EXECUTION_MAX_OUTPUT_BYTES`. Exceeding it terminates the owned process tree and produces a factual failed result with `EXECUTION_OUTPUT_LIMIT_EXCEEDED`; Agent Core does not classify a quota-truncated attempt as success.

Execution recovery is an operator-only stopped-runtime workflow:

```text
agent-core execution-backup [reason]
agent-core execution-restore <bundle-path>
agent-core execution-retention-plan [older-than-days]
agent-core execution-retention-apply <plan-path> <bundle-path>
```

`ExecutionService` owns an exclusive runtime lease beside the execution DB. Backup, restore, and retention apply acquire that same lease, so destructive maintenance fails closed while a live runtime owns the database.

A recovery bundle contains a worker-generated/checkpointed SQLite backup plus the complete execution evidence tree. The manifest records source/schema versions, SHA-256 and byte size for the DB and every evidence file, SQLite integrity, creation time, and reason. Restore verifies the whole bundle before mutation, keeps a pre-restore DB/WAL/SHM/evidence rollback snapshot, stages replacements, and automatically restores prior live state if a replacement step fails.

Raw-log retention is explicit and backup-gated. Planning is dry-run only and produces an immutable SHA-256 plan. Apply requires a verified bundle created no earlier than that plan, revalidates the exact candidates, never expands the deletion set, preserves `.result.json` terminal evidence, and writes one JSONL audit decision for every candidate. No MCP restore or physical-purge tool is added.

The detailed operator procedure is maintained in `docs/deterministic-execution-fabric.md`.

The pre-integration Wave C gate on 2026-08-31 produced:

```text
focused Wave C acceptance          17 files / 113 tests PASS
full regression                    118 files / 572 tests PASS
intentional skips                  38 tests
npm run verify:release             PASS
live temporary lifecycle canary    PASS
orphan descendant after cancel     0
output quota canary                4096 / 4096 bytes then failed as required
backup/restore lifecycle           PASS
retention dry-run/action parity    4 / 4 deleted; 0 skipped
package/dependency changes         none
external AI model/API dependency  0
```

Post-integration public runtime was then restarted on the integrated source and verified:

```text
merged-main npm ci + verify:release   PASS
origin/main equality                  PASS at 4d9ee20 integration source
Codespace execution health           healthy / integrity ok / schema 4
public health / remote metrics        200 / 403
public MCP no-token / evil Origin     401 / 403
public legacy MCP                     2025-11-25 / 55 tools PASS
public modern MCP                     2026-07-28 / 55 tools PASS
live execution lease                  PID owner match PASS
live execution-backup while active    rejected PASS
temporary public canary key           revoked PASS
```

This certifies the Wave C code boundary. A final docs-only certification commit is source-synchronized after publication so runtime metadata remains equal to final `origin/main`.

## Wave D audit & observability contract

Wave D adds a local-first observability fabric without changing the 55-tool MCP surface or making telemetry a runtime dependency.

Correlation contract:

```text
HTTP request                      unique requestId + W3C-compatible trace/span context
MCP tool                          nested tool correlation, same request trace
capability route                  routeContextId linked to active request trace
execution_create                 durable creator correlation in run metadata
execution_start / attempt        factual start-request correlation
execution event/result marker    trace + request + route + tool + run/node/attempt lineage
```

Audit contract:

```text
request/routing audit write path     bounded enqueue; no synchronous appendFileSync
authoritative storage                local JSONL
queue                                bounded; drop/error counters are explicit
record integrity                     sequence + SHA-256 previousHash chain
rotation                             whole-record immutable segments
retention                            whole segments only after atomic anchor advancement
verification                         read-only `agent-core audit-verify [audit-root]`
tamper claim                         tamper-evident, not tamper-proof against full local replacement
raw credentials/raw execution logs   excluded
```

Detailed observability metrics remain local-authoritative and low-cardinality. `/health/metrics` keeps the Wave A loopback-only HTTP policy; the authenticated `agent_core_health_metrics` MCP tool remains the remote diagnostic path. Audit health exposes counts, queue state, rotation count, and only a 16-character head-hash prefix.

Optional OTLP export is disabled unless `AGENT_CORE_OTLP_ENDPOINT` is set. The endpoint must be credential-free `http:`/`https:` on `localhost`, `127/8`, or `::1`; query/fragment/userinfo and any remote hostname are rejected. No telemetry API-key/header configuration exists. Only traces and metrics are exported using OTLP/HTTP JSON; local audit remains authoritative.

Collector availability is non-authoritative: timeout/refusal increments local telemetry failure metrics and keeps a bounded retry queue, but does not downgrade Agent Core `overallHealth` or change HTTP/MCP/tool/execution results.

Pre-integration certification evidence on 2026-08-31:

```text
focused adversarial acceptance       23 files / 159 tests PASS
full npm run verify:release           123 files / 605 tests PASS
intentional skips                     38 tests
live correlated execution lineage     PASS
live audit chain                      19 records / 18 rotated segments / verify PASS
live copied-audit tamper              rejected PASS
raw command sentinel in audit         0
local OTLP trace/metric export         PASS
collector removed                     HTTP 200 / overall healthy / export isolated
package/dependency changes            none
external AI model/API dependency      0
pre-integration public baseline       Wave A gates + legacy/modern 55 tools PASS
```

Post-integration Wave D certification on the real Codespace runtime:

```text
merged-main npm ci + verify:release      PASS
full regression                          123 files / 605 tests PASS; 38 intentional skips
origin/main publication/readback         PASS at cc8f571
connection.sourceCommit equality         PASS at cc8f571
public health / remote metrics           200 / 403
public MCP no-token / evil Origin        401 / 403
public correlated MCP response           request ID + traceparent PASS
legacy MCP                               2025-11-25 / 55 tools PASS
modern MCP                               2026-07-28 / 55 tools PASS
live audit verify                        31 records / PASS
live audit dropped / write errors        0 / 0
real telemetry configuration             disabled; no collector required
overall health with collector absent     healthy
temporary public canary key              revoked PASS
```

This certifies the Wave D runtime-code boundary. The final docs-only certification SHA is source-synchronized after publication so `HEAD`, `origin/main`, and Codespace `sourceCommit` remain identical.

## Wave E routing & memory quality contract

Wave E adds offline, deterministic quality certification before routing or recall heuristics may be tuned. The repo owns both corpora and the evaluator; `quality:gate` now runs inside `verify:release`. Evaluation uses only local deterministic code and temporary local SQLite databases.

Pre-tuning → final routing metrics:

```text
tier accuracy                     0.9250 -> 0.9750
false high-impact rate            0.0571 -> 0
unsafe route overpermission       0.2250 -> 0
false read-only classification    0.4737 -> 0
relevant skill precision@2        0.5278 -> 1.0000
unnecessary skill-load rate       0.0833 -> 0
verification correctness          1.0000 -> 1.0000
routing deterministic replay      1.0000 -> 1.0000
```

Pre-tuning → final memory metrics:

```text
Recall@K                          1.0000 -> 1.0000
MRR                               0.9375 -> 1.0000
hard-guardrail recall             1.0000 -> 1.0000
current-revision correctness      1.0000 -> 1.0000
prior-failure recall              1.0000 -> 1.0000
graph-target recall               1.0000 -> 1.0000
conflict visibility               1.0000 -> 1.0000
artifact/procedure recall         1.0000 -> 1.0000
noise displacement rate           0.2500 -> 0
cross-project contamination       0 -> 0
cross-principal contamination     0 -> 0
character-budget correctness      1.0000 -> 1.0000
memory deterministic replay       1.0000 -> 1.0000
```

Evidence-backed production changes were intentionally narrow: token-boundary/semantic capability scoring, least-privilege read-only route permissions, weak route-recommendation filtering with compatibility corrections, and pinned-decision ordering against low-importance chatter. Memory score weights were not changed.

Wave E pre-integration certification evidence on 2026-08-31:

```text
focused adversarial acceptance       20 files / 118 tests PASS
100k memory preflight                 p95 85.299 ms / target <150 ms PASS
SQLite integrity                      ok
full npm run verify:release           PASS
full regression                       130 files / 627 tests PASS
intentional skips                     38 tests
quality:gate                          PASS
routing corpus                        40 cases
memory corpus                         12 cases
package dependency changes            none
external AI model/API dependency      0
temporary local trust-boundary canary PASS
legacy MCP                            2025-11-25 / 55 tools PASS
modern MCP                            2026-07-28 / 55 tools PASS
remote metrics classification         403 through trusted proxy
no-token / evil Origin                401 / 403
```

This evidence certifies the Wave E feature branch before integration. Production certification is recorded only after fast-forward integration, merged-main verification, publication readback, controlled runtime source-sync, and public canary equality.


Post-integration Wave E certification on the real Codespace runtime:

```text
source commit / origin main                c547c937e66c3e51b5b5cbf4d7f4723f6752ee53
connection.sourceCommit                    c547c937e66c3e51b5b5cbf4d7f4723f6752ee53
source equality                            PASS
merged-main npm ci + verify:release        PASS
full regression                            130 files / 627 tests PASS; 38 intentional skips
quality:gate                               PASS
routing tier accuracy                      0.975
false high-impact / overpermission          0 / 0
false read-only / unnecessary skill load   0 / 0
relevant skill precision@2                 1.000
memory Recall@K / MRR                      1.000 / 1.000
noise displacement                         0
project/principal contamination            0 / 0
100k memory preflight p95                  85.299 ms (<150 ms PASS)
public health / remote metrics             200 / 403
public MCP no-token / evil Origin          401 / 403
legacy MCP                                 2025-11-25 / 55 tools PASS
modern MCP                                 2026-07-28 / 55 tools PASS
request correlation headers                PASS
live audit chain                           116 records / verify PASS
temporary public canary key                revoked PASS
package/dependency changes                 none
memory score-weight changes                none
external AI model/API dependency           0
```

One full-suite run exposed a timing-only test flake in the Wave D audit-journal test. The production journal was unchanged; `c547c93` replaced a fixed 10 ms sleep with deterministic append-start synchronization. The focused test then passed and was repeated 10/10 before the fresh merged-main release gate above passed.


## Wave F adaptive resource governance production technical certification

Wave F remains a local deterministic control-plane feature. Resource pressure can reduce only the number of **new** execution nodes dispatched; it never changes process/result truth, terminates already-running work, raises concurrency above the run/operator maximum, or invokes an external AI/model/API.

Feature certification at `0a242b8424081248fb94e28cf7e289fd37aca55c`:

```text
adversarial resource policy matrix         15 tests PASS
scheduler governance acceptance/stress     3 tests PASS
20-node pressure stress max concurrency     4 / 4
pressure-triggered terminate calls          0
unknown resource facts                      no throttle / hard max preserved
throttle/recovery reason events             PASS
scheduled maintenance default               disabled
scheduled destructive call paths            0
execution runtime lease changes              none
DAG validation p95                           1.473 ms / <50 ms PASS
ready dispatch p95                           32.894 ms / <100 ms PASS
persisted wake p95                           7.467 ms / <250 ms PASS
full npm run verify:release                  PASS
full regression                              136 files / 663 tests PASS
intentional skips                            38
Wave E quality:gate                          PASS
package/dependency changes                   none
external AI model/API dependency             0
feature trust-boundary canary                PASS
health / remote metrics                      200 / 403
no-token / evil Origin                       401 / 403
legacy / modern MCP                          2025-11-25/55 / 2026-07-28/55 PASS
```

`LocalMaintenanceCoordinator` has no import/invocation path for retention apply, recovery restore, credential revocation/rotation, or filesystem deletion. Its scheduled work is limited to memory/execution integrity-status reads and `planExecutionRetention` dry-run planning. The existing execution runtime lease is unchanged.

The feature evidence above was subsequently integrated with two concurrent Super-Runtime main histories without conflict. Technical production source `3f27cedbf35826cd45ad172ebd250e68f335437d` passed fresh `verify:release`, was published to `main` non-force, source-synced into the Codespace runtime, and passed production health/audit/public/MCP certification. Certification docs `042d8bc1a8969c8378042d02738e3cb57e92afc6` then passed fresh `verify:release`, were published to both `main` and the Wave F audit branch, and were source-synced with exact `HEAD == origin/main == connection.sourceCommit` equality. Wave F is therefore certified complete; final local-worktree deletion is housekeeping only and does not alter production behavior.


Production technical runtime evidence:

```text
technical production source             3f27cedbf35826cd45ad172ebd250e68f335437d
HEAD == origin/main == sourceCommit     PASS
health / memory / execution             ok / ok / ok
public health / remote metrics          200 / 403
MCP no-token / evil Origin              401 / 403
correlation headers                     PASS
resource governance                     enabled; safe 4 / operator max 4
maintenance                             disabled by default; 0 runs; 0 candidates
legacy MCP                              2025-11-25 / 55 tools PASS
modern MCP                              2026-07-28 / 55 tools PASS
live audit                              216 records / verify PASS
temporary canary key                    revoked PASS
unrelated .vscode editor state          preserved
```

One temporary-key public canary produced a non-reproducing 401 only on its modern request. The key was immediately revoked and verified revoked. Modern discovery/tools then returned 200 both loopback and public using the established runtime connector key, and the final comprehensive public canary passed both protocol eras. No source change was made from that isolated observation.

## Wave G core re-certification and v0.6.0 production evidence

Wave G adds no new reasoning/runtime subsystem. It closes the release-process gap by making the complete 18-area architecture matrix a repository-owned contract and by providing canonical local certification authority through `npm run certify:core:prepublish` and postpublication `npm run certify:core`. GitHub Actions/CI remains outside Agent Core release authority.

The immutable stable release source is `5c19c0535042174a0f9d9a8ff7dd5eeb5c23b087`. The release identity and distribution evidence are:

```text
Agent Core version                         0.6.0
stable tag                                 v0.6.0
stable tag commit                          5c19c0535042174a0f9d9a8ff7dd5eeb5c23b087
GitHub Release                             published stable / non-draft / non-prerelease
required release assets                    7 / 7
local vs GitHub Release byte parity        7 / 7 PASS
GitHub Package                             @black-project-agent-core/agent-core-plugin@0.6.0
package TGZ SHA-256                        6a289bc15e0c4d4d75459ec7aee72749f3b213190c218be6a1feb549f767bf89
package TGZ SHA-1                          1c94478a9c2f29a61e11ab8f8c27de76acfec857
registry vs release TGZ parity             SHA-256 + SHA-1 exact PASS
Presentation Bridge source bundle version  0.2.0
```

Exact remote release assets were downloaded and compared against artifacts rebuilt locally from `5c19c053`; all seven files matched byte-for-byte, and the downloaded `SHA256SUMS.txt` independently verified every checksummed payload. The published registry TGZ was then downloaded through authenticated npm registry access and matched the GitHub Release TGZ exactly (SHA-256 `6a289bc15e0c4d4d75459ec7aee72749f3b213190c218be6a1feb549f767bf89`, SHA-1 `1c94478a9c2f29a61e11ab8f8c27de76acfec857`).

Postpublish core certification at the immutable stable release source:

```text
core matrix                                 18 / 18 PASS
normal regression                           137 files / 668 tests PASS
intentional skips                           38
Wave E quality gate                         PASS
routing tier accuracy                       0.975
memory Recall@K / MRR                       1.000 / 1.000
100k memory preflight p95                   80.036 ms / <150 ms PASS
DAG validation p95                          1.688 ms / <50 ms PASS
ready dispatch p95                          23.949 ms / <100 ms PASS
persisted wake p95                          8.756 ms / <250 ms PASS
max observed / configured concurrency       4 / 4 PASS
stable release parity                       v0.6.0 / 7 assets PASS
external AI/model dependency violations     0
external model endpoint/key marker hits     0
```

One postpublication certification attempt encountered a transient host-load excursion at `185.539 ms` for the 100k memory p95 and correctly failed the `<150 ms` gate. No threshold or runtime source was changed to force a pass. Three immediate 5-sample reruns measured `65.423 / 74.259 / 78.252 ms`, a 25-sample run measured p95 `74.411 ms` (max `77.041 ms`), and the next complete postpublish `certify:core` run passed at `80.036 ms`. The failed excursion remains part of the certification record rather than being hidden.

Final supplemental live GitHub Fabric acceptance passed all four read-only probes using the existing separate repository and Packages credentials without printing either value: identity `GET /user` 200, private repository metadata 200, Git `ls-remote` PASS, and npm package-list 200. The earlier 3/4 probe used the generic Codespaces integration token and correctly exposed its package-scope limitation; final certification used the already-provisioned Packages credential rather than converting that earlier 403 into a false PASS.

After the stable tag was created, concurrent Super-Runtime native-substrate work advanced `main` to `95326bac134cd721cf7e23526725babed9e0bc5c`. Its Agent Core core-adjacent portion only expands fresh-Codespace system prerequisites with `cmake`, `g++`, `ninja-build`, and `ccache`, plus the matching reproducibility test. The immutable `v0.6.0` tag remains at `5c19c053`; latest main was separately required to pass the full postpublish architecture gate.

Latest-main certification at `95326bac134cd721cf7e23526725babed9e0bc5c`:

```text
npm ci + npm run certify:core               PASS / 18 of 18
version                                     0.6.0
normal regression                           137 files / 668 tests PASS / 38 skips
100k memory preflight p95                   72.949 ms / <150 ms PASS
DAG validation p95                          1.670 ms / <50 ms PASS
ready dispatch p95                          24.927 ms / <100 ms PASS
persisted wake p95                          6.821 ms / <250 ms PASS
max observed / configured concurrency       4 / 4 PASS
stable release parity                       v0.6.0 PASS
external model dependency/source violations 0 / 0
```

Controlled runtime source-sync used only the fail-closed `sync-source.sh` fast-forward path and preserved unrelated untracked `.vscode/`. The final v0.6.0 production runtime canary on the same latest-main SHA produced:

```text
HEAD == origin/main == connection.sourceCommit  PASS at 95326bac134cd721cf7e23526725babed9e0bc5c
connection sourceVersion                       0.6.0
public health / remote metrics / local metrics 200 / 403 / 200
MCP no-token / evil Origin                     401 / 403
correlation headers                            PASS
memory health / integrity                      healthy / ok
execution health / integrity                   healthy / ok
resource governance                            enabled; safe 4 / configured max 4
maintenance                                    disabled; 0 runs; 0 retention candidates
legacy MCP                                     2025-11-25 / 55 tools PASS
modern MCP                                     2026-07-28 / 55 tools PASS
live audit                                     389 records / verify PASS
temporary public canary key                    not created
```

A timed-out lifecycle wrapper temporarily left bootstrap/restart flags in the tool environment earlier in Wave G. Prerequisite inspection showed the repository and dependency tree were healthy; the flags were removed only from the repair invocation, after which connection metadata and runtime health proved the synchronized source. No source/history reset, force push, Mac runtime, or semantic bypass was used.

The architecture-level stable claim is ready for final closeout after the documentation SHA carrying this evidence itself passes `npm run certify:core`, is published/source-synced, and local Wave G branch/worktree housekeeping is recorded.

## Last core certification

The final continuity/execution core certification was completed on 2026-08-26 after the execution WAL durability fix and staged default-enabled rollout.

### Regression gate

```text
npm ci          PASS
npm run build   PASS
npm test        PASS
```

Certified regression totals:

- test files: 68 / 68 passed;
- normal tests: 267 passed;
- benchmark-only timing tests: 4, executed separately under performance-gate mode;
- explicit performance-gate tests: 6 / 6 passed.

### Execution performance gate

Certified isolated measurements:

```text
DAG validation @ 128 nodes p95   1.916 ms   target < 50 ms
ready dispatch p95               23.586 ms  target < 100 ms
persisted wake delivery p95      29.667 ms  target < 250 ms
max observed concurrency          4 / 4
max event queries per wait        2
```

The measurements describe the validated environment; correctness is governed by persisted state and tests rather than timing assumptions.

### Memory scale gate

The 100k-item Deterministic Memory Fabric benchmark passed with SQLite integrity `ok` and end-to-end preflight/recall p95 of 67.137 ms against the certified `<150 ms` target.

### Acceptance and recovery

Final acceptance coverage proved:

- dependency-correct parallel scheduling;
- a dependent node can begin after its actual dependency succeeds while an unrelated slow node keeps running;
- fresh same-principal routes can continue owned active execution;
- restart recovery treats a valid terminal result marker as authority;
- missing terminal evidence becomes `interrupted`, never inferred success;
- raw stdout/stderr is not promoted wholesale into DMF;
- synthetic secret evidence does not appear as plaintext in DMF search/export/database paths.

### WAL / graceful exit proof

Execution SQLite automatic WAL checkpointing was replaced with explicit durable boundaries at graph/dynamic-graph/terminal-run transitions. After a real live execution workload, the corrected runtime demonstrated a clean old-process exit during controlled restart and a healthy replacement service.

## Release gate

Stable certification is performed locally by the Agent Core execution authority. Every stable release must pass the local gates below before publication. Once those local gates pass and the build is declared stable, that evidence is authoritative and must not be repeated through GitHub Actions or any other CI runner. GitHub Actions is disabled for this repository and is not an allowed verification or publication path.

The local release gates are:

| Gate | Requirement |
|---|---|
| Dependencies | clean `npm ci` |
| Build | TypeScript build passes |
| Regression | full test suite passes |
| Brand | tracked-source brand scan passes |
| Release metadata | package/server/changelog versions consistent; README remains version-neutral |
| Security packaging | no secrets/runtime/capability caches in release staging |
| Plugin package | tracked-core plugin bundle builds successfully |
| Artifact integrity | SHA-256 checksums generated for published assets |
| GitHub Release | release is published only after verification succeeds |
| GitHub Package | plugin package publishes successfully under the stable channel |

If any local gate fails, local publication stops. After the local gates pass, publication proceeds directly from the verified local artifacts through Native GitHub Fabric and GitHub Packages. CI must not rerun those gates or block the release.

## Evidence policy

Agent Core distinguishes semantic conclusions from operational evidence:

```text
raw stdout/stderr       -> local execution evidence only
execution events        -> execution journal
verified artifact/hash  -> structured evidence
accepted decision       -> DMF / continuity checkpoint
semantic task completed -> explicit task checkpoint only
```

A process disappearing, a timeout, or a restart is never sufficient evidence of success.
