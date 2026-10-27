# Hermes Runtime Architecture & Integration Blueprint
**Target codebase:** F:\Workflow\Hermes-Official-20261003
**Written:** 2026-10-23 (Asia/Jakarta)
**Status:** Static source-grounded proposal. No runtime execution, test, installation, patch or deployment performed.

## 0. Evidence boundary
Objective: reverse engineer Model Caller Invocation → Interaction Processing → Text Output Response and propose concrete integration of external MCP, memory and Node.js/TypeScript harness.
Method: read current source tree, relevant function bodies, AST symbols, module registration, dependency manifest, concurrency and persistence seams. Findings tagged **Verified** refer to observed code; **Proposed** designs have not been installed or exercised.
The principal route below is the generic conversation turn. Anthropic Messages, Bedrock Converse, MoA, Codex Responses and Codex app-server have distinct transport branches. No claim of universal behavior or live-provider readiness is made.

## 1. Architecture Map & Concurrency Pattern
### 1.1 Full execution graph
~~~mermaid
flowchart TD
 H["CLI / TUI / Gateway / ACP host"] --> A["run_agent.py: AIAgent + TurnFacadeMixin"]
 A --> L["Lease / Relay turn / ContextVar scope"]
 L --> C["conversation_loop._run_conversation_turn"]
 M["MemoryManager: builtin + optional external"] --> X["turn_context.build_turn_context + prefetch"]
 C --> X --> Q["prepare_iteration + assemble_api_request + preflight"]
 Q --> B["turn_api_request.build_api_request"]
 B --> P["llm_request middleware + pre_api_request hook"]
 I["agent_init._build_client"] --> K["Provider client / transport"]
 P --> D["turn_api_call.perform_api_call"]
 K --> D --> E["llm_execution middleware + HTTP/SSE"]
 E --> N["turn_response_intake.normalize_model_response"]
 N --> T{"tool_calls present?"}
 T -->|Yes| R["turn_tool_round: persist tool-call row"]
 R --> U["guardrails + tool_executor + MCP async loop"]
 U --> V["persist tool results + optional compression"]
 V --> Q
 T -->|No| F["finish_text_response: stop gates + output transform"]
 F --> S["append assistant text + SessionDB flush"]
 S --> Z["finalize_turn: cleanup + hooks + result"]
 Z --> O["final_response + completed/failed + metadata"]
 E -. "stream delta" .-> SD["stream_delivery: scrub + single writer + callbacks"]
 SD --> H
 O --> H
 Z -. "sync/queue next prefetch" .-> M
~~~
### 1.2 Exact invocation trace
1. **Wrapper:** run_agent.py:216-284 composes AIAgent from mixins, forwards initialization to agent.agent_init.init_agent. agent/agent_init.py:991-1044 chooses a provider path and initializes/rebuilds client state. The OpenAI-compatible path uses an OpenAI SDK client.
2. **Turn entry:** agent/turn_facade.py:24-220, TurnFacadeMixin.run_conversation obtains durable-turn lease and Relay conversation/turn ownership, then invokes agent.conversation_loop.run_conversation. Its chat() shorthand returns result["final_response"] (lines 220-222).
3. **Context:** agent/conversation_loop.py:1555 onward calls build_turn_context; agent/turn_context.py:909-956 invokes MemoryManager.on_turn_start and prefetch_all, and attaches recalled context as an API-only content sidecar.
4. **Bounded loop:** agent/conversation_loop.py:1657-1708 runs begin_iteration, prepare_iteration, assemble_api_request, run_preflight_gate, announce_api_call, retry/call, normalize_model_response and either tool round or text response.
5. **Request builder:** agent/turn_api_request.py:93-160 constructs provider kwargs, sanitizes, performs transport-specific preflight, invokes apply_llm_request_middleware and pre_api_request observer.
6. **Actual provider call:** agent/turn_api_call.py:46-135 selects interruptible streaming or non-streaming inside run_llm_execution_middleware. agent/chat_completion_helpers.py:762-795 invokes request_client.chat.completions.create for generic OpenAI-compatible calls; specialized adapters use their own APIs.
7. **Response interpretation:** agent/turn_response_intake.py:120-147 calls normalize_response_for_agent, yields assistant_message + finish_reason, coerces text to string and invokes post_api_request observer.
8. **Tool branch:** agent/turn_tool_round.py:51-224 validates tool calls, flushes assistant tool-call row to SessionDB **before side effects**, executes tools, persists results and continues the model loop. If flush fails, it refuses the tool side-effect path.
9. **Text branch:** agent/turn_final_response.py:58-375 handles empty/degenerate/stalled replies, think stripping, stop gates and transformation **before** assistant-text persistence.
10. **Terminal result:** agent/turn_finalizer.py:525-724 recovers streamed text where needed, closes transcript, persists session, emits completion hooks and returns final_response, completed/failed, session ID, model/provider and usage.
11. **User-visible streaming:** agent/stream_delivery.py:298-334 sends sanitized deltas to display/TTS callbacks with single-writer fencing. A delta is not the same as durable final_response.
12. **Alternate branch:** conversation_loop.py:1639-1656 can hand an entire turn to Codex app-server subprocess; an integration relying only on the generic provider call cannot claim that route is covered.

### 1.3 Concurrency / ownership matrix
| Mechanism | Verified behavior | Design constraint |
|---|---|---|
| Turn execution | Bounded synchronous conversation state machine plus scoped leases, Relay coordinator and ContextVars | Preserve a single authoritative turn owner |
| Normal nonstream request | _NonStreamRequest uses worker+watchdog; direct inline call for nested cron/delegation avoids nested-pool deadlock (chat_completion_helpers.py:982-1040,1261-1274) | Avoid adding another blocking worker layer |
| Tool batches | Up to 8 workers, parallel/sequential segments, results reassembled in original call order (tool_executor.py:135,1576-1618,1926-1950) | Respect mutation barriers and result-to-call identity |
| MCP client | Sync handler marshals to async background RPC; per-server _rpc_lock and approval/trust gate; opt-in parallel-safe server flag (mcp_tool_handlers.py:566-608) | Do not blindly parallelize or replay writers |
| Stream | Token-based single-writer ownership rejects old/retried stream deltas (stream_delivery.py:235-266,298-334) | Observe post-scrubber, not raw provider output |
| Memory | Builtin plus at most **one external** MemoryProvider; bounded external prefetch thread and one-worker queued sync/prefetch (memory_manager.py:222-253,365-445) | Preserve session/profile isolation, bounded latency |
| Persistence | Tool call row durably flushed before tools; final assistant row flushed before terminal completion when possible | Side-effect receipts must not precede durable ownership |
| Retry/interrupt | Dedicated error, redirect, timeout, response checks and finalizer guards | Do not duplicate model requests or tool writes |

## 2. Dependency Analysis
| Capability | Library/framework or implementation | Evidence and limits |
|---|---|---|
| Primary runtime | Python, pyproject.toml declares >=3.11,<3.15 | Python engine; not natively TypeScript |
| LLM API | Declared OpenAI SDK and httpx; adapters for Anthropic Messages, Bedrock, MoA, Codex | agent/agent_init.py::_build_client and chat_completion_helpers.py |
| Middleware & plugins | Native Hermes middleware, lifecycle observers, plugin dispatch | hermes_cli/middleware.py and lifecycle.py |
| Interactive terminals | Declared rich and prompt_toolkit | pyproject.toml; actual UI appearance not tested |
| Gateway | Declared FastAPI, Uvicorn, websockets | pyproject.toml; no live service probe |
| MCP | Optional MCP Python SDK, tool discovery, stdio transports, schema cache and async RPC | tools/mcp_tool_discovery.py and mcp_tool_handlers.py |
| State | SessionDB/SQLite-oriented persistent conversation and assistant/tool rows | turn_tool_round.py; turn_finalizer.py |
| Memory | Builtin file-based MEMORY.md/USER.md and external MemoryProvider | agent/agent_init.py:1299-1345; memory_manager.py |
| Concurrent orchestration | Thread pools, asyncio MCP loop, locks and ContextVar turn ownership | tool_executor.py; mcp_tool_handlers.py; turn_facade.py |
| Node.js / TypeScript | **Proposed external MCP/HTTP sidecar**, not a dependency of generic Hermes model engine | Do not directly import TS into Python |

The manifest proves declared packages, not their actual installation/health. Provider selection depends on configuration; do not infer a configured route from code support.

## 3. Integration Hook Points
| Priority | Exact file / function | What can be attached | Safety boundary |
|---|---|---|---|
| P0 | tools/mcp_tool_discovery.py::discover_mcp_tools; register_mcp_servers | External Node/TypeScript MCP server and typed tools | Config validation, toolset filtering, subprocess scope |
| P0 | tools/mcp_tool_handlers.py::_make_tool_handler | Tool result exchange over managed async RPC | Existing trust/approval, _rpc_lock, read-only-only retry |
| P0 | agent/memory_provider.py::MemoryProvider | Optional custom memory adapter with prefetch, queue_prefetch, sync_turn and tool schemas | Only one external provider; scoped session/profile |
| P0 | agent/memory_manager.py::add_provider; prefetch_all; handle_tool_call | Wire memory to existing startup/recall/tool lifecycle | Bound timeouts and redaction, no second memory authority |
| P0 | agent/turn_context.py::_memory_turn_start_and_prefetch | Model-facing recall before call | Bounded relevant context, provenance, injection protection |
| P1 | hermes_cli/middleware.py::apply_llm_request_middleware | Provider-request metadata/context shaping | Preserve schema, prompt cache, token budget |
| P1 | agent/turn_api_request.py::_fire_pre_api_request_hook | Before-call read-only observer | Never export credentials or raw full history by default |
| P1 | hermes_cli/middleware.py::run_llm_execution_middleware | Latency, counters, tracing | next_call must be single-use; do not repeat inference |
| P1 | agent/turn_response_intake.py::normalize_model_response | After-call normalized observer | Preserve finish_reason and tool IDs |
| P1 | agent/stream_delivery.py::_fire_stream_delta | Sanitized visible text progress/UI sink | Single-writer token, backpressure, hidden reasoning exclusion |
| P1 | agent/turn_final_response.py::finish_text_response | User-visible answer shaping | Transform before durable assistant flush |
| P1 | agent/turn_finalizer.py::apply_llm_output_transform; finalize_turn | Final text policies, completion metadata | Consistent persisted+delivered answer; interruption checks |
| P2 | agent/turn_tool_round.py::run_tool_round; tool_executor.py | Tool argument policy under existing guardrails | Preserve tool_call_id/result matching, ordered barriers |
| P2 | agent/agent_init.py::_build_client; agent/client_lifecycle.py | Full provider adapter replacement | High blast radius: do not modify for first PoC |

**Important distinction:** MCP is callable tooling. MemoryProvider provides automatic recall and post-turn sync. A memory.search MCP tool alone does not make every turn auto-recall. A thin Python MemoryProvider bridge may invoke a Node service, but only if the external provider slot is free.
**Important output distinction:** run_conversation()["final_response"] is the terminal result; stream callbacks represent provisional sanitized deltas. Postprocessing should not mutate completed output after SessionDB has stored a different version.

## 4. Actionable Implementation Steps
### 4.1 Compare truly different strategies
| Route | Risk / effort | Value | Decision |
|---|---|---|---|
| A. Existing Hermes MCP → Node.js/TypeScript sidecar | Low-medium; reversible | Reuse mature tool safety, schema, dispatch | **First choice** |
| B. Python MemoryProvider → Node-backed custom memory | Medium; requires free external-provider slot | Automatic retrieval and sync per turn | **Second stage** |
| C. Replace model client/turn loop with another harness | High; retries/streams/ownership rewritten | Only justified by measured unmet transport needs | **Defer** |

### 4.2 Ordered tactical blueprint
1. **Baseline (read-only):** capture Hermes source revision/hash, selected api_mode, configured MCP servers, existing external MemoryProvider and relevant SessionDB configuration. A folder date is not a verified commit.
2. **Build an isolated Node/TS MCP sidecar** with two read-only functions: harness.ping and memory.search, each with explicit JSON Schema, timeout, protocol version and bounded result. Avoid generic execute-shell or write-file at first.
3. **Register via Hermes native MCP management/config** (hermes_cli/mcp_config.py; tools/mcp_tool_discovery.py). For local integration prefer stdio and a project-local executable, with stdout reserved for MCP protocol and stderr for logs. Inspect exact CLI/config schema before writing it.
4. **Connect and check tool inventory** through native discovery. Prove two tools visible and invoke ping/search with valid/invalid inputs; record actual results before marking PASS. Confirm server failure does not corrupt the turn.
5. **Wire memory.search** through native tool call dispatch. Carry session_id, bounded limit, source metadata and tool_call_id matching. Do not infer safe replay on mutating tools or give returned content higher instruction authority.
6. **Only if automatic recall required**, implement a thin Python MemoryProvider pointing at the same service. Use provider.initialize, is_available, name, prefetch, queue_prefetch, sync_turn, get_tool_schemas and shutdown; verify it is the only external provider. Use bounded cache and background work.
7. **Use existing prefetch injection**, not a second prompt constructor. Source-label each recall, filter secrets and malicious instructions, limit length; keep canonical user input apart from the API-only sidecar.
8. **Instrument outputs through observer/stream/finalizer hooks**, using sanitized text and IDs. Do not expose chain-of-thought, unredacted credentials or raw intercepted provider chunks.
9. **Seek separate approval for execution tests** before running them: ordinary 1-turn text, multi-tool/order, MCP shutdown/reconnect, MemoryProvider timeout, redirect/stream single-writer, cross-profile session, fallback, persistence failure, and specialized Codex path. Assert observed facts only.
10. **Revert safely:** unregister/disable external MCP server; detach optional MemoryProvider; confirm original provider → normalized text → final_response still works. Keep Hermes AIAgent, SessionDB and model caller unchanged.

### 4.3 Proposed integration payloads (not verified existing schemas)
~~~text
harness.ping({}) -> { version, schemaVersion, status }
memory.search({ query, session_id, limit })
  -> { hits:[{ id, source, text, score }], truncated, providerVersion }
MemoryProvider.prefetch(query, session_id) -> short source-labeled context string
MemoryProvider.queue_prefetch(query, session_id) -> schedule bounded background recall
MemoryProvider.sync_turn(user_content, assistant_content, session_id) -> authorized durable update
stream/final event metadata: session_id, task_id, turn_id, api_request_id, visible_delta or final_response, completed, failed
~~~
These payloads are a suggested interface; they require validated schemas, identity checks and implementation. Node-to-Python state should be exchanged by MCP/HTTP with bounded serialization, not by direct imports or an unsynchronized shared transcript.

## 5. Verification Plan, Risks & Unknowns
**Acceptance gates (NOT RUN):** real model invocation returns nonempty final_response; response equals durable assistant content when persistence is healthy; tool result identity and ordering remain intact; stream retry never delivers a stale duplicate; missing MCP server fails without side effects; memory recall is relevant/cited/bounded; simultaneous session identities stay isolated; all connector credentials remain private; disabling sidecar cleanly restores baseline.
**Top risks:** injecting untrusted memory into higher-priority instructions, incorrect tool-retry after uncertain mutation, tool/stream race, nested pool deadlock, excessive latency, provider-specific transport incompatibility, store/output divergence, memory sync duplicating canonical state, and secret leakage through middleware logs.
**Controls:** read-only-first tools, per-session identity, bounded timeouts and result budget, strict JSON Schema, allowlist/approval gate, deduplication/call receipts, causal provenance, redacted telemetry, preserved retries/turn ownership and replay-safe isolation.
**Unknown until runtime tests:** exact active user provider/model, installed dependency state, custom MCP servers already configured, behavior of 9Router or external Node harness, real memory provider slot availability, observed latency, auth, compatibility with every alternate transport.
No truncated source was repaired; pagination/AST inspection was used to continue relevant reads. No original file was modified.

## 6. Source Evidence Index
- run_agent.py:216-284 — AIAgent and client-init forwarding
- agent/agent_init.py:991-1044,1299-1345 — provider client and builtin/external memory init
- agent/turn_facade.py:24-220 — session lease, Relay ownership, public chat()
- agent/conversation_loop.py:1486-1537,1555-1768 — retry, generic turn loop, special Codex path
- agent/turn_context.py:900-956 — turn-start prefetch / API-content sidecar
- agent/turn_api_request.py:45-160 — request middleware and observer
- agent/turn_api_call.py:46-135 — streaming selection and execution middleware
- agent/chat_completion_helpers.py:762-795,982-1040,1261-1274 — concrete provider invocation and worker/direct paths
- agent/turn_response_intake.py:120-147 — normalized assistant response and post-API observer
- agent/turn_tool_round.py:51-224 — tool-call persistence, execution, continuation
- agent/tool_executor.py:135-139,1576-1618,1926-1950 — concurrent and segmented dispatch
- agent/stream_delivery.py:235-266,298-334 — writer ownership, scrubbers, visible deltas
- agent/turn_final_response.py:58-375 — final text transform and assistant flush
- agent/turn_finalizer.py:525-724 — post-loop completion contract
- hermes_cli/middleware.py:16-25,88-149,161-204 — middleware hooks, single-use downstream call
- hermes_cli/lifecycle.py:24-46 — lifecycle event observers
- tools/mcp_tool_discovery.py:538-645,769-776 — MCP discovery, parallel-safe metadata
- tools/mcp_tool_handlers.py:566-608 — MCP trust gate and async RPC lock
- agent/memory_manager.py:222-253,365-445,540-605 — memory lifecycle and routing
- agent/memory_provider.py:109-216 — external provider hook contract
- pyproject.toml:1-170 — declared Python/framework dependencies

## 7. Final Recommendation / Delivered Scope
Keep the established Python Hermes turn machine. Add a TypeScript/Node **MCP sidecar**, then optionally one thin **MemoryProvider** adapter if automatic context recall is necessary. This preserves caller, retries, authorization, streaming ownership, session durability and reversibility.
**Delivered:** source trace and proposal document only. **Not delivered/claimed:** live execution, modified Hermes source, installed MCP plugin, deployed Node service, verification PASS or release.
