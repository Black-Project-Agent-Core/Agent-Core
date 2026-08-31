# AI Agent Consumer Contracts

Pinned references:

- OpenClaw: `12f2f9c35510ab2c07a3525c897c0a94e75da256`
- Hermes Agent: `1f99a4b2f2982fbef06df00ad673ade4e1895668`
- Odysseus: `c9dd68d890a7c0ee0df9a0e351ce22aafd6c7c0f` (`dev` at capture time)

Purpose: determine what Super-Runtime must expose so AI-agent products can use it without Super-Runtime becoming coupled to any one agent framework.

## Shared external denominator

All three references have a path for using a local/self-hosted OpenAI-compatible model endpoint.

The strongest interoperability baseline is therefore:

```text
GET  /v1/models
POST /v1/chat/completions
```

with streaming, structured tool calls, usage metadata, and correct model IDs.

This should be viewed as a **compatibility surface**, not the internal architecture of Super-Runtime.

## OpenClaw observations

OpenClaw's custom-provider configuration distinguishes provider API modes. For self-hosted `/v1/chat/completions` servers it uses an `openai-completions` adapter; it can also use `openai-responses` when the backend implements `/v1/responses`.

Its local-service integration commonly probes a local model server through `/v1/models` before sending inference traffic. It also carries model metadata such as context window, maximum output tokens, reasoning capability, input modalities, and compatibility flags.

OpenClaw source/docs also show that local backends can need schema-cleaning or provider-specific compatibility declarations for tool schemas. This matters because a model server that accepts a chat request but cannot compile or parse its tool schema is not an agent-compatible backend.

### Super-Runtime consequence

At minimum, Super-Runtime should eventually support:

- `/v1/models` with useful metadata;
- `/v1/chat/completions` streaming and non-streaming;
- native OpenAI-style `tools` and `tool_choice` request fields;
- normalized structured `tool_calls` responses;
- cancellation when the client disconnects;
- slow-local-model timeouts without corrupting model state;
- optional `/v1/responses` compatibility once the basic contract is stable.

## Hermes Agent observations

Hermes explicitly abstracts providers and accepts custom OpenAI-compatible endpoints. Its agent loop expects OpenAI-style tool-calling semantics and persists tool-call state across the conversation lifecycle.

The configuration supports custom base URLs and model identifiers rather than requiring a specific local runtime brand.

Hermes also has local model detection and model-list interactions, reinforcing `/v1/models` as a useful discovery contract.

### Super-Runtime consequence

A successful HTTP 200 and generated text are insufficient. For Hermes-class consumers, the runtime must preserve:

- assistant content;
- tool call IDs;
- function/tool names;
- JSON arguments;
- finish reason semantics;
- tool result replay compatibility;
- stable streaming deltas;
- model/context metadata.

## Odysseus observations

Odysseus has a provider layer below its chat/agent loop and supports generic OpenAI-compatible endpoints plus local runtimes such as llama.cpp, vLLM, SGLang, Ollama, and LM Studio.

Its model capability system treats tool support as a capability rather than assuming every endpoint supports native function calls. Its specs explicitly separate provider-emitted tool calls from authorization: the provider proposes an action; the agent/tool security layer decides whether it may execute.

Odysseus also uses endpoint/model-specific context-length metadata and includes tool-call arguments in token-budget estimation.

### Super-Runtime consequence

Super-Runtime should expose **capabilities truthfully**. It must not claim tool-call support merely because an architecture can generate tokens. Capability discovery should distinguish:

- native structured tool calling;
- prompted/text tool protocol only;
- reasoning stream support;
- context-window size;
- multimodal inputs where applicable;
- embeddings where applicable;
- model lifecycle/readiness state.

## Two-plane API hypothesis

A clean boundary is emerging.

### Compatibility / inference plane

Designed for OpenClaw, Hermes, Odysseus, IDE agents, and arbitrary clients:

```text
GET  /health
GET  /v1/models
POST /v1/chat/completions
POST /v1/responses              optional/next tier
POST /v1/embeddings             capability-dependent
```

This plane should remain as boring and standard as possible.

### Native Super-Runtime control plane

Designed for runtime administration rather than model conversation:

```text
model lifecycle
load / unload / switch
memory budget
CPU/GPU device policy
residency plan
cache policy
context/state budget
runtime metrics
I/O metrics
peak/current RSS
health/readiness
benchmark/probe controls
```

The exact transport and endpoint names are not yet frozen. The important design decision is that these controls should **not** be smuggled into OpenAI request bodies or made dependent on one agent framework.

## Agent-oriented model contract

Super-Runtime needs a model capability descriptor above the raw graph adapter.

A possible conceptual record:

```text
ModelCapabilities
  inference
  chat_template
  structured_tools
  reasoning
  context
  embeddings
  modalities
  state_mode
  quantization
  CPU backend support
  optional accelerator support
  out_of_core support class
```

This allows a model to be:

```text
loadable = true
agent_tool_compatible = false
```

without ambiguity.

That distinction is important for small/local models whose chat template or tool-call parser cannot reliably produce the structured protocol required by an agent loop.

## Context is part of the consumer contract

Agent frameworks are context-intensive. They send system instructions, tool schemas, history, source fragments, terminal output, and tool results.

Therefore Super-Runtime must report realistic context capacity and refuse or compact according to explicit policy rather than silently exceeding the model/runtime memory budget.

This is where the compatibility plane and the native budget plane meet:

```text
agent asks for context N
       |
       v
model capability window
       +
runtime state-memory budget
       |
       v
accepted effective context
```

## What Super-Runtime should not own

Even though these agent projects are reference material, Super-Runtime should not absorb their responsibilities:

- shell/filesystem/git tools;
- MCP server policy;
- task planning;
- human approval policy;
- memory/skills databases for the agent product;
- channel integrations;
- scheduled tasks;
- agent identity/persona.

Those belong above the runtime.

Super-Runtime owns reliable, resource-aware inference and the model/runtime contract those systems consume.

## Initial interoperability gate

A future prototype should not be called agent-compatible until one local Super-Runtime model can pass a black-box interoperability suite that verifies:

1. model discovery;
2. streaming text;
3. native structured tool call;
4. multi-turn tool result -> model continuation;
5. cancellation during generation;
6. context-limit reporting and enforcement;
7. usage/token metadata;
8. stable behavior under a configured RAM budget;
9. at least one real consumer integration (OpenClaw/Hermes/Odysseus) without consumer-specific runtime patches.
