# Native Chat reasoning effort and Skill promotion

2026-10-28. Reasoning UI and the user-authorized trusted-controller approval extension are built and resident. Three exact proposal revisions are catalog-active. Local-operator Low/High UI turns are independently read back below. Learning and document archiving are finalized separately.

## Scope and ownership

Main owns source/UI/backend/launcher, tests, architecture and this report. Native Agent Core remains the user's default engineering partner: preflight and independent reviews were delegated to Native. After the user's explicit approval-policy extension, Main performed the three delegated decisions through the existing Learning/SkillService owners. No source ownership was transferred. No dependencies, secret-key edits, tool grants, commit or push were added. One existing credential received a workspace-scoped proposal-approver allowance.

Baseline branch `feature/claude-donor-up01-up14`, HEAD `07c07d83ab5175b5fe15f49165a469b8d5b09a05`. Earlier uncommitted Anthropic work is preserved and included in the total Git diff; see [its separate evidence](anthropic-provider-setup.md).

## Implementation

- BrainCircuit beside the provider picker opens Auto/Low/Medium/High/XHigh/Max. Only individually confirmed Anthropic model levels appear; missing metadata offers Auto only. Existing localStorage ownership stores global `agentcore.chat.reasoning`; default Auto. Unsupported saved levels reset with a visible notice. Other providers retain the preference but send no effort.
- Menu uses radio semantics, Enter/Space, arrow keys, Home/End, Escape, outside click and focus return. Provider and effort controls are disabled during running, draft creation and paused recovery.
- Optional `reasoningEffort` passes through WebView/MainForm, launcher HTTP, authenticated turn route, service, controller, provider pool and adapter. Auto omits wire `output_config`; explicit values set `output_config.effort`. No new endpoint/MCP input. HTTP validates before streaming/turn creation; service/pool also validate, including selected-credential metadata before inference. Qualification probes stay Auto.
- Nullable `chat_turns.reasoning_effort` uses the existing additive migration; old turns/checkpoints mean Auto. Turn creation snapshots effort; checkpoints retain it, recovery verifies equality, changed-effort request-ID retries conflict even at the concurrent beginTurn boundary. Assistant metadata displays the snapshot.
- Adaptive thinking, omitted display, prefix mismatch drop behavior, ordered content and signatures remain in the existing path. Old ready Anthropic metadata refreshes once; non-ready cache entries retain their retry backoff.

## Verification

| Execution | Result |
| --- | --- |
| Provider/readiness/chat reliability/store | 71 tests passed, four suites |
| HTTP/service/controller/durable continuation | 98 passed, five suites |
| Readiness refresh/backoff regression | 29 passed |
| UI, including two levels, reload, provider switch, Auto omission, unsupported saved value, keyboard/recovery lock | 77 passed, 13 suites |
| Launcher, including low/high/Auto serialization | 40 passed; existing HealthResponseTimeout test first failed during concurrent load, then passed alone and in the full suite |
| TypeScript/Core build | Passed; path policy 506 files/zero exceptions; ownership 42 sources/45 catalog artifacts; structure 471 directories |
| Production UI build | Passed, 1,684 transformed modules |
| Launcher publish | Passed with project-local .NET SDK 8.0.425; single-file candidate SHA-256 `df2eff5540896ed9de49c818ca6ca07ad99f9d356096100cd2cd66c234088db0` |
| Launcher staging/installation | Existing pending/checksum workflow consumed on first official activation; installed EXE matches the published hash above; owner retained the previous EXE backup |
| Resident | Second official restart corrected HTTP option forwarding; Core PID 20472, started 2026-10-28T15:07:02.024Z; health HTTP 200/status ok, build stale=false |
| Real Native UI low/high calls | User-operated launcher UI; local-operator finalized Anthropic turns persist `low` and `high`, responses LOW-OK/HIGH-OK; exact IDs below |
| Final controller propagation regression | 20 passed after asserting effort on every signed-content model call |

Counts overlap and are separate executions, not a sum of unique tests. Fixture results do not prove resident operation. Effort does not guarantee lower Memory/planning latency or better task quality.

## Native partnership and decisions

Partner chat `5ec9c8c9-9e4c-44d9-b798-079064e432dd`: preflight turn `99a101bb-931d-4f08-811b-f308b29d2f54`; review turn `a6392426-9fc0-434b-841e-1db1e81cd581`. Native found the metadata-backoff regression; Main fixed and tested it. Review bridge timed out at 300 seconds, but independent readback confirmed the finalized persisted response; no ambiguous send was replayed. Review was bounded/incomplete, not a full independent audit.

| Proposal | Original requested revision | Historical result before policy extension |
| --- | --- | --- |
| windows-powershell-host | `sha256:3571326aeef21d47d438f64cf6037ccadccbae5552a70fd0b9a8df212ff2df0c` | Exact local approval recorded, build stopped with `SKILL_PROPOSAL_ACTIVE_DRIFT`; existing pack active |
| security-change-review | `sha256:3340e246653231cef3af36daad8d24bce4d5acf0d7fe0db59e58433f0db87952` | Pending local command; absent at preflight |
| skill-authoring | `sha256:913088e3838463ecc57e8f6f7b1dbff425cd80fa4fd4b9e2079dc4f96cb15583` | Pending local command; another pack already active |

The original path required real local-user Native messages. Local conversation `0a8662f1-64cb-4efb-a196-b242499d9863`, message `c0d6401d-fd88-4ec4-bbb9-c5985eec562d`, contained all three commands in one multiline message; whole-message parsing did not recognize it, and decisions remained empty. Main cancelled the ineffective model turn and explained one command per message. The user's later explicit request authorized the separate trusted-controller route described below. No external-origin relabeling, invented evidence or manual catalog write occurred.

Proposal revision and artifact digest are different identities. Stop each affected promotion on revision/validation/active-state drift; preserve history/rollback. Archive only completed human-readable proposals through [the existing guide](../proposals/REVIEW-GUIDE.md). Activation is not measured benefit.

## Applied workflows and continuity

Replica `replica-recon` mapped the official Anthropic API boundary and existing adapter. Primary sources: [effort](https://platform.claude.com/docs/en/build-with-claude/effort), [thinking](https://platform.claude.com/docs/en/build-with-claude/thinking), publisher [TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript) as schema context only. No SDK dependency or third-party source copying.

`frontend-ui-engineering` informed keyboard/focus semantics and existing style reuse; `api-and-interface-design` informed strict boundary validation, Auto omission, additive persistence and replay conflicts. Tests verify those decisions. `mind-control` separated verified metadata, review findings and unknown resident evidence. No performance redesign/benchmark was warranted for a bounded preference field.

Canonical Memory `dcf7c6da-5b5c-47d3-a1fe-32a25aeddc4d` was saved/read back. Main task key `native-reasoning-ui-and-skill-promotions-20261028`, host task `ext-aa70e0f96b594d38814d24222f66b0af`, initial Memory episode `8e7c131f-19db-4f92-ad45-e27c271101eb`. Reconcile binding after Native work before scoped writes. Learning, activation receipt and final outcome are tracked separately from test success.

After Native work, the same host task successfully relinked the original Memory episode. Evidence capture `aab58441-bfdd-4d91-bcdc-833fc315a33c` stores the preactivation report. An append initially used an invalid event kind (`phase-complete` belongs to checkpoint triggers), so it was rejected; the dependent checkpoint then correctly returned a revision conflict. No save was claimed. After reading the exact schema, a `decision` event succeeded at revision 2, checkpoint `700df114-8c18-4086-a099-d3d734ffbff0` succeeded, and independent task-context readback reported current/ready with the activation obligation intact.

Background Browser Control attached a task-created loopback tab; that endpoint is not the launcher's WebView UI. A later close returned `BROWSER_CONTROL_SESSION_NOT_FOUND`. No live UI acceptance or screenshot is claimed from that probe. The user later operated the actual WebView; the independent turn readback is recorded below.

## User-authorized approval-policy extension

After the original local-message blocker, the user explicitly requested: “ubah sistem aturan untuk approve proposal, masukan kamu ke daftar yang memperbolehkan mengirim instruksi spesial soal promote proposal”. This authorizes a real delegated-controller path, not fabricated Native messages. The earlier exclusive local-user requirement is superseded only for credentials explicitly provisioned by the operator. Main still owns all source/auth/docs; Native reviews read-only.

Authenticated principal: `59a9447b-06fc-4961-a533-1bdc03213222`, currently named `claude-code-desktop`, active/no expiry when inspected through public FileKeyStore metadata. The ID identifies a credential, not an AI product. Every holder of that credential shares the allowance; this limit was disclosed to the user. Enrollment and resident delegated promotion succeeded; no key was rotated, renamed or exposed.

Existing owners and trust path:

1. FileKeyStore operator provisioning writes bounded, versioned `proposal-approvers.json` in the existing auth directory, keyed by credential ID and canonical workspace. Missing/malformed state fails closed. There is no provisioning action in the proposal MCP API.
2. Server derives the principal from verified authentication; the existing `skills decide_proposal` branch requires `confirmation=APPROVE_SKILL_PROPOSAL`, `decision=approve`, exact proposal ID/digest/scope and no supplied user evidence. The current external task must resolve for that owner and the requested workspace must match.
3. Live allowance, key expiry/revocation and existing `skills` tool membership are checked on admission. Native model tasks cannot use delegated authority. Name/client-label assertions do not grant it. Rotation does not automatically transfer allowance to a new ID.
4. Learning records a deterministic `controller-decision:` reference plus `controllerId`, session/task and scope, separately from real Native `user-message:` decisions. A later current REJECT/defer/revise decision blocks delegated re-approval, including a new controller session.
5. Existing SkillService owns validation, build, activation and rollback; no catalog overwrite or drift suppression is added. New revisions need new explicit delegated decisions; old approval is not relabeled or carried forward.

Native review turn `f170e2c2-c4ff-47e5-8ca1-410ce69c2513` (three bounded source reads, no mutations) independently flagged identity spoofing, forged evidence, replay/veto protection and stale key-store writes. Main used a separate auth allowlist file so usage writes never replace the allowance. A deterministic two-store fixture then reproduced the older auth bug: verification paused after reading its snapshot, a peer revoked the key, and the old verifier returned a live principal and rewrote revokedAt to null. The new verifier hashes outside the lock, then reloads/checks the live record inside an owner mutation lock; create/import/revoke/rotate share the existing installed `proper-lockfile`/atomic-write pattern. The reproducer failed before and passed after; the final seven-test key-store suite includes multi-instance mutation and non-inherited rotation allowance.

Security workflow: `security-and-hardening` mapped MCP arguments, host identity, auth policy, task/workspace and catalog boundaries, with abuse cases for missing/forged authority, wrong workspace, revocation, malformed policy and stale revision. Performance workflow: `performance-oriented-software-engineering` kept scrypt out of the verification write lock; this is local JSON metadata correctness, not a throughput optimization. No latency, scalability or benefit claim is made without a representative measurement.

The original Windows local decision is preserved as `user-message:9ce8a2b7-8425-412e-a3d7-bd7da92f677b`, session `cda68bef-2a0c-400f-ac06-de75a8c63b0b`, task `78702569-570b-401f-aee8-db8fd6b26da1`, recorded 2026-10-28T14:12:13.148Z. Its create proposal conflicts with a pack already imported earlier. Reconcile by a revision-bound owner workflow; do not reinterpret this old approval as approval of a replacement revision.

Main source-only Learning checkpoint `reasoning-ui-source-verified-awaiting-native-decisions-20261028` completed review as `awaiting-verification`, scoped to the original source/build milestone. It does not complete this expanded user task. Four adapted-use receipts (frontend UI, API/interface, Replica source mapping, Mind-Control evidence checking) were recorded with exact digests and scoped test/report evidence; `trustChanged=false`. Policy authorization source was captured as Memory artifact `994e941e-fae7-4b62-ac3a-046d54dee463`; the task event advanced to revision 3. Checkpoint refused a stale active next-action source: its workspace-file report snapshot had changed as this report evolved. Inspection of the owner showed live-origin revalidation, not a missing task or lost event. Resolve the older checklist with fresh evidence and attach the new next-action to the immutable authorization source; retain historical report snapshots.

Updated checks: delegated approval/Native compatibility/HTTP auth plus key store passed 29 tests in four suites; external proposal/docs + credential grants + manifest passed 25 tests in three suites; final key-store suite passed 7 tests including concurrent stores and non-inherited rotation allowance. Executions overlap. A first delegated test incorrectly expected canonical status `implemented`; existing successful owner behavior is `approved` plus `artifactStatus=catalog-active`, and the test now checks that exact distinction instead of relabeling state. No additional catalog reconciliation was introduced into the delegated route.

## Resident activation and HTTP recovery

FileKeyStore provisioned credential `59a9447b-06fc-4961-a533-1bdc03213222` for `agent-core`; independent owner readback returned allowed=true, foreign-workspace=false, other-principal=false. AGENTS.md now documents the delegated path. The complete changed contract was read in four contiguous fragments and acknowledged at digest `sha256:6cd3db273508f987e61729fe9fe714a970d27ffc6e39b51594fa1989fea1b0a7`. After restart, a fresh contract read matched the previously fully read body byte-for-byte, then a new receipt was acknowledged and canonical Memory inspected first.

First official restart: MCP request log `runtime/restart/mcp-98789b19-a39f-49d0-aef2-2caddc07d09c.log`; worker receipt `a16cf2e7f54f464ea16d3acda86186bd.json` exited 0. Launcher PID 4036 installed the staged EXE at exact hash `df2eff5540896ed9de49c818ca6ca07ad99f9d356096100cd2cd66c234088db0`; the pending checksum marker was consumed and old EXE retained by the owner under `runtime/launcher/backups/launcher-194837d0e2d74e5e96816bd92dabf666.exe`. Its 61-second readiness observation expired before Core was ready; a later independent health read returned ok, PID 11592, start 2026-10-28T14:54:22.542Z, build stale=false at uptime 103 seconds. Window/receipt alone was not treated as health proof.

Live delegated promotion of the unchanged security proposal returned `SKILL_PROPOSAL_CONTROLLER_NOT_AUTHORIZED` before any decision/catalog mutation. Root cause: Main omitted forwarding `proposalDecisionAuthorizer` in the explicit options projection inside `src/mcp/handler.ts`. Direct service tests covered the approval branch, but not this transport factory seam. Main added the typed option and forwarding, then `tests/trusted-proposal-http.test.ts` passed through real HTTP authentication, MCP contract/task binding, FileKeyStore allowlist, exact SkillService activation and deprovisioning; a forged principal argument did not replace the server principal. Core rebuild and launcher republish passed after the fix. The additional official recovery activation completed below; the original one-restart target was not achieved.

Grafel reported the workspace current. Bounded caller review of `createMcpHttpHandler` confirmed the index/service and integration-test callers; exact source plus the authenticated HTTP regression are the authority for the new field. The Codex tool description remains cached without the new marker; existing input fields are unchanged, so live requests can still reach the new server branch. No client-description refresh is claimed.

Memory recovery completed after resolving the stale report-backed checklist. Episode revision 4 checkpoint `fbe487fa-a168-4ed3-815a-51d7a2fc30dd` was independently read back current, with the immutable user-policy source and expanded activation obligation intact.

## Final resident and proposal evidence

Second official restart: request log `runtime/restart/mcp-06f8982c-321a-4bb8-87e9-47a3a1ea66c5.log`, worker receipt `2453e869116a4324925fd06c48e1b3fc.json`, exit 0/readiness ready at 45 seconds. Launcher PID 7852, Core PID 20472. Fresh receipt acknowledged the unchanged fully read contract; canonical Memory was inspected before ordinary work. No further restart was needed for managed Skill activation.

Windows and authoring proposals were stale `create` requests for existing active packs. Main inspected current digests, used `skills(propose)` with the exact old proposal digest, and amended implementation scope to revise the existing pack while preserving packaged references/history. Proposal IDs were retained; old decisions/history remain historical. This was an explicit new proposal revision, not a transfer of the old user approval. Main then separately approved each exact new digest using the newly authorized controller path.

| Skill | Final proposal revision | Independently inspected and validated active artifact digest |
| --- | --- | --- |
| windows-powershell-host | `sha256:507605b6cad774b2ff846af9dbd6e6b4a9ac10af6132326a3c803bfc4bf587bc` | `sha256:2643be829c6590d5cd704742c07aa68ead6b3fd898bab68309de11a1515e0288` |
| security-change-review | `sha256:3340e246653231cef3af36daad8d24bce4d5acf0d7fe0db59e58433f0db87952` | `sha256:3f53d5dd66cd69dd0a1d508377ff985077f4f272d2be37e39f1377d203d30499` |
| skill-authoring | `sha256:077dd1a3de86e73df9e4c13059a8a9a3124331b5964c0d3f2d7d2b9b80e5aea2` | `sha256:20fca6f619dee5b52f5996aae45c310518b92b41aeafeb4f4a5e9d827a293c1b` |

Host decision references, all `build-and-activate`, owner task `ext-aa70e0f96b594d38814d24222f66b0af`, session `ext-owner-11a880351cfd970e4f67fc40732209f8a0cea090623abdfc`, principal above:

- Security 2026-10-28T15:08:24.490Z: `controller-decision:fb6e44f4d2f233f683298b932439d2e361d84a2c763ba8bf24fc084f4b388aca`.
- Windows 2026-10-28T15:14:41.221Z: `controller-decision:20d300edc47d2a01bbf390e1402ecfdaad5785fcc4ab6303d924a1de6ca38e8e`.
- Authoring 2026-10-28T15:14:52.137Z: `controller-decision:ee2f780ef5cba8bbf05357befac01021345b04a4dffbd540ba2809a68386b496`.

Canonical status is `approved` with `artifactStatus=catalog-active`, not a fabricated `implemented` state. All active `allowedTools=[]`; no grants expanded. Windows history retains baseline `sha256:e29336f818de17f65bf968a54eaf2211165feae47677e346ca37ec856babdadb`. Authoring history retains `sha256:01ffebbec6bfe8e359180da66f73a50380fb69e2aa8756782331dceb99121640`; its 2,555-byte `references/intake-review.md` is byte-identical to the baseline, SHA-256 `5d22faaa4741bfe6e352565cb16e9420cb37cbee397ea9853dc111bba25b111a`. Rollback history is present and inspectable; rollback was not executed against the newly active production packs.

Native final read-only review turn `1bb53022-d2c6-4e68-ab56-f6bb3ee8b60c` independently confirmed all three active digests, empty tool declarations and both baseline histories. It read only the first reference fragment, so Main independently compared the full reference bytes. Native flagged stale report text and differences from the original two proposal revisions; the mapping and decision chain above reconcile those observations. Native's claim that IDs differed from preflight was not independently substantiated; persisted exact IDs were retained.

### Actual two-level UI acceptance

User reported successful Low/High operation in the launcher. Independent `native_chat_bridge(read)` of conversation `7da6dcf0-b9f7-45bc-8736-28a4f37ca6cc` establishes local-operator origin and finalized Anthropic `claude-sonnet-5-5` calls:

| Turn | Prompt / response | Persisted effort |
| --- | --- | --- |
| `168fca87-5111-4a38-82fa-8f2cc15958c7` | `Jawab persis LOW-OK` / `LOW-OK` | `low` |
| `f704611b-d0b7-4b7c-a1fe-1da3ab39b3dc` | `Jawab persis HIGH-OK` / `HIGH-OK` | `low` |
| `a3dbdf59-f0de-49f9-8d5b-16678701c916` | `Jawab persis HIGH-OK` / `HIGH-OK` | `high` |

The first HIGH prompt still used Low; the later HIGH turn is the qualifying High call. Prompt text alone does not establish effort. Each turn observed one provider/model call and recorded usage; the adapter wire tests separately assert the exact `output_config.effort` JSON. No interception of private live HTTP bodies or automated WebView interaction is claimed.

### Skill acceptance and bounded reuse

Strict lint over all 46 active catalog packs returned zero parse/name errors. Existing unrelated packs share boilerplate non-trigger text. For these three packs the generic proposal renderer uses singular `Trigger`/`Non-trigger`, while the baseline linter expects plural headings and reports notes. The existing discovery owner explicitly accepts both forms; a read-only assertion using `describeSkill` verified three triggers/three non-triggers per target, declared applicability, unique normalized non-trigger text across the active catalog and empty tool declarations. Other linter notes concern absent UPSTREAM.json for locally authored packs and owner metadata `.agent-core-skill.json`; these are not parse failures. This is a documented format adaptation, not a claim of a clean warning-free global baseline.

Following the fully delivered active `skill-authoring` revision, Main wrote one inactive 1,270-byte draft at `runtime/tmp/reasoning-skill-acceptance/reasoning-transport-fixture/SKILL.md`: bounded name/description, distinct applicability, numbered steps, tool tier table, PowerShell verification command, no grants or imports. Its first `skills(validate)` succeeded without correction, digest `sha256:c655c2ce4c02af6752d31389c89a0e9656e62e33e8a8c97650a6711216a2b2e4`. It was not proposed, imported or activated.

Following the fully delivered active `security-change-review` revision, Main reviewed the known vulnerable auth regression: source is a valid secret admitted to `FileKeyStore.verify` (`src/auth/key-store.ts:176`); asynchronous scrypt at line 185 separates snapshot loading from the old metadata write. A peer operator can revoke during that interval. The old sink saved stale authentication state and resurrected `revokedAt=null`, allowing use beyond revocation. Evidence level: demonstrated by `tests/key-store.test.ts:31`, which pauses after the snapshot, revokes through a second store, then resumes verification; it failed before the fix. Current verification rechecks ID/hash/salt and revocation/expiry inside shared locked mutation at lines 189–193; revoke uses the same mutation owner at line 199. Reachability requires a previously valid secret plus a concurrent revocation, impact is authentication continuity after revocation, and the deterministic regression now asserts null/no resurrection. A client label alone cannot reach delegated approval: server-owned authentication and the live workspace allowlist guard that path. This bounded review did not scan unrelated process/network/archive code and does not claim the absence of vulnerabilities.

No activation or acceptance fixture is evidence of measured Skill benefit. Memory/planning latency is outside this change: one later health response was overall ok while Memory, Learning and Code Intelligence subprobes returned `HEALTH_PROBE_TIMEOUT`; their direct scoped operations continued to work. A subsequent independent health read reported all three available, with unchanged Core PID/build. One lexical-search MCP transport failure was retried read-only after checking process ownership/health; it succeeded without restart. Do not interpret effort levels as a fix for that separate probe latency.

Final combined regression execution: `npx vitest run tests/skill-discovery.test.ts tests/skill-pack-lint.test.ts tests/key-store.test.ts tests/skill-proposal-decisions.test.ts` passed 48 tests in four suites. Resident lexical discovery ranked each of the three target Skills first for its own positive applicability query; all 46 catalog entries were valid, none omitted. These are bounded routing checks, not a measured global effectiveness study. The standalone `verify:skill-routing` command requires explicit fixture/observation datasets; no historical dataset was relabeled as fresh production evidence. `git -c core.whitespace=cr-at-eol diff --check` passed.

Completed human-readable proposal archive destinations (canonical Skill/Learning state stays in place): [windows-powershell-host](../history-agent-core/windows-powershell-host.md), [security-change-review](../history-agent-core/security-change-review.md), [skill-authoring](../history-agent-core/skill-authoring.md). Main preserves the original proposal text/decision history and adds completion evidence before the bounded move. No rollback, release apply, commit, push, dependency install or additional restart was performed for final acceptance.

## Learning and archive closure

Resident Memory evidence `5b2f62b6-f070-4756-8c6a-660ec015404b` is immutable controller-reported evidence with inspectable task/turn/catalog references; it is not automatically a verified fact. Episode revision 6 checkpoint `a5537b29-7154-473a-b57d-32ddd0ed4d31` was read back current/ready. A prior attempt to resolve the final root goal was rejected by `MEMORY_PRESERVATION_REQUIRED`; the reducer requires an active goal even for a later completed episode. No mutation occurred on rejection. Main retained the goal and uses episode status for completion.

Final Learning checkpoint `reasoning-ui-trusted-promotions-resident-final-20261028` used reason `verified-recovery`. The exact task-scoped review completed at 2026-10-28T15:34:03.983Z as `no-new-knowledge`: task outcomes/authorization were already saved in canonical Memory, and no new measured benefit or duplicate procedure/Skill proposal was warranted. Two unrelated pending reviews were retained. Eight bounded adapted-use declarations were recorded across the task; host verification remains unavailable for the narrative report rather than a workflow evaluation manifest, so receipts did not change trust (`trustChanged=false`). This does not negate the separately inspectable fixture, build, live turn and catalog results.

Review's automatic proposal-document publication reported partial for Windows and authoring (`EXTERNAL_PROPOSAL_PUBLICATION_UNAVAILABLE`) after the authorized completion annotations changed their readable projections. The guard did not overwrite those edits. Their successful canonical decisions/catalog activation and completed readable documents remain intact; Main archives those exact completed projections, without retrying build or republishing them. Canonical status remains approved/catalog-active.

Final ledger: source/auth/UI/launcher/tests/architecture/changesets updated as enumerated above; workspace-scoped approver configuration added through FileKeyStore; three managed artifacts activated, two previous revisions retained; one inactive acceptance draft under runtime/tmp; three readable proposal projections moved individually to history after Learning review. No downloads/new packages, secret key changes, tool-grant expansion, commits or pushes. Two official restarts total; current source build is resident. UI behavior and task results are verified; production rollback and quantified Skill benefit remain untested.
