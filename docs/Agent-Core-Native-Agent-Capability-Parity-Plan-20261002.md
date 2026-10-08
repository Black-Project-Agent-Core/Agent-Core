# Agent Core Native Agent Capability Parity — Execution Plan
Date: 2026-10-02

Status: **COMPLETE — NACP-0..NACP-10 RESIDENT VERIFIED — P8 LIVE WEB SEARCH VERIFIED — PLAN CLOSED**

Prerequisite authorities:
- docs\Agent-Core-Interactive-Agent-Chat-Plan-20261002.md — IAC-0..IAC-9 COMPLETE
- docs\Agent-Core-Persistent-Credential-Rotation-Plan-20261002.md — resident provider scheduler verified
- docs\Agent-Core-External-Controller-Cumulative-Learning-Plan-20261001.md — EC-0..EC-9 historical acceptance authority
- docs\CODEBASE.md
- canonical Memory implementation-verification for IAC-9 and persistent credential rotation

## 1. Goal

Make the AI Agent running inside Agent Core Interactive Chat capable of using the Agent Core body with functional parity to an external controller such as ChatGPT when that controller is not present.

Target architecture:

External Controller (ChatGPT)          Native AI Agent
            \                              /
             \                            /
              +------ SAME AGENT CORE ----+
                       |
                 SAME Memory
                 SAME Learning
                 SAME Skills
                 SAME Procedures
                 SAME Evidence
                 SAME MCP authorities
                 SAME provider scheduler
                       |
        +--------------+-------------------+
        |              |          |        |
     Filesystem     Processes   Browser   Phone
        |              |          |        |
        +---------- Grafel / Semantic IDE -+
                       |
                 real environment

The controller/model may change. The Agent Core body and durable knowledge authority do not.

## 2. Definition of parity

Parity means **functional capability parity inside Agent Core**, not literal parity with every proprietary tool exposed by a hosting platform.

In-scope:
- Agent Core local filesystem/document operations;
- terminal/process execution;
- local search;
- browser navigation and controlled web interaction;
- Agent Core-native internet/web research capability;
- Grafel Code Intelligence;
- Semantic IDE/LSP;
- Phone/device control;
- configuration/status inspection;
- shared Memory retrieval;
- shared Learning/finalization;
- Skills/Procedures/pattern reuse;
- evidence, verification, failure learning, and restart continuity.

Out-of-scope by default:
- proprietary ChatGPT-only platform tools/connectors that do not exist in Agent Core;
- unrelated cloud apps such as email/calendar unless separately adopted into Agent Core;
- a second Memory, second Learning system, second MCP server, or second machine-control layer.

When a ChatGPT platform capability is useful but absent in Agent Core, the target is an Agent Core-native functional equivalent, not dependency on the ChatGPT runtime.

## 3. Current proven baseline

Already resident-verified:
- Interactive Native Agent Chat supports durable multi-turn conversation and Core restart continuity.
- Native Agent uses canonical Agent Core Memory-first retrieval.
- Native Agent uses the same Learning finalization and verified-knowledge pipeline.
- Skills/Procedures/Grafel synthesis are already part of NativeAgentController context construction.
- PersistentCredentialScheduler owns provider/key selection and survives restart.
- AgentRuntimeToolSession already creates an in-memory MCP client connected to createAgentCoreMcpServer().
- createAgentCoreMcpServer() registers the same Agent Core MCP authorities used by external controllers.
- tool-grant enforcement is installed before registration: disallowed tools are hidden from discovery and rejected on direct invocation.

Current resident restriction:
- AGENT_CORE_AI_ALLOWED_TOOLS resolves to exactly one granted ordinary tool: get_config.

Therefore the missing layer is not tool implementation. It is **capability selection, task-scoped grant expansion, web-search parity, and acceptance of the existing tool body under NativeAgentController**.

## 4. Existing Agent Core capability inventory

Current CODEBASE authority records 70 public MCP tools:
- 28 machine-control tools;
- 17 Memory tools;
- 1 Learning tool;
- 14 Phone tools;
- 7 Grafel Code Intelligence tools;
- 2 Semantic IDE/LSP tools;
- 1 artifact-only Skills tool.

Machine-control registration already includes:
- get_config / set_config_value;
- read_file / read_multiple_files;
- write_file / write_pdf;
- create_directory / list_directory / move_file;
- file_checkpoint / edit_block;
- browser_control;
- start_search / get_more_search_results / stop_search / list_searches;
- get_file_info;
- start_process / read_process_output / interact_with_process / force_terminate;
- list_sessions / list_processes / kill_process;
- usage/history/prompt support tools.

The same MCP server conditionally registers Memory, Learning, Semantic IDE, Skills, Phone, and Code Intelligence from the same service instances used by the resident Core.

## 5. Core invariants

1. **One body**
   Native Agent must reuse createAgentCoreMcpServer() and existing service instances. No duplicate filesystem/browser/terminal/phone implementation.

2. **One canonical Memory**
   External controller and Native Agent read the same runtime\memory authority.

3. **Learning owns durable knowledge writes**
   Native Agent must not bypass verification/finalization by freely writing durable knowledge through ordinary tool calls.

4. **Tool grant remains an enforcement boundary**
   Capability parity must expand task-scoped grants, not disable installCredentialToolGrant().

5. **Least capability per task**
   The model should see only the tools relevant to the current task, rather than every Agent Core tool on every turn.

6. **Operator ceiling**
   Environment/configuration remains able to place a hard maximum on which tools Native Agent can ever obtain.

7. **User intent controls mutation**
   Read-only inspection may be broadly available; write/process/device/admin capabilities require matching task intent and existing Agent Core safety policy.

8. **Evidence before success**
   Tool parity must preserve current verification and Learning finalization contracts.

9. **Shared failure learning**
   Tool failures observed by Native Agent feed the same Reflexion/Memory/Learning mechanisms where appropriate.

10. **No secret exposure**
    Provider secrets, launcher auth, and protected credentials never become model-visible capability data.

## 6. Capability families

Introduce an Agent Core-owned capability catalog rather than exposing raw tool lists as product policy.

Initial families:

### observe.local
Read-only local inspection:
- get_config
- read_file
- read_multiple_files
- list_directory
- get_file_info
- list_sessions
- list_processes
- get_usage_stats
- get_recent_tool_calls
- get_prompts

### search.local
Local filesystem/search discovery:
- start_search
- get_more_search_results
- list_searches
- stop_search where cleanup is needed

### files.mutate
Filesystem/document mutation:
- file_checkpoint
- write_file
- write_pdf
- create_directory
- edit_block
- move_file

### process.execute
Bounded terminal/process work:
- start_process
- read_process_output
- interact_with_process
- list_sessions
- list_processes

### process.admin
High-impact process control:
- force_terminate
- kill_process

### browser.navigate
Controlled browser interaction:
- browser_control
- URL-reading through the existing read_file URL mode where appropriate

### code.intelligence
Grafel tools plus read-only source inspection.

### semantic.ide
Semantic IDE/LSP analysis tools.

### phone.observe
Read-only phone/device state tools.

### phone.act
Phone/device mutation/control tools.

### skills.inspect
Artifact-only skill listing/inspection/package metadata.

### memory.read
Targeted read-only Memory search/read capabilities when mid-task retrieval beyond controller-managed Memory-first/adaptive recall is necessary.

### admin.config
High-impact configuration mutation:
- set_config_value

Learning writes and durable Memory mutation are intentionally **not** general capability families. Durable knowledge continues through agent_core_finalize -> Learning.

## 7. Risk classes

Every capability/tool must have a normalized runtime risk class derived from existing MCP annotations plus curated overrides for non-RDC tools.

Planned classes:

R0 — cognitive/read-only
- local reads, health/status, Memory reads, Grafel queries, Semantic IDE reads.

R1 — open-world read
- URL fetch, browser navigation/search, remote read-only research.

R2 — local mutation
- file edits, file creation, PDF creation, directory creation, safe process start when explicitly requested.

R3 — active external/device mutation
- browser form submission, phone actions, interactive processes, process termination.

R4 — administrative/high-impact
- config mutation, broad destructive operations, sensitive lifecycle/process controls.

The existing annotations readOnlyHint, destructiveHint, idempotentHint, and openWorldHint should seed this catalog rather than being replaced.

## 8. Dynamic task-scoped grant protocol

Do not turn AGENT_CORE_AI_ALLOWED_TOOLS into “all tools permanently visible.”

Planned flow:

1. A turn starts with:
   - Memory-first context;
   - Skills/Procedures/Grafel synthesis;
   - synthetic controller tools such as strategy/finalize;
   - minimal base grant.

2. The model declares needed capability families through a new synthetic controller call:
   agent_core_request_capabilities({
     families,
     reason,
     expectedActions
   })

3. NativeAgentController evaluates the request against:
   - current user message and conversation context;
   - operator capability ceiling;
   - current MCP registry snapshot;
   - risk class;
   - task/workspace scope;
   - existing protected-boundary rules;
   - whether mutation is actually requested.

4. Resolver maps approved families to exact current tool names.

5. AgentRuntimeToolSession is opened/refreshed with the approved ToolGrant.

6. Subsequent model calls discover only those approved tools.

7. Grant expires with the turn unless an explicitly safe conversation-level preference is defined.

This makes capability selection dynamic without weakening the existing tool-grant enforcement.

## 9. Configuration evolution

Current:
AGENT_CORE_AI_ALLOWED_TOOLS = explicit tool list.

Planned semantics:
- retain backward compatibility;
- explicit tool list remains an absolute operator ceiling when present;
- introduce a capability-policy mode such as:
  - minimal
  - read-only
  - dynamic
  - explicit
- default migration for an existing installation must remain conservative.

Possible configuration shape:

AGENT_CORE_AI_CAPABILITY_POLICY=dynamic
AGENT_CORE_AI_ALLOWED_TOOLS=<optional hard ceiling>
AGENT_CORE_AI_ALLOWED_CAPABILITIES=<optional family ceiling>

Exact environment names remain implementation-time decisions after source review; the architectural rule is that policy/ceiling and per-turn selected grant are separate concepts.

Health should expose only safe aggregates:
- capability policy;
- number of capability families available;
- current turn granted family count;
- no sensitive tool arguments or secrets.

## 10. Shared Memory and knowledge contract

The user requirement is bidirectional knowledge continuity between external controller and Native Agent.

External controller -> Agent Core:
experience
-> evidence
-> verification
-> Learning/Memory
-> canonical runtime\memory

Native Agent -> Agent Core:
experience
-> evidence
-> verification
-> agent_core_finalize
-> Learning
-> canonical runtime\memory / Procedure / Skill

Future external controller session:
Memory-first
-> can retrieve Native Agent-created durable knowledge

Future Native Agent session:
Memory-first
-> can retrieve external-controller-created durable knowledge

Rules:
- chat transcript remains separate from Memory;
- unverified observations are not promoted automatically;
- Native Agent does not receive unrestricted memory_remember/memory_update as an ordinary shortcut around Learning;
- read-only targeted Memory search/read can be granted when needed;
- knowledge-use receipts should identify which canonical Memory/procedure/skill materially affected the result.

## 11. Cross-controller knowledge parity acceptance

Knowledge sharing is not accepted merely because both controllers can query the same folder.

Required round trips:

### K1 — External -> Native
External controller creates or updates a verified reusable Memory item through the normal Agent Core learning/memory path.

Native Agent later receives a task where that knowledge is applicable.

PASS:
- Memory-first or adaptive recall surfaces the same canonical memory ID;
- Native Agent records knowledge use;
- verified outcome cites evidence/use receipt.

### K2 — Native -> External
Native Agent completes a task and Learning promotes a verified durable fact/pattern/procedure.

A fresh external-controller session later performs Memory-first retrieval.

PASS:
- external controller retrieves the exact canonical item;
- no copy/export/synchronization step is needed.

### K3 — Conflict/freshness
One controller supersedes or updates knowledge.

PASS:
the other controller observes current authority/freshness rather than silently using stale duplicated state.

## 12. Filesystem and document parity

First execution-parity wave should prioritize the tools most commonly used for engineering work.

Read profile:
- file/directory inspection;
- semantic document projection;
- local search;
- metadata inspection.

Mutation profile:
- checkpoint first for scoped source edits where appropriate;
- write/edit/create/move operations;
- PDF/document operations through existing specialized owners.

Requirements:
- existing allowed-directory/path rules stay active;
- protected reference boundary stays active;
- mutation safety and evidence capture stay active;
- same-target mutation coordination remains authoritative;
- no separate Native Agent filesystem APIs.

Acceptance must prove both read-only analysis and a user-authorized bounded edit flow.

## 13. Terminal/process parity

Native Agent should gain the same project-owned process primitives used by external controllers:
- start_process;
- read_process_output;
- interact_with_process;
- session/process inspection.

Higher-impact termination remains separately gated.

Rules:
- preserve existing blocked-command/config boundaries;
- preserve project ownership checks;
- do not invent background completion semantics;
- long-running tasks remain observable and bounded;
- user-authorized tests/builds are still distinct from ordinary task execution per the local operating contract.

Acceptance should include:
- run a harmless process;
- read output;
- use output as verification evidence;
- restart conversation/Core without corrupting process/session state.

## 14. Code intelligence parity

For code tasks, Native Agent should receive a composed capability profile rather than raw shell-only access:

code.inspect:
- read_file/read_multiple_files/search;
- Grafel code_workspace/code_graph/code_surface/code_analysis/code_patterns as appropriate;
- Semantic IDE/LSP queries.

code.modify:
- code.inspect plus checkpoint/write/edit;
- build or targeted verification only when user authorization/task contract permits.

Rules:
- source outranks graph;
- Grafel freshness checked before structural reasoning;
- public signatures/routes/shared wiring trigger structural review;
- no Grafel marker writes into protected repositories without explicit authorization.

This should make Native Agent engineering behavior converge with the current external-controller operating discipline.

## 15. Browser and internet parity

Existing body:
- browser_control provides browser interaction;
- read_file URL mode provides bounded direct URL reads;
- shared outbound-network policy provides fetch/retry/timeout/redaction primitives.

Missing functional parity:
- Agent Core does not currently expose a dedicated search-engine abstraction equivalent to a platform-native web-search tool.

Plan:
create an Agent Core-owned Web Research capability under the existing network/security policy.

Target primitives:
- web_search(query, recency?, domains?, limit?)
- web_open(result/url)
- optionally web_find / bounded extraction
- browser_control remains available for interactive sites.

Provider architecture:
- pluggable search backend;
- provider credentials, if required, stay in protected runtime configuration;
- model never receives raw provider credentials;
- search result normalization is provider-independent;
- browser fallback may supplement but must not become an implicit scraping dependency.

Implementation may adopt an additional library/provider if source review proves it materially improves reliability and licensing/security are acceptable.

## 16. Web research behavior

Native Agent research should follow:

query
-> Agent Core web_search
-> ranked result metadata
-> bounded page fetch/open
-> source/evidence reference
-> reasoning
-> optional additional search
-> verified answer/action

Requirements:
- citations/evidence IDs usable by verification/Learning;
- bounded response sizes;
- safe redirect/domain handling;
- current shared outbound-network policy;
- no hidden dependence on ChatGPT web tooling;
- no automatic persistence of browsing history into Memory;
- durable web-derived knowledge enters Memory only after verification/Learning.

This phase supplies the “legs/internet” missing from the current Native Agent anatomy.

## 17. Phone/device parity

Phone tools already exist under the same Agent Core MCP server.

Plan:
split into observe vs act families.

Observe:
- device status;
- screen/state inspection;
- non-mutating queries.

Act:
- touch/input/navigation/application actions;
- device changes.

Rules:
- phone controller availability is health-gated;
- actions must match user task intent;
- evidence and failure learning use the same Agent Core runtime;
- phone capability is not required to block parity acceptance for environments without an enabled device, but must be tested when the resident phone subsystem is enabled.

## 18. Capability resolver ownership

Likely new owners:
- src\agent-capability-catalog.ts
- src\agent-capability-resolver.ts
- src\agent-capability-policy.ts

Likely modifications:
- src\agent-controller.ts
- src\agent-tool-session.ts
- src\config.ts
- src\agent-runtime.ts
- src\http\app.ts health projection
- launcher/UI status only if capability state is shown
- MCP metadata adapters for normalized annotations
- new web subsystem if web search is implemented

The resolver is a **selection layer**, not an execution authority.
Execution remains the existing MCP server and services.

## 19. Grant lifecycle and auditing

Each turn should persist safe grant metadata:
- requested capability families;
- approved capability families;
- denied families/reason code;
- granted tool names or catalog digest;
- risk ceiling;
- grant revision;
- timestamps.

Do not persist:
- tool arguments containing secrets;
- raw credentials;
- private model reasoning.

Tool execution continues through existing:
- Tool History;
- Activity Tracker;
- MCP mutation safety;
- evidence capture policy;
- Native Agent task episodes.

Knowledge-use and artifact-use receipts remain separate from capability-grant receipts.

## 20. Failure and Reflexion behavior

Tool parity must preserve the existing NativeAgentController failure loop:

tool failure
-> classify failure
-> record evidence
-> adaptive Memory recall
-> require materially changed strategy
-> block equivalent failed retry
-> retry differently or finalize failed

Capability-specific failures:
- TOOL_GRANT_DENIED is a policy failure, not a reason to repeatedly retry the tool;
- unavailable subsystem is capability-unavailable, not model failure;
- web provider outage may allow alternate search provider/browser fallback;
- protected-boundary denial is terminal for that requested target unless user changes scope.

Reusable successful corrections may later become operational-reflection Memory through the normal Learning path.

## 21. Implementation phases

### NACP-0 — Capability census and contract freeze
- enumerate live 70-tool surface;
- capture annotations/category/risk;
- confirm current Native Agent grant;
- identify platform-only gaps;
- freeze capability-family taxonomy.

### NACP-1 — Capability catalog
- normalize MCP tool metadata;
- map tools to capability families and risk classes;
- expose catalog to controller, not directly as unrestricted model authority.

### NACP-2 — Dynamic grant resolver
- add synthetic capability-request step;
- evaluate against user intent, operator ceiling, risk and registry;
- produce task-scoped ToolGrant;
- refresh AgentRuntimeToolSession safely.

### NACP-3 — Read-only local parity
- observe.local;
- search.local;
- memory.read;
- read-only Grafel/Semantic IDE;
- safe status/usage/history tools.

### NACP-4 — Engineering execution parity
- files.mutate;
- process.execute;
- code.inspect/code.modify composition;
- preserve checkpoints/mutation safety and user-controlled verification.

### NACP-5 — Browser navigation parity
- browser.navigate;
- URL-read integration;
- safe open-world grants;
- evidence/readback rules.

### NACP-6 — Agent Core-native Web Research
- search provider abstraction;
- web_search/web_open;
- citations/evidence;
- optional dependency/provider adoption only if justified.

### NACP-7 — Device parity
- phone.observe;
- phone.act;
- enabled-device acceptance.

### NACP-8 — Shared knowledge parity
- external -> Native round trip;
- Native -> external round trip;
- freshness/supersession;
- knowledge-use receipts.

### NACP-9 — High-impact/admin hardening
- process.admin;
- admin.config;
- explicit user-intent boundaries;
- deny-by-default tests.

### NACP-10 — Resident parity acceptance
- multi-capability real tasks from Interactive Chat;
- restart Core;
- repeat with same canonical Memory/tool policy;
- verify external controller can consume Native-learned knowledge afterward.

## 22. Initial capability profiles

These are policy compositions, not separate runtimes.

### Research
observe.local
search.local
browser.navigate
web.research
memory.read

### Code Review
observe.local
search.local
code.intelligence
semantic.ide
memory.read

### Code Change
Code Review
+ files.mutate
+ process.execute

### Local Operations
observe.local
process.execute
browser.navigate
optional files.mutate

### Phone Assistance
observe.local
phone.observe
optional phone.act

### Administration
explicitly selected high-impact families only;
never an implicit default.

## 23. Acceptance matrix

### P1 — Grant discovery enforcement
Task asks only to inspect a file.

PASS:
model sees read capabilities, not unrelated mutation/admin tools; raw direct call to ungranted tool is still denied.

### P2 — Read-only file task
Native Agent reads and analyzes a real project file.

PASS:
same filesystem authority/evidence rules as external controller.

### P3 — Local search
Native Agent locates an unknown file/content using search tools.

PASS:
search results drive the next action without shell workarounds.

### P4 — Authorized edit
User explicitly asks for a bounded source edit.

PASS:
resolver expands to mutation tools, checkpoint/evidence rules hold, and unrelated high-impact tools stay hidden.

### P5 — Process execution
Native Agent runs an authorized harmless command/build and reads output.

PASS:
process ownership/output/evidence contracts hold.

### P6 — Grafel + Semantic IDE
Code task requires structural and semantic inspection.

PASS:
Native Agent checks graph freshness, uses relevant capability, and source remains final authority.

### P7 — Browser navigation
Native Agent opens/navigates a controlled web target.

PASS:
open-world capability is granted only for the task and browser evidence is bounded.

### P8 — Native web search
User asks for current external information.

PASS:
Agent Core-native search finds sources, opens evidence, and completes a verified answer without ChatGPT platform web tools.

### P9 — External -> Native Memory sharing
External controller stores verified reusable knowledge.

PASS:
fresh Native Agent retrieves and uses same canonical item with receipt.

### P10 — Native -> External Memory sharing
Native Agent learns verified durable knowledge.

PASS:
fresh external-controller session retrieves the same canonical item without synchronization/export.

### P11 — Knowledge freshness
Knowledge is superseded/updated by one controller.

PASS:
other controller respects current authority/freshness.

### P12 — Failure learning
Granted tool fails.

PASS:
adaptive recall occurs and equivalent retry is blocked until strategy changes.

### P13 — Denied capability
Model requests an unrelated or above-ceiling capability.

PASS:
grant denied with bounded reason; no hidden discovery/direct call path.

### P14 — Secret boundary
Exercise provider/web/device capabilities.

PASS:
no raw provider/search/device credentials appear in model-visible tool catalog, chat transcript, Activity summary, or Learning artifacts.

### P15 — Restart continuity
Conversation and capability policy survive Core restart correctly.

PASS:
session/chat continues, but per-turn grants do not become permanently over-broad.

### P16 — Cross-controller practical parity
Run matched engineering/research tasks once via external controller and once via Native Agent.

PASS:
both can reach equivalent Agent Core-owned capabilities and durable knowledge authorities; differences are attributable to model quality/platform-only tools, not missing Agent Core body access.

## 24. Hard acceptance gates

Native Agent Capability Parity is not complete just because allowedTools contains many names.

Required:
1. live capability catalog from current registry;
2. task-scoped grants;
3. existing tool-grant enforcement preserved;
4. read-only local parity;
5. filesystem mutation parity;
6. process execution parity;
7. Grafel/Semantic IDE parity;
8. browser navigation parity;
9. Agent Core-native web search;
10. shared canonical Memory both directions;
11. Learning remains only durable-write path for Native Agent knowledge;
12. failure/reflexion loop preserved;
13. mutation/evidence policies preserved;
14. high-impact tools deny-by-default;
15. no secret exposure;
16. restart does not widen grants;
17. no second MCP/memory/tool implementation;
18. matched cross-controller parity acceptance.

Phone parity is additionally required when the resident phone subsystem is enabled.

## 25. Structural blast radius

Likely high-impact source owners:
- src\agent-controller.ts
- src\agent-tool-session.ts
- src\config.ts
- src\agent-runtime.ts
- src\index.ts
- src\mcp\server.ts only if metadata/catalog access requires a shared projection
- MCP registrars for metadata normalization
- src\net shared policy
- potential new src\web subsystem
- health and Interactive Chat status projections
- tests for controller/tool grants/security/restart
- launcher/UI only for safe capability status/approval UX if needed

Because this changes tool discovery and execution authority, implementation requires structural review of controller/tool-session/MCP registration/auth boundaries against fresh Grafel evidence.

## 26. Migration and compatibility

Existing installations with:
AGENT_CORE_AI_ALLOWED_TOOLS=get_config
must not silently gain write/admin capability on upgrade.

Migration principles:
- current explicit allowlist remains honored as a hard ceiling;
- dynamic parity requires an explicit policy/config change during implementation/activation;
- legacy one-shot /agent/run and Interactive Chat continue using the same controller;
- external MCP controller behavior is unchanged;
- public MCP tool count should not change merely because Native Agent gains access to existing tools;
- web-search additions, if new public tools are introduced, require explicit compatibility accounting.

No persistent tool grant from one turn should silently broaden future turns.

## 27. Release and activation boundary

This section records the original pre-implementation boundary. Section 28 is the current implementation authority.

Capability-parity source/config work is now implemented and targeted-qualified, but resident activation still requires the supported launcher restart.

Material behavior is recorded by the dedicated NACP changeset; release application remains separate.

Expected final state:

External Controller                 Native AI Agent
       |                                   |
       +---------- Agent Core -------------+
                    |
          canonical Memory/Learning
                    |
            task-scoped capability
                    |
          existing Agent Core MCP
                    |
      files/process/browser/web/code/phone
                    |
             real environment

At completion, the Native Agent should be able to continue useful Agent Core work when the external ChatGPT controller is absent, while both controllers continue sharing durable verified knowledge through the same canonical authorities.


## 28. Implementation result — 2026-10-02

NACP source implementation is complete through the planned capability/runtime layers:
- capability catalog and normalized risk classes;
- task-scoped dynamic capability resolver;
- synthetic `agent_core_request_capabilities`;
- argument-level restrictions enforced in AgentRuntimeToolSession;
- local observation/search, file mutation, process execution/admin, browser navigate/act, Grafel, Semantic IDE, Phone observe/act, Skills inspection, targeted Memory read, admin config and web-research families;
- shared canonical Memory/Learning round-trip coverage;
- existing ToolGrant discovery/direct-call denial, mutation safety, verification, failure-learning and Learning finalization preserved.

Local activation configuration has been prepared for the next resident restart:
- `AGENT_CORE_AI_CAPABILITY_POLICY=dynamic`
- `AGENT_CORE_AI_ALLOWED_TOOLS=`
- `AGENT_CORE_AI_ALLOWED_CAPABILITIES` contains all reviewed capability families.

The running resident Core still reports the previously inherited policy `explicit` with a one-tool ceiling until the supported launcher restart reloads the environment.

Qualification evidence:
- root build PASS; path policy 301 authored files / 0 documented exceptions;
- final NACP targeted suite: 10 files / 50 tests PASS;
- browser-control isolated qualification: 3/3 PASS;
- shared knowledge parity PASS in both directions: external-controller canonical Memory -> Native knowledge-use receipt, and Native verified knowledge -> fresh external Memory retrieval;
- real existing-MCP execution parity PASS for scoped file write/read + process execution while unrelated process-admin tool remained denied;
- public MCP manifest now accounts for 72 tools when Web Research is registered and remains inside the reviewed 120 KB handshake budget;
- changed-source security analysis: 0 findings;
- Semantic IDE contract test was repaired from a stale global tool-count assertion to a delta contract proving exactly `code_symbol` + `code_refactor` are contributed by Semantic IDE;
- browser timeout observed only in a heavy parallel suite; isolated browser qualification passed and production browser code was not changed for that timeout.

Web Research result:
- search providers implemented: Exa, Parallel, Firecrawl and Jina Search, each credential-gated;
- extraction/open providers include keyless Jina Reader, then configured Parallel/Firecrawl fallbacks;
- live keyless Jina Reader acceptance against `https://www.openai.com/` PASS: provider=jina, title=`OpenAI | Research & Deployment`, 7,366 extracted content characters;
- live Jina Search without a key returned HTTP 401, so the attempted keyless-search assumption was rejected and rolled back;
- a DuckDuckGo HTML fallback experiment also failed in this network (timeout/refused) and was not adopted;
- resident/full live search therefore still requires at least one supported search credential: Exa, Parallel, Firecrawl or Jina.

Grafel source review:
- AgentCapabilityResolver and WebResearchService resolve in the graph and show expected impacts into NativeAgentController/startAgentCoreService plus dedicated tests;
- graph integrity currently remains degraded due `unexplained-structural-shrink` after explicit reindex;
- exact current source plus executed tests are the implementation authority; no blind equivalent reindex loop was performed.

Material behavior intent:
- `.changeset\20261002-native-agent-capability-parity.md`
- type: minor
- unapplied

No version mutation, release application, Git-history mutation, publication or deployment was performed.

Current closure state:

**NACP-0..NACP-9 SOURCE IMPLEMENTED + TARGETED QUALIFIED; NACP-10 RESIDENT PARITY ACTIVATION PENDING SUPPORTED CORE RESTART.**

Full resident Web Search acceptance is additionally conditional on a configured search-provider credential; keyless Jina Reader extraction is already live-verified.

## 29. NACP-10 resident parity closure — 2026-10-02

Resident capability policy is active:
- policy = dynamic;
- permanent tool-name ceiling count = 0;
- reviewed capability-family ceiling count = 16;
- Agent Runtime and Agent Chat available;
- all three configured model-provider routes available;
- pendingFinalizationCount = 0;
- canonical Memory/Learning healthy.

Resident Native Agent acceptance now proves:
- bounded local file/process parity;
- Grafel + Semantic IDE parity;
- browser navigation parity;
- phone.observe parity;
- reversible phone.act parity;
- deny-by-default policy enforcement;
- per-turn grant reset/non-persistence;
- external-controller -> Native shared canonical Memory reuse;
- Native -> external durable Learning/Memory reuse.


### 29.1 Resident phone.act proof

A bounded reversible phone task requested only phone.observe + phone.act.

Observed resident chain:
- capability request approved phone.observe + phone.act;
- phone_status success;
- baseline phone_observe success;
- phone_home success;
- post-home phone_observe success;
- phone_launch_app success restoring the prior app;
- final phone_observe success;
- task terminal outcome verified;
- Learning finalization complete;
- verification ref: verification:nacp10-phone-act-resident.

No tap/swipe/text/named-action mutation was used.


### 29.2 Deny-by-default and grant reset proof

Read-only resident task requested observe.local + process.admin.

Resolver evidence:
- approved=[observe.local]
- denied=[process.admin:user-intent]
- riskCeiling=0
- only read_file executed
- verified finalization completed.

A second turn in the same conversation then started again with:
- initialGrantedTools=1
- requested memory.read only
- grantedTools=9

This proves previous-turn grants do not persist as a widened permanent grant.


### 29.3 Shared Memory receipt gap and source repair

Resident shared-Memory tests proved Native Agent can read and materially use external-controller canonical Memory, and Native verified Learning can create durable knowledge retrievable by an external controller.

Audit then found one attribution gap:
- targeted Memory obtained through ordinary memory_search was usable;
- but NativeAgentController did not ingest memory_search retrievalEvidence into its memoryEvidence map;
- therefore later knowledgeUse declarations could not produce a verified knowledge-use receipt for that direct-search path.

Source repair:
- NativeAgentController now parses successful memory_search tool output;
- absorbs retrievalEvidence attemptId/contentDigest;
- records the retrieval attempt on the Agent Runtime task;
- exposes that receipted Memory as valid evidence for later knowledgeUse attribution.

Targeted test added:
- granted memory.read;
- memory_search returns canonical Memory with retrieval evidence;
- later agent_core_strategy declares knowledgeUse;
- knowledgeUse receipt count must be > 0.

Qualification: shared-knowledge parity suite PASS 3/3.
Resident proof of this exact receipt repair still requires one supported Core restart.


### 29.4 Final qualification after receipt repair

- root npm run build: PASS;
- path policy: 301 authored files / 0 exceptions;
- capability/config/execution/shared-knowledge batch: 4 files / 14 tests PASS;
- Web Research + controller + runtime integration batch: 3 files / 13 tests PASS;
- tool-grant + UI transport batch: 21/21 non-browser tests PASS;
- browser-control isolated: 3/3 PASS;
- changed-source security analysis for controller + receipt test: 0 findings.

The one browser timeout observed in a heavy mixed parallel suite remained non-reproducible in isolated authority and production browser code was not altered for it.


### 29.5 Web Search external dependency

Agent Core-native Web Research search providers are implemented for:
- Exa;
- Parallel;
- Firecrawl;
- Jina Search.

Current resident configuration contains none of those search credentials.

Keyless live probes:
- Jina Reader/open: already verified and available;
- Jina Search without key: HTTP 401;
- DuckDuckGo HTML: network timeout/refused in this environment;
- Google/Bing HTML returned challenge-bearing pages;
- Brave returned 429;
- Mojeek returned 403.

No challenge/scrape-based backend was adopted.

Therefore web_open/browser internet parity is resident verified, while full web_search resident acceptance remains conditional on one supported search-provider credential.


### 29.6 Current closure state

Implemented/resident verified:
- NACP-0..NACP-9 source/runtime architecture;
- dynamic task-scoped grants;
- read/write/process/code/browser/phone execution breadth;
- deny-by-default;
- per-turn grant reset;
- shared canonical Memory/Learning both directions;
- web_open/browser open-world read.

Pending:
1. supported Core restart to resident-load the direct memory_search knowledge-use receipt repair;
2. one configured Exa/Parallel/Firecrawl/Jina Search credential for full live web_search acceptance.

The NACP changeset remains minor and unapplied. No version/release/Git-history/publication action was performed.


## 30. NACP-10 post-reload final resident evidence — 2026-10-02

The supported desktop-launcher Restart action was invoked through Windows UI Automation. Resident Core PID changed and the new process loaded the current compiled controller.

Post-reload resident health:
- Agent Runtime available;
- Agent Chat available;
- capability policy = dynamic;
- permanent tool-name ceiling = 0;
- reviewed capability-family ceiling = 16;
- pendingFinalizationCount = 0;
- canonical Memory issueCount = 0;
- Learning issueCount = 0;
- Phone available;
- Web Research reader configured through keyless Jina Reader;
- Web Research search remains unconfigured because no supported search-provider credential is present.

Direct targeted-Memory receipt acceptance:
- fresh resident conversation: `ad54255f-e318-4105-b3f6-fcea044eb8cd`;
- task: `9822c774-7809-475c-a761-47275796aa6d`;
- capability request approved `memory.read`, grantedTools=9;
- `memory_search` surfaced canonical Memory `eb894a07-1069-4971-93d4-01f6176ca835` with retrieval evidence;
- controller recorded the direct retrieval attempt and a recall episode;
- subsequent strategy declaration produced one verified knowledge-use receipt;
- `metrics.knowledgeUseReceipts=1`;
- knowledgeUse contains the same Memory ID, retrievalAttemptId and contentDigest;
- terminal outcome verified;
- Learning finalization complete;
- final response `NACP10_MEMORY_RECEIPT_OK:EMBER-6042`.

This closes the previously open direct-memory-search attribution/reload gap.

Additional resident NACP-10 evidence:
- bounded phone.act PASS: phone status -> HOME once -> observe, with task-scoped phone.act grant and verified finalization;
- deny-by-default PASS: read-only task requested observe.local + process.admin; resolver approved observe.local and denied process.admin:user-intent; only get_config executed;
- grant reset PASS: high-risk phone grant did not persist; later turns restarted with initialGrantedTools=1;
- matched cross-controller engineering parity PASS: Native Agent and external controller both read the same Agent Core-owned fixture and executed the same harmless process evidence successfully;
- resident browser navigation, web_open, Grafel, Semantic IDE, file/process, phone.observe, phone.act, external->Native Memory and Native->external Learning/Memory are all verified.

Final source qualification after receipt repair:
- root build PASS, path policy 301 authored / 0 exceptions;
- NACP targeted suite 10 files / 39 tests PASS;
- direct memory_search receipt regression PASS;
- changed-source security analysis: 0 findings;
- Grafel current/integrity accepted at 11,207 entities / 60,314 relationships, registered repository coverage 1/1.

### 30.1 Remaining external dependency

The only unclosed acceptance item is **live generic web_search**.

Source/runtime support is implemented and targeted-tested for Exa, Parallel, Firecrawl and Jina Search. The resident environment currently has no configured search-provider credential, and prior keyless/challenge-based experiments were rejected as unreliable. Keyless Jina Reader/web_open remains live and healthy.

Therefore:
- Agent Core body/capability parity is resident verified;
- shared knowledge parity including verified knowledge-use receipts is resident verified;
- live generic web_search is **credential-blocked**, not implementation-blocked.

One supported search credential (Exa, Parallel, Firecrawl, or Jina Search) is required to close P8 live acceptance.

The NACP changeset remains minor and unapplied. No version/release/Git-history/publication action occurred.

## 31. Creator partnership + credentialed research expansion — 2026-10-03

The creator explicitly delegated standing task-scoped decision authority for clearly scoped Agent Core work. This is implemented as operating behavior, not as a bypass around authentication, secret handling, evidence, provider policy, law, or higher-priority safety.

Controller behavior now states:
- inspect, decide, act and verify without repeated confirmation for ordinary/reversible work already implied by the task;
- recover context before asking the creator to repeat known information;
- choose the strongest evidence-backed reversible option when several are equivalent, then report the decision;
- challenge weak, contradictory, wasteful or materially harmful assumptions instead of acting as a yes-only assistant;
- ask only when unresolved ambiguity materially changes the intended outcome or exact intent for an irreversible/destructive/external commitment is genuinely missing;
- finish substantive work with a transparent action ledger.

The same doctrine is present in root AGENTS.md for external controllers and in NativeAgentController.systemPrompt() for the resident Native Agent.

Dynamic capability selection was also tightened without widening the permanent tool ceiling. Explicit delegation language such as "kerjakan", "selesaikan", "implementasikan", "pasang" and equivalent English task-delegation wording now counts as execution intent for R2 file/process work. R3 process-admin and R4 configuration mutation still require specific matching task intent.

The existing web.research family remains the single Agent Core-owned research capability. web_search now supports three provider-neutral modes:
- web -> Exa, Parallel, Firecrawl, Jina Search, then Browserbase Search as the difficult-web fallback;
- academic -> OpenAlex;
- assets -> Pexels, then Unsplash fallback.

web_open remains Jina Reader first, then Parallel/Firecrawl when configured, with Browserbase Fetch as the final difficult-web fallback. Asset results return source-page provenance plus bounded direct image/thumbnail metadata. This does not create an image-generation system or an automatic downloader.

Browserbase is now an active Agent Core-native fallback because its Search and Fetch endpoints were credential-validated and fit the existing bounded research contract without a new SDK or subsystem. Apify remains credential-validated but dormant: a token alone does not define which Actor/workflow should run, so Agent Core does not silently choose a billable Actor. Langfuse remains credential-validated observability readiness; Agent Core does not automatically export traces/user content merely from key presence.

Secret-safe live credential probes before resident reload:
- Exa search: PASS;
- Parallel search: PASS;
- Firecrawl search: PASS;
- Jina Search: PASS;
- OpenAlex: PASS;
- Pexels: PASS;
- Browserbase credential endpoint: PASS;
- Apify account endpoint: PASS;
- Langfuse authenticated project endpoint: PASS;
- Unsplash search: HTTP 401 with the configured access key; Pexels keeps assets mode operational.

Compiled-source live smoke after build:
- web mode -> Exa PASS;
- academic mode -> OpenAlex PASS;
- assets mode -> Pexels PASS;
- health reports searchConfigured, academicConfigured and assetConfigured true;
- difficultWebCredentialsPresent and observabilityCredentialsPresent true.

No raw credential was written to logs, docs, Memory, test output or model-visible configuration.

Qualification before resident reload:
- targeted tests: 4 files / 23 tests PASS;
- Browserbase compiled-service smoke: Search PASS with two normalized results; direct Fetch endpoint PASS and unit fallback contract PASS;
- root npm run build PASS;
- path policy: 301 authored files / 0 exceptions;
- release:compat PASS;
- MCP surface: 72 tools, 0 removed, breakingEvidence=false;
- manifest budget: 119,983 bytes / ~29,996 tokens within 120,000 / 30,000 limits;
- changed-source security analysis: 2 behavior-changing source files scanned / 0 findings;
- Grafel explicit reindex: current/integrity accepted at 11,231 entities / 60,407 relationships with repository coverage 1/1.

Resident reload remains the lifecycle gate for this section because loadConfig() reads project .env at Core startup. The desktop-launcher-owned restart path is the supported activation mechanism; resident P8 is not claimed until the restarted Native Agent itself uses web.research and finalizes with verification evidence.

## 32. P8 resident live-search acceptance repair — 2026-10-03

First resident P8 acceptance after the r2 stability reload reached the Native Agent runtime correctly and proved:
- dynamic Native Agent conversation/session creation worked;
- `web.research` capability was available under the resident dynamic policy;
- `web_search` completed successfully;
- three `web_open` calls completed successfully;
- Core/Memory/Learning/Web Research health remained available.

The turn then failed closed at `AGENT_RUNTIME_VERIFICATION_EVIDENCE_REQUIRED`. Exact source inspection found the remaining implementation gap: `NativeAgentController` generated stable `tool:<tool>:<call-id>` evidence references and recorded them internally, but successful `web_search`/`web_open` result messages exposed only the raw tool text to the model. The model therefore had evidence content but no explicit inspectable ref to copy into `agent_core_finalize`.

Source repair:
- `agent_core_finalize` tool description now tells the model to copy exposed `AGENT_CORE_EVIDENCE_REF` values exactly;
- the Native Agent system prompt repeats that requirement;
- successful `web_search` and `web_open` model-visible tool results append the corresponding stable `AGENT_CORE_EVIDENCE_REF`;
- runtime verification remains fail-closed: no evidence is auto-injected into finalization and the model still must explicitly select the supporting ref.

This is an evidence-handoff repair, not a relaxation of verification. The repaired build was subsequently loaded through the supported Core restart and P8 passed resident live acceptance; see the final closure below.
## 33. Final NACP / P8 resident closure — PASS — 2026-10-03

After the supported Core restart, resident PID `7516` loaded the compiled evidence-handoff repair. `/health` remained `ok` with Agent Runtime, Agent Chat, Memory, Learning and Web Research available; Web Research reported searchConfigured=true with Exa, Parallel, Firecrawl, Jina and Browserbase search providers.

Authoritative final P8 acceptance:
- conversation `3f71cd6f-8fe3-452a-b91c-e5eb9876e72d`;
- durable runtime session `ae28fb04-a121-415d-80f0-c1cd49a3a937`;
- turn `8c54b9ed-ea55-44e1-ac82-c1d6297b2e73`;
- runtime task `5237b96a-d28a-4957-ac13-cc3087fb7950`;
- provider/model Gonka / MiniMaxAI-MiniMax-M2.7;
- 5 iterations, one Memory-first retrieval, 4 ordinary tool calls, 0 tool failures.

Resident capability/evidence proof:
- capability request approved exactly `web.research`, grantedTools=3, riskCeiling=1;
- two `web_search` calls succeeded;
- two `web_open` calls succeeded against Node.js evidence;
- runtime persisted four exact tool evidence refs;
- `verificationRef` is `tool:web_open:chatcmpl-tool-855adac6c70bcd1b`;
- terminalOutcome=`verified`, metrics.verifications=1;
- Learning finalization status=`complete` before the assistant response;
- final response cited official `nodejs.org` sources and reported Node.js 24.x/Krypton v24.21.0 from opened evidence.

This closes P8 and all remaining NACP acceptance for the implemented scope. NACP-0..NACP-10 and P1..P13 are no longer open. The existing minor changeset remains unapplied. No version mutation, release apply, Git-history mutation, publication or deployment was performed.