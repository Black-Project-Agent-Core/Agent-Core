# Market Signal Lab Alpha 6.3 Product Source Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every concrete Envato product shown in Market Signal Lab directly traceable back to its original Envato item page without inventing URLs or weakening Alpha 6.2’s bounded Observed Market semantics.

**Architecture:** Preserve canonical absolute Envato item URLs in the existing normalized observation/source metadata, add an app-layer `ProductSourceLink` view that joins product identity to observed source evidence, and expose that view through existing `/api/autopilot/view`, `/api/explorer`, and `/api/universe/explorer` responses. Render single-product rows as a directly linked product title plus `Open on Envato`; render grouped/multi-product directions as expandable evidence lists with one source link per observed product. Continue to use the existing `Investigate` action for MSL Advanced Research.

**Tech Stack:** Go, local JSONL ledgers, `net/http`, HTML/CSS/vanilla JavaScript, existing English/Indonesia i18n registry.

---

### Task 1: Canonical Envato URL Contract

**Files:**
- Create: `internal/app/product_source_links.go`
- Test: `internal/app/product_source_links_test.go`
- Modify: `internal/app/autopilot_view.go`
- Modify: `internal/app/universe_view.go`
- Modify: `internal/app/universe_explorer.go`

**Interfaces:**

```go
type ProductSourceLink struct {
    ProductID string `json:"productId"`
    Title string `json:"title"`
    URL string `json:"url,omitempty"`
    SourceSite string `json:"sourceSite,omitempty"`
}
```

- [ ] **Step 1: Write failing tests** proving only absolute `http/https` Envato URLs are exposed; malformed/relative/missing URLs become unavailable rather than invented.
- [ ] **Step 2: Run targeted tests and verify RED.**
- [ ] **Step 3: Implement canonical URL helper and source-link service join** from normalized observations.
- [ ] **Step 4: Run targeted and full app tests.**
- [ ] **Step 5: Commit** `feat: preserve canonical product source links`.

### Task 2: Autopilot and Explorer Response Integration

**Files:**
- Modify: `internal/app/autopilot_view.go`
- Modify: `internal/app/universe_view.go`
- Modify: `internal/app/universe_explorer.go`
- Modify tests in `internal/app/*_test.go`

**Interfaces:**
- Adds `primaryProduct` and `evidenceProducts` where ranking rows aggregate multiple items.
- Preserves existing row IDs, scores, trends, and signals.

- [ ] **Step 1: Write failing integration assertions** that concrete products include original source URL and grouped directions expose multiple evidence products.
- [ ] **Step 2: Run targeted tests and verify RED.**
- [ ] **Step 3: Populate source links from observed products without changing ranking math.**
- [ ] **Step 4: Run targeted/full tests.**
- [ ] **Step 5: Commit** `feat: expose product source evidence`.

### Task 3: Safe Source-Link UI

**Files:**
- Modify: `internal/web/index.go`
- Test: `internal/web/autopilot_ui_test.go`
- Test: `internal/web/i18n_contract_test.go`

**Interfaces:**
- Consumes: `row.primaryProduct`, `row.evidenceProducts`, and `row.productCount`.
- Produces: singleton title link/button and multi-item expandable source list.

- [ ] **Step 1: Write failing UI contract assertions** for `Open on Envato`, `View {count} Products`, `Product link unavailable`, `target="_blank"`, and `rel="noopener noreferrer"`.
- [ ] **Step 2: Run targeted web tests and verify RED.**
- [ ] **Step 3: Add HTML/JS helpers** that escape text, accept only backend-validated URLs, and render:
  - one product: linked title + `Open on Envato` + `Investigate`;
  - multiple products: cluster title + `View N Products` toggle + evidence rows + `Investigate`;
  - missing URL: disabled source action.
- [ ] **Step 4: Run targeted and full web tests.**
- [ ] **Step 5: Commit** `feat: open observed products on Envato`.

### Task 4: Bilingual Copy and Version Upgrade

**Files:**
- Modify: `internal/i18n/locales/en.json`
- Modify: `internal/i18n/locales/id.json`
- Modify: `cmd/market-signal-lab/main.go`
- Modify: `internal/app/service.go`
- Modify: `internal/web/server.go`
- Modify: `internal/web/index.go`
- Modify: version assertions in tests

**Interfaces:**
- Produces application/export version `0.3.0-alpha.6.3` and identical locale keys.

- [ ] **Step 1: Add failing locale/version assertions.**
- [ ] **Step 2: Add English and Indonesia keys** for source-link actions, tooltips, evidence count, unavailable state, and expandable list.
- [ ] **Step 3: Update all runtime/export badges and filenames to Alpha 6.3.**
- [ ] **Step 4: Run i18n, server, app, and command tests.**
- [ ] **Step 5: Commit** `chore: release alpha6.3 product source links`.

### Task 5: Documentation, Release Build, and Verification

**Files:**
- Modify: `README.md`
- Create release artifacts under `/mnt/data`.

**Interfaces:**
- Produces Windows x64 EXE, ZIP, source ZIP, README, and SHA-256 manifest.

- [ ] **Step 1: Document** direct links, multi-product clusters, URL safety, source-language preservation, and the distinction between `Open on Envato` and `Investigate`.
- [ ] **Step 2: Run fresh verification:** `gofmt`, `go test ./... -count=1`, `go test -race ./... -count=1`, `go vet ./...`, JavaScript syntax extraction/check, locale parity, and `git diff --check`.
- [ ] **Step 3: Cross-build** `GOOS=windows GOARCH=amd64 go build -ldflags="-H windowsgui"`.
- [ ] **Step 4: Package artifacts and generate SHA-256 checksums.**
- [ ] **Step 5: Verify archive contents and commit documentation** `docs: document alpha6.3 source links`.
