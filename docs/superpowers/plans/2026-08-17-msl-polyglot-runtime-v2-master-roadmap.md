# Market Signal Lab Polyglot Runtime v2 — Master Implementation Roadmap


> **Polyglot Foundation v3 canonical update (2026-08-22):** For current language ownership, selective TypeScript/Bun adoption, generated-JS policy, anti-duplication rules, and the current phase map, read `docs/superpowers/specs/2026-08-22-msl-polyglot-foundation-v3-design.md` and `docs/superpowers/plans/2026-08-22-msl-polyglot-foundation-v3-master-roadmap.md`. This older document remains historical design/roadmap evidence and must not be used to reintroduce obsolete transport or language-boundary assumptions.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each phase task-by-task. Every implementation phase must have a phase-specific TDD plan before production code is changed.

**Goal:** Evolve Market Signal Lab into a domain-owned polyglot system where Go controls the application, Rust owns production analytics, Python owns quantitative research/calibration, and C++ is introduced only as a proven native accelerator.

**Architecture:** Go remains the Windows host/control plane and security boundary. Rust becomes the mandatory production analytics plane with no hidden Go analytics fallback. Python is introduced later as an offline Quant Research Laboratory, while C++ is conditional on profiling evidence and remains behind Rust.

**Tech Stack:** Go 1.22+, Rust stable/Cargo, long-lived NDJSON worker IPC, Python 3.12+ for offline quant tooling when its phase begins, C++20 only after profiling gate, existing vanilla JavaScript/HTML/CSS UI, append-only local history, Windows x64 packaging.

## Global Constraints

- Primary scope: Envato market Trends & Insights / observed market direction intelligence only.
- Preserve the permanent user guardrail verbatim in project documentation.
- No portfolio/review/rejection/submission intelligence in this roadmap.
- Runtime market data must be real observations; no synthetic runtime catalog/product/author data.
- Go is not a production analytics fallback after the Rust cutover.
- Rust is mandatory for every analytics subsystem migrated to Rust.
- Rust workers receive normalized analytical input only; never credentials or browser sessions.
- Python is offline/research unless a later approved design explicitly promotes a component.
- C++ is forbidden until profiling demonstrates a concrete justified hotspot.
- Business interfaces remain language-neutral.
- English and Indonesia are mandatory release-gate languages.
- Existing Market Surface != Catalog semantics and all Alpha 6.5.2.1 temporal/provenance contracts remain intact.
- `Map Market Now` must not publish complete derived analytics if the required Rust runtime is unavailable.
- README remains evergreen; release-specific details belong in GitHub Releases.
- Every safe source/test/spec/plan/QA/checkpoint must be synchronized to `rendevouz999/Market-Signal-Lab` before handoff.

---

## Phase Map

```text
PHASE A — Alpha 6.5.3 Runtime Contract Cutover
Go control plane + Rust mandatory analytics contract
Remove user-selectable Go/Shadow analytics modes
Remove runtime demo/legacy UI

        ↓

PHASE B — Alpha 6.5.3 Rust Production Analytics Core
Compile real Rust worker
Consensus / Ambiguity / Volatility / Selection Probability
No Go runtime fallback
Windows worker packaging

        ↓

PHASE C — Rust Ranking & Signal Expansion
Catalog/Product ranking math
Exposure / Breadth / Relative Strength
Supply / Competition / Author Concentration
Hierarchical numeric aggregation

        ↓

PHASE D — Alpha 6.6 Market Flow & Cohort Engine
Surface transition flow
Exposure Velocity
Cohort survival/persistence/decay/re-entry
Rust-owned production computation

        ↓

PHASE E — Alpha 7 Trend State Engine
Emerging / Accelerating / Mainstream / Saturated
Cooling / Declining / Re-emerging
Robust time-series statistics in Rust

        ↓

PHASE F — Alpha 7.1 Market Memory & Historical Echo
Market fingerprints
Regime similarity
80% catalog + 80% product-type hard gates
Historical consensus and forward outcomes
Rust production scoring

        ↓

PHASE G — Alpha 7.2 Python Quant Research Lab
Backtesting
Probability calibration
Calibration metrics
Model comparison
Validated parameters promoted to Rust

        ↓

PHASE H — Profiling Gate / Optional C++ Accelerator
Only if profiling proves a hotspot
C++20 specialized kernels behind Rust
```

---

## Phase A — Alpha 6.5.3 Runtime Contract Cutover

### Purpose

Remove ambiguity about which language owns production analytics before compiling or expanding more Rust code.

### Deliverables

- one production analytics identity: `rust-production`;
- Go remains host/control plane;
- no user-selectable Go analytics mode;
- no runtime Shadow Verification mode;
- no Go analytics fallback path;
- explicit Rust unavailable/incomplete state;
- one-time internal synthetic legacy cleanup;
- no `Purge Legacy Demo Data` button or demo runtime controls;
- updated checkpoint/spec/plan/repository state.

### Release gate

This phase is not a final user release by itself. It is a source architecture checkpoint. Ordinary Go-side tests must remain green while Rust-required paths are allowed to report unavailable until Phase B supplies the compiled worker.

---

## Phase B — Alpha 6.5.3 Rust Production Analytics Core

### Purpose

Make Rust a real packaged production dependency for the existing Cross-Surface Consensus analytical kernels.

### Rust operations

```text
distribution_similarity
item_volatility
cluster_volatility
selection_probability
```

### Validation strategy

- freeze Alpha 6.5.2.1 deterministic reference vectors;
- reference vectors are test evidence, not a production Go engine;
- run `cargo test` and `cargo clippy -- -D warnings`;
- build native Rust worker;
- build Windows x64 Rust worker;
- run deterministic 10K / 100K / 1M parity corpus;
- run worker protocol/error tests;
- benchmark only after parity passes;
- package MSL with the real worker.

### Required runtime behavior

```text
Rust Ready
→ analytics runs

Rust unavailable / crashed / protocol mismatch
→ no hidden Go result
→ analytics finalization blocked/incomplete
→ UI explicitly explains the failure
```

### Release artifact

```text
Market Signal Lab/
├── Market Signal Lab.exe
├── engines/rust/msl-analytics-rust.exe
├── browser-companion/
└── README.md
```

Alpha 6.5.3 is not final until this phase passes.

---

## Phase C — Rust Ranking & Signal Expansion

### Purpose

Move numeric market-ranking work that is currently concentrated in Go into the Rust analytics plane so Rust is not merely a four-operation side worker.

### Candidate ownership migration

- Product Exposure Score;
- Catalog Trend numeric components;
- Product Opportunity numeric components;
- Market Breadth;
- Relative Strength;
- Supply Velocity;
- Competition Acceleration;
- Author Concentration;
- Volume-Weighted Index numerical aggregation;
- Equal-Sector Index numerical aggregation;
- index divergence calculation.

### Boundary rule

Go still owns IDs, timestamps, source references, provenance assembly, storage, HTTP, and UI presentation. Rust owns deterministic numeric computation.

### Gate

Every migrated kernel needs:

- frozen regression fixture;
- Rust unit test;
- Go integration contract test using the Rust worker;
- no duplicate production formula left in Go after migration.

---

## Phase D — Alpha 6.6 Market Flow & Cohort Engine

### Purpose

Read the **flow** of observed products through market surfaces instead of only scoring static snapshots.

### Rust-owned computations

```text
New / Random New
      ↓
Category / Search
      ↓
Popular
      ↓
Featured
      ↓
Persistent Exposure
      ↓
Cooling / Disappearing / Re-entered
```

Metrics:

- Observed Exposure Velocity;
- surface transition probability/frequency;
- New → Popular observed conversion;
- Time to Popular;
- Popular Persistence;
- cross-surface expansion;
- Exposure Decay;
- Trend Re-entry Frequency;
- release cohort survival 7D/30D/90D;
- catalog flow velocity.

### Go responsibilities

- collect/canonicalize observation events;
- schedule scans;
- persist append-only surface events;
- send normalized cohort/transition matrices to Rust;
- expose resulting flow metrics through API/UI.

---

## Phase E — Alpha 7 Trend State Engine

### Purpose

Convert raw scores and movement into market-cycle states that are more informative than a single percentage.

### States

```text
Emerging
Accelerating
Mainstream
Saturated
Cooling
Declining
Re-emerging
```

### Rust statistical toolkit

- rolling median;
- EWMA smoothing;
- Theil–Sen slope where appropriate;
- monotonic direction test / equivalent robust statistic;
- rolling z-score anomaly detection;
- change-point evidence where justified;
- confidence intervals from deterministic/approved methods.

### Evidence stage contract

```text
1 comparable scan   → Current Composition
2                   → Movement Indication
3–5                 → Preliminary Trend
6+                  → Established Trend
12+ periodic        → Seasonality Candidate
```

No state may bypass evidence-depth gates.

---

## Phase F — Alpha 7.1 Market Memory & Historical Echo

### Purpose

Turn append-only history into a market-memory system that can detect structural regimes resembling prior periods.

### Rust production features

- Market Fingerprint generation;
- catalog-distribution similarity;
- product-type-distribution similarity;
- momentum/breadth/supply similarity;
- regime similarity ranking;
- Historical Echo classification;
- forward-outcome aggregation;
- historical consensus across multiple analogs.

### Hard gate

```text
Catalog Similarity >= 80%
AND
Product-Type Similarity >= 80%
```

Only then may a period be labeled a Historical Echo candidate.

### Output language

Historical analogs are evidence, not guarantees. The UI must never transform a historical match into a claim that a future movement is certain.

---

## Phase G — Alpha 7.2 Python Quant Research Lab

### Purpose

Create an independent laboratory that tests whether MSL's scores and states actually predict later observed market behavior.

### Python package boundary

Suggested structure:

```text
research/python/
├── pyproject.toml
├── msl_quant/
│   ├── datasets.py
│   ├── backtest.py
│   ├── calibration.py
│   ├── metrics.py
│   ├── replay.py
│   └── reports.py
└── tests/
```

### Inputs

Explicit sanitized exports containing:

- historical fingerprints;
- catalog/product ranking snapshots;
- flow/cohort outcomes;
- predictions made at original timestamp;
- coverage/confidence/data-quality metadata;
- model versions.

No credentials or raw private sessions.

### Metrics

- directional accuracy;
- Precision@K;
- Recall where a ground-truth event definition exists;
- Brier Score for probability-like predictions;
- Expected Calibration Error or approved calibration metric;
- false-positive/false-negative analysis;
- performance by evidence stage and Data Quality grade.

### Promotion contract

Python does not silently change production formulas.

```text
Experiment
→ documented result
→ approved model/parameter revision
→ versioned Rust implementation
→ regression/backtest gate
→ production
```

---

## Phase H — Profiling Gate / Optional C++ Accelerator

### Purpose

Use C++ only if Rust profiling proves a specialized kernel is a substantial bottleneck and a native implementation provides a repeatable improvement worth the maintenance cost.

### Candidate targets

- large pairwise regime similarity matrices;
- dense cohort aggregation;
- specialized SIMD distribution/distance kernels;
- other concrete CPU hotspots found through profiling.

### Admission gate

Before creating production C++ code:

1. benchmark representative 10K / 100K / 1M or larger real-shaped corpora;
2. identify the exact Rust hotspot with profiler evidence;
3. attempt algorithmic and idiomatic Rust optimization first;
4. build an isolated C++20 proof-of-concept;
5. compare end-to-end latency, memory, and integration overhead;
6. adopt only if the improvement is repeatable and materially useful.

### Runtime structure

```text
Rust Analytics
   ├── normal Rust path
   └── optional C++ accelerator path
```

No Go analytics fallback is introduced.

---

## Repository and checkpoint discipline

At the end of every phase:

- update `docs/checkpoints/CURRENT_MSL_CHECKPOINT.md`;
- add phase QA report under `docs/qa/`;
- preserve design and plan under `docs/superpowers/`;
- push safe source/tests/locales/scripts/manifests;
- never push local user database/history or credentials;
- keep root README evergreen;
- place release-specific detail in GitHub Releases when tooling permits.

## Overall completion definition

The polyglot roadmap succeeds when language boundaries are meaningful rather than cosmetic:

```text
Go     = application/control plane
Rust   = production market analytics
Python = quant research/calibration
C++    = evidence-driven accelerator only
```

No language is added merely for language count, and no runtime fallback hides which analytics implementation produced a market result.
