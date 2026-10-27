# OpenClaw Model-Invocation Runtime: Architecture & Integration Proposal

> **Status:** SOURCE-GROUNDED PROPOSAL, NOT IMPLEMENTED OR LIVE-TESTED. Inspection: 2026-10-23.
> **Source:** F:\Workflow\openclaw (Git HEAD b5ae1a4363815be651d639a9d78e480cda6c7a42; package version 2026.10.6).
> **Integration destination:** F:\Workflow\deepseek-harness (Git HEAD 687f282e8625c6b8d11ff58211a90524be2e4317).
> **Scope:** Model Caller Invocation -> Interaction Processing -> Text Output Response. Source and existing docs were inspected read-only. No service started, model invoked, tests/builds run, credentials read, or runtime code edited.
> **Evidence rule:** "Observed" means an identified local source path/function; "documented" refers to in-repo architecture material; "proposed" is not an existing implementation. All file paths below are relative to the stated repositories.

## Executive decision

There is **no single universal first model-caller script** for every OpenClaw entry route. A CLI or messaging ingress reaches a reply/agent runner; harness selection may choose the built-in runtime or a plugin harness. For the **built-in runtime**, the host model-caller wrapper is **src/llm/stream.ts** (stream, streamSimple, complete, completeSimple), connected to the agent loop by **src/plugin-sdk/agent-core.ts** (openClawAgentCoreRuntime). The earliest product CLI bin is **openclaw.mjs**, not itself the model transport.

Preferred integration: **reuse the existing OpenClaw MCP client and memory/plugin contracts; put custom Node/TypeScript logic in a narrow external MCP server or Cordis plugin.** Do not fork the event loop, replace the OpenClaw model transport, or introduce a competing transcript owner for a memory/tool feature. A bridge that both frameworks can consume is an architectural proposal, not evidence that either can natively act as the other's MCP server.

## 1. Architecture Map & Concurrency Pattern

### 1.1 End-to-end flow (built-in runtime, source-grounded)

~~~mermaid
flowchart TD
  A["Inbound CLI / Gateway / Channel message"] --> B["src/auto-reply/dispatch.ts: dispatchReply*"]
  B --> C["src/auto-reply/reply/agent-runner-run.ts: runReplyAgent"]
  C --> D["agent-runner-execute.ts: executePreparedReplyAgentRun"]
  D --> E["agent-runner-execution.ts: executeAgentTurn + fallback/authority"]
  E --> F["embedded-agent-runner/run-entry.ts: runEmbeddedAgentEntry + select harness"]
  F --> G["embedded-agent-runner/run/attempt.ts: runEmbeddedAttempt"]
  G --> H["prepare session, transcript, tools, prompt; submitEmbeddedAttemptPrompt"]
  H --> I["AgentSession.prompt -> packages/agent-core: Agent / runAgentLoop"]
  I --> J["agent-stream-response.ts: streamAgentResponse"]
  J --> K["plugin-sdk/agent-core.ts: openClawAgentCoreRuntime.streamSimple"]
  K --> L["src/llm/stream.ts: streamSimple/stream -> provider runtime"]
  L --> M["Provider transport / streamed assistant events"]
  M --> J
  J --> N{"Assistant requests tools?"}
  N -->|Yes| O["tool admission + execution; MCP via agent-bundle-mcp-runtime"]
  O --> I
  N -->|No / settled| P["message_start / deltas / message_end / agent_end"]
  P --> Q["embedded-agent-subscribe.ts + attempt-result.ts: collect answer"]
  Q --> R["agent-run-terminal-reply.ts: visible/silent/empty text"]
  R --> S["agent-runner-result.ts -> result-payloads.ts"]
  S --> T["reply-dispatcher.ts -> channel-specific delivery"]
~~~

The diagram collapses preparation and fallback helpers; it is **not** a claim that every provider or alternative plugin harness traverses these exact nodes. The named built-in caller edges are grounded in the imports/functions listed below.

### 1.2 Caller and lifecycle owners

| Stage | Observed owner / function | Responsibility |
| --- | --- | --- |
| CLI bin | openclaw.mjs, package.json bin | Application entry; **not** the first provider call |
| Inbound orchestration | src/auto-reply/dispatch.ts; dispatchReplyFromConfig; keyed reply lease | Session/channel admission, ordering, dispatcher creation |
| Turn ownership | src/auto-reply/reply/agent-runner-run.ts: runReplyAgent | Mailbox/follow-up, abort composition, reply turn |
| Execution | src/auto-reply/reply/agent-runner-execution.ts: executeAgentTurnInternalLoop | Runtime selection, prepared admission, fallback, progress |
| Harness selection | src/agents/embedded-agent-runner/run-entry.ts: runEmbeddedAgentEntry | Select model/harness and accepted logical result |
| Model attempt | src/agents/embedded-agent-runner/run/attempt.ts: runEmbeddedAttempt | Tool/session/diagnostic resource lifecycle |
| Prompt submit | src/agents/embedded-agent-runner/run/attempt-prompt-phase.ts; attempt-prompt-submit.ts: submitEmbeddedAttemptPrompt | Prompt projection, session prompt invocation, current-source checks |
| Core loop | packages/agent-core/src/agent-loop.ts: runAgentLoop / runAgentLoopContinue | Turn, messages, tools, continuation, emitted events |
| Stream conversion | packages/agent-core/src/agent-stream-response.ts: streamAgentResponse | Convert transcript to LLM context; consume deltas and tool batches |
| Host injection | src/plugin-sdk/agent-core.ts: openClawAgentCoreRuntime | Bind core streamSimple/completeSimple to host transport |
| **Provider caller** | **src/llm/stream.ts: stream / streamSimple / complete / completeSimple** | Auth/admission, provider runtime, event stream/error terminal |
| Subscription | src/agents/embedded-agent-subscribe.ts: subscribeEmbeddedAgentSession | Assistant text, block chunks, tool/meta/delivery evidence |
| Text terminal | src/agents/agent-run-terminal-reply.ts: prepareAgentRunTerminalReply | Visible vs NO_REPLY silence vs empty; display text sanitation |
| Final payload | src/auto-reply/reply/agent-runner-result.ts: finalizeReplyAgentRun | Accounting, payload construction, completion |
| Delivery | src/auto-reply/reply/reply-dispatcher.ts | Sanitize/normalize outbound payload and track channel-delivery outcomes |

### 1.3 Concurrency, stream settlement and ownership

- **Ingress ordering (observed):** src/auto-reply/dispatch.ts owns a keyed FIFO foreground lease; agent-runner-run.ts submits a session-controller mailbox input and combines cancellation sources with AbortSignal.any.
- **Model streaming (observed):** src/llm/stream.ts creates an event stream, waits for provider rate-limit admission, checks provider auth and abort, then relays provider events via an async iterator. Failed setup becomes an explicit assistant error event.
- **Tool batching (observed):** packages/agent-core/src/agent-stream-response.ts maintains separate Promise chains for admission and executions, combines prior execution with new work and aborts on fatal/terminal outcomes. Tool results enter transcript/events with their tool-call IDs. Parallel capability must not be mistaken for unconditional parallel execution.
- **Async tool collector (observed):** streamAgentResponse enables asyncToolExecution only when the exposed tools include sessions_yield; otherwise a model could finish before asynchronous results become visible. Preserve this behavior in adapters.
- **Attempt resource lifetime (observed):** run/attempt.ts uses runWithAsyncWorkResources, bound model authority, AbortControllers and finally cleanup. Do not retain closures/tool handles after lease revocation.
- **MCP connection lifetime (observed):** src/agents/agent-bundle-mcp-runtime.ts: createSessionMcpRuntime creates scoped server sessions using @modelcontextprotocol/client, stdio/SSE/streamable-http transport, request timeout, startup backoff and cached/in-flight catalogs.
- **Worker parallelism (documented):** docs/agent-runtime-architecture.md describes WorkerTaskPool and bounded worker admission for compute, read and writer workloads. This is **not** proof of parallelism for every agent turn; inspect each consumer before tuning.
- **Output correctness (observed):** NO_REPLY classification and terminal reply snapshots are distinct from confirmed outbound delivery. A completed model stream, an emitted text chunk and a successful send are three different facts.

## 2. Dependency Analysis

| Dependency / framework | Grounded role | Evidence |
| --- | --- | --- |
| Node.js + TypeScript/ESM + pnpm workspaces | Application, async I/O, runtime and packages | openclaw/package.json, pnpm-workspace.yaml; source TS/JS imports |
| @openclaw/agent-core | Agent state, loop, tool scheduling, events | packages/agent-core/src/agent.ts; agent-loop.ts |
| @openclaw/llm-core | Model/assistant context, StreamFn, typed events | packages/agent-core/src/runtime-deps.ts; agent-stream-response.ts |
| @openclaw/ai | Provider registry, transport and streaming runtime | src/llm/stream.ts; src/llm/ai-transport-host.ts |
| OpenClaw Plugin SDK | Supported host-to-plugin contract | src/plugin-sdk/agent-core.ts; src/plugin-sdk/AGENTS.md |
| @modelcontextprotocol/client | External MCP client; not automatically an MCP server | src/agents/agent-bundle-mcp-runtime.ts |
| OpenClaw Memory plugins | Existing memory owners and tool contracts; deployment-dependent | extensions/memory-core/index.ts; extensions/memory-lancedb/index.ts |
| Cordis (DeepSeek Harness) | Context-based plugin composition and reversible effects | deepseek-harness/docs/architecture.md |
| @deepseek-ai/dsh-mcp-client | DSH external MCP tool client with namespaced tools | deepseek-harness/packages/mcp/mcp-client/README.md |
| DSH ctx.sessions / ctx.agents / ctx.llm / ctx.tools | Event log, agent driver, model provider and tool registry | deepseek-harness/docs/architecture.md; packages/core/agent-loop/src |

**Important boundary:** OpenClaw's own Agent Core package is **not** the external local application named Agent Core. Similar names do not imply compatibility or shared state. DSH is Cordis-based; OpenClaw's built-in loop is OpenClaw-owned. Avoid a second loop whose turn order/session semantics silently diverge.

## 3. Integration Hook Points

| Priority | Concrete hook / object | Proposed attachment | What must not change |
| --- | --- | --- | --- |
| P0, recommended | src/agents/agent-bundle-mcp-runtime.ts: createSessionMcpRuntime, plus agent-bundle-mcp-tools.ts and its documented configuration | Register an external MCP server for custom TS tools and memory lookup without patching built-in loop | Tool names/schema stability, run-scoped auth, request abort, catalog lifetime |
| P0, recommended | extensions/memory-core/index.ts: createLazyMemoryTool, tool contract module; or selected memory-lancedb plugin | Reuse active memory engine and inject bounded sourced recall through its supported plugin tools | Canonical memory ownership, permissions, duplicate detection and sensitive data |
| P1 | packages/agent-core/src/agent.ts: AgentOptions.beforeToolCall, afterToolCall, afterToolOutcome, streamFn | Narrow instrumentation/policy for tool lifecycle **only through a documented supported plugin SDK contract** | Do not import private core files from plugins; do not bypass authority |
| P1 | src/agents/embedded-agent-subscribe.ts: subscribeEmbeddedAgentSession | Read-only lifecycle/progress observer where documented events allow it | Chunk ordering, duplicate suppression, delivery evidence |
| P1 | DeepSeek Harness packages/mcp/mcp-client | Register the **same external MCP server** as Cordis ctx.tools capability | Do not equate connection/readiness with authorization for side effects |
| P2 | DeepSeek Harness ctx.llm/llm/stream and ctx.sessions/SessionEvent via its public Cordis service contracts | Custom DSH provider or context adapter if cross-framework session semantics truly needed | Session event authority, append-only history, cancellation |
| P3, avoid initially | src/llm/stream.ts: streamSimple or src/plugin-sdk/agent-core.ts: openClawAgentCoreRuntime | Low-level transport instrumentation **only** if existing provider/plugin hooks cannot meet a measured requirement | Provider auth, rate limits, retry semantics, cached prompt prefix |
| P3, avoid | src/agents/agent-run-terminal-reply.ts and src/auto-reply/reply/reply-dispatcher.ts | Observe reply terminal/delivery, not rewrite them to insert memory | NO_REPLY behavior, payload sanitation, send receipts |

**Plugin-rule prerequisite:** OpenClaw src/plugin-sdk/AGENTS.md mandates documented openclaw/plugin-sdk/* subpaths, stable public contracts, and generic host capabilities rather than private src/agents/* imports. The internal files above are source evidence and design anchors, **not blanket instructions to patch or import them**.

**Custom memory mechanism (proposed):** retrieve <=3 provenance-bearing snippets before a new turn, bound by agent/session/requester scope and token budget; keep mutable per-turn facts outside stable prompt prefix. After settlement, save only a verified, non-secret, user-authorized distilled fact via the chosen existing memory owner. Do not copy full raw transcripts to a second store or run both OpenClaw memory engines as conflicting writers.

**Cross-framework bridge contract (proposed):**
- Input: requester identity/scope, correlation or turn ID, operation, typed JSON arguments, deadline/AbortSignal equivalence, explicit capability authority.
- Output: bounded typed text/structured result, provenance, tool error class, source ID, optional retryability, effect receipt only if observed.
- Failure: timeout/abort and tool error are explicit; no synthetic success, unknown send status remains unknown.
- State: bridge is stateless until persistence need is proven; idempotency key plus an effect-point authorization check for mutating operations.

## 4. Actionable Implementation Steps

1. **Preserve baselines.** Pin the source revisions above; check source/worktree status immediately before edits. Keep F:\Workflow\openclaw read-only throughout initial integration. Inspect OpenClaw's documented MCP configuration route rather than creating a new core API.
2. **Pick one real use case.** First prototype is read-only knowledge.search (query, scope, limit -> sourced summaries). Define response schema and an explicit unavailable/error result. No API tokens or model calls needed in this proof.
3. **Use an existing owner.** If OpenClaw memory-core already satisfies knowledge.search, expose/reuse it via supported tools instead of installing a new memory database. If not, implement a small Node/TypeScript **MCP server** owning only the missing adapter; do not claim that existing OpenClaw MCP *client* automatically exposes its internal memory as a server.
4. **Connect OpenClaw.** Supply the adapter using its configured Agent Bundle MCP server mechanism (scoped stdio for local use; authenticated Streamable HTTP for remote use); verify tool discovery, schema name, one call and cancellation. Do not modify run-entry.ts or the core loop for this.
5. **Connect DeepSeek Harness only if needed.** Mount the adapter using the existing dsh-mcp-client Cordis configuration; confirm namespaced ctx.tools tool and bounded errors. DSH MCP client documentation provides stdio/streamable-http, timeout and reconnect configuration. The DSH side is a *client*, not an inferred implementation of a server.
6. **Add knowledge capture last.** Once lookup works, design a single write owner. On committed assistant-turn completion, derive a small fact with sources and user-approved retention policy. Separate model text, tool results, terminal reply and delivery receipts. Save failures as unverified observations, not facts.
7. **Verify with approved targeted checks before activation.** Contract discovery; read-only retrieval; distinct two-session isolation; permission denial; provider/MCP timeout; cancellation; parallel tool batches and sessions_yield; NO_REPLY/empty response; duplicate sends; restart and rollback. Tests and live API calls **were not executed** for this proposal.
8. **Deploy/cut over separately.** Use a reversible plugin/config change only after test evidence and explicit deployment authorization. Keep original model/provider route, plugin registry, memory store and channel dispatcher unchanged. Roll back by removing the adapter registration/config, not by deleting session data.

### Acceptance conditions for a future implementation

- One real turn reaches the intended model via the selected built-in or plugin harness; logs/receipts identify the selected route. No unapproved remote inference.
- Tool results appear once with stable tool IDs; two requesters do not leak context or results to each other.
- Text deltas remain ordered, terminal reply matches the current-source assistant answer, NO_REPLY remains silent, and a send is not claimed until actual delivery evidence exists.
- Memory recall cites durable source IDs and stays within configured time/size limits; denied/failed retrieval is visible and fail-soft.
- Aborts, timeouts, crash/restart and provider fallback do not produce duplicate side effects or hang tool leases.
- Existing OpenClaw and DSH tests remain unchanged until an approved integration change defines the focused coverage. No performance or latency improvement is claimed without a baseline and an end-to-end measurement.

## 5. Alternatives and architectural choice

| Route | Reuse | Risk/reversibility | Decision |
| --- | --- | --- | --- |
| A. External MCP adapter + existing OpenClaw Agent Bundle MCP + DSH dsh-mcp-client | High | Low, config-level rollback | **Prototype first** |
| B. OpenClaw-supported code plugin + DSH Cordis plugin with one shared external API | Medium | Medium, two plugin contracts | Only for richer lifecycle semantics |
| C. Replace OpenClaw streamSimple/provider or embed DSH agent-loop inside OpenClaw | Low | High, history/tool/authority drift | **Reject for current goal** |

### Non-obvious future extension (hypothesis, not current fact)

Treat "memory" as **provenance-bearing capability context**, not a transcript dump: a small evidence service responds to the current intent, keeps independently revocable scope and source fingerprints, and emits an explicit absent/stale result. Both agent runtimes can consume that context through MCP while remaining independent in provider choice and session ownership. Falsify the design if it adds duplicate context, cross-session leakage, unacceptable prompt latency, or repeated writes without a clear owner.

### Evidence inventory / verification limits

- **Read as source:** openclaw/package.json; src/llm/stream.ts; src/plugin-sdk/agent-core.ts; packages/agent-core/src/agent.ts, agent-loop.ts, agent-stream-response.ts, runtime-deps.ts; src/agents/embedded-agent-runner/run-entry.ts; run/attempt.ts, attempt-prompt-phase.ts, attempt-prompt-submit.ts, attempt-stream.ts, attempt-result.ts; src/agents/embedded-agent-subscribe.ts; src/agents/agent-run-terminal-reply.ts; src/agents/agent-bundle-mcp-runtime.ts; src/auto-reply/dispatch.ts; reply/agent-runner-run.ts, agent-runner-execution.ts, agent-runner-result.ts, agent-runner-result-payloads.ts, agent-runner-payloads.ts, reply-dispatcher.ts; extensions/memory-core/index.ts; extensions/memory-lancedb/index.ts.
- **Read as architecture reference:** openclaw/docs/agent-runtime-architecture.md; docs/openclaw-agent-runtime.md; AGENTS.md and src/agents/AGENTS.md; deepseek-harness/docs/architecture.md; packages/mcp/mcp-client/README.md; docs/AGENTS.md.
- **Not established:** exact startup CLI-to-channel call graph across every ingress, actual configured model/provider, enabled plugin/memory backend, deployed MCP endpoint, current secrets or running process state, measured concurrency/latency, whether DSH has an MCP *server* adapter, live compatibility of a proposed bridge. Resolve these before implementation.
- **Change boundary this task:** only this Markdown proposal is created. No modifications to either runtime, model config, memory database, or deployment.
