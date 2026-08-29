# Market Signal Lab Alpha 6.2 Safe Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a paginated, bounded, honest Market Explorer for the Observed Market Universe while preserving Market Autopilot as the discovery engine and avoiding any claim of global Envato completeness.

**Architecture:** Keep the local append-only product/author/observation stores as the source of truth. Add a bounded `UniverseExplorerService` that scans those ledgers with a hard cap, applies validated filters and stable sorting, aggregates facets from the matching bounded set, and returns paginated summaries. Expose the service through `/api/universe/explorer`, then replace the current Explorer preview with real filters, facets, result cards, pagination, and Saved View reuse. Keep author names as public evidence, not primary product-ranking signals.

**Tech Stack:** Go, local JSONL repositories, `net/http`, HTML/CSS/vanilla JavaScript, existing English/Indonesia i18n registry.

---

### Task 1: Explorer Query Contract and Validation

**Files:**
- Create: `internal/domain/explorer.go`
- Test: `internal/domain/explorer_test.go`
- Modify: `internal/repository/universe.go`

**Interfaces:**
- Produces `UniverseExplorerQuery`, `UniverseExplorerResult`, `ExplorerFacets`.
- Extends repository with bounded reads needed by Explorer.

- [ ] Write failing domain tests for validated sort keys, page bounds, page-size bounds, and date parsing.
- [ ] Run targeted tests and verify they fail because Explorer contracts do not exist.
- [ ] Implement normalized query/domain structs and bounded repository interfaces.
- [ ] Run targeted and full tests.
- [ ] Commit `feat: define bounded market explorer queries`.

### Task 2: Bounded Explorer Service

**Files:**
- Create: `internal/app/universe_explorer.go`
- Test: `internal/app/universe_explorer_test.go`
- Modify: `internal/storage/universe_store.go`

**Interfaces:**
- Consumes `UniverseExplorerQuery`.
- Produces filtered page, total count, bounded facets, and explicit `scanTruncated` metadata.

- [ ] Write failing service tests covering catalog/site/type/author/title/price/date filters, stable sorting, pagination, and truncation.
- [ ] Implement bounded store reads with a configurable hard scan cap; no unbounded file read in Explorer request path.
- [ ] Build joined product/observation/author summaries and aggregate facets only from matching scanned rows.
- [ ] Run targeted and full tests.
- [ ] Commit `feat: add bounded market explorer service`.

### Task 3: Explorer HTTP API

**Files:**
- Create: `internal/web/explorer_handlers.go`
- Test: `internal/web/explorer_handlers_test.go`
- Modify: `internal/web/server.go`

**Interfaces:**
- Produces `GET /api/universe/explorer`.

- [ ] Write failing handler tests for query parsing, defaults, invalid dates/sorts, empty results, pagination metadata, and truncation metadata.
- [ ] Implement the handler and route.
- [ ] Run targeted and full web tests.
- [ ] Commit `feat: expose local market explorer api`.

### Task 4: Explorer UI, Facets, and Pagination

**Files:**
- Modify: `internal/web/index.go`
- Test: `internal/web/explorer_ui_test.go`

**Interfaces:**
- Consumes `/api/universe/explorer`.
- Produces real Explorer controls, facet summaries, result cards, previous/next pagination, and explicit bounded-universe disclosure.

- [ ] Write failing UI contract tests for required labels/actions and real API use.
- [ ] Replace `renderExplorerPreview()` with query construction, loading/error states, facet chips, cards, pagination, and truncation disclosure.
- [ ] Keep author search available but visually secondary to product/catalog metadata.
- [ ] Run UI and full tests.
- [ ] Commit `feat: build observed market explorer ui`.

### Task 5: Saved View Reuse

**Files:**
- Modify: `internal/web/index.go`
- Test: `internal/web/advanced_ui_test.go`

**Interfaces:**
- Consumes existing Saved Views `/api/saved-views`.
- Produces `Apply` action that maps saved filter keys into Explorer state and navigates to Explorer.

- [ ] Write failing UI tests for `Apply`, Explorer navigation, and saved filter mapping.
- [ ] Implement safe mapping for known filter keys only.
- [ ] Run UI/full tests.
- [ ] Commit `feat: apply saved views to market explorer`.

### Task 6: Version, Documentation, and Release Build

**Files:**
- Modify: `cmd/market-signal-lab/main.go`
- Modify: `internal/app/service.go`
- Modify: `README.md`
- Modify: relevant tests

**Interfaces:**
- Version `0.3.0-alpha.6.2`.
- Windows x64 build, source ZIP, SHA-256 manifest.

- [ ] Write/update failing version and export tests.
- [ ] Update README with Explorer scope, bounded scan semantics, facets, pagination, and Saved View workflow.
- [ ] Run `gofmt`, `go test ./... -count=1`, `go test -race ./... -count=1`, `go vet ./...`, locale parity, JS syntax checks, and `git diff --check`.
- [ ] Cross-build Windows GUI x64 executable and package release/source artifacts.
- [ ] Commit `chore: release alpha6.2 safe explorer`.
