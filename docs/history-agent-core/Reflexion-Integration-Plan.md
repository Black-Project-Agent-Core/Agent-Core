# Reflexion Re-Grounding + Selective Adoption Plan — Agent Core

> **Status:** RE-GROUNDED 2026-09-22 — NO NEW CURRENT-FIT PROPOSAL — REFERENCE RETIRED AFTER GUARDED DELETION
> **Current audit reference:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\steal-use-repos\Reflexion` at `218cf0ef1df84b05ce379dd4a8e47f17766733a0`.
> **Evidence boundary:** R2-P1/R2-P2 native implementation remains partly readable; historical test/live records below do not imply that deleted dependencies or canonical memory are presently operational.
> **Updated:** 2026-09-22
> **Former reference:** <PROJECT_ROOT>\Audit\Reflexion
> **Reference origin:** https://github.com/noahshinn/reflexion
> **Grounded revision:** 218cf0ef1df84b05ce379dd4a8e47f17766733a0
> **Reference state:** retired/deleted after second-wave implementation, targeted verification, and final zero-value census
> **Reference license:** MIT
> **Scope:** exhaustive source/test/history re-grounding plus the user-selected R2-P1/R2-P2 second-wave adoption into Agent Core-owned Reflexion/history behavior
> **Install gate:** user explicitly approved R2-P1 and R2-P2 on 2026-09-20; no additional Reflexion mechanism is authorized beyond this documented scope

## 1. Purpose

Reconstruct the missing parent Reflexion plan after the 2026-09-20 corruption/recovery cycle, re-ground the exact Reflexion reference from code rather than README/paper claims, and determine whether any useful mechanism remains unadopted.

This plan preserves the already-completed first-wave controller contract, contract regression, and deterministic exact-repeat failure-loop advisor. It does not treat historical planning text as proof of implementation.

No separate Reflexion runtime, model/provider, autonomous retry loop, benchmark harness, test generator, tree search, or memory store is introduced by this plan; the selected mechanisms are implemented inside existing Agent Core advisor/history surfaces.

## 2. Audit evidence

Primary evidence used:

- exact checkout HEAD 218cf0ef1df84b05ce379dd4a8e47f17766733a0;
- 55 tracked Python files / approximately 4,558 Python lines; a full AST census found 293 function/class definitions across the four experiment families. One parse error exists only in the vendored HumanEval execution harness where upstream intentionally comments out unsafe exec() beneath a with-block; it is not a Reflexion control-path mechanism;
- four experiment families: programming_runs (36 Python files), hotpotqa_runs (9), alfworld_runs (5), webshop_runs (5);
- Git history through the grounded revision;
- programming Reflexion, immediate-refinement, immediate-reflexion, UCS, executor feedback, generator/reflection helpers;
- HotpotQA strategy modes, last-attempt formatting, reflection accumulation, scratchpad/observation truncation and halt logic;
- ALFWorld/WebShop EnvironmentHistory repeated-action exhaustion, reflection memory update, and bounded last-3 prior plans;
- current Agent Core AGENTS.md Reflexion protocol;
- src\mcp\failure-loop-advisor.ts;
- tests\reflexion-contract.test.ts and current loop-detector tests;
- active Tool History implementation and get_recent_tool_calls surface;
- completed Automated-Reflexion-Contract-Regression-Plan.md plus the recovered original parent plan as historical provenance only.

Grafel workspace audit-reflexion was registered/index requested with the user's explicit marker permission. Exact source remains final authority if graph freshness is unavailable or delayed.

## 3. Current Agent Core Reflexion baseline

Already implemented:

- failure-triggered reflection only from real failure/correction/no-progress evidence;
- direct failing result is first evidence source;
- targeted Tool History / Activity Tracker evidence only when needed;
- explicit prohibition on blind equivalent retry;
- task-local reflection is not durable truth;
- bounded recall of at most 1–3 relevant durable lessons;
- durable promotion only after a correction materially succeeds and is reusable;
- prohibition on hidden/private reasoning, raw scratchpad and chain-of-thought persistence;
- controller-side design over existing Agent Core evidence + MemoryService;
- no ReflexionService, Python runtime, LangChain, ChromaDB, autonomous retry daemon or second agent;
- deterministic FailureLoopAdvisor for exact tool + canonical args + failure family repetition;
- first exact repeat produces no advisory, second repeat emits repeat advisory, third+ emits no-progress advisory;
- bounded in-memory loop state with TTL and polling/status exemptions;
- secret-redacted failure families and advisory text;
- Reflexion controller-contract regression with negative control;
- Activity Tracker REFLEXION reuse rather than a new reflection database/log authority.

These mechanisms must not be reimplemented under new names.

## 4. Exact mechanism census

### R01 — Failure-triggered self-reflection

Programming, ALFWorld, WebShop and HotpotQA all reflect only after an unsuccessful/incorrect attempt or exhausted run.

**Disposition:** ALREADY ADOPTED.

Agent Core explicitly triggers Reflexion only from real failure evidence, failed authorized verification, correction, or repeated no-progress.

### R02 — Failure feedback → concise reflection → changed next attempt

Programming Reflexion passes prior implementation, executor feedback and self-reflection into the next candidate generation.

**Disposition:** ALREADY ADOPTED AT CONTROLLER BOUNDARY.

Agent Core already requires observed failure -> bounded diagnosis/hypothesis -> materially changed next attempt. The connected controller performs semantic reasoning; no second model is required.

### R03 — Immediate refinement without explicit reflection

immediate_refinement.py retries using execution feedback but supplies a placeholder instead of model-generated reflection.

**Disposition:** ALREADY REPRESENTED / NO UNIQUE VALUE.

Agent Core may correct directly from concrete failure evidence when a separate reflection step adds no value; it does not require ceremony before every correction.

### R04 — Immediate reflection without real test feedback

immediate_reflexion.py loops reflection using the placeholder feedback 'Test cases omitted'.

**Disposition:** REJECT.

This weakens Agent Core's evidence-first rule and would encourage unsupported self-diagnosis.

### R05 — Bounded prior-plan memory

ALFWorld/WebShop keep only the last three prior reflection plans when constructing the next reflection prompt.

**Disposition:** ALREADY ADOPTED / AGENT CORE STRONGER.

Agent Core durable recall is explicitly bounded to 1–3 relevant semantic lessons instead of blindly using the last three chronological reflections.

### R06 — Reflect only unsolved tasks

ALFWorld/WebShop update reflection memory only for failed/unsolved environments.

**Disposition:** ALREADY ADOPTED.

Agent Core does not create task-local failure reflection after routine success.

### R07 — Repeated identical action exhaustion

EnvironmentHistory marks an environment exhausted when the same action is issued twice consecutively.

**Disposition:** PARTIALLY ADOPTED — REMAINING SOURCE-DERIVED GAP.

Current FailureLoopAdvisor detects only the exact tuple tool + canonical args + failure family. A caller can change non-material/cosmetic arguments and repeatedly hit the same failure family without reaching the exact-repeat advisory. The original recovered plan explicitly listed this regression risk but current code does not close it.

### R08 — Exact repeat failure detection

Reflexion environments stop or reconsider when actions/attempts repeat without progress.

**Disposition:** ALREADY ADOPTED.

Current FailureLoopAdvisor already handles literal equivalent failing calls with bounded state and TTL.

### R09 — Strategy modes: last attempt, reflection, or both

HotpotQA exposes LAST_ATTEMPT, REFLEXION, and LAST_ATTEMPT_AND_REFLEXION context strategies.

**Disposition:** CORE CONCEPT ALREADY AVAILABLE, NO NEW STRATEGY ENUM NEEDED.

Agent Core already has direct failing result, recent Tool History/Activity Tracker and durable lesson recall as separate evidence layers. Adding an enum would duplicate controller judgment.

### R10 — Last-attempt context preservation

HotpotQA can include the previous reasoning trace in the next attempt.

**Disposition:** PARTIALLY ADOPTED.

Agent Core can inspect recent tool calls, but current history output is either full bounded ServerResult or a generic '[output omitted]' marker when one output exceeds 4 KiB. Large failure outputs therefore lose the most useful failure signal for later reflection.

### R11 — Token-budgeted observation truncation

HotpotQA truncate_scratchpad() preserves the trajectory shape while replacing the largest observations until the context fits a token budget.

**Disposition:** RAW SCRATCHPAD METHOD REJECTED; FAILURE-EVIDENCE COMPACTION PATTERN REMAINS VALUABLE.

Agent Core must never persist/return hidden reasoning. The useful adaptation is to compact inspectable tool evidence while preserving error/result structure, not to truncate chain-of-thought.

### R12 — Environment history action/observation labels

ALFWorld/WebShop store ordered action/observation pairs.

**Disposition:** ALREADY REPRESENTED.

Tool History already stores toolName, sanitized arguments, output, timestamp and duration; Activity Tracker captures failures separately.

### R13 — Human-edit label

EnvironmentHistory contains a human_edit label; ALFWorld source comments that this path is not currently supported.

**Disposition:** NO ADOPT VALUE.

Explicit user corrections are already first-class Reflexion triggers in Agent Core.

### R14 — Reflection accumulation across trials

HotpotQA accumulates reflection strings; ALFWorld/WebShop append reflection plans and later bound recent use.

**Disposition:** AGENT CORE ARCHITECTURE IS STRONGER.

Task-local reflections stay local; reusable successful corrections are promoted into canonical Memory. Raw accumulated reflections are not treated as durable truth.

### R15 — Separate internal tests vs final evaluation

Programming Reflexion may generate internal tests, iterate against them, then evaluate against hidden/reference tests.

**Disposition:** REJECT AS AUTOMATIC BEHAVIOR.

Agent Core verification is user-authorized. It must not generate/run tests automatically merely because a failure occurred.

### R16 — Generated internal tests

generator_utils.py can generate model-authored tests and sample them randomly.

**Disposition:** REJECT.

This violates Agent Core's user-controlled verification boundary and introduces non-deterministic test generation as an execution dependency.

### R17 — Structured executor result: pass flag + textual feedback + per-test boolean state

Programming executors return ExecuteResult(is_passing, feedback, state).

**Disposition:** CONCEPTUALLY USEFUL BUT DOMAIN-SPECIFIC IMPLEMENTATION REJECTED.

Agent Core already receives structured MCP isError/results plus explicit authorized test output. A generic test-bitmask runtime does not belong in core Reflexion.

### R18 — Candidate branching / expansion factor

Reflexion UCS generates multiple candidate implementations per state.

**Disposition:** REJECT AS DEFAULT AGENT CORE BEHAVIOR.

Autonomous multi-candidate retry/search would become a hidden retry/runtime layer and conflicts with the direct controller model.

### R19 — Uniform-cost search / best-state selection

Reflexion UCS ranks states by number of failing tests and selects the best state if no goal state is found.

**Disposition:** REJECT.

It depends on autonomous candidate generation and test execution. The controller may reason about alternatives itself, but Agent Core must not add a search engine that executes them automatically.

### R20 — State deduplication by test-outcome bitmask

UCS collapses candidates by a bitmask of per-test pass/fail state.

**Disposition:** REJECT / TOO DOMAIN-SPECIFIC.

Agent Core failure evidence spans files, processes, APIs, IDEs, devices and other tools, not one fixed test vector.

### R21 — Best-effort run resume / success counting

Programming experiments resume benchmark items from JSONL logs and skip solved work.

**Disposition:** NO UNIQUE VALUE.

Agent Core task continuity belongs to current controller context, canonical Memory for durable reusable facts, and explicit task/user state—not benchmark-run resume files.

### R22 — Benchmark run logs/results/datasets

Repository includes many experiment logs, generated results and benchmark data.

**Disposition:** REJECT.

They are research evidence, not Agent Core runtime capability.

### R23 — Reflexion-specific prompts/few-shot examples

Repository ships benchmark prompts and reflection examples.

**Disposition:** REJECT AS RUNTIME ASSET.

Agent Core Reflexion semantics live in the controller contract; benchmark prompt wording is not an architecture dependency.

### R24 — Dedicated OpenAI/model clients and retry wrappers

Reference code owns model/provider calls and exponential retry decorators.

**Disposition:** REJECT / SUPERSEDED.

Agent Core must not add a Reflexion-specific model provider. General outbound/runtime hardening is handled separately by Agent Core's existing networking/security architecture.

### R25 — Model-generated self-reflection helper

generic_generate_self_reflection() calls a model with prior implementation + feedback.

**Disposition:** ALREADY ADOPTED BY AUTHORITY SPLIT.

The connected AI/controller performs semantic reflection; Agent Core does not need an internal reflection LLM.

### R26 — Large-output context preservation

HotpotQA preserves the trajectory while selectively truncating large observations rather than dropping the whole context.

**Disposition:** PARTIALLY ADOPTED — REMAINING SOURCE-DERIVED GAP.

Current ToolHistory caps an oversized ServerResult by replacing content with a generic omission marker. This protects size but can erase error code/message/evidence needed by later reflection.

### R27 — Stop when context/action sequence is exhausted

Reflexion environments halt when repeated action or step/token limits indicate no useful progress.

**Disposition:** PARTIALLY ADOPTED.

Agent Core has exact-repeat failure advisory and bounded tool-history/output, but no broader same-failure-family stagnation advisory across cosmetically changed arguments.

### R28 — Success promotes reusable behavior

Research loops retain successful outcomes; the recovered Agent Core plan mutates this into verified durable lesson promotion.

**Disposition:** ALREADY ADOPTED / AGENT CORE STRONGER.

Only successful reusable corrections are promoted to canonical operational-reflection memory.

## 5. Remaining selectable proposals

Only two mechanisms survive the exhaustive source comparison.

### Proposal R2-P1 — Failure-family stagnation advisory across changed arguments

**Priority:** HIGH
**Default recommendation:** SELECT
**Source inspiration:** EnvironmentHistory repeated-action exhaustion plus UCS progress-state comparison.

Current gap:

- FailureLoopAdvisor fingerprint includes toolName + canonical args + failure family;
- exact-argument repeats are detected well;
- changing an argument can reset the exact-repeat streak even when the same underlying failure family persists;
- the original Reflexion regression-risk list explicitly warned about retries hidden behind cosmetic parameter changes.

Proposed adaptation:

1. Keep the existing exact-repeat detector unchanged for second-call precision.
2. Add a second bounded per-tool + normalized failure-family streak independent of args.
3. Only count consecutive failures inside the existing TTL; any success or different failure family resets that broader streak.
4. Emit a broader stagnation advisory only at a conservative threshold, recommended third same-family failure.
5. Advisory text states that different arguments have not changed the failure outcome and requests a different target/hypothesis/diagnostic method.
6. Keep the same polling/status exemption set or stricter exemptions.
7. Never block, route, retry, recall memory, or mutate machine-control behavior.
8. Reuse existing redaction and bounded state; do not persist a new reflection database.

Primary target:

- src\mcp\failure-loop-advisor.ts;
- existing failure-loop advisor targeted tests if implementation is selected.

Value:

- closes cosmetic-argument evasion of no-progress detection;
- matches Reflexion's exhaustion idea without importing autonomous loops;
- remains advisory-only and controller-side.

### Proposal R2-P2 — Compact failure-evidence capsule for recent tool history

**Priority:** HIGH
**Default recommendation:** SELECT
**Source inspiration:** HotpotQA LAST_ATTEMPT_AND_REFLEXION plus token-budgeted observation truncation.

Current gap:

- ToolHistory correctly redacts and caps output;
- when a ServerResult exceeds 4 KiB, capOutput() replaces its content with only a generic omission marker;
- this can erase the structured error signal needed for failure diagnosis;
- get_recent_tool_calls has no failure-only compact mode, so the controller may need to retrieve more context than necessary.

Proposed safe adaptation:

1. Never preserve or expose hidden reasoning/scratchpads.
2. Add a deterministic compact evidence representation derived only from inspectable tool records:
   - timestamp;
   - tool name;
   - sanitized canonical arguments or bounded argument summary;
   - isError/outcome status;
   - normalized/redacted failure family when present;
   - bounded beginning/end or structured text excerpt from large tool output;
   - duration.
3. Preserve error code/message/family before dropping bulk output.
4. Extend get_recent_tool_calls with optional failure-focused/compact filtering rather than creating a new reflection tool.
5. Compact mode should return only the smallest evidence bundle useful for reflection.
6. Existing full-history behavior remains backward compatible.
7. Persisted history remains sanitized and bounded; no new history file/database.
8. Polling/status entries can be excluded from compact failure capsules by default or via explicit filter semantics.

Primary targets:

- src\rdc\utils\toolHistory.ts;
- src\rdc\handlers\history-handlers.ts;
- src\rdc\tools\schemas.ts;
- MCP tool metadata for get_recent_tool_calls;
- targeted history/Reflexion tests if selected.

Value:

- preserves failure signal from oversized outputs;
- reduces controller context cost during diagnosis;
- captures the useful Reflexion 'last attempt + reflection evidence' pattern using only inspectable redacted evidence;
- avoids chain-of-thought persistence entirely.

## 6. Explicit rejection set after re-grounding

Closed as no-adopt for current Agent Core architecture:

- Reflexion Python runtime;
- LangChain/OpenAI Reflexion agent classes;
- second reflection model/provider;
- autonomous retry loops;
- UCS/tree search execution;
- candidate expansion/temperature search;
- automatic generated tests;
- automatic test execution without user authorization;
- benchmark environments/datasets/results/logs as runtime dependencies;
- dedicated reflection database/vector store;
- raw reasoning/scratchpad persistence;
- benchmark few-shot prompt assets;
- model-specific retry wrappers;
- test-bitmask state as a general Agent Core progress authority;
- automatic promotion of failed reflections to durable memory;
- a ReflexionService or machine-control gate.

## 7. Source-derived defects/risks not to copy

1. Immediate Reflexion can generate repeated self-reflection without concrete feedback; Agent Core must stay evidence-first.
2. UCS autonomously expands multiple model candidates and runs tests; Agent Core must preserve user-controlled verification.
3. EnvironmentHistory uses a mutable default list argument for history; do not copy this Python state pattern.
4. Some reference paths accumulate reflections without strong validation; Agent Core must keep task-local reflections non-authoritative until successful correction.
5. Reflexion benchmark model/runtime code owns provider credentials and retry policy; do not transplant it.
6. HotpotQA scratchpad truncation operates on model reasoning traces; only the evidence-compaction idea is reusable, never raw/private scratchpad handling.
7. Research run logs can contain full prompts/actions/outputs; do not make them a durable memory authority.

## 8. User selection result

The user explicitly approved execution of both remaining Reflexion second-wave proposals on 2026-09-20.

Selection result:

- [x] R2-P1 — Failure-family stagnation advisory across changed arguments
- [x] R2-P2 — Compact failure-evidence capsule for recent tool history
- [ ] Reject both

Both mechanisms remain advisory/evidence-only and do not authorize autonomous retry, routing, testing, memory promotion, or machine-control gating.

## 9. Implementation phases after selection

### Phase 0 — Preserve current Reflexion invariants

- scoped backup only affected controller/history files;
- preserve current contract regression and exact-repeat behavior;
- preserve current 0.11.0 stable version and pending 0.12.0 intents;
- add release intent only when selected shipped behavior is implemented;
- no release apply/baseline refresh.

### Phase 1 — P1 broader stagnation advisory, if selected

- add bounded same-tool/same-failure-family state independent of args;
- keep exact-repeat fingerprint path unchanged;
- reset on success/different family/TTL expiry;
- emit advisory only, never block/retry;
- retain redaction/exemption semantics.

### Phase 2 — P2 compact evidence mode, if selected

- define deterministic compact ToolHistory record shape;
- preserve error/failure family before large-output omission;
- extend existing get_recent_tool_calls schema backward-compatibly;
- return sanitized compact failure evidence only when requested;
- keep full output mode unchanged.

### Phase 3 — Contract/docs/memory synchronization

- update AGENTS.md only if controller-facing behavior changes materially;
- update CODEBASE.md in same task;
- update root MEMORY.md implemented state;
- refresh durable Reflexion strategy memory only after implementation is real;
- update this plan to exact implemented/verified state.

### Execution result — 2026-09-20

Implemented natively without adding a Reflexion runtime, model/provider, database, retry engine, or new package dependency:

- src\failure-evidence.ts now centralizes redacted failure-family normalization and bounded head/tail evidence excerpts for reuse by the advisor and Tool History;
- FailureLoopAdvisor preserves the original exact tool+args+family path and adds a second consecutive same-tool/same-family streak independent of arguments;
- broader stagnation emits only after the third same-family failure when argument variation has actually occurred; success, family change, TTL expiry, or reset clears the broader streak;
- advisory records now include scope exact|failure-family while remaining non-blocking and non-retrying;
- ToolHistory captures a bounded redacted failureEvidence capsule before oversized raw ServerResult output is replaced by the existing 4 KiB omission marker;
- full/default get_recent_tool_calls deliberately strips the internal capsule so its historical response shape remains unchanged;
- get_recent_tool_calls adds optional compact=false and failuresOnly=false parameters. compact=true returns only bounded arguments summary, outcome, failure family/excerpt, timestamp/tool/duration; failuresOnly=true filters to failed calls;
- circular/oversized values remain sanitized/bounded through existing redaction plus compact evidence handling;
- AGENTS.md now directs controllers toward compact failure history when that is sufficient and documents broader same-family stagnation as advisory evidence only;
- dedicated minor release intent .changeset/20260920073613-21747a.md records the shipped behavior;
- stable product version remains 0.11.0; no release apply or baseline refresh occurred.

## 10. Verification gates

Run only after proposal selection and user-authorized targeted verification.

P1 gates:

1. existing exact-repeat second-call advisory remains unchanged;
2. third consecutive same-tool/same-family failure with materially different args produces stagnation advisory;
3. changed failure family resets broader stagnation;
4. any success resets broader stagnation;
5. TTL expiry resets broader stagnation;
6. polling/status exemptions remain silent;
7. secrets remain absent from family/advisory output;
8. no tool call is blocked or retried automatically.

P2 gates:

9. oversized failed output retains redacted failure code/message/family in compact evidence;
10. bulk output remains bounded;
11. compact mode can filter to failure evidence without returning unrelated successful history;
12. default get_recent_tool_calls response remains backward compatible;
13. persisted history remains bounded/redacted;
14. hidden/private reasoning is never stored or returned;
15. malformed/circular outputs remain safe and bounded.

Architecture gates:

16. no Reflexion runtime/model/provider/database is added;
17. no machine-control routing/gate is introduced;
18. Memory remains sibling authority;
19. release:compat remains free of public tool removals;
20. root build succeeds;
21. direct tool execution semantics stay unchanged.

## 11. Verification evidence

Targeted verification authorized by the user's approval of this plan:

- tests\failure-loop-advisor.test.ts, tests\reflexion-second-wave.test.ts, and tests\reflexion-contract.test.ts passed 3 files / 18 tests after a live-acceptance-discovered volatile-path normalization regression was added;
- original exact-repeat advisory behavior remained second-call repeat / third-call no-progress;
- a third consecutive same-tool/same-family failure across changed arguments produced scope=failure-family no-progress;
- family change, success, TTL expiry, polling/status exemptions, and redaction reset/silence behavior remained correct;
- oversized failed history output was capped while compact mode retained redacted failure family plus bounded head/tail evidence;
- compact failuresOnly excluded unrelated successes;
- default/full history response omitted the internal failureEvidence field and retained raw-output shape;
- circular failed output remained safe/bounded;
- controller contract regression remained 3/3 PASS;
- root TypeScript build completed with exit code 0;
- compiled dist smoke confirmed get_recent_tool_calls schema accepts compact=true/failuresOnly=true and compiled FailureLoopAdvisor/ToolHistory exports exist;
- release:check-intent returned ok=true;
- release:compat remained 62 -> 62 public tools with no route/tool removal and breakingEvidence=false;
- read-only release plan remained 0.11.0 -> 0.12.0 minor with five pending intents;
- no release:apply, release:baseline, commit, tag, push, publish, deploy, or restart was performed.

Grafel indexing was requested for structural review but remained queued/dirty during this implementation window. Per Agent Core contract, exact current source, targeted tests, compiled smoke and release compatibility remained authoritative; no claim relies on stale graph evidence.

## 12. Corpse / retirement result

Retirement condition B is satisfied:

- first-wave mechanisms plus R2-P1/R2-P2 are implemented and targeted-verified;
- source-first census covered all 55 tracked Python files, approximately 4,558 lines, 293 parsed function/class definitions, and all four experiment families;
- every mechanism family is accounted for by Agent Core adoption, explicit rejection, or benchmark/support-only classification;
- final active-source scan found no Audit\Reflexion path, no benchmark-path dependency, and no root Reflexion/LangChain/Chroma dependency;
- the checkout remained clean at 218cf0ef1df84b05ce379dd4a8e47f17766733a0.

Audit\Reflexion was therefore deleted under the user's corpse-retirement authorization. Provenance remains in this plan and scoped backups.

## 13. Current conclusion

Reflexion first-wave controller behavior, contract regression, exact-repeat advisory, same-family stagnation advisory, and compact failure-evidence Tool History are now Agent Core-owned behavior.

Final second-wave additions:

- R2-P1: advisory-only same-tool/same-failure-family stagnation across changed arguments;
- R2-P2: optional compact/failures-only recent tool-history evidence that preserves redacted failure signal from oversized outputs.

Everything else in grounded revision 218cf0ef1df84b05ce379dd4a8e47f17766733a0 is already represented more safely in Agent Core, benchmark/domain-specific, support-only, redundant, or rejected by the direct-controller/user-controlled-verification architecture.

Source/dist implementation, targeted verification, and live Node Core activation are complete. The final live process started from rebuilt dist\index.js at 2026-09-20T14:46:49+07:00 with /health=ok and Memory/Execution available. Live acceptance using three ENOENT read_file failures with different absolute paths produced no advisory on failures 1–2 and the new failure-family no-progress advisory on failure 3. The current chat connector still advertises a cached pre-change get_recent_tool_calls input schema and therefore strips compact/failuresOnly before dispatch; reconnect/reinitialize the connector to consume those new optional parameters through this client. This client-cache limitation does not change the live server implementation.
## 14. Reference re-grounding — 2026-09-22

### 14.1 Exact source and scope
The requested `steal-use-repos\Reflexion` clone is at `218cf0ef1df84b05ce379dd4a8e47f17766733a0`, identical to the already-audited baseline. Fresh Git inventory found 436 tracked files, including 55 Python files across programming, HotpotQA, ALFWorld and WebShop. The byte inventory succeeded for all 55. An AST-only inspection parsed 54 files and counted 293 functions/classes; it did not import or execute the repository.
The one AST failure is `programming_runs/human-eval/human_eval/execution.py`: a warning deliberately leaves the generated-code exec line commented under an otherwise empty with-block. Exact source confirms this upstream safety-disabled harness. It is not evidence that the clone suffered filesystem corruption, and it was not repaired or run.
This is an incremental re-grounding of an unchanged main revision plus selected branch evidence, not a claim to have re-read every research log/notebook or every historical commit. Logs containing generated reasoning are not durable Agent Core knowledge and are not copied.
### 14.2 Mechanism dispositions grounded in executable source
`programming_runs/reflexion.py` uses failure feedback for the next implementation, bounds trial iterations and checks external evaluation after internal tests. Preserve the general evidence-before-success principle already in the controller contract; do not transplant automatic model generation or test execution. A passing internally generated test is not independent acceptance evidence.
`programming_runs/reflexion_ucs.py` scores candidate states by failed tests and automatically expands/searches candidate implementations. This is an autonomous model/test search runtime, not a missing Agent Core sibling capability, and remains rejected for the current user-controlled verification architecture.
`alfworld_runs/env_history.py` marks repeated identical actions exhausted and constructs prior-trial context. The actual implementation uses a mutable list default and does not establish evidence that a repeat was ineffective; do not copy that state shape. Native Agent Core already distinguishes failure outcome, tool/arguments and failure family.
`webshop_runs/generate_reflections.py` reflects only unsuccessful tasks and exposes the latest three prior reflections as prompt context. Agent Core's failure-triggered bounded recall rule already captures the useful mechanism; the upstream accumulation of unverified reflections is not a valid replacement for explicit, verified durable memory capture.
### 14.3 Remote-ref recheck
Eight remote refs were inventoried. `main`/`HEAD` identify the audited revision. `main-private` and `starchat` contribute no commits beyond HEAD in the inspected Python history; their older snapshot differences are not new changes. `hotpot-notebooks`, `hotpotqa-runs` and `main-backup` contain earlier experiment organization/drivers and moved/renamed Python files. `hotpot-enhancement` adds model-aware tokenization, logging, invalid-action formatting and result serialization.
The distinct branch bodies were checked directly: the older `hotpotqa_runs/cot_run_base.py` is a benchmark driver with dataset/model/run-log ownership; `programming_runs/generators/parse_indent.py` actually calls exec on generated code to try indentation variants and is unsuitable for a source-inspection primitive; the enhancement `AnyOpenAILLM` wrapper is model-provider orchestration. None supplies a new current-fit native integration mechanism. Triple-dot added-file lists were not treated as proof of novelty when the same mechanisms already exist at main.
### 14.4 Current Agent Core implementation evidence
`src/mcp/failure-loop-advisor.ts` directly implements exact-repeat fingerprints, bounded TTL/state, changed-argument same-family streaks, success reset and advisory-only output. `src/rdc/utils/toolHistory.ts:284-394` captures sanitized compact failure evidence before capping output and supports failuresOnly filtering. These are present code bodies derived from the selected R2 mechanisms, not merely file-size or plan-title evidence.
`src/failure-evidence.ts`, the ordinary history handler and one old advisor test were deleted in the earlier corrupt-artifact cleanup. Their missing contents are a separate recovery task; no present-runtime acceptance is claimed here. Existing compiled artifacts, historical acceptance records and these surviving bodies do not prove that the current source tree can rebuild.

### 14.5 Final value and dependency decision
**New proposals for user selection: NONE for this pinned reference and current Agent Core boundaries.** R2-P1/R2-P2 remain historical selected mechanisms with direct surviving implementation evidence. Benchmark providers, automatic candidate search/evaluation, raw prompt/scratchpad persistence and generated-code execution remain rejected rather than unimplemented promises.
A fresh read-only scan of current `src`, `scripts` and `tests` found zero literal dependencies on `steal-use-repos/Reflexion`, `Audit/Reflexion` and the benchmark module paths. The first diagnostic counter was discarded because the PowerShell automatic `$Matches` variable overwrote the accumulator; the corrected scan used a distinct accumulator and returned zero. No decision relies on the invalid count.
The reference root and descendants had no reparse entries. Git status showed only the audit-created `.grafel/group.json`, with no source modifications. Retirement is authorized only after the audit workspace is unregistered, its matching marker is removed and a final HEAD/clean-tree guard confirms this same checkout.
**Final disposition:** NO NEW CURRENT-FIT VALUE — REFERENCE RETIRED. `five-repo-audit-20260922` was unregistered; the provider had already removed its matching audit markers. A final exact HEAD/clean-tree/no-reparse guard passed before deleting only `steal-use-repos\Reflexion`. The deletion command returned `DELETED=Reflexion`, verified absence with Test-Path, and listed the other four requested clones as retained.
This scoped adoption judgement does not mean upstream Reflexion is universally useless or Agent Core recovery is finished. No recovery, memory recreation, runtime restart, build, benchmark/test suite or new implementation was performed by this re-grounding.
