# Market Signal Lab

**Local-first Observed Market Intelligence for Envato**
Windows-focused · private/internal use · English + Indonesia · no AI dependency · no synthetic runtime market data

Market Signal Lab (MSL) adalah alat analisis pasar yang dibangun untuk membantu membaca **arah tren market Envato, perubahan exposure/ranking, dan insight produk** dari observasi pasar yang dapat diaudit.

MSL tidak menganggap satu halaman `Popular`, satu browser, satu akun, atau satu snapshot sebagai kebenaran tunggal. Sistem menyimpan observasi lintas waktu dan lintas konteks, lalu membandingkan bukti tersebut untuk mencari pola, movement, dan arah tren yang lebih dapat dipertanggungjawabkan.

> MSL bukan produk Envato dan tidak mengklaim akses ke source code algoritma internal, data privat, demand internal, earning kompetitor, probabilitas download, ataupun probabilitas acceptance. Setiap sinyal harus mempunyai scope dan evidence yang jelas.

## Tujuan

MSL dibangun untuk mengurangi keputusan produksi yang hanya bergantung pada tebakan tanpa analisis atau satu tampilan market. Fokus utamanya adalah menjawab pertanyaan seperti:

- ke mana arah tren market Envato sedang bergerak berdasarkan evidence yang tersedia;
- katalog, kategori, product type, tema, gaya, use case, atau pola apa yang menunjukkan perubahan bermakna;
- apakah sebuah sinyal hanya menggambarkan komposisi saat ini atau sudah mempunyai evidence movement/trend;
- apakah sebuah sinyal stabil lintas surface dan lintas waktu;
- seberapa ambigu atau konsisten ranking yang sedang terlihat;
- seberapa kuat kualitas data yang mendukung suatu trend inference atau product insight;
- bagaimana pola hari ini dibandingkan dengan history yang sudah terkumpul;
- insight apa yang membantu meningkatkan relevansi, positioning, dan kualitas produk yang kita buat.

`Trend Direction Inference` berarti perkiraan analitis tentang arah tren berdasarkan evidence terukur. Ini bukan tebakan acak dan tidak boleh mengklaim kepastian yang lebih kuat daripada bukti yang tersedia.

MSL **bukan** sistem market-entry timing atau trading. MSL tidak ditujukan untuk menjawab "kapan masuk ke pasar", membuat entry/exit signal, atau memakai semantik buy/sell/hold.

## Cara kerja

```text
Observed Envato Market Evidence
        ↓
Market Mapping + History
        ↓
Normalization & Segmentation
        ↓
Evidence Quality + Signal Eligibility
        ↓
Movement / Ranking / Consensus Analysis
        ↓
Trend Direction Inference
        ↓
Catalog / Product Trend Ranking
        ↓
Product Insight + Quality Benchmarking
```

Data yang berhasil diamati disimpan secara lokal sebagai history append-only sehingga perubahan dan pergerakan market dapat dibandingkan dari waktu ke waktu.

## Kemampuan inti

Secara ringkas, MSL menyediakan:

- Market Autopilot untuk pemetaan pasar teramati;
- Catalog dan Product Directions;
- Cross-Surface Consensus dan Market Ambiguity;
- Ranking Volatility dan Observed Selection Probability;
- Coverage, Confidence, Data Quality, EvidenceStage, dan SignalEligibility sesuai kontrak versi yang berlaku;
- score provenance / penjelasan mengapa sebuah skor atau insight muncul;
- temporal history produk dan market-map runs;
- live scan progress, telemetry, dan adaptive ETA berdasarkan pekerjaan nyata;
- Rust sebagai production analytics plane untuk kernel yang sudah dimigrasikan, dengan Go sebagai Windows control/security/provenance plane;
- Python sebagai future offline Quant Research / Calibration Lab;
- C++ hanya sebagai accelerator opsional jika profiling membuktikan hotspot yang layak;
- Advanced Research untuk validasi evidence dan model lebih dalam;
- Browser Capture Companion yang explicit dan preview-first;
- English dan Indonesia.

Detail lengkap setiap perubahan tidak ditempatkan di README. Lihat **GitHub Releases** untuk informasi versi, fitur baru, perubahan perilaku, bug, fix, known issues, upgrade notes, build, dan checksum.

## Filosofi analisis

MSL menggunakan konsep **Observed Market**, bukan klaim mengetahui algoritma internal Envato. Beberapa prinsip utamanya:

- Market Surface bukan Catalog.
- Satu scan hanya menggambarkan komposisi saat ini, bukan otomatis sebuah tren.
- History yang comparable diperlukan sebelum menyimpulkan pergerakan.
- Public, subscriber, API, dan konteks lain dapat menunjukkan ranking berbeda.
- Perbedaan tersebut diperlakukan sebagai data untuk diukur, bukan dianggap error.
- Unknown evidence bukan neutral evidence; sinyal yang tidak didukung tidak boleh dibuat seolah valid.
- Confidence tidak boleh mengalahkan EvidenceStage atau SignalEligibility.
- Legacy `Opportunity` / `OpportunityScore` yang masih ada demi compatibility harus dibaca sebagai legacy product-insight/ranking score, **bukan** rekomendasi kapan masuk ke pasar.
- Product Insight, Confidence, Coverage, dan Data Quality tidak boleh dicampur menjadi satu makna.

Backtesting, calibration, atau evaluasi terhadap later observed Envato outcomes boleh digunakan untuk menguji apakah trend-direction inference mempunyai daya jelaskan/prediksi yang terukur. Pengujian tersebut tetap merupakan market-intelligence research, bukan trading atau market-entry timing.

## Privacy & local-first

Aplikasi dan history utama berjalan secara lokal.

Repository **tidak boleh** menyimpan:

```text
Envato personal token
Authorization headers
cookies / browser storage
%LOCALAPPDATA%\MarketSignalLab\ database
raw account session
local real scan history
private runtime logs containing credentials
```

Worker analytics hanya boleh menerima data matematis/ter-normalisasi yang memang dibutuhkan untuk perhitungan dan tidak boleh menerima credential Envato atau session browser.

## Local runtime

```text
Dashboard: http://127.0.0.1:17771/
Data:      %LOCALAPPDATA%\MarketSignalLab\
```

## Dokumentasi

Struktur dokumentasi repository:

```text
docs/superpowers/specs/  design contracts
docs/superpowers/plans/  implementation plans
docs/qa/                 verification and QA reports
docs/checkpoints/        continuation checkpoints + permanent guardrails
docs/project/            permanent project/repository policies
docs/release-history/    archived release-specific documentation
```

Canonical purpose guardrail:

```text
docs/checkpoints/PERMANENT_MSL_PURPOSE_GUARDRAIL.md
```

Jika historical plan/spec menggunakan nama compatibility yang terdengar lebih luas daripada tujuan produk saat ini, purpose guardrail di atas mengatur interpretasi semantiknya kecuali dokumen tersebut sedang merekam exact legacy behavior sebagai regression evidence.

**README menjelaskan produknya. GitHub Releases menjelaskan versi dan perubahannya. Docs menjelaskan desain, plan, QA, arsitektur, dan guardrail.**

## Project Guardrail — verbatim

> hal yang perlu di luruskan untuk alat yang kita bangun bukan untuk melakukan hal ilegal atau hacking web, melainkan hanya menganalisa arah market, membaca algoritma market, untuk mengetahui katalog, produk, dan nama pemilik produknya bukan berarti meng-hack orang tersebut melainkan melihat insight baru dan mengikuti alur trends, setiap katalog yang sedang hype di masukan ke daftar ranking Trends Katalog, dan produk apa yang bagus menjadi Insight agar aku tidak salah membuat produk, bukan bermaksud mencuri ide produk melainkan untuk bersaing tentang kualitas dan mengukur kualitas antara produkku dan orang lain.
