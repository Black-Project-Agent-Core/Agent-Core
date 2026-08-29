# Market Signal Lab Alpha 6.4 Temporal Product Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add immutable verified first-release timestamps, dynamic last-seen-in-trend timestamps, append-only trend lifecycle history, comparable-run temporal integrity, and bilingual product/run timelines without AI or mock data.

**Architecture:** Extend the normalized product entity with verified release provenance while keeping observation timestamps separate. Store trend lifecycle events append-only per product/window/run, derive current temporal summaries from those events, and expose them through existing Product Directions plus a market-map history API. The Envato connector may accept only explicit release fields from official API responses; unknown release dates remain unavailable rather than inferred.

**Tech Stack:** Go 1.x, JSONL local storage, embedded HTML/JavaScript UI, official Envato Market API connector, English/Indonesia JSON locale registry.

## Global Constraints

- Windows x64 `.exe`, local-first, no LLM, no embedding model, no Ollama, no GPU dependency.
- English is default/fallback; Indonesia is second; locale key parity is a release gate.
- Date A is immutable after verified first release is stored; conflicting later values create an audit event and never overwrite automatically.
- Date B changes only when a completed/partial market-map run classifies the product as active in a defined trend window.
- `releasedAt`, `firstDetectedAt`, `lastScannedAt`, and `lastTrendSeenAt` are distinct concepts.
- Trend lifecycle storage is append-only: entered, continued, exited, reentered.
- Current and previous comparable runs must never resolve to the same run ID.
- Store UTC/RFC3339 internally; display `dd/MM/yyyy HH:mm` in the user's local timezone.
- No mock runtime routes, seed data, synthetic products, synthetic authors, or guessed URLs/dates.
- Personal tokens and raw upstream payloads must never enter database, export, logs, or UI diagnostics.

---

### Task 1: Temporal Domain and Storage Contracts

**Files:**
- Modify: `internal/domain/universe.go`
- Modify: `internal/domain/autopilot.go`
- Modify: `internal/repository/universe.go`
- Modify: `internal/repository/autopilot.go`
- Modify: `internal/storage/universe_store.go`
- Modify: `internal/storage/autopilot_store.go`
- Test: `internal/storage/temporal_store_test.go`

**Interfaces:**
- Produces `ProductReleaseRecord`, `ProductReleaseConflict`, `ProductTrendEvent`, `ProductTemporalSummary`.
- Produces repository methods for release records/conflicts, trend events, and `LatestCompletedMarketMapRunExcluding`.

- [x] Write failing storage tests for immutable release, conflict audit, append-only trend events, and previous-run exclusion.
- [x] Run targeted storage tests and verify missing-contract failures.
- [x] Implement minimal domain/repository/storage contracts.
- [x] Run targeted and full tests.
- [x] Commit.

### Task 2: Official Release Timestamp Parsing and Enrichment

**Files:**
- Modify: `internal/connectors/envato/universe.go`
- Modify: `internal/connectors/envato/catalog_surfaces.go`
- Create: `internal/connectors/envato/item_detail.go`
- Test: `internal/connectors/envato/item_detail_test.go`
- Modify: `internal/app/autopilot_service.go`
- Test: `internal/app/release_enrichment_test.go`

**Interfaces:**
- Produces `ObservedItem.ReleasedAt`, `ReleasePrecision`, `ReleaseField`.
- Produces `Client.ItemDetail(ctx, token, itemID, allowance)`.
- Persists only explicit official release fields; never uses `updated_at` or first-detected time as release.

- [x] Write failing connector tests for explicit release fields and rejection of updated-only responses.
- [x] Run targeted tests and verify failures.
- [x] Implement parsing and bounded enrichment for direction evidence products.
- [x] Run connector/app/full tests.
- [x] Commit.

### Task 3: Trend Lifecycle Engine

**Files:**
- Create: `internal/temporal/trends.go`
- Test: `internal/temporal/trends_test.go`
- Modify: `internal/app/autopilot_outputs.go`
- Test: `internal/app/temporal_trend_integration_test.go`

**Interfaces:**
- Consumes product snapshots for 7/30/90-day windows plus current/prior comparable run IDs.
- Produces entered/continued/exited/reentered events and product temporal summaries.

- [x] Write failing tests for entered, continued, exited, reentered, and no-update-when-not-trending.
- [x] Run tests and verify expected failures.
- [x] Implement deterministic lifecycle engine and persistence integration.
- [x] Run targeted and full tests.
- [x] Commit.

### Task 4: Product Temporal Views and Market-Map Timeline API

**Files:**
- Modify: `internal/domain/autopilot.go`
- Modify: `internal/app/product_source_links.go`
- Create: `internal/app/temporal_views.go`
- Test: `internal/app/temporal_views_test.go`
- Modify: `internal/web/autopilot_handlers.go`
- Modify: `internal/web/server.go`
- Test: `internal/web/temporal_handlers_test.go`

**Interfaces:**
- Extends `ProductSourceLink` with Date A, Date B, first detected, last scanned, active windows, lifecycle status, and provenance.
- Produces `GET /api/autopilot/history` and product temporal detail data.

- [x] Write failing service/API tests.
- [x] Run and verify failures.
- [x] Implement service views and handlers.
- [x] Run targeted and full tests.
- [x] Commit.

### Task 5: Bilingual Temporal UI

**Files:**
- Modify: `internal/i18n/locales/en.json`
- Modify: `internal/i18n/locales/id.json`
- Modify: `internal/web/index.go`
- Test: `internal/web/temporal_ui_test.go`
- Test: `internal/web/i18n_contract_test.go`

**Interfaces:**
- Displays First Release and Last Seen in Trend below products.
- Displays unavailable/verified/conflict states, 7D/30D/90D badges, and market-map timeline.

- [x] Write failing UI contract tests for both timestamps, history timeline, format helper, and bilingual keys.
- [x] Run and verify failures.
- [x] Implement UI and locale keys.
- [x] Run JavaScript syntax, UI, locale, and full tests.
- [x] Commit.

### Task 6: Version, Export, Documentation, and Windows Release

**Files:**
- Modify: `cmd/market-signal-lab/main.go`
- Modify: `internal/app/service.go`
- Modify: `README.md`
- Create: `docs/superpowers/specs/2026-08-16-market-signal-lab-alpha6.4-temporal-product-intelligence.md`
- Modify: export tests where required.

**Interfaces:**
- Version `0.3.0-alpha.6.4`.
- Export includes normalized release/trend history but excludes tokens/raw payloads.

- [x] Write/update failing version and export tests.
- [x] Implement release metadata and documentation.
- [x] Run `gofmt`, `go test ./...`, `go test -race ./...`, `go vet ./...`, JS syntax, locale parity, and `git diff --check`.
- [x] Build Windows x64 GUI executable, package ZIP/source/README/checksums, and smoke-test extracted source.
- [x] Commit release.
