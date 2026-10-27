# Odysseus Runtime Architecture and Harness Integration Blueprint

**Status:** Source-grounded proposal only. No runtime integration has been applied.
**Inspected repository:** F:\Workflow\odysseus
**Git HEAD (observed):** 01566b158e627748f70ac402571f2f78241fb6f9
**Scope:** Model Caller Invocation -> Interaction Processing -> Text Output Response.
**Evidence basis:** Direct inspection of current Python source, dependency manifests and module entrypoints, 2026-10-23.
**Excluded:** live model requests, running-server benchmarks, package installation, test execution, deployment, credential inspection and source changes.

## 1. Architecture Map & Concurrency Pattern

### 1.1 Primary entrypoints and responsibility

- **Application root:** app.py:130 creates FastAPI; app.py:743-751 registers setup_chat_routes.
- **First user-request handler:** routes/chat_routes.py:2252 (POST /api/chat) or :2469 (POST /api/chat_stream).
- **Actual model HTTP caller:** src/llm_core.py:2603 llm_call_async; :2933 stream_llm; :2959 _stream_llm_inner.
- **Call routing wrapper:** src/llm_core.py:2529 llm_call_async_with_route_fallback; :4436 stream_llm_with_fallback.
- **Interaction lifecycle:** src/agent_loop.py:21029 stream_agent_loop, plus compact alternate src/clean_agent_preview.py:5235 stream_preview.
- **Output boundary:** src/agent_runtime/completion.py:206 with_completion_gate, then routes/chat_routes.py stream_with_save.
- **Persistence:** routes/chat_helpers.py:1540 save_assistant_response; delivery by FastAPI StreamingResponse.
- **Ordinary no-tool mode:** routes/chat_routes.py:4190 streams through model wrapper without agent tool execution.

### 1.2 Source-grounded execution architecture

~~~mermaid
flowchart TD
    U["Browser / API client"] --> R["FastAPI routes/chat_routes.py"]
    R --> A["Auth, owner/session, tool policy and TurnContract"]
    A --> C["build_chat_context: history + preface + memory/RAG"]

    C --> N{"Requested mode"}
    N -->|Non-stream JSON| Q["llm_call_async_with_route_fallback"]
    N -->|Streaming chat| S["stream_llm_with_fallback; tools=None"]
    N -->|Streaming agent| L["stream_agent_loop"]
    L --> V{"Compact preview selected?"}
    V -->|No| I["Agent model rounds via stream_llm_with_fallback"]
    V -->|Yes| P["stream_preview: separate direct httpx caller"]
    I --> T["Parsed tool calls + TurnContract + runtime authority"]
    P --> T
    T --> X["execute_tool_block: native tool / MCP / execution bridge"]
    X --> I
    I --> G["with_completion_gate: journal + evidence + safe answer"]
    P --> G
    Q --> J["Session ChatMessage + JSON response"]
    S --> Z["stream_with_save / SSE render state"]
    G --> Z
    Z --> B["save_assistant_response + session_manager"]
    Z --> D{"Delivery policy"}
    D -->|Interactive| K["agent_runs: detach + replay + resume"]
    D -->|Compare/unattended| F["Direct StreamingResponse; cancel on disconnect"]
    K --> U
    F --> U
    B --> H["Sequential post-response memory/skill extraction"]
~~~

**Important:** The compact path under src/clean_agent_preview.py:5626 constructs a separate httpx.AsyncClient. The shared src/llm_core.py caller is NOT a universal interception point.

### 1.3 Turn lifecycle and text response

1. HTTP request reaches /api/chat_stream, resolves owner/session, selected endpoint, model and privileges.
2. build_chat_context builds prior messages, preset instructions, attachments and permitted memory/RAG context.
3. For agent mode, resolve the immutable TurnContract and request authority before offering tools.
4. stream_agent_loop performs model call(s); it parses streamed text, usage, native tool_calls and errors.
5. Any admitted tool executes through execute_tool_block; results are associated with tool-call IDs and appended to the next model round.
6. The completion decorator evaluates journal/effect evidence before releasing answer text, possibly emitting an authoritative final_response replacement.
7. stream_with_save tracks canonical render ownership, persists assistant text and metadata, and emits message_saved / metrics / [DONE].
8. The SSE is delivered directly or through agent_runs replay/subscribe. A detached interactive run continues after the tab disconnects.
9. After completed response, background memory and skill extraction may run under existing eligibility and sequencing rules.

**Separate non-stream path:** POST /api/chat prepares shared context, invokes llm_call_async_with_route_fallback, saves ChatMessage, schedules post-response work and returns JSON.
**SSE event semantics:** delta appends visible text; final_response replaces the current turn's draft; thinking is separate; tool_start/tool_output/agent_step are non-answer events; metrics and message_saved are terminal metadata.
**Do not append final_response to existing deltas.** routes/chat_routes.py:_AgentRenderState records render ownership and replacement_scope="turn".

### 1.4 Concurrency, lifecycle ownership and failure boundaries

| Mechanism | Existing implementation | Consequence for integration |
|---|---|---|
| Async model transport | httpx.AsyncClient and async generators in src/llm_core.py | Stream without blocking the event loop; propagate cancellation. |
| Connection pooling | src/llm_core.py:613 _get_http_client, 100 max connections / 30 keepalive | Avoid per-token new HTTP clients for the standard path. |
| Local inference gate | src/llm_core.py:111 _local_model_slot, per-endpoint asyncio.Lock | Foreground has priority; background local generation can be cancelled. |
| Sync/async shared health | src/llm_core.py thread-safe dead-host maps via threading.Lock | Do not mutate host-health counters unsafely from multiple threads. |
| Foreground fallback | stream_llm_with_fallback, pre-content eligible errors only | Never replay an already-visible partial answer via a new provider. |
| Per-tool progress | src/agent_loop.py:33500 creates a task and drains asyncio.Queue | Cancel spawned tool task if generation/stream is closed. |
| Detached streams | src/agent_runs.py start/_drain/subscribe | One active run per session; the next run awaits predecessor completion. |
| Subscriber fan-out | Per-subscriber asyncio.Queue + in-memory event replay | Survives browser disconnect, not server restart; heartbeat around 10 seconds. |
| Finished-run retention | src/agent_runs.py _EVICT_GRACE_S = 180 seconds | Bound memory usage; no durable event log implied. |
| Post-response extraction | routes/chat_helpers.py:1696, sequential queue while stream idle | Do not compete with active local model for KV cache/slots. |

**Cancellation difference:** Compare-mode and unattended streams are direct SSE and cancel upstream when the client disconnects. Interactive detached runs continue until completion, stop or replacement.
**Potential failure states:** model transport failure, ineligible fallback, tool authority denial, stale MCP connection, run replacement, generator cancellation, incomplete evidence and server restart. Report these separately.

## 2. Dependency Analysis

### 2.1 Runtime dependencies confirmed from requirements.txt and imports

| Component | Exact source evidence | Purpose |
|---|---|---|
| Python + asyncio | src/agent_loop.py, src/agent_runs.py | Model turns, asynchronous tools, task/queue lifecycle. |
| FastAPI / Starlette | requirements.txt:1; app.py; routes/chat_routes.py | HTTP endpoints, auth dependencies and StreamingResponse SSE. |
| Uvicorn | requirements.txt:2 | ASGI server. |
| HTTPX | requirements.txt:5; src/llm_core.py | OpenAI-compatible/Anthropic/Ollama/Responses HTTP and streamed transport. |
| Pydantic + pydantic-settings | requirements.txt:9-10 | Request/settings validation. |
| SQLAlchemy | requirements.txt:11; core.database | Session/message persistence and data model. |
| MCP Python SDK v1 | requirements.txt:51, mcp<2 | Built-in and external MCP transport (stdio, SSE, HTTP). |
| ChromaDB client | requirements.txt:25 | Memory/RAG vector search adapter; not the model-call transport. |
| JavaScript frontend | package.json; static/; frontend/src | Browser chat and SSE rendering; not the Python LLM caller. |

### 2.2 Provider and transport bindings

The model wrapper chooses provider-specific URL, headers and payload, including Anthropic messages, native Ollama chat, OpenAI-style chat-completions, and ChatGPT-subscription Responses.
The app also has a special compact preview agent that sends direct HTTP requests from clean_agent_preview.py. It is a separate implementation and must be tested independently.
MCPManager uses existing connect_stdio, connect_sse and connect_http transports and exposes model-facing tool schemas. Node.js/TypeScript is a **possible external integration consumer**, not an observed core language of model inference.
**Dependency risk:** Installing an unrelated TypeScript orchestration framework inside the Python service would add duplicate concurrency, model routing and security contracts without evidence of a necessary gap.

## 3. Integration Hook Points

### 3.1 Ranked seams, with exact code anchors

| Rank | Hook | Existing owner | Safe use and important limitation |
|---|---|---|---|
| 1 | Existing MCP tool transport | src/mcp_manager.py:150, :561, :688 | Connect an external TypeScript/Node MCP server through existing stdio/SSE/HTTP; reuse schema discovery and request policy. No replacement inference engine. |
| 2 | Tool admission and dispatch | src/tool_execution.py:1625 execute_tool_block, :1924 _execute_tool_block_impl | All model-selected actions must pass owner/TurnContract/RequestAuthority checks before execution. Inject tools via registered transport, not by bypassing dispatcher. |
| 3 | Per-request external executor | src/tool_execution.py:78 AgentExecutionBridge; routes/chat_routes.py:807 _external_execution_bridge | Optional Node service for declared supported tools over request-scoped HTTP; protect token, URL and session identity. Not the default if MCP already suffices. |
| 4 | Native/external memory provider interface | src/memory_provider.py:34 MemoryProvider, :258 MemoryProviderRegistry | Implement external recall/remember/list/delete adapter; preserve native baseline, user scope, and collision detection. |
| 5 | Memory registry bootstrap | src/app_initializer.py:111-113 | Currently registers only NativeMemoryProvider; extra provider needs intentional registration/wiring, not just creation of a subclass. |
| 6 | Context recall injection | routes/chat_helpers.py:1008 build_chat_context; src/chat_processor.py ChatProcessor.build_context_preface | Integrate selected memory as context once, with provenance and token budget; protect incognito/no_memory and treat retrieval as untrusted. |
| 7 | After-turn learning | routes/chat_helpers.py:1696 run_post_response_tasks | Best for asynchronous memory extraction and verified summaries; reuse serial scheduling and avoid active local generation. |
| 8 | Final text/evidence | src/agent_runtime/completion.py:206 with_completion_gate | Preserve buffered answer, completion_decision, provenance, and replacement semantics; do not append unverified claims downstream. |
| 9 | Session persistence / SSE | routes/chat_helpers.py:1540 save_assistant_response; routes/chat_routes.py:3838 stream_with_save | Observe canonical final response, save once, keep event compatibility (final_response, delta, metrics, message_saved). |
| 10 | Model transport adapters | src/llm_core.py:2603, :2933, :2959; src/clean_agent_preview.py:5235 | Use only when adding a genuinely new provider/protocol. Two caller paths must be reviewed; model-provider patching is more invasive. |

**Observed but important limitation:** A MemoryProviderRegistry object exists and is initialized with NativeMemoryProvider, but the main ChatProcessor is instantiated with the native memory manager. An external provider does not automatically participate in context building just because it is registered; inspect and explicitly wire the intended retrieval consumer.

### 3.2 Recommended integration architecture

**Primary option: Native MCP reuse (recommended).** Write a project-external, narrow TypeScript MCP tool server. Register it with Odysseus' existing MCPManager, then rely on the existing TurnContract -> execute_tool_block admission chain. Keep Python agent orchestration and streaming intact.

~~~text
External TypeScript tool (Node process)
          |
          | MCP stdio / SSE / HTTP, explicit schema
          v
Odysseus MCPManager ---- tool schemas ----> agent model
          ^                                  |
          | qualified call                   | proposed tool calls
          +---- execute_tool_block <---------+
                        |
              tool result + provenance
                        |
              agent model next round
                        |
              completion gate -> SSE -> saved text
~~~

**Second option: MemoryProvider adapter.** For a genuinely different external memory backend, implement the existing Python MemoryProvider contract as an adapter to a Node service. Gate by owner/session, store credentials server-side, preserve NativeMemoryProvider and build_context_preface behavior. Add a single opt-in retrieval path, not two competing injection loops.

**Third option: AgentExecutionBridge.** Only when the consumer already has a request-local HTTP executor and needs to run an offered tool in an external host. Exact supported_tools, owner, token, resource identity and user policy are mandatory. This is not an authorization bypass.

**Not recommended:** replacing the Python event loop with a second Node agent orchestrator, intercepting only llm_core while ignoring compact preview, or rewriting /api/chat_stream events and persistence.

## 4. Actionable Implementation Step

### Phase 0. Confirm consumer, authority and baseline (read-only)

1. Decide the needed behavior: external tools, external memory, or genuinely new model provider. Do not combine three migrations unnecessarily.
2. Pin Git HEAD and review current process/config without collecting secrets. This document observed HEAD 01566b158e627748f70ac402571f2f78241fb6f9, but freshness must be revalidated before implementing.
3. Record the current SSE protocol, model route selection, memory permissions, and agent completion contract. Compare both standard and compact inference paths.
4. Freeze unrelated behavior. Establish a rollback boundary before any approved source edit or dependency installation.

### Phase 1. Smallest reversible prototype: external MCP

1. Build a separate Node.js/TypeScript MCP server with **one read-only example tool** and a bounded JSON schema. If using the MCP TypeScript SDK, check a compatible pinned version at implementation time; none was verified/installed during this inspection.
2. Expose stdio first for local isolation. Give the server a distinct namespace and a stable tool name; do not reuse a built-in tool name.
3. Register the server through Odysseus' current MCP connection/config workflow. Confirm schema appears via MCPManager.get_all_openai_schemas.
4. Issue one authorized tool-using agent turn. Trace call admission from TurnContract through execute_tool_block to MCPManager.call_tool and back to the following model round.
5. Keep tool calls exact-scope and inspectable: input/output schema, timeout, failure indication, owner binding and activity evidence.

### Phase 2. Optional custom memory (only for an identified consumer)

1. Implement an adapter conforming to MemoryProvider.remember, recall, list_memories and delete; give the provider a unique provider_id.
2. Attach a Node memory backend behind the adapter, or reuse NativeMemoryProvider if its storage/retrieval already meets requirements.
3. Register the provider in src/app_initializer.py; explicitly wire an opt-in retrieval consumer at build_chat_context/ChatProcessor (registry registration alone is insufficient).
4. Enforce owner/session isolation, incognito and no_memory flags, bounded top_k, source attribution, deduplication and untrusted-context labeling.
5. Run writes only through the intended after-turn/explicit action path; respect existing sequential extraction and cancel semantics. A memory result must never grant tool authority.

### Phase 3. Text response integration (avoid invasive rewrite)

1. Keep the canonical output owner in routes/chat_routes.py and the completion/evidence owner in src/agent_runtime/completion.py.
2. Preserve incremental delta, thinking, tool_start, tool_output, agent_step, final_response, metrics, message_saved and [DONE] events.
3. When replacing a draft, emit final_response as turn-scoped replacement. Do not concatenate it to previously streamed tokens.
4. Persist through save_assistant_response only after the accepted terminal response, retaining requested/actual model metadata, tool/evidence receipts and incognito semantics.
5. If external postprocessing is needed, use a defined pre-completion or pre-persistence transform with bounded effects. Do not silently modify user-visible claims after the evidence gate.

### Phase 4. Targeted acceptance plan (NOT executed by this task)

| Probe | Acceptance criterion |
|---|---|
| Plain chat | One final answer; no unexpected tool use or tool-specific authorization. |
| Non-stream POST /api/chat | Same selected route constraints and saved response shape. |
| Agent native tool call | Schema -> permitted exact call -> tool result -> next model round. |
| External MCP unavailable | Failure reported honestly; no tool substitution or fake success. |
| Compact preview branch | Tool and text output still work on the separate direct HTTP caller. |
| Final-response replacement | No duplicated draft; saved answer equals canonical rendered answer. |
| Detached client / resume | Run identity preserved, ordered event replay, no duplicate persistence. |
| Stop / cancellation | Tool task cleaned; partial-save semantics and user stop respected. |
| Local-model contention | Foreground priority preserved; background extraction waits. |
| Owner privacy | No cross-owner memory, no incognito leakage or credential disclosure. |
| Model fallback | Allowed only before meaningful output; actual model provenance retained. |
| Response claiming a side effect | Completion evidence rules are not bypassed by custom code. |

**No test, build, model invocation or deployment was performed for this architecture proposal.** The matrix is the next implementation's verification design, not a PASS report.

### Phase 5. Decision and rollback contract

**Recommended first experiment:** one read-only TypeScript MCP tool integrated via existing MCPManager. It validates the external tool path without changing the Python caller, memory schema, output format or orchestration loops.
**Success:** one requested tool call produces an attributable tool result and an evidence-supported text response; existing chat and compact agent modes remain unaffected.
**Falsification:** tool is not offered, policy denies it incorrectly, response duplicates after final_response, session context leaks or cancellation leaves work running. Roll back the single external MCP registration/server; do not mutate unrelated core subsystems.
**Next extension only if needed:** custom MemoryProvider adapter with explicit ChatProcessor wiring. Model-provider additions are a separate, higher-risk phase.

## 5. Source Evidence and Limits

- app.py:130,743-751; routes/chat_routes.py:2232-2252,2398,2468-2469,3838,4190,4537,4840-5009.
- routes/chat_helpers.py:1008,1179-1182,1540,1696; src/chat_processor.py ChatProcessor; src/app_initializer.py:111-113.
- src/llm_core.py:111,613,2603,2933,2959,4436; src/clean_agent_preview.py:5235,5626.
- src/agent_loop.py:21028-21029,26914,27297,33500,36307,37900-38039.
- src/tool_execution.py:78,1625,1924; src/mcp_manager.py:150,210,286,368,561,627,688.
- src/agent_runtime/completion.py:206-421; src/agent_runs.py:1-305.
- src/memory_provider.py:34,258-327; requirements.txt:1-11,25,51.

**Evidence classification:** filenames, symbols, imports, call expressions, configuration and control flow above are observed source facts; the recommended integration sequence and risks are engineering inferences. Running-service health, installed packages, external MCP trust configuration, performance gains, runtime concurrency under load and successful real model output remain **unverified**.
**No source or runtime changes were made.** This file is a planning artifact for human review, not a claim that integration is active.

