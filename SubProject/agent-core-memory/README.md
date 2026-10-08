# Agent Core Memory

Standalone extraction of the Memory subsystem used by Agent Core.

This directory contains the independently usable memory-engine package imported into Agent Core, not a second Memory server. The upstream import and local patches are recorded in `UPSTREAM-SOURCE.json` and [PATCHES.md](PATCHES.md). No personal/canonical runtime memory is included.

## Agent Core host integration

The monorepo root `npm run build` runs `build:memory` before compiling the host. `src/memory/host-runtime.ts` in the host keeps the legacy engine on the configured v1 root when no activation marker exists, and loads this package only after validating `runtime/memory-v2-activation.json` and its backup identity. Activated experience-v2 uses `runtime/memory-v2`; it does not co-write the legacy root. `memory_v2_read` and `memory_v2_write` are registered by the host, not by this package.

The standalone default below is separate from that host cutover. Source checkout alone does not establish an activated runtime. See the host [installation history](../../docs/Agent-Core-Memory-v2-Installation-20261008.md) and [recorded live acceptance](../../docs/Agent-Core-Memory-v2-Live-Acceptance-20261009.md) for their original environment, dates and limits.

## Core capabilities

- Canonical Markdown-backed memory records
- Atomic file persistence and process locking
- BM25 lexical retrieval
- Optional semantic embeddings and cosine similarity
- Hybrid/fusion retrieval with bounded result budgets
- Memory links, temporal relationships, and bounded evolution
- Provenance and source-staleness evidence
- Revision history
- Feedback, salience, forget/restore lifecycle
- Atomic batch transactions
- Import/export transfer format
- Consolidation and retirement review
- Retrieval/use ledger and diagnostics
- Embedding repair state with bounded retry
- Workspace-aware memory scoping

## Requirements

- Node.js 24.15 or newer
- npm

Runtime package dependencies are intentionally small:
- `proper-lockfile`
- `zod`

## Install

```bash
cd SubProject/agent-core-memory # when starting at the Agent Core repository root
npm ci
npm run build
npm test
```

## Basic usage

```ts
import { initializeStandaloneMemory } from "agent-core-memory";

const memory = await initializeStandaloneMemory();

const saved = await memory.remember({
  title: "Project convention",
  content: "Use source-first verification before changing architecture.",
  category: "architecture",
  tags: ["project", "convention"]
});

const results = await memory.search("architecture verification");
console.log(saved.id, results);
```

By default, canonical memory is stored under:

```text
<baseDir>/runtime/memory
```

For standalone use, `baseDir` defaults to the caller's working directory. Hosts should supply their verified project root explicitly rather than inherit an incidental working directory. A custom memory root can be passed with:

```ts
const memory = await initializeStandaloneMemory({
  memoryRoot: "D:/my-memory-store"
});
```

For lower-level integration, `MemoryService.initialize(baseDir, memoryRoot, embedder)` remains available.

## Optional semantic embeddings

The extraction includes the Agent Core Cloudflare Workers AI embedder.

```ts
import {
  CloudflareWorkersAIEmbedder,
  MemoryService
} from "agent-core-memory";

const embedder = new CloudflareWorkersAIEmbedder({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
  apiToken: process.env.CLOUDFLARE_API_TOKEN!,
  model: "@cf/google/embeddinggemma-300m",
  dimensions: 768
});

const memory = await MemoryService.initialize(
  process.cwd(),
  undefined,
  embedder
);
```

If no embedder is configured, canonical storage and lexical retrieval remain usable.

## Security boundary

This repository contains source code only. It deliberately excludes
`runtime/memory`, credentials, secrets, environment files, backups, and user data.

See `EXTRACTION-MANIFEST.json` for the exact source extraction boundary.

## Controller continuation and complete transfer

Experience-v2 hosts can use `createControllerMemoryDispatcher(session)` for an allowlisted, transport-neutral controller contract. Read responses include advisory metadata and exact final-envelope byte metrics. Fresh controllers can resume from a capsule or page the current episode when it is stale or missing.

`exportMemoryTransferV2`, `previewMemoryTransferV2`, and `importMemoryTransferV2` provide checksummed whole-root snapshots and isolated restore without the legacy 500-record cap. Complete restore preserves logical root identity, retained evidence and receipts; it refuses an active-root merge. Knowledge-only exports are explicitly incomplete and cannot be restored as a complete backup.

See [controller integration and transfer](docs/controller-integration.md), [T9 verification](docs/verification/memory-controller-transfer.md), and [final integration evidence](docs/verification/memory-integration.md). The imported evolution completed G0–G9 and final independent review on 7 October 2026. Those runs establish synthetic Linux/protocol/isolated-restore behavior, not live autonomous-controller reliability. Later host-specific Windows and external-controller evidence is recorded separately in the host documents above; it does not establish the complete Windows regression matrix or cross-provider/Native-Agent continuation.
