# Agent Core Memory

Standalone extraction of the Memory subsystem used by Agent Core.

This repository contains the memory engine itself, not the full Agent Core product.
No personal/canonical runtime memory is included.

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
npm install
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
<project-root>/runtime/memory
```

A custom memory root can be passed with:

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

See [controller integration and transfer](docs/controller-integration.md) and [T9 verification](docs/verification/memory-controller-transfer.md). Linux protocol replay is distinct from live model integration. Live controller A→B and the separate Windows matrix are **NOT RUN**. Gate G9 awaits independent review.
