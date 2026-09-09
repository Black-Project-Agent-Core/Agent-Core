# Agent Core Portable Self-Healing Runtime Design

## Goal
Agent Core must cold-relocate across folders, drive letters, and Windows machines without fixed paths, while preserving durable user state and rebuilding machine-local state automatically.

## Chosen architecture
The project folder is the authoritative current root, resolved at startup rather than configured. `Agent Code Native.exe` owns the lifecycle and performs the portable bootstrap before it starts the runtime. System Node/npm are preferred when compatible; otherwise a verified project-local portable Node runtime is installed under `runtime/tools`. The bundled tunnel client remains preferred, with explicit architecture checks.

## State boundary
Durable state moves with the folder: `runtime/data`, `runtime/memory` (the Markdown vault and its auxiliary state), `runtime/execution`, `secrets`, the tunnel profile, and user-authored allow-list entries. Machine-local state is disposable: owned-process PID records, shutdown/exit request files, lifecycle temp/cache, the root locator, and bootstrap identity metadata.

## Relocation behavior
Every lifecycle start computes a runtime identity from normalized root path, machine name, user SID, OS architecture, and bootstrap schema. If it differs from the previous identity, Agent Core clears only machine-local lifecycle state, refreshes `%LOCALAPPDATA%\AgentCore\root.txt`, rediscovers executables, and continues from durable state.

## Dependency behavior
Node requirement is `>=24.15.0`. Resolution order is explicit override, compatible system Node, compatible project-local Node, then verified download of a pinned compatible Node build. Downloads use HTTPS and SHA-256 verification from the official Node checksum manifest. `npm ci` runs only when dependencies are missing or unhealthy.

## Safety
No admin rights are required for the fallback runtime. No global PATH mutation is required. No durable auth, custom Agent Core key, memory vault, execution state, or tunnel identity is deleted during relocation recovery. A network outage only blocks first-time dependency acquisition; it never destroys existing state.

## Supported relocation contract
Cold relocation is supported: stop Agent Core, copy/move the whole project folder, then launch `SubProject\Agent-Code\Agent Code Native.exe` from the new location. Hot relocation while processes hold files open is not a supported operation.

## Acceptance
A relocated temp copy must rebind its root, reject stale lifecycle state, discover a compatible runtime without drive assumptions, preserve durable files, and produce healthy Agent Core/tunnel startup. Existing OAuth tunnel-resource regression tests must stay green.
