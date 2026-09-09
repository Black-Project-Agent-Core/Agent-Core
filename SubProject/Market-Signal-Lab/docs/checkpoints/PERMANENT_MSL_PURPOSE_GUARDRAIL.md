# Permanent Market Signal Lab Purpose Guardrail

**Status:** PERMANENT / USER-AUTHORED PURPOSE CORRECTION
**Scope:** All MSL product design, analytics semantics, naming, documentation, UI, research, and future development.

This file is the canonical purpose guardrail for Market Signal Lab. Future MSL work must preserve this meaning and must not reinterpret MSL as a trading, financial-market-timing, or market-entry-timing system.

## User correction — verbatim

> sejujur aku tidak butuh bagian "kapan masuk ke pasar" karna yang aku butuhkan tahu kemana arah trends dan mendapat insight di market envato, karna jika ada kata "kapan masuk ke pasar" ini sama dengan sedang bermain saham atau hal hal tentang trading, jadi kalau bisa pemahaman kata "kapan masuk ke pasar" ini di hapus saja, karna merusak arti maksud tujuan alat untuk menebak arah trend market envato dan insight produk, menebak pun tidak asal asalan karna ada perhitungan analisanya, meski aku tidak tahu cara menganalisa trend market dari produk envato setidaknya aku tahu maksud tujuannya sehingga kamu bisa bantu aku untuk membangunnya.

## Canonical product meaning — non-verbatim

Market Signal Lab exists to analyze observable Envato marketplace evidence so it can infer the likely direction of marketplace trends and produce useful product insights.

The desired chain is:

```text
Observed Envato Market Evidence
→ Historical / Cross-sectional Analysis
→ Evidence Quality and Signal Eligibility
→ Trend Direction Inference
→ Catalog / Product Trend Ranking
→ Product Insight
→ Better Product Decisions and Quality Benchmarking
```

`Trend Direction Inference` means an evidence-based analytical estimate derived from measured observations, history, movement, composition, competition, and other defensible signals. It does not mean arbitrary guessing and it must not claim certainty beyond the available evidence.

## Explicit non-goals

MSL is **not** intended to provide:

- "when to enter the market" recommendations;
- market-entry timing signals;
- trading-style entry/exit signals;
- buy/sell/hold semantics;
- financial-market or stock-trading analogies as the product model;
- guaranteed predictions about future Envato performance.

Do not introduce those concepts into MSL naming, analytics semantics, UI copy, roadmap, or product-purpose descriptions unless the user explicitly changes this guardrail later.

## Primary questions MSL should help answer

- Ke mana arah tren di market Envato berdasarkan evidence yang tersedia?
- Katalog, kategori, produk, tema, gaya, atau pola apa yang sedang menunjukkan perubahan bermakna?
- Insight produk apa yang dapat diambil dari perubahan tersebut?
- Seberapa kuat evidence yang mendukung suatu trend inference?
- Bagaimana kualitas/positioning produk kita dapat dibandingkan dengan kompetisi secara sah untuk membantu membuat produk yang lebih baik?
- Kapan evidence belum cukup sehingga sistem harus menahan atau menurunkan confidence terhadap suatu insight?

## Research / forecasting boundary

Backtesting, calibration, historical analog analysis, and evaluation against later observed Envato outcomes are allowed when their purpose is to test or improve **trend-direction inference** and product insight.

Allowed meaning:

```text
"Given the evidence available at time T, did the inferred direction later match what was actually observed on Envato?"
```

This research must not be translated into:

```text
"enter now"
"exit now"
"best time to enter the market"
buy / sell / hold
trading-style action signals
```

A model may estimate future observed direction or probability-like evidence only when the quantity, horizon, calibration, uncertainty, and evidence limitations are explicit. It remains market-intelligence inference, not market-entry timing.

## Legacy compatibility names

Historical or frozen contracts may still contain names such as:

```text
Opportunity
OpportunityScore
Product Opportunity
```

Those names may remain temporarily where exact v0.1 parity, regression fixtures, persisted schema compatibility, or historical evidence requires them.

Their canonical interpretation is **legacy product-insight/ranking semantics only**. They must never be interpreted as a recommendation about when to enter the Envato market.

C1 may preserve these names for exact parity. A later explicitly approved semantic-correction phase may replace them with more defensible product-insight terminology without rewriting historical regression evidence.

## Documentation precedence

For current/future product meaning, this purpose guardrail takes precedence over older roadmap/spec/plan wording that could otherwise be interpreted as market-entry timing or trading semantics.

Exceptions are limited to documents that intentionally preserve exact historical behavior, field names, schemas, or regression evidence. In those cases:

1. preserve the historical text/field required for evidence or compatibility;
2. interpret it under this purpose guardrail;
3. do not expand the legacy wording into a new trading/timing feature;
4. use current purpose terminology in new UI, docs, plans, and analytics contracts unless exact compatibility requires otherwise.

Archived QA/release-history documents should not be retroactively rewritten merely to make history look cleaner. Their historical facts remain evidence; this guardrail governs how current development interprets them.

## Semantic rule

Prefer terms such as `trend direction`, `trend inference`, `market movement`, `market evidence`, `catalog trend`, `product insight`, `competition signal`, and `quality benchmark`.

Avoid framing MSL with `market entry timing`, `entry signal`, `exit signal`, `buy`, `sell`, or other trading semantics.

This guardrail supplements, and does not replace, the existing lawful competitive-intelligence, credential/security, evidence-truth, architecture, repository, and no-silent-main-merge guardrails.
