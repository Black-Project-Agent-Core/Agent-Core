---
"agent-core": minor
---

Native builds its tool registry once per process and names the task on each call, instead of rebuilding a registry for every turn. Each call carries a host-supplied caller (task, workspace, session, granted tools, failure-loop advisor, image view store); the registry lists and runs only that caller's grant, and refuses a call without one. The model sees the same tools and the same tool contract digest as before. `AGENT_CORE_NATIVE_TOOL_REGISTRY=per-task` keeps the earlier registry per session. Also: discovery names are cached per registry shape and a session reads its tool listing, definitions and digest once; `image_inspect` views now survive across turns of a conversation; read-only actions of the `skills` tool (`list`, `inspect`, `search`, `read`) no longer get a dispatch checkpoint or mutation journal entry; and explicit capability policy no longer shrinks the operator's tool ceiling when a capability request is denied.
