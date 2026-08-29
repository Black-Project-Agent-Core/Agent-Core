# Codespace Tools Gateway

Status: backend verified on 2026-08-20.

## Purpose

The Tools Gateway exposes reviewed tools, skills, plugin sources, and MCP adapters to the Custom GPT through the existing authenticated Codespace Supervisor on port 8787.

It does not create a second AI agent. The Custom GPT remains the only reasoning agent.

## Architecture

```text
Custom GPT
  -> GPT Action / OpenAPI
  -> existing HTTPS Codespace Supervisor :8787
  -> /tools-gateway/*
  -> reviewed adapter
  -> installed tool / local skill source / MCP stdio server
```

The gateway intentionally uses the existing supervisor process and port. No additional public port is required.

## Public routes

- `GET /tools-gateway/status`
- `GET /tools-gateway/tools`
- `GET /tools-gateway/tools/{tool_id}`
- `POST /tools-gateway/invoke`

All routes use the same existing `BRIDGE_TOKEN` bearer authentication as the stable Action bridge.

## Registered tool IDs

The registry is capability-oriented. GPT Builder should discover current availability with `listToolsGatewayTools`, then invoke the named capability that matches the task rather than reasoning from the aggregate name “Tools Gateway”.

Current registered IDs include:

- code intelligence and analysis: `serena`, `mcp-language-server`, `ast-grep`, `semgrep`, `code-intelligence`, `ast-grep-skill`;
- repository context: `repomix`;
- browser/UI validation: `playwright-mcp`, `chrome-devtools-mcp`;
- framework/API documentation: `context7`;
- GitHub and Git inspection: `github-mcp`, `mcp-git`;
- planning/task state: `task-master`, `beads`, `j-space`;
- project memory: `graphiti`, `agentmemory`, `claude-mem`, `mcp-memory`;
- engineering guidance/skill sources: `superpowers`, `spec-kit`, `anthropic-skills`, `vercel-skills`, `skills-cli`, `agent-skill-eval`;
- capability discovery/catalogues: `agentfinder-catalog`, `plugin-catalogue`, `mcp-registry`;
- reference MCP adapters: `mcp-everything`, `mcp-filesystem`, `mcp-fetch`, `mcp-time`, `mcp-sequential-thinking`;
- compatibility/metadata: `openhands-agent-canvas`;
- environment-limited source: `docker-mcp-gateway`.

Availability is probed at request time. Registry metadata is not treated as proof that a runtime is healthy. `openhands-agent-canvas` remains metadata-only and must not be launched as a second reasoning agent.

### GPT routing contract

For engineering tasks, the GPT should explicitly select specialized capabilities when useful:

- use `serena` for symbol-aware navigation and semantic code understanding;
- use `mcp-language-server` for definitions, references, hover, and diagnostics;
- use `ast-grep` for structural code-pattern search;
- use `semgrep` for deterministic static/security analysis;
- use `repomix` when repository context must be compressed for broad inspection;
- use `context7` for version-specific library/framework/SDK documentation;
- use `playwright-mcp` for local browser E2E flows and `chrome-devtools-mcp` for browser/runtime debugging;
- use `github-mcp` for reviewed GitHub inspection and `mcp-git` for read-only Git queries;
- use `task-master` or `beads` for persistent task/dependency state when a multi-step implementation benefits from it;
- use `j-space` for seam/resume/note/ship ledger operations;
- use `graphiti`, `agentmemory`, or `claude-mem` only when project-memory retrieval materially helps the task;
- use source/catalogue capabilities such as `superpowers`, `spec-kit`, `code-intelligence`, or `plugin-catalogue` for guidance/discovery, not as substitutes for direct workspace execution.

Direct workspace Actions remain the primary path for deterministic file writes, commands, Git commits, and Windows Relay operations. Tools Gateway augments those Actions with specialized analysis, documentation, browser, memory, and planning capabilities.

## Current runtime status at acceptance

- J-Space: available.
- Context7 4.0.2: available and callable.
- OpenHands Agent Canvas 1.14.0: metadata-only; the gateway will not launch a second reasoning agent.
- claude-mem 13.15.2 CLI wrapper exists, but the runtime reports `not installed`; gateway status is `degraded`.
- code-intelligence source: available for bounded read/search.
- awesome-claude-code-plugins catalogue: available for bounded read/search.
- seven MCP reference servers: available through reviewed stdio adapters.

## MCP policy

The gateway is not a raw MCP passthrough. Each MCP server has an explicit allowlist.

- `mcp-everything`: safe demonstration subset only; environment access is denied.
- `mcp-filesystem`: read/list/search/info operations only, pinned to `/workspaces/Market-Signal-Lab`.
- `mcp-memory`: graph operations are allowed. Process lifetime semantics remain those of the upstream server.
- `mcp-sequential-thinking`: tool listing only. Calls are disabled so internal reasoning is not exported.
- `mcp-fetch`: `fetch` is allowed.
- `mcp-git`: read-only Git operations only. Mutating Git operations remain behind the existing stable Git Action endpoints.
- `mcp-time`: time and timezone conversion operations are allowed.

## Generic invoke contract

`POST /tools-gateway/invoke` accepts a registered `toolId`, one exposed `operation`, and bounded optional fields such as `query`, Context7 library fields, `mcpTool`, `path`, `inputJson`, and `maxChars`.

`inputJson` is a JSON object encoded as a string. This is intentional: GPT Builder previously dropped nested arbitrary objects from generated Action function signatures. The backend parses and validates the string before dispatch.

No raw shell passthrough is exposed by the Tools Gateway.

## Persistence

`.devcontainer/scripts/bootstrap-supervisor.sh` copies `tools_gateway.py` into `/home/vscode/.codespace-supervisor` together with `server.py` and `windows_gateway.py`. The normal zero-touch post-create/post-start lifecycle therefore restores the gateway on rebuild/resume.

The gateway internally prepends these paths when invoking installed assistant tools, so it does not depend on interactive-shell PATH state:

- `/workspaces/.assistant-tools/bin`
- `/workspaces/.assistant-tools/npm-global/bin`

## Acceptance performed on 2026-08-20

- existing Codespace/Windows unittest suite plus Tools Gateway tests: 8/8 passed;
- gateway registered 13 tool IDs;
- Context7 `list-tools` succeeded;
- Context7 React library resolution succeeded;
- J-Space `seam` succeeded;
- code-intelligence bounded search succeeded;
- plugin catalogue bounded search succeeded;
- OpenHands `--info` succeeded without launching an agent;
- claude-mem status correctly reported degraded/not installed;
- all seven MCP servers completed `tools/list`;
- MCP Everything `get-sum` succeeded;
- MCP Filesystem reported only `/workspaces/Market-Signal-Lab` as allowed;
- MCP Memory `read_graph` succeeded;
- MCP Fetch fetched `https://example.com`;
- MCP Git `git_status` succeeded;
- MCP Time `get_current_time` succeeded;
- environment MCP call `get-env` was denied with HTTP 403;
- MCP Git mutation `git_commit` was denied with HTTP 403;
- Sequential Thinking execution is not exposed;
- public `https://cautious-space-succotash-r7p4gjxw6qj5hpv59-8787.app.github.dev/tools-gateway/status` returned HTTP 200;
- Windows Relay 1.1.1 / Desktop Commander 0.2.47 remained connected after supervisor reload.

## Stable Action compatibility

The backend additions are namespaced under `/tools-gateway/*`. Existing workspace, Git, job, health, privacy, and `/windows/*` behavior is unchanged.

The GPT Builder schema must be merged with the already-stable v1.1.3 schema rather than replacing it with a Tools-Gateway-only schema.
