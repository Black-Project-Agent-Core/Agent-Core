# WeKnora platform, operations and support audit — Main

Pinned donor: `G:/repos/weknora` at `22a331a2eac6d9ca367cd2fd2cf295cf42c4526e`. Recipient: current `E:/Projects/Agent-Core` working sources. This report records selective semantic traces after full-content mechanical triage. It does not certify every function, dependency, asset, platform or deployment.

## Coverage and authority

The initial Main partition contains 1,668 files: 602 source, 516 tests, 220 configuration/support, 130 documentation, 173 binary assets and 27 vendored source. `main-lexical-triage.json` records every assigned byte read, file header, text classification and declaration scan. A lexical declaration is not a validated call graph. `runtime/build/weknora-donor-20261026/main-read-log.json` retains explicit excerpt ranges and working-source SHA-256 digests; unsuccessful reads are not evidence. Some earlier direct reads are not in this log and are not counted as complete-file semantic coverage.

Raka's original partition additionally hands platform/auth/storage/automation services, repositories and all migrations to Main for comparative disposition. Original inventory ownership stays unchanged. The source-family decisions below cover that handoff; they do not turn mechanical-only files into deeply read files. Native owns agent/session/MCP/sandbox comparative mechanisms even when their handlers/types live in the Main partition. Exact reviewed paths and unresolved depth are retained separately from adoption decisions.

No donor server, Redis, SQL migration, container, connector, browser renderer or external IM channel was started. Donor tests were read selectively and not run. No credentials or actual `.env` files were read. Supporting documentation can be stale: for example CLI AGENTS claims server per-token scope is absent, while inspected current middleware contains explicit API-key capability gates. Source and executed recipient checks take precedence.

## P-01 — auth and scoped access: same principle, different product

`internal/middleware/auth.go::Auth:127–191` routes internal dispatch, JWT and API-key authentication; unauthenticated requests are rejected. `api_key_gate.go::authorize:130–152` defaults to deny for an undeclared route and checks explicit capabilities. Its comment at155–161 documents why engine routes outside the group need a separate key-principal denial. `application/access/knowledgebase.go::ResolveKB:95–155` binds caller tenant and checks API-key KB scope, persisted sharing or a shared-agent read grant rather than trusting a request's source-tenant assertion.

Core already has bearer/OAuth authentication in `src/http/auth.ts`, resource/origin policy in `src/http/security-policy.ts:108–155`, explicit credential tool grants in `src/auth/tool-grant.ts` and host-bound Memory sessions. Native UI uses a loopback check and constant-time token comparison (`src/http/app.ts:65–84`). The grant installer hides disallowed discovery and refuses direct raw calls. **Decision: preserve these existing owners; no enterprise tenant/RBAC database import.** A multi-tenant document-library permission model is not evidence that local authorized workspace identity is missing.

`application/service/tenant_api_key.go::AuthenticateAPIKey:86–102` checks revocation/expiry after hash lookup;105–123 throttles detached last-used updates. This is a useful hot-path pattern but its load/store gate does not itself make concurrent touches exactly once. Core's file credential store, OAuth and provider scheduler have their own persistence/identity contract. No recipient auth write bottleneck was measured, so porting this cache/goroutine pattern is unjustified. Donor `types/secret.go:15–31` defines a redacted-placeholder round trip; dedicated credential endpoints are described at11–12. It is a response/update convention, not proof of at-rest encryption.

## P-02 — request/body and diagnostic bounds: parity, retain smaller appropriate limits

Donor `middleware/logger.go::readRequestBody:100–143` reads only a capped prefix, then reconstructs the reader so logging does not consume the body. `sanitizeQuery:86–96` parses and redacts repeated/encoded sensitive query parameters. `handler/upload_limit.go:43–68` applies upload/JSON caps before multipart/JSON parsing; skill-source JSON has a distinct64KiB limit. These are real boundary improvements over logging an unbounded body, not a reason to import Gin middleware.

Core `src/http/app.ts::readBody:43–52` counts bytes before retaining each chunk (256KiB default); OAuth has a separate64KiB reader. `src/security/redaction.ts:15–40` traverses values with depth/cycle handling; tracker applies redaction before bounded diagnostics and stores64KiB/256 events in its ring (`src/tracker/activity-tracker.ts:31–38`,46–58). **Decision: mechanism parity, no replacement.** A source comparison is not a global security certification; not every route/log producer was exercised.

`infrastructure/web_search/response_limit.go:31–42` distinguishes oversize refusal from a read error and caps error previews at4KiB (`50–74`). Core already has bounded outbound response readers; W-02 adapts only the missing structured *body-read transport cause* classification. No donor16MiB/64MiB constant is copied into tighter recipient boundaries.

## P-03 — SSRF and path confinement: reject weaker broadening

`utils/ssrf_outbound_cache.go:35–76` caches validation by origin and singleflights misses for60seconds. Validation at a new connection remains separate. Entries expire on reuse; the shown map has no capacity bound or periodic sweep, so one-time unique origins can leave entries resident. This is a static resource-risk observation, not a load-test result.

Core public document reads already resolve all answers, require public addresses, pin the actual connection, verify the peer/TLS identity, re-admit redirects and bound30seconds/10MiB/5redirects (`src/net/public-url-read.ts:21–32`,50–109,112–149). Donor browser fallback resolves and pins a hostname (`web_fetch/fetcher.go:366–397`) but explicitly has whitelist exceptions and launches a fresh Chromium flow (`404–433`). **Decision: no cache/whitelist policy broadening and no embedded Chromium owner.** The existing browser/research owners can serve a separately authorized dynamic-page task.

`utils/security.go::SafePathUnderBase:120–136` normalizes absolute strings and checks a separator-aware prefix. It does not resolve symlinks in that function. Core's security/file identity, semantic IDE and process owners must remain authoritative; a lexical-prefix helper must not replace real identity checks. The Python MCP upload resolver is stronger on this narrow point: `mcp-server/upload_paths.py:29–68` uses realpath/commonpath and configured roots, with a guarded cwd fallback. That is a principle already present in recipient scoped file tooling, not a new storage engine.

## P-04 — storage, archives and resource delivery: product breadth, bounded principles already present

`internal/filetransport/response.go::Serve:29–69` receives an already-authorized reader, closes it on all paths, delegates seekable Range/HEAD to Go ServeContent and streams non-seekable bodies without buffering. Authorization remains the caller's responsibility. `application/service/file/object_storage_http.go:37–80` separates setup/header waits from transfer deadlines and retains a fallback whole-transfer deadline;88–99 ties cancellation to closing the body. Multi-backend S3/COS/OBS/OSS/KS3/TOS wrappers and backend-prefixed paths solve a distributed document-library product requirement.

Core's local file/preview and remote document readers already have scoped authorization, bounded projection and process ownership. No authorized object-storage bucket consumer was established in the inspected local owners. **Decision: no cloud object store, schema or backend-registry import.** Transfer streaming can be reconsidered if an actual full-object HTTP consumer needs it; a filesystem projection returning bounded text is a different contract from serving arbitrary original objects.

Donor parser archive helpers check declared size *and* actual decompressed bytes (`docparser/zip_limits.go:42–80`), with per-entry and aggregate image limits. Core already preflights specialized Office/EPUB packages before conversion (`document-projection/service.ts:123–134`); `archive-converter.ts:63–114` checks member count, declared expansion, traversal, symlinks, encryption and compression. Entry streams also enforce actual byte limits (`43–60`). **Decision: parity of layered archive bounds.** Neither this review nor donor comments establish that every third-party parser behaves within a hard process heap bound.

## P-05 — rate limits: reject collision-prone donor accounting

`ratelimit/limiter.go:19–33` atomically prunes/counts/adds a Redis sorted set. However `redisAllow:79–88` forms the member as `instanceID:UnixMilli`; two accepted requests for the same key/instance/millisecond use one member. A repeated ZADD can replace the member rather than add a hit. **Decision: do not copy this accounting.** This is an unexecuted static collision scenario; no donor Redis was contacted. Local fallback semantics and cleanup are separate from distributed admission. Core's provider quotas already belong to the persistent credential scheduler, not this public-embed/IP limiter.

## P-06 — automation, background work and process recovery: retain existing boundaries

`application/service/automation_scheduler.go:74–132` claims due schedules with a versioned transaction, advances schedule time and creates a run; the family also contains lease expiry, overlap policy, prompt recovery and pruning. `automation/instruction.go:31–57` renders known placeholders and bounds carried result text. These are connected unattended-run product features, not a drop-in replacement for Native task checkpoints/provider quotas. No second recurring-job product owner is introduced. User requests for app-level scheduled follow-ups continue through the configured automation tool.

Background registry/inbox/listener families (`internal/background`, service/background*) separate live activity from delivered notices and session lifecycle. Existing Native state, recovery, tracker and event delivery remain the corresponding recipient owners; Native's comparative handoff covers its runtime details. **Decision: product-specific/background principle parity, no independent Redis/SQL queue.** Lease/CAS comments alone do not prove exactly-once external side effects.

Donor `local_shell_job_log.go:11–89` rotates16MiB disk segments while preserving an8KiB head and cumulative offset. This is a useful persistence design but was not benchmarked against Core's actual terminal workload. Core already bounds per-session output at50MiB and evicts oldest lines (`src/rdc/terminal-manager.ts:71`,625–649). Donor's `local_shell_job_identity_other.go` deliberately does not stamp/recover non-Darwin processes. Core queries Windows CIM creation identity and refuses mismatches (`src/rdc/process-ledger.ts:49–84`) and owns process-tree termination. **Decision: no process recovery import; no Windows portability superiority claim.** Persistent rotated output remains a separate future workload decision, not an accepted change.

## P-07 — IM channels, tracing and public embedding: breadth without a current consumer

`im/adapter.go:126–177` separates callback verification/parsing, replies, replace-style stream updates and attachments. `channel_security.go:5–10` refuses DingTalk HTTP mode because its timestamp signature does not authenticate the body; actual external platform behavior was not tested. WeCom/Feishu/Telegram/DingTalk channel families bring platform-specific network identities, dedup and message formatting. **Decision: no unsolicited outbound channels or credential provisioning.** The local Core tool/runtime does not gain a user-authorized messaging consumer merely from donor breadth.

`storageurl/stream.go:73–103`,144–169 holds back incomplete references and caps each retained tail at4096bytes. It solves rewriting donor-specific storage handles across streamed chunks. Core's inspected Native chat completes a bounded provider response and persists turns; no storage-handle rewriting consumer was established. **Decision: no holdback layer.** Native owns reconnect/backpressure comparison, and UI presentation is separately audited.

`tracing/langfuse/manager.go:50–98` uses OTel batching, max queue, sampling and package-local propagation rather than mutating global propagators. Core already has bounded/redacted local tracking and task/evaluation evidence. **Decision: optional external telemetry integration deferred; no silent export of prompts/outputs or new account required.** An exporter is not a proof of task quality or lower latency. `internal/embedpolicy` concerns framing/CSP, not vector embeddings; no Memory-embedding policy is derived from its name.

## P-08 — CLI, MCP clients and UI: preserve wire and owner separation

The complete622-line donor `cli/AGENTS.md` was read as source context; no donor CLI was executed or edited. It describes stable envelopes, typed errors, dry-run and curated MCP. Actual `cli/internal/mcp/tools.go::registerTools:137–148` registers ten tools; annotations are advisory while server auth must enforce authority. `cli/cmd/doc/wait.go:153–228` deduplicates IDs, uses a shared timeout and semaphore, distinguishes cancellation from timeout and partitions outcomes. The semaphore is acquired inside one goroutine per ID, so active HTTP calls are bounded but queued goroutines are not globally capped. **Decision: useful API ergonomics; no parallel CLI/MCP implementation.** Core already owns tool contracts, structured errors, explicit selected-tool grants, workspaces, cancellation and verification receipts.

UI render helpers smooth partial Markdown (`frontend/src/utils/chatMarkdownRenderer.ts:193–270`); stream transport captures assistant identity and avoids repeating an accepted POST (`api/chat/streame.ts:104–119`). Core already deduplicates turns by `clientRequestId` and rejects cross-conversation reuse (`src/agent-chat-service.ts:364–369`). More Vue components, bilingual docs and mobile clients do not establish a better Core task workflow. **Decision: classify their families and keep richer UI capabilities as scoped candidates; no visual redesign or wholesale Vue import.** Native owns deeper agent/context/stream findings.

## Support-family disposition

| Family | Disposition and reason |
| --- | --- |
| `cmd`, config, database, router, common/errors/types | Deployment/wire/domain glue. Keep contracts paired with their caller; do not copy passive structs or migration schemas into existing TS owners. Auth/upload/queue boundaries above are selected semantic traces, not a deep review of all handlers. |
| `handler` KB/search/wiki/memory/datasource | Raka mechanism comparisons plus Main auth/body boundary. Session/model/MCP/agent handler semantics additionally require Native handoff. |
| `infrastructure/chunker`, `docparser` | Raka chunk/source-location/ingestion findings; Main archive/network checks. Python/Go parser service/runtime not imported. |
| web search adapters | Configured provider breadth; capped responses observed. Core's existing research adapters and source provenance remain owners; no credentials installed. |
| all374 migrations | Database compatibility/history for a distinct product. Classified by backend/version/operation; no migration executed or translated. They are not independent runtime features. |
| Docker/Compose/Helm/Formula/Makefile/scripts/GitHub CI | Platform packaging and maintenance. Native Windows resident build/restart remains official Core path; no container/service deployment requested. |
| README/CHANGELOG/API schemas/website-docs/examples | Capability/navigation context. Source verification required before adoption; translated text/generated schemas are not independent implementation proof. |
| binary/media/assets/fonts/icons/fixtures | Identified by path/header/size and kept as donor support material. Not decoded/rendered or copied. A hash/classification does not establish asset license or visual quality. |
| `third_party`, licenses, lockfiles | Vendored/dependency provenance. Root MIT declaration applies to own code, not every transitive component. See ATTRIBUTION and preserved LICENSE; no dependency imported. |
| miniprogram/misc/rerank demo/MCP Python server | Separate clients/examples or optional service entrypoints; inspect boundaries where relevant, no new product owner or service deployment. |

## Remaining depth

Full byte coverage and family classification are attainable; proof that no superior technique exists anywhere is not. Mechanical-only source/test/support rows remain marked as such. No load/penetration/cross-platform/donor-integration testing or corpus-wide retrieval-quality evaluation was performed. W-02 and the subsequently implemented K-LOC-01 meet their source/recipient-regression and resident-activation gates; see the main audit for results. UI/CLI and cross-domain families can generate further candidates as actual consumers emerge, without weakening these evidence labels.
