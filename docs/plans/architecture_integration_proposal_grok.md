# Grok Build Runtime Architecture & Integration Blueprint

> Status: SOURCE-GROUNDED PROPOSAL / NOT IMPLEMENTED
> Inspected: 2026-10-23. Target: F:\Workflow\grok-build.
> Pinned upstream identity: SOURCE_REV = 559751fdcec02d413e4c57c8832ab275e4f44980.
> Scope: Model Caller Invocation -> Interaction Processing -> Text Output Response.
> Method: read-only inspection of actual Rust modules and Cargo manifests; no inference request, compile, integration test, or deployment was run.

## 1. Architecture Map & Concurrency Pattern

### 1.1 Entry points and ownership
- Executable/composition entry: crates/codegen/xai-grok-pager-bin/src/main.rs (CLI/TUI/agent/headless routing). It is NOT the HTTP model caller.
- Input owner: crates/codegen/xai-grok-shell/src/session/acp_session_impl/run_loop.rs, SessionCommand::Prompt (around line 725), queue_input.
- Turn owner: crates/codegen/xai-grok-shell/src/session/acp_session_impl/turn.rs, handle_turn_input, process_conversation_turn_inner.
- Model invocation wrapper: crates/codegen/xai-grok-sampler/src/handle.rs, SamplerHandle::submit_and_collect_with_metadata; the shell invokes it at sampler_turn.rs::submit_turn_request (around line 1770-1810).
- HTTP/provider caller: crates/codegen/xai-grok-sampler/src/client.rs, SamplingClient, create_response_stream / create_message_stream and backend-specific calls.
- Background inference owner: crates/codegen/xai-grok-sampler/src/actor/mod.rs + actor/request_task.rs.
- Output adapter: crates/codegen/xai-grok-shell/src/session/acp_session_impl/sampling_events.rs::handle_sampling_event; updates.rs::send_update.
- Persistent assistant-item commit: sampler_turn.rs::record_assistant_response and turn.rs::record_response_items via xai-chat-state.

### 1.2 Mermaid architecture and complete execution path
~~~mermaid
flowchart TD
  U[User input: TUI / Headless / ACP] --> B[Pager binary / session-new]
  B --> Q[SessionCommand::Prompt + queue_input]
  Q --> S[SessionActor::handle_turn_input]
  S --> M[Prefetch memory/reminders + tools/MCP catalog]
  M --> R[ChatStateActor::build_request]
  R --> T[run_turn_via_sampler / submit_turn_request]
  T --> H[SamplerHandle mpsc Submit + oneshot]
  H --> A[SamplerActor command loop]
  A --> J[JoinSet per-request task]
  J --> C[SamplingClient reqwest HTTP]
  C --> P{Provider backend}
  P --> X[/responses SSE]
  P --> Y[/chat/completions SSE]
  P --> Z[/messages SSE]
  X --> F[Backend stream transform]
  Y --> F
  Z --> F
  F --> E[SamplingEvent channel]
  E --> D[spawn_local stream drainer]
  D --> V[SessionActor::handle_sampling_event]
  V --> W{Event kind}
  W -->|Text token| O[ACP AgentMessageChunk]
  W -->|Reasoning| N[ACP AgentThoughtChunk]
  W -->|Tool call| K[ToolBridge / permission / MCP]
  K --> L[ToolResult -> ChatState -> next sampling round]
  L --> R
  W -->|Complete| CMT[Record assistant + usage; turn completion]
  W -->|Failed| RET[Bounded retry / cancellation / error]
  O --> OUT[SessionEvent notification FIFO / replay buffer / ACP gateway]
  OUT --> UI[Pager UI or headless consumer]
  CMT --> STATE[ChatState / persistence]
~~~

### 1.3 Exact request-to-output checkpoints
1. run_loop.rs::run_session dispatches Prompt into queue_input; turn.rs::handle_turn_input claims the prompt and builds turn state.
2. turn.rs::process_conversation_turn_inner calls prepare_tool_definitions_timed, obtains first_turn_memory_reminder, then chat_state_handle.build_request with tools, memory and active context.
3. turn.rs calls run_turn_via_sampler; sampler_turn.rs::submit_turn_request allocates RequestId, records stream ownership, and invokes SamplerHandle::submit_and_collect_with_metadata.
4. SamplerActor::spawn owns mpsc command input; each Submit creates CancellationToken and JoinSet task running request_task::run_request_task.
5. SamplingClient sends streaming HTTP to selected provider endpoint. Separate transforms process Responses, Chat Completions and Anthropic Messages event formats.
6. stream/responses.rs maps ResponseOutputTextDelta -> SamplingEvent::ChannelToken(Text); reasoning and function calls have separate event kinds.
7. spawn.rs spawns a stream drainer: sampler_event_rx.recv -> SessionActor::handle_sampling_event.
8. sampling_events.rs sends ChannelToken(Text) as ACP SessionUpdate::AgentMessageChunk; Reasoning as AgentThoughtChunk; ToolCallDelta as a dedicated xAI update.
9. updates.rs::send_update_full enqueues SessionEvent::Notification with eventId/chunkId and request-bound ordering; buffered forwarding feeds ACP gateway/clients.
10. turn.rs records response.items through chat state; fallback_text emits AgentMessageChunk only if no text chunks streamed; tool calls run via execute_tool_calls, write tool results, and continue the model loop.

### 1.4 Concurrency and ordering contracts
- Async runtime: Tokio. SamplerActor command loop serially consumes mpsc commands, but JoinSet runs distinct inference requests concurrently via tokio::spawn.
- Session coordination uses tokio::task::spawn_local / LocalSet, so do not assume all session state is Send or safe to await while holding RefCell borrows.
- Per-request completion is oneshot; live tokens use mpsc shared event rail. Both are intentionally distinct: completion alone does not establish that all UI events drained.
- turn_stream_drained ownership + generation + stream-drain barrier reconcile completion with FIFO delivery. A cancelled/rewound request must not reintroduce stale tokens or tool effects.
- CancellationToken cooperatively stops request tasks; JoinSet reaps terminated work; retry/timeout budgets are bounded, and retry-after-first-output restrictions protect visible text from duplicate output.
- Tool calls can be batched; prepare_tool_call, permission/hook gates, MCP dispatch and same-file conflict locking must be preserved. Do not infer all tool execution is sequential.
- Streamed text, reasoning, tool-argument deltas and terminal events must never be conflated; preserving per-request sequence and dedup metadata is essential.
- Subagent sampling can be gated by tokio::sync::Semaphore through acquire_subagent_sampling_permit; main session may be ungated.

## 2. Dependency Analysis

| Runtime component | Evidence and purpose |
| --- | --- |
| Rust / Cargo workspace | Cargo.toml: workspace resolver 2, edition 2024; many xai-* crates, not Node application |
| Tokio + tokio-util | mpsc/oneshot, spawn/JoinSet, timers, CancellationToken, semaphore |
| reqwest + rustls | SamplingClient asynchronous HTTP and TLS |
| eventsource-stream + futures-util | SSE decoding and stream transforms |
| async-openai (pinned fork) | Typed Responses/Chat Completions/Messages-compatible request and response structures; see Cargo.toml patch |
| serde + serde_json | Typed requests, model events, tool args and notification serialization |
| agent-client-protocol (ACP) | SessionCommand-facing integration and SessionUpdate::AgentMessageChunk output |
| xai-chat-state | ConversationRequest construction, assistant/tool persistence and usage |
| xai-grok-mcp | Owned MCP clients, server state, auth and tool registrations |
| xai-grok-memory | Existing memory service; shell has first-turn injection and session-end hooks |
| tracing / xai-grok-otel | request/turn spans, correlation and diagnostics |

Backend selection is configuration-dependent; there is no evidence of one universally fixed model endpoint. Do not treat OpenAI compatibility as an assertion that all inference goes to OpenAI. API auth and per-provider capability checks stay in their current owners.

## 3. Integration Hook Points

### H1. Existing MCP boundary: preferred for custom Node.js/TypeScript tools
- Inspect: crates/codegen/xai-grok-shell/src/session/acp_session_impl/mcp.rs, register_mcp_tool / client get_tool_registrations.
- Inspect: crates/codegen/xai-grok-shell/src/session/acp_session_impl/sampler_turn.rs, prepare_tool_definitions_timed / prepare_tool_definitions_inner.
- Inspect: crates/codegen/xai-grok-shell/src/session/acp_session_impl/tool_calls.rs, execute_tool_calls / execute_tool_calls_batch.
- Implementation: run a separate project-owned Node/TS MCP service over supported stdio or HTTP transport, connect through existing MCP configuration, expose narrow tools such as memory_search and memory_record, preserve existing permissions.
- Benefit: zero modifications to Rust SamplingClient or event decoder; reversible by removing the MCP server configuration.

### H2. Pre-inference context enrichment: existing memory owner first
- Inspect: crates/codegen/xai-grok-shell/src/session/acp_session_impl/turn.rs, first_turn_memory_reminder -> chat_state_handle.build_request (around lines 2820 and 2945).
- Inspect: crates/codegen/xai-grok-shell/src/session/helpers/memory_context.rs and crates/codegen/xai-grok-shell/src/session/memory/v2_capture.rs.
- For native integration, prefer wiring an opt-in bounded retrieval into current memory/context assembly, not editing provider HTTP serialization.
- Resolve async retrieval before request construction; attach provenance, enforce token/latency budget, and handle unavailable memory as an optional degraded path.
- Existing first-turn injection is verified; a custom remote retrieval adapter at that point is PROPOSED, not already built.

### H3. Post-model semantic capture / memory write
- Inspect: crates/codegen/xai-grok-shell/src/session/acp_session_impl/sampler_turn.rs::record_assistant_response and turn.rs::record_response_items.
- Inspect: crates/codegen/xai-grok-shell/src/session/memory/hooks.rs::on_session_end; existing memory session-end metadata save is best effort, gated by save_on_end and minimum conversation size.
- Prefer explicit consent / reviewed durable facts and existing memory write API; do not blindly persist every streamed token, reasoning trace, tool secret or prompt.

### H4. Text output consumer / observability bridge
- Inspect: crates/codegen/xai-grok-shell/src/session/acp_session_impl/sampling_events.rs::handle_sampling_event, SamplingChannel::Text.
- Inspect: crates/codegen/xai-grok-shell/src/session/acp_session_impl/updates.rs::send_update_full, emit_buffered.
- A new read-only text sink, if required, should subscribe after ACP normalization with requestId/chunkId and cancellation awareness, without intercepting or blocking the FIFO.
- Do not modify stream/responses.rs for UI formatting; it is a provider-neutral stream normalization boundary.

### H5. Provider adapter: high cost; only if existing backends cannot meet a concrete need
- Inspect: crates/codegen/xai-grok-sampler/src/client.rs and stream/{responses,chat_completions,messages}.rs.
- Suitable for a NEW incompatible provider or wire protocol, not for ordinary memory or MCP integration.
- Adding a provider entails auth, request shape, streaming mapping, error/timeout/retry behavior, typed model metadata and targeted regression tests.

### H6. Existing hooks / tool permission boundary
- Inspect: crates/codegen/xai-grok-shell/src/session/acp_session_impl/tool_calls.rs::prepare_tool_call, execute_tool_calls_batch; plus extensions/hooks.rs.
- Useful for auditable pre-tool validation and post-tool context, not to bypass prompts, security policy or ownership.

## 4. Integration Alternatives / Decision

| Path | Scope | Risk | Reversibility | Recommendation |
| --- | --- | --- | --- | --- |
| A. Node/TS MCP sidecar | Server config + external process, no Grok Rust changes | Low-moderate | High | START HERE |
| B. Reuse native memory pre-turn boundary | Small Rust integration with xai-grok-memory | Moderate, context/cache risks | Moderate | Only when MCP retrieval is insufficient |
| C. Replace/wrap SamplingClient | Provider transport and stream transforms | High, stream/retry risks | Low | Reject for memory/tool task |

The counter-intuitive opportunity is NOT building a second orchestrator. Keep the Rust session and sampler as a stable deterministic execution core; expose domain-specific cognition as replaceable tools/memory over the existing typed MCP seam. Treat expected latency and quality gains as hypotheses until measured.

## 5. Actionable Implementation Steps

### Phase 0: establish immutable baseline (read-only; no service calls)
1. Pin SOURCE_REV and record Cargo.lock / target project root. Record separate git status before changing any source.
2. Draw the path from Prompt -> build_request -> submit_and_collect -> SamplingEvent -> AgentMessageChunk using the file/line evidence above.
3. Inspect actual MCP config accepted by this checked-out Grok build; do not assume a generic JSON format or copy a config example from another version.

### Phase 1: smallest reversible TypeScript integration (recommended)
1. Create a separate Node/TypeScript MCP service OUTSIDE the Grok repository or in an explicitly approved integration workspace.
2. Implement read-only memory_search first. Define a JSON schema with query, limit and scope; return bounded, provenance-carrying structured results.
3. Configure it through the existing Grok MCP server configuration, using a project-relative command where supported. Keep credentials server-side and outside repo/version control.
4. Discover tools via the normal MCP tools/list route. Verify only the registered tool appears under its namespaced name and that permission gates remain intact.
5. Trigger a non-destructive model request in an isolated test session only after explicit runtime/test approval; confirm exactly one tool call and one tool result.

### Phase 2: optional durable memory
1. Add memory_record as a separately authorized capability, with explicit workspace/session scope, deduplication and provenance requirements.
2. Keep write-on-final (validated candidate) separate from raw token streaming; reject secret-bearing content and conflicting updates rather than silently overwriting.
3. Compare with existing xai-grok-memory facilities before adding storage. Reuse canonical store where compatible, avoid competing truths or uncontrolled dual writes.
4. If context injection is needed without a tool call, prototype bounded pre-turn retrieval through memory_context/build_request and assess prompt-prefix stability.

### Phase 3: stream / failure acceptance (future checks, NOT executed)
1. Test /responses, /chat/completions, and /messages text deltas; verify final output text equals normalized accumulated assistant content.
2. Test interleaved reasoning, text and tool-argument events; no reasoning leaks into AgentMessageChunk and no argument delta becomes prose.
3. Test early cancellation/rewind/timeout; stale chunks are dropped and no duplicate final chunk is emitted.
4. Test tool->result->model continuation, MCP disconnect/reconnect and unavailable external memory; preserve ordering, bounded wait, fallback and permission behavior.
5. Measure model TTFT, TTFM, total turn latency, extra tokens, memory hit usefulness and observed accuracy before recommending native changes.

## 6. Anti-Patterns and Constraints

- Do NOT rewrite Grok Build into TypeScript/Node.js or replace SamplerActor merely to attach a tool.
- Do NOT block the high-frequency text event drainer on remote memory calls.
- Do NOT run memory capture on every character delta or persist provider reasoning/credentials.
- Do NOT treat backend event Completed and text chunks as interchangeable; completion is reconciled with stream-drain ownership.
- Do NOT assume multi-tool batches commute: original tool permission gates and same-file edit locking are significant.
- Do NOT interpret repo documentation, generated Cargo manifest, or this static inspection as proof of a running inference session.
- Apache-2.0 first-party code; inspect LICENSE and THIRD-PARTY-NOTICES before copying code, especially async-openai fork and third_party sources.

## 7. Evidence Index and Verification Status

| Claim | Exact primary source |
| --- | --- |
| Binary / CLI entry | crates/codegen/xai-grok-pager-bin/src/main.rs |
| Session intake | crates/codegen/xai-grok-shell/src/session/acp_session_impl/run_loop.rs:~725 |
| Model request construction | crates/codegen/xai-grok-shell/src/session/acp_session_impl/turn.rs:~2670-3050 |
| Model sampler invocation | crates/codegen/xai-grok-shell/src/session/acp_session_impl/sampler_turn.rs:~1716-1840 |
| SamplerHandle transport | crates/codegen/xai-grok-sampler/src/handle.rs |
| Per-request concurrency | crates/codegen/xai-grok-sampler/src/actor/mod.rs:~30-128 |
| Retry / failure controls | crates/codegen/xai-grok-sampler/src/actor/request_task.rs |
| HTTP APIs + authentication | crates/codegen/xai-grok-sampler/src/client.rs |
| SSE text normalization | crates/codegen/xai-grok-sampler/src/stream/responses.rs:~320-390 |
| Sampler event drainer | crates/codegen/xai-grok-shell/src/session/acp_session_impl/spawn.rs:~2118 |
| Text to ACP chunks | crates/codegen/xai-grok-shell/src/session/acp_session_impl/sampling_events.rs:~105-260 |
| ACP output notification FIFO | crates/codegen/xai-grok-shell/src/session/acp_session_impl/updates.rs:~251-370 |
| Tool/MCP dispatch | crates/codegen/xai-grok-shell/src/session/acp_session_impl/tool_calls.rs:~335-600 and mcp.rs |
| Session-end memory | crates/codegen/xai-grok-shell/src/session/memory/hooks.rs |

**Verified by source reading:** file ownership, function names, channel semantics, concurrency control, streaming-to-ACP conversion and existing MCP/memory seams.

**Not verified:** exact live configuration, real model/provider availability, API performance, external TypeScript MCP compatibility, inferred speedups and complete dynamic coverage of every special/edge path.

**Change ledger for this task:** One proposal Markdown file only. No source modification, credentials, install, execution, restart, upload or deployment.
