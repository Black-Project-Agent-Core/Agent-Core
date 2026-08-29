# Market Signal Lab — Polyglot Runtime Architecture v2 Design Specification


> **Polyglot Foundation v3 canonical update (2026-08-22):** For current language ownership, selective TypeScript/Bun adoption, generated-JS policy, and anti-duplication rules, read `docs/superpowers/specs/2026-08-22-msl-polyglot-foundation-v3-design.md`. This older document remains historical design/roadmap evidence and must not be used to reintroduce obsolete transport or language-boundary assumptions.


**Status:** Approved architecture direction; supersedes the Alpha 6.5.3 runtime-fallback design for future implementation.

## 1. Purpose

Market Signal Lab (MSL) remains a private, local-first, Windows-focused Envato market Trends & Insights intelligence system. Its primary job is to reduce guesswork about market direction, catalog momentum, product direction, market ambiguity, persistence, and historical behavior before production effort is committed.

### Permanent project guardrail — verbatim

> hal yang perlu di luruskan untuk alat yang kita bangun bukan untuk melakukan hal ilegal atau hacking web, melainkan hanya menganalisa arah market, membaca algoritma market, untuk mengetahui katalog, produk, dan nama pemilik produknya bukan berarti meng-hack orang tersebut melainkan melihat insight baru dan mengikuti alur trends, setiap katalog yang sedang hype di masukan ke daftar ranking Trends Katalog, dan produk apa yang bagus menjadi Insight agar aku tidak salah membuat produk, bukan bermaksud mencuri ide produk melainkan untuk bersaing tentang kualitas dan mengukur kualitas antara produkku dan orang lain.

Current scope remains **market Trends & Insights only**. Personal portfolio scoring, review readiness, rejection prediction, submission intelligence, and category-fit scoring for the user's own products remain postponed until the Trends & Insights system proves useful through real use and backtesting.

## 2. Core architectural decision

MSL becomes a **domain-owned polyglot system**. Languages do not duplicate one another as runtime fallbacks. Each language owns the subsystem class where it has a concrete technical advantage.

```text
                         MARKET SIGNAL LAB
                                │
                       Market Signal Lab.exe
                                │
                         GO CONTROL PLANE
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
              ▼                 ▼                 ▼
        RUST ANALYTICS      PYTHON QUANT      UI / CAPTURE
        PRODUCTION PLANE    RESEARCH PLANE    JS/HTML/CSS
              │
              ▼
       C++ ACCELERATOR
       only when profiling
       proves a hotspot
```

This supersedes the user-facing/runtime architecture where `Go Native`, `Rust Native`, and `Shadow Verification` were selectable production modes.

## 3. Language ownership

### Go — Control Plane / Application Host

Go owns:

- `Market Signal Lab.exe` lifecycle and process host;
- Market Autopilot orchestration;
- Envato connector/networking;
- request scheduling, rate-limit handling, retries, and bounded scan plans;
- HTTP API and Server-Sent Events;
- Live Scan Telemetry and Adaptive ETA;
- security and credential boundary;
- worker supervision and capability negotiation;
- storage coordination and local application state;
- localization server;
- export orchestration;
- Browser Companion ingestion endpoints;
- Windows integration and scheduled execution;
- construction of user-facing domain/provenance objects from analytics results.

Go does **not** remain a production analytics fallback after the Rust cutover.

### Rust — Production Analytics Plane

Rust is the sole production owner of migrated deterministic analytics.

Initial ownership:

- cross-surface distribution similarity;
- Item Consensus / Concept Consensus numerical kernels;
- Market Ambiguity calculations;
- item and cluster ranking volatility;
- Observed Selection Probability.

Next ownership:

- catalog/product ranking mathematics;
- Observed Exposure Score;
- Market Breadth;
- Relative Strength;
- Supply Velocity;
- Competition Acceleration;
- Author Concentration;
- hierarchical market index numerical aggregation.

Future ownership:

- Alpha 6.6 Market Flow & Cohort computations;
- Alpha 7 Trend State statistics;
- Alpha 7.1 production Market Fingerprint and Historical Echo scoring.

If the Rust analytics runtime is unavailable, MSL must not silently calculate those analytics in Go. The application reports an explicit unavailable/degraded analytics state and does not publish a new derived analytics result as if Rust had run.

### Python — Quant / Research Laboratory

Python is an offline/read-only analytical laboratory, not the primary interactive runtime.

Python owns:

- statistical experiments;
- backtesting;
- probability calibration;
- calibration curves and reliability diagrams;
- Brier score and calibration error;
- Precision@K / Recall / directional accuracy evaluation;
- bootstrap confidence intervals;
- time-series and historical replay experiments;
- reference-validation datasets;
- research plots and diagnostic reports;
- parameter/model comparison before validated parameters are promoted to Rust production models.

Python receives sanitized analytical datasets only. It does not receive Envato credentials or browser sessions.

### C++ — Conditional Native Accelerator

C++ is not a mandatory runtime layer. It enters only after profiling demonstrates a specific hotspot where a specialized native/SIMD implementation creates a meaningful measurable advantage over the optimized Rust implementation.

Potential targets:

- very large pairwise fingerprint comparisons;
- large historical similarity matrices;
- dense cohort aggregation kernels;
- SIMD-heavy distance/distribution calculations;
- future specialized native numerical primitives.

C++ lives behind the Rust analytics plane. If a C++ accelerator is absent, the subsystem continues through the Rust implementation—not through Go analytics.

### JavaScript / HTML / CSS — Presentation and Browser Capture

Existing responsibilities remain:

- responsive dashboard;
- UI state/interaction;
- Browser Capture Companion;
- explicit preview-before-save capture workflow.

English and Indonesia remain mandatory release-gate languages.

## 4. Business-language neutrality

Business code must describe the business operation, not the implementation language.

Use:

```text
CalculateVolatility(...)
CalculateConsensus(...)
CalculateMarketFlow(...)
ClassifyTrendState(...)
```

Do not expose names such as:

```text
CallRustVolatility(...)
CallCppSimilarity(...)
```

The implementation owner is resolved below the business/domain boundary.

## 5. Worker security boundary

Rust, Python, and C++ analytical components must never receive:

- Envato personal token;
- Authorization headers;
- cookies;
- browser local/session storage;
- raw authenticated browser sessions;
- account email/private account data;
- raw authenticated API bodies containing credentials.

Rust receives normalized mathematical/domain-neutral analytical input. Python receives sanitized exported research datasets. C++ receives numeric buffers from Rust only.

## 6. Rust runtime failure semantics

There is no hidden Go analytics fallback.

Required states:

```text
Rust Ready
Rust Starting
Rust Unavailable
Rust Protocol Mismatch
Rust Crashed
Rust Timed Out
Rust Invalid Result
```

For user-triggered Market Autopilot production analysis, a Rust preflight must pass before derived analytics are published.

If Rust becomes unavailable after data collection starts:

- collected raw/normalized observations may be safely persisted by Go;
- the Market Map run is marked `analytics_incomplete` or equivalent;
- no new Trends Catalog/Product Direction/Consensus result is published as complete;
- UI clearly states that analytics finalization requires the Rust runtime;
- no Go calculation substitutes for the missing Rust result.

## 7. Migration validation without production fallback

Existing Go formulas may be used during migration only as **test/reference evidence**, not as runtime fallback.

Migration approach:

1. freeze deterministic Alpha 6.5.2.1 reference fixtures and expected results;
2. compile Rust worker;
3. require Rust to match the frozen reference corpus within the accepted tolerance;
4. optionally validate independent mathematical references through Python later;
5. remove production `GoEngine`, runtime shadow mode, and Go fallback path;
6. keep only test fixtures/reference vectors needed for regression.

This preserves numerical continuity without leaving two production engines that confuse the user.

## 8. Runtime demo/legacy cleanup

Production runtime must not expose demo/test market data controls.

Remove from production/UI:

- Load Demo / seed demo commands;
- synthetic catalog/product/author runtime seeds;
- demo/ranking-demo HTTP routes;
- `Purge Legacy Demo Data` button;
- legacy-demo explanatory UI;
- bundled runtime sample market observations.

Legacy synthetic cleanup becomes a one-time internal storage migration. It is not a permanent user-facing feature.

Synthetic data remains allowed only in isolated:

- Go `_test.go` fixtures;
- Rust unit/integration fixtures;
- Python research fixtures;
- benchmark corpora.

Synthetic fixtures must never enter runtime market observations, user history, ranking, or production insight UI.

## 9. Storage ownership

Go remains coordinator of canonical local storage at this phase.

- canonical evidence/history remains append-only and auditable;
- Rust does not read MSL storage directly;
- Rust receives normalized DTO batches from Go;
- Python receives explicit sanitized research exports;
- C++ receives numeric buffers from Rust.

A future analytical projection/columnar store may be introduced only when dataset size and profiling justify it. It is not part of the initial cutover.

## 10. UI contract

Settings no longer presents runtime choices:

```text
Go Native
Rust Native
Shadow Verification
```

Instead it shows factual component health:

```text
Application Host        Go        Healthy
Production Analytics    Rust      Ready / Unavailable
Quant Research Lab      Python    Installed / Not configured
Native Accelerator      C++       Not required / Available
Analytics Protocol                msl-analytics/1
```

No mode selector may imply that Go can be selected as a production analytics engine.

## 11. Existing MSL behavior that must remain intact

- Market Autopilot whole observed-market discovery;
- real Envato data only in runtime;
- Market Surface != Catalog;
- Site → Content Type → Catalog → Product Type → Use Case segmentation;
- Trends Catalog and Product Directions;
- Trend Score vs Opportunity Score separation;
- Coverage, Confidence, Data Quality A-D;
- stratified sampling and sample audit;
- score provenance / Why this score?;
- product source links;
- Saved Views and Watchlist;
- Date A `releasedAt` and Date B `lastTrendSeenAt` semantics;
- append-only trend lifecycle;
- Cross-Surface Consensus and Market Ambiguity semantics;
- Browser Capture Companion privacy boundaries;
- responsive 1366×768 workspace;
- Live Scan Telemetry factual progress and adaptive ETA;
- English + Indonesia parity;
- local-first user data under `%LOCALAPPDATA%\MarketSignalLab\`.

## 12. Repository policy

All safe source, tests, locale files, specs, plans, QA, manifests, and continuation checkpoints must be synchronized to the private repository:

```text
rendevouz999/Market-Signal-Lab
```

Never push credentials, cookies, private sessions, real local database/history, or secret-bearing runtime logs.

README remains evergreen. Release-specific history belongs in GitHub Releases when release tooling is available.

## 13. Roadmap alignment

```text
Alpha 6.5.3
Polyglot Runtime v2 Foundation
- Go control plane
- Rust mandatory production analytics
- remove Go analytics runtime/fallback
- remove runtime demo/legacy controls

↓

Alpha 6.6
Market Flow & Cohort Engine
- Rust production analytics
- New/Category/Search/Popular/Featured flow
- Exposure Velocity
- Cohort Survival

↓

Alpha 7
Trend State Engine
- Rust
- Emerging / Accelerating / Mainstream / Saturated / Cooling / Declining / Re-emerging

↓

Alpha 7.1
Historical Echo & Seasonality
- Rust production regime scoring
- Python validation/research where useful

↓

Alpha 7.2
Backtesting & Probability Calibration
- Python Quant Research Lab
- validated calibrated parameters promoted to Rust

↓

Performance Profiling Gate

↓ only if evidence justifies

C++ Native Accelerator
```

## 14. Acceptance definition for the architecture cutover

The cutover is successful only when all are true:

1. `GoEngine` is absent from production runtime.
2. Production runtime exposes no Go analytics mode.
3. Production runtime exposes no Shadow Verification mode.
4. Rust worker compiles and runs on the packaged Windows build.
5. `Rust unavailable` is explicit and never converted to hidden Go calculation.
6. Existing stable analytics match frozen reference fixtures within tolerance.
7. Runtime demo/legacy market-data controls are removed.
8. Test/benchmark synthetic data stays isolated from runtime storage/UI.
9. English/Indonesia parity remains green.
10. Safe source/docs/tests are synchronized to GitHub before the build is handed off.
