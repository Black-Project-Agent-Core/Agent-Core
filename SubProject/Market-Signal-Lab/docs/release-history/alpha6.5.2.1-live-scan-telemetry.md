# Market Signal Lab v0.3 Alpha 6.5.2.1

**Live Scan Telemetry & Adaptive ETA**
Windows x64 · local-first · private/internal use · English + Indonesia · no AI · no synthetic market data

Market Signal Lab memetakan data publik yang diperoleh melalui Envato Market API menjadi **Observed Market Universe** yang dapat diaudit. Alpha 6.5 memperbaiki fondasi analisis supaya *market surface*, katalog, tipe produk, use case, kualitas sampel, dan arah waktu tidak lagi tercampur menjadi satu angka yang menyesatkan.

> Market Signal Lab bukan produk Envato dan tidak mengklaim akses ke algoritma internal, data privat, demand internal, earning kompetitor, ataupun source code Envato. Aplikasi hanya membuat inferensi dari observasi publik yang berhasil dikumpulkan secara terukur.

---

# Bahasa Indonesia

## Alpha 6.5.2.1 — Live Scan Telemetry & Adaptive ETA

Alpha 6.5.2.1 membuat proses **Map Market Now** dapat diaudit saat masih berjalan. Dashboard memisahkan **Current Run** dari **Last Completed Map**, sehingga angka hasil analisis sebelumnya tidak lagi tampak seolah merupakan progres scan baru.

Live Mapping menampilkan:

- stage tracker dari persiapan scan sampai finalisasi history;
- progress faktual `completed work units / planned work units`;
- discovered products dan completed requests/work units;
- elapsed time, estimated remaining, expected finish, dan ETA confidence;
- lima event terbaru pada Recent Log serta Full Run Log;
- warning/error/retry seperti HTTP 429 tanpa menyimpan token, Authorization header, cookie, atau raw response body;
- persisted runtime telemetry untuk audit dan kalibrasi ETA berikutnya.

Progress **tidak** memakai jumlah produk scan sebelumnya sebagai denominator. Quick/Standard/Deep hanya menentukan topology pekerjaan; durasi tidak pernah di-hardcode berdasarkan nama mode. ETA menggunakan fakta current run (kecepatan work unit, request latency, retry delay) dan, bila tersedia, historical runtime yang kompatibel secara struktural.

Jika belum ada bukti yang cukup, UI menampilkan:

```text
Calibrating… / Mengkalibrasi…
```

bukan angka ETA palsu. Ketika data mulai cukup, estimator dapat beralih dari current-run-only dengan confidence rendah ke estimasi yang didukung beberapa comparable historical run.

Endpoint lokal baru:

```text
POST /api/autopilot/run                 # memulai scan async, 202 + runId
GET  /api/autopilot/live?runId=...      # snapshot runtime
GET  /api/autopilot/live/events?runId=... # SSE telemetry stream
GET  /api/autopilot/run-log?runId=...   # structured event log
GET  /api/autopilot/runtime-history     # persisted runtime summaries
```

Token Envato hanya dikirim pada body POST awal dan tidak pernah dimasukkan ke URL SSE, history, export, atau live log.

## Alpha 6.5.2 — Cross-Surface Consensus & Market Ambiguity

Alpha 6.5.2 treats public, subscriber, official API, Advanced Research, and manual Envato Trends & Insights observations as separate market contexts instead of assuming a single canonical `Popular` ranking. It measures Item Consensus, Concept Consensus, Overall Market Consensus, Market Ambiguity, Ranking Volatility, and Observed Selection Probability.

The optional **Visible Ranking Capture Companion** is explicit and preview-first: it reads only currently rendered Envato item cards after the user clicks Capture, never scrolls the page, never reads cookies/tokens/browser storage, and sends normalized visible-card metadata only to the local Market Signal Lab instance. Load the unpacked extension from the release folder `browser-companion/` using Chrome/Edge Developer Mode.

A single public-vs-subscriber pair is only a **Current Cross-Surface Comparison**. Two comparable batches permit a volatility indication; 3–5 permit a preliminary consensus trend; 6+ permit an established consensus trend. Observed Selection Probability is the frequency with which an item or concept appears inside the eligible observed contexts and Top-K denominator; it is not a download, success, earnings, or acceptance probability.

CLI helper:

```text
Market Signal Lab.exe capture-helper-path
```

prints the expected browser companion directory beside the executable.

## 0. Responsive Workspace Alpha 6.5.1

Alpha 6.5.1 mempertahankan seluruh data, connector, formula, history, Signal Integrity, dan Temporal Product Intelligence dari Alpha 6.5, tetapi merombak antarmuka menjadi workspace yang responsif. Target utama adalah penggunaan pada **1366×768, zoom browser 100%, dan skala tampilan Windows 100–125%** tanpa perlu mengecilkan halaman.

Perubahan antarmuka utama:

- navigasi pill panjang diganti sidebar berkelompok;
- sidebar dapat dilipat pada desktop dan berubah menjadi drawer pada layar hingga 1024px;
- top bar tetap terlihat dan memuat halaman aktif, scan terakhir, kualitas data, density, dan bahasa;
- summary cards memakai grid fluid yang otomatis berubah jumlah kolom;
- tabel dashboard menyembunyikan kolom sekunder secara bertahap, lalu berubah menjadi card-row di bawah 900px;
- Explorer mempunyai filter drawer pada viewport sempit;
- pilihan **Nyaman / Ringkas** disimpan lokal dan tidak mengandung rahasia;
- English dan Indonesia sama-sama diuji pada viewport laptop dan tablet;
- tidak ada perubahan destruktif pada `%LOCALAPPDATA%\MarketSignalLab\`.

Viewport QA release:

```text
1920×1080
1600×900
1440×900
1366×768
1280×720
1024×768
768×1024
```

Pada seluruh viewport tersebut, halaman utama lulus pemeriksaan tanpa body-level horizontal overflow dan tanpa kontrol utama terpotong. Raw evidence tables tetap boleh mempunyai scroller internal bila jumlah kolom memang membutuhkan ruang tambahan.

### Metode QA responsif dan ledger perbaikan

Browser plugin tidak tersedia pada environment build. QA final memakai Chromium DevTools Protocol pada halaman `about:blank`, lalu menyuntikkan **template HTML, seluruh CSS, kamus English/Indonesia, dan workspace JavaScript yang persis sama dengan asset embedded EXE**. Pendekatan ini menghindari kebijakan Chromium terkelola yang memblokir navigasi localhost, tanpa mengubah asset yang diuji. Test Go terpisah tetap memverifikasi route localhost, content type asset, dan embedding aktual.

Perbaikan material yang diverifikasi:

| Masalah sebelumnya | Perbaikan Alpha 6.5.1 |
|---|---|
| navigasi pill panjang memakan lebar | sidebar berkelompok, collapsible, dan drawer mobile |
| layout memerlukan zoom-out | grid fluid, `min-width: 0`, padding/type berbasis `clamp()` |
| tabel memaksa body melebar | column priority dan card-row di bawah 900px |
| filter Explorer terlalu padat | filter drawer pada viewport sempit |
| detail teknis memenuhi first viewport | progressive disclosure dan top-N history |
| label Indonesia merusak sidebar collapsed | terjemahan dipindahkan ke child label; icon/label structure dipertahankan |
| density hanya satu mode | Nyaman/Ringkas tersimpan lokal |

Satu penyimpangan yang disengaja: tabel evidence mentah tetap boleh scroll horizontal **di dalam panelnya sendiri**, karena menyembunyikan kolom audit akan mengurangi ketelitian. Body halaman tetap tidak boleh overflow.

## 1. Perubahan utama Alpha 6.5

Alpha 6.5 menambahkan lapisan **Signal Integrity** sebelum ranking atau rekomendasi dipublikasikan:

```text
Envato API observations
        ↓
Market Surface normalization
        ↓
Taxonomy segmentation
        ↓
Stratified sample audit
        ↓
Data Quality assessment
        ↓
Hierarchical market indices
        ↓
Temporal direction stage
        ↓
Score provenance
        ↓
Quality-gated ranking and insights
```

Tujuannya bukan membuat angka lebih banyak, melainkan memastikan setiap angka menjawab pertanyaan yang benar dan mempunyai jejak bukti.

## 2. Market Surface berbeda dari Catalog

### Market Surface

Market Surface menjelaskan **di mana sebuah item ditemukan**:

- `New`
- `Random New`
- `Popular`
- `Featured`
- `Search`
- `Category`
- `Similar`

### Catalog

Catalog menjelaskan **item tersebut berada di pasar apa**:

```text
Site
→ Content Type
→ Catalog
→ Product Type
→ Use Case
→ Topic / Style
→ Product
```

Contoh yang benar:

```text
Site: GraphicRiver
Surface: Popular
Content Type: Graphic Templates
Catalog: Presentation Templates
Product Type: Sports Presentation
Use Case: Sponsorship Proposal
```

`Popular`, `Featured`, atau `Random New` tidak boleh muncul sebagai nama katalog pada ranking Alpha 6.5.

## 3. Indeks pasar bertingkat

Alpha 6.5 membangun indeks pada beberapa level:

```text
Observed Envato Market
├── Site Index
├── Content-Type Index
├── Catalog Index
├── Product-Type Index
└── Use-Case Index
```

Contoh jalur analisis:

```text
Global
→ GraphicRiver
→ Graphic Templates
→ Presentation Templates
→ Sports Presentation
→ Sponsorship Proposal
```

Dengan pemisahan ini, lonjakan VideoHive tidak otomatis dianggap sebagai pertumbuhan pasar presentasi atau mockup.

## 4. Dua indeks yang tidak boleh dicampur

### Volume-Weighted Index

Menunjukkan bagian pasar dengan volume observasi terbesar. Kontribusi setiap peer dibatasi agar satu site atau sektor tidak dapat menguasai indeks secara diam-diam.

### Equal-Sector Index

Memberi kontribusi setara kepada setiap sektor yang memenuhi standar kualitas. Indeks ini mengukur apakah pergerakan benar-benar menyebar luas.

Contoh:

```text
Volume-Weighted Index: Rising
Equal-Sector Index: Neutral
Divergence: Concentrated
```

Interpretasi:

> Pergerakan naik terkonsentrasi pada beberapa sektor besar dan belum menjadi kenaikan pasar yang luas.

Aplikasi tidak merata-ratakan divergence tersebut menjadi satu signal positif.

## 5. Tahap arah berdasarkan kedalaman history

Satu snapshot tidak cukup untuk menyatakan tren. Alpha 6.5 menggunakan kontrak berikut:

| Comparable Runs | Tahap | Makna |
|---:|---|---|
| 1 | Current Composition | Hanya komposisi saat ini; belum ada arah |
| 2 | Movement Indication | Indikasi perubahan awal |
| 3–5 | Preliminary Trend | Tren awal, belum mapan |
| 6+ | Established Trend | Tren teramati yang lebih mapan |
| 12+ periodic runs | Seasonality Candidate | Kandidat pola musiman untuk versi Market Memory |

Ketika tahap masih `Current Composition`, Trend Score dan Opportunity temporal tidak boleh dipresentasikan seolah-olah sudah mempunyai bukti pergerakan.

## 6. Data Quality berbeda dari Coverage dan Confidence

### Coverage

Coverage mengukur seberapa banyak **scope penelitian yang direncanakan** berhasil diselesaikan. Coverage 100% tidak berarti 100% seluruh database Envato telah dipindai.

### Confidence

Confidence mengukur konsistensi dan kekuatan bukti terhadap suatu hasil.

### Data Quality Grade

Data Quality menilai apakah sampel tersebut cukup seimbang dan layak digunakan. Grade:

```text
A = 85–100
B = 70–84,9
C = 50–69,9
D = di bawah 50
```

Komponen resmi:

| Komponen | Bobot |
|---|---:|
| Stratum Completion | 20% |
| Sample Size | 15% |
| Sample Balance | 15% |
| Unique Product Ratio | 10% |
| Taxonomy Confidence | 10% |
| Author Coverage | 5% |
| Source Reliability | 10% |
| Historical Depth | 10% |
| Surface Diversity | 5% |

Contoh:

```text
Coverage: 100%
Confidence: 78%
Data Quality: C
Reason: 72% sample berasal dari satu site
```

Aplikasi tidak boleh menganggap hasil tersebut setara dengan sampel Grade A.

## 7. Stratified Sampling

Market Autopilot membagi penelitian ke strata minimum:

```text
Site × Catalog Level × Market Surface
```

Jika taxonomy tersedia dengan baik:

```text
Site × Content Type × Catalog × Market Surface
```

Setiap strata menyimpan:

- target sample;
- request allowance;
- request used;
- observed items;
- unique products;
- completion status;
- reliability;
- failure code;
- contribution to index.

Request yang sudah dipakai untuk category bootstrap tidak dihitung dua kali. Budget selanjutnya dibagikan secara round-robin agar satu site tidak menghabiskan seluruh request budget.

## 8. Sample Audit

Setiap `Map Market Now` menghasilkan audit yang dapat dibaca melalui panel **Signal Quality**:

- item share per site;
- item share per content type;
- item share per catalog;
- observations per surface;
- unique-product ratio;
- duplicate rate;
- author attribution rate;
- taxonomy coverage dan confidence;
- stratum completion;
- sample balance;
- source reliability;
- failed strata dan reason codes.

## 9. “Mengapa skor ini?”

Setiap score yang dipublikasikan dapat mempunyai tombol:

```text
Why this score?
Mengapa skor ini?
```

Score Provenance menyimpan:

- current run dan prior run;
- planner version;
- sampling schema version;
- taxonomy version;
- weighting version;
- model version;
- final score;
- original weight;
- effective weight setelah missing-data normalization;
- component contribution;
- sample size dan unique products;
- site/catalog/surface distribution;
- Coverage, Confidence, Data Quality;
- missing components;
- fallback rules;
- reason codes;
- generated timestamp.

Tidak ada score yang boleh dipublikasikan tanpa provenance yang valid.

## 10. Quality-gated output

Alpha 6.5 menerapkan quality gate terhadap:

- Market Index;
- Trends Catalog;
- Product Directions;
- Production Insights;
- Saturation Alerts.

Bukti berkualitas rendah dapat tetap disimpan untuk audit, tetapi tidak otomatis dipromosikan menjadi rekomendasi produksi dengan keyakinan tinggi.

## 11. Migrasi dari Alpha 6.4

Data asli dipertahankan:

- products dan public authors;
- normalized observations;
- source URLs;
- release records dan release conflicts;
- Date A / First Release;
- Date B / Last Seen in Trend;
- product trend lifecycle events;
- Market Map history;
- Saved Views;
- Watchlist;
- Advanced Research history.

Katalog legacy yang sebenarnya adalah market surface diproses sebagai berikut:

```text
Pasti surface-derived
→ dipindahkan menjadi surface evidence
→ dikeluarkan dari catalog ranking

Ambigu
→ masuk Legacy Classification Review
```

Snapshot lama tetap dapat dibaca, tetapi diberi status `legacy_unsegmented` dan tidak digunakan sebagai pembanding arah Alpha 6.5 kecuali dapat dihitung ulang dari observasi yang masih tersedia.

## 12. Comparability antar-run

Dua run hanya boleh dibandingkan untuk arah temporal jika cocok pada:

- planner version;
- scan mode;
- sampling schema version;
- taxonomy version;
- enabled source sites;
- enabled market surfaces;
- stratum targets;
- weighting version;
- category-depth policy.

Run yang berbeda masih dapat dilihat berdampingan, tetapi tidak boleh menghasilkan panah naik/turun bersama.

## 13. Product temporal intelligence tetap dipertahankan

Setiap produk mempertahankan empat timestamp berbeda:

```text
releasedAt       = Date A, tanggal rilis resmi dan immutable
firstDetectedAt  = pertama kali Market Signal Lab melihat item
lastScannedAt    = terakhir terlihat dalam scan apa pun
lastTrendSeenAt  = Date B, terakhir memenuhi threshold trend
```

History tren tetap append-only:

- `trend_entered`
- `trend_continued`
- `trend_exited`
- `trend_reentered`

## 14. Market Autopilot dan Advanced Research

### Market Autopilot

Digunakan untuk broad discovery:

```text
Settings → connect Envato API
Market Autopilot → Quick / Standard / Deep
Map Market Now
Review Current Composition / Movement / Trend
Review Signal Quality
Review Catalog and Product directions
```

### Advanced Research

Digunakan setelah broad discovery menemukan kandidat yang perlu divalidasi lebih dalam. Keduanya memakai kontrak surface, taxonomy, quality, comparability, dan provenance yang sama.

## 15. Data source dan keamanan token

Personal token:

- dimasukkan langsung ke aplikasi;
- berada di memory process;
- tidak disimpan dalam database;
- tidak masuk export;
- tidak masuk log;
- tidak ditaruh di URL;
- tidak boleh dikirim melalui chat.

Untuk headless scan:

```powershell
$env:ENVATO_TOKEN="TOKEN_PRIBADI"
.\Market Signal Lab.exe market-map --token-env ENVATO_TOKEN --mode standard --no-open
```

Aplikasi menyimpan normalized observations dan derived history, bukan raw API response sebagai permanent archive.

## 16. No AI dan no mock data

Alpha 6.5 tidak membutuhkan:

- LLM;
- embedding model;
- Ollama;
- GPU;
- cloud AI;
- AI API key.

Tidak ada synthetic catalog/product/author seed untuk runtime. Tool pembersihan legacy demo tetap tersedia hanya untuk mendeteksi atau menghapus record sintetis dari versi lama; tool tersebut tidak membuat mock data baru.

## 17. Export Alpha 6.5

Export version:

```text
0.3.0-alpha.6.5.1
```

Tambahan record:

- `marketMapTargetResults`
- `observationSegmentations`
- `sampleAudits`
- `dataQualityAssessments`
- `marketIndexSnapshots`
- `scoreProvenance`
- `legacyClassificationReviews`
- `integrityModels`

Semua data Alpha 6.4 tetap dipertahankan, termasuk release, trend events, product source links, normalized observations, Saved Views, dan Watchlist.

Export tidak memuat field token, authorization header, atau raw payload.

## 18. API audit lokal

Endpoint read-only Alpha 6.5:

```text
GET /api/integrity/sample-audit?runId=<id>
GET /api/integrity/indices?runId=<id>
GET /api/integrity/index-history?level=<level>&entityId=<id>
GET /api/integrity/quality?runId=<id>
GET /api/integrity/surfaces?runId=<id>
GET /api/integrity/provenance?id=<id>
GET /api/integrity/legacy-reviews?status=open
```

Dashboard lokal:

```text
http://127.0.0.1:17771/
```

Data lokal:

```text
%LOCALAPPDATA%\MarketSignalLab\
```

## 19. Guardrail proyek — verbatim

> hal yang perlu di luruskan untuk alat yang kita bangun bukan untuk melakukan hal ilegal atau hacking web, melainkan hanya menganalisa arah market, membaca algoritma market, untuk mengetahui katalog, produk, dan nama pemilik produknya bukan berarti meng-hack orang tersebut melainkan melihat insight baru dan mengikuti alur trends, setiap katalog yang sedang hype di masukan ke daftar ranking Trends Katalog, dan produk apa yang bagus menjadi Insight agar aku tidak salah membuat produk, bukan bermaksud mencuri ide produk melainkan untuk bersaing tentang kualitas dan mengukur kualitas antara produkku dan orang lain.

Guardrail ini menjadi kontrak produk. Market Signal Lab tidak dibuat untuk hacking, bypass, akses data privat, menebak earning kompetitor, atau menjiplak desain.

---

# English

## 0. Alpha 6.5.1 Responsive Workspace

Alpha 6.5.1 preserves all Alpha 6.5 data, connectors, formulas, history, Signal Integrity, and Temporal Product Intelligence while rebuilding the interface as a responsive workspace. The primary target is **1366×768 at 100% browser zoom and 100–125% Windows display scaling** without requiring page zoom-out.

Key UI changes:

- the long pill navigation row is replaced by grouped sidebar navigation;
- the sidebar collapses on desktop and becomes a drawer at widths up to 1024px;
- the sticky top bar shows the active page, latest scan, data quality, density, and language;
- summary cards use a fluid auto-fit grid;
- dashboard tables progressively hide secondary columns and become card rows below 900px;
- Explorer filters become a drawer on narrow viewports;
- **Comfortable / Compact** density is stored locally and contains no secrets;
- English and Indonesia are both validated on laptop and tablet viewports;
- `%LOCALAPPDATA%\MarketSignalLab\` remains data-compatible.

Release viewport QA:

```text
1920×1080
1600×900
1440×900
1366×768
1280×720
1024×768
768×1024
```

The primary workspace passed without body-level horizontal overflow or clipped primary controls at every listed viewport. Raw evidence tables may still use an internal scroller where dense columns genuinely require it.

### Responsive QA method and repair ledger

The Browser plugin was unavailable in the build environment. Final rendered QA used Chrome DevTools Protocol on an allowed `about:blank` page, then injected the **exact embedded HTML template, every CSS asset, both locale dictionaries, and the real workspace JavaScript**. This avoids the managed Chromium policy that blocks localhost navigation without changing the assets under test. Separate Go integration tests still verify the real localhost routes, asset content types, and executable embedding.

Material repairs verified:

| Previous issue | Alpha 6.5.1 repair |
|---|---|
| long pill navigation consumed width | grouped collapsible sidebar and mobile drawer |
| dashboard required browser zoom-out | fluid grids, `min-width: 0`, clamp-based spacing/type |
| tables forced body overflow | column priority plus card-row mode below 900px |
| Explorer filters were too dense | narrow-viewport filter drawer |
| technical evidence filled the first viewport | progressive disclosure and top-N history |
| Indonesian labels broke collapsed navigation | localization moved to child labels so icon/label structure survives |
| one fixed density | locally persisted Comfortable/Compact modes |

Intentional deviation: raw evidence tables may retain an **internal** horizontal scroller because hiding audit columns would reduce traceability. The page body itself remains overflow-free.

## 1. Alpha 6.5 purpose

Alpha 6.5 introduces a **Signal Integrity layer** before rankings or production recommendations are published. Public Envato API observations are normalized into market surfaces, taxonomy segments, stratified sample audits, quality grades, hierarchical indices, temporal stages, and complete score provenance.

## 2. Market Surface versus Catalog

A Market Surface explains **where an item was observed**:

- New
- Random New
- Popular
- Featured
- Search
- Category
- Similar

A Catalog explains **which market the item belongs to**:

```text
Site
→ Content Type
→ Catalog
→ Product Type
→ Use Case
→ Topic / Style
→ Product
```

Surface labels must never appear as catalog rankings.

## 3. Hierarchical indices

Alpha 6.5 publishes separate indices for:

- Global observed market;
- Site;
- Content type;
- Catalog;
- Product type;
- Use case.

This prevents activity in one large site or medium from silently becoming a trend claim for an unrelated catalog.

## 4. Volume-weighted and equal-sector indices

The volume-weighted index measures where most observed activity is concentrated, with peer caps that prevent silent domination.

The equal-sector index measures whether eligible sectors move together.

Divergence is retained as evidence rather than averaged away.

## 5. Honest temporal stages

| Comparable Runs | Stage |
|---:|---|
| 1 | Current Composition |
| 2 | Movement Indication |
| 3–5 | Preliminary Trend |
| 6+ | Established Trend |
| 12+ periodic runs | Seasonality Candidate |

A first run cannot be presented as a market direction.

## 6. Coverage, Confidence, and Data Quality

Coverage measures completion of the declared research plan, not coverage of the complete Envato database.

Confidence measures evidence consistency.

Data Quality grades sample balance, unique-product ratio, taxonomy confidence, author coverage, source reliability, history depth, surface diversity, and stratum completion. A high-coverage but severely imbalanced sample can still receive Grade C or D.

## 7. Stratified sampling and sample audit

Requests are allocated across bounded site/catalog/surface strata. Category bootstrap requests are subtracted before remaining budget allocation. The audit preserves distributions, duplicate rates, unique-product ratio, taxonomy coverage, reliability, failed strata, and reason codes.

## 8. Score provenance

Every published score can be traced to:

- current and previous run;
- planner, sampling, taxonomy, weighting, and model versions;
- original and effective weights;
- component contributions;
- missing components and fallback rules;
- sample distributions;
- Coverage, Confidence, and Data Quality;
- reason codes and generation time.

## 9. Migration and compatibility

Alpha 6.4 real observations and temporal records remain intact. Surface-derived legacy catalogs are moved out of ranking without deleting products or history. Ambiguous rows enter a review queue. Legacy snapshots remain readable but non-comparable until they can be recalculated under Alpha 6.5 contracts.

Two runs are comparable only when their planner, mode, sampling schema, taxonomy, enabled sources/surfaces, stratum targets, weighting version, and category-depth policy match.

## 10. Security and operational constraints

Alpha 6.5 is:

- local-first;
- no AI;
- no synthetic market data;
- no stored personal token;
- no raw API payload archive;
- no private endpoint access;
- no earnings prediction;
- no claim of access to Envato's internal algorithm.

Product titles, public author names, source URLs, IDs, and source metadata remain in their original language.

## 11. Upgrade workflow

1. Close all older Market Signal Lab processes.
2. Extract Alpha 6.5.1 into a new folder.
3. Start `Market Signal Lab.exe`.
4. Confirm the version is `v0.3 Alpha 6.5.1`.
5. Configure the Envato token in Settings.
6. Run a consistent Quick, Standard, or Deep map.
7. Review **Signal Quality** before trusting any ranking.
8. Use **Why this score?** to audit important decisions.
9. Repeat comparable runs over time before interpreting direction stages.

## 12. Powered by Envato API

The private preview displays textual `Powered by Envato API` attribution. This project is independent and is not an Envato product.

---

## Build information

```text
Application: Market Signal Lab
Version: 0.3.0-alpha.6.5.1
Runtime: Go
Distribution: Windows x64 GUI
Storage: local append-only JSONL ledgers and replaceable live metadata cache
Languages: English (default/fallback), Indonesia
AI: disabled / not required
Synthetic runtime data: none
```
