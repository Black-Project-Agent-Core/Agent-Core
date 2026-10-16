> **Historical document, superseded for current Memory placement on 16 October 2026.** Preserve the dated evidence below; do not recreate its old SubProject, MCP-owned memory files, or storage locations. Current ownership and installation status: [Memory consolidation](../../CONSOLIDATION.md).

# Agent Core Memory Evolution Implementation Plan

> **Pelaksanaan setelah pengguna menyetujui rencana:** jalankan task, test, review, dan commit secara bertahap. Checkbox di bawah adalah pekerjaan mendatang, bukan bukti pekerjaan selesai. Jangan mulai implementasi hanya karena dokumen ini sudah dipush.

**Goal:** membuat pengalaman engineering yang tersimpan bisa dipakai kembali oleh controller AI baru, dengan pengungkapan konteks secukupnya, bukti yang bisa dilacak, dan sejarah penting yang tetap utuh.

**Architecture:** pertahankan canonical Markdown, retrieval, lock, transaksi, provenance, dan ledger yang sudah ada. Tambahkan kontrak controller yang compact-first, episode milik task, capsule deterministik, promosi berbasis bukti, serta semantics temporal/epistemic. Arsip sumber menjadi dasar pemulihan; ringkasan dan index tetap turunan yang bisa dibangun ulang.

**Tech Stack:** TypeScript ESM, Node.js `>=24.15.0`, filesystem lokal, `proper-lockfile`, `zod`, dan Vitest sesuai package baseline. Tidak ada database, SDK model, tokenizer, atau layanan cloud baru yang diwajibkan oleh rencana ini.

**Spec:** bagian 1–10 dokumen ini adalah spesifikasi desain usulan; bagian 11–15 adalah rencana pelaksanaan, evaluasi, traceability, dan gerbang penerimaan. Seluruhnya perlu direview bersama, bukan mengambil daftar task tanpa invariants-nya.

**Status:** REVIEW ONLY, 2026-10-07 UTC. Baseline source yang dibaca: `dbaab11a8ed922406ed2085ba8822d54bf79b5b4`, branch `main`, 56 tracked files. Working tree bersih sebelum dokumen dibuat. Pemeriksaan pada tahap ini bersifat statis; install, build, product execution, benchmark, dan test **belum dijalankan**. Hasil PASS yang pernah dilaporkan pada ekstraksi sebelumnya bukan hasil verifikasi Linux baru.

## Global Constraints

- Produk yang dikembangkan adalah engine Memory standalone; isi memory pengguna, credential, runtime, log pribadi, dan transcript percakapan tidak masuk repository.
- Instruksi terbaru untuk pekerjaan ini: simpan rencana agar arah dapat direview dahulu. Implementasi source menunggu review.
- Pengalaman penting, keberhasilan, keputusan, kegagalan yang bermakna, dan evidence yang diizinkan harus tetap dapat ditelusuri setelah compaction, consolidation, supersession, dan archival.
- Archive tidak memanggil delete. Compaction hanya mengubah representasi yang ditampilkan; bukan menghapus pengalaman.
- Memory bersifat advisory. Tidak ada record, label `verified`, pin, receipt, atau proposal yang menciptakan izin tindakan baru.
- Controller identity, session identity, task identity, episode identity, workspace identity, dan pemilik store adalah hal berbeda.
- Operasi lokal tanpa embedder dan tanpa API key harus tetap berguna. Model opsional tidak boleh menjadi syarat membaca, melanjutkan task, atau menyimpan bukti.
- Jaminan budget berlaku pada payload publik yang benar-benar diserialisasi; angka token tanpa tokenizer spesifik harus ditulis sebagai estimasi.
- Tidak ada klaim menaikkan IQ intrinsik model, mengakses reasoning internal, mengetahui sisa context window, atau mengompresi history yang sudah dikelola ChatGPT.
- Baca format lama, jangan hilangkan field baru saat roundtrip, dan jangan menjanjikan binary lama aman menulis store format baru.
- Linux menjadi lingkungan verifikasi pertama setelah implementasi diizinkan. Klaim Windows membutuhkan bukti Windows tersendiri.
- Tidak ada release, deploy, perubahan credential, atau mutasi monolith Agent Core yang tersirat oleh rencana ini.

## Review Focus

Lima risiko terpenting berikut memiliki test eksplisit pada task yang disebut:

1. Payload terlihat compact tetapi menyelundupkan full record di field lain: budget harus diuji pada JSON final, termasuk Unicode dan metadata (T1, E11–E13).
2. Dua controller menulis saat capsule/consolidation sedang disiapkan: stale proposal tidak boleh menimpa state baru, dan retry tidak boleh menggandakan event (T2, T3, T5; E05, E09, E15).
3. Archive, expiry, atau rotasi ledger menghilangkan satu-satunya bukti keberhasilan: bukti penting dan revisinya harus tetap reachable setelah restart (T2, T4, T5; E07, E16, E28).
4. Informasi historis dibuang oleh filter “sekarang” sebelum query `asOf`: valid-time dan recorded-time harus dibedakan, termasuk ingestion terbalik (T6; E18–E23).
5. Instruksi lama atau source berbahaya berubah menjadi authority karena sering dipakai: source role, verifikasi, penggunaan, dan izin tetap terpisah (T7, T8; E24–E27).

## 1. Baca ini dahulu: lima keputusan utama

**Klarifikasi scope terbaru:** checkout ini adalah source engine, bukan production memory store. Pengguna tidak meminta mempertahankan/memigrasikan data personal insidental yang mungkin ada pada salinan kerja; backup data tersebut dikelola terpisah. Tidak ada cleanup atau migration data personal pada task docs ini. Preservation dalam plan adalah perilaku engine untuk pengalaman yang dicatat ke depan; compatibility dan recovery diuji memakai synthetic v1/v2 fixtures. Store baru yang kosong adalah jalur implementasi pertama, sehingga migration tooling bukan hambatan memulai fitur.

Semua default berikut adalah **rekomendasi untuk review**, belum keputusan yang dianggap disetujui.

| Keputusan | Default yang direkomendasikan | Dampak praktis |
|---|---|---|
| D1. Apa hasil pertama yang benar-benar terasa? | Progressive disclosure compact-first melalui API baru; API `search()` lama tetap tersedia | Controller baru menerima daftar ringkas yang aman diserialisasi, lalu membuka detail tertentu. Tidak menunggu seluruh arsitektur selesai |
| D2. Apa yang dipertahankan? | Seluruh episode yang diterima dan bukti yang diizinkan, beserta revision lineage; archive tidak punya TTL penghapusan otomatis | Storage bertambah. Pertumbuhan dikelola lewat dedup byte, paging, dan turunan kecil; penghapusan privasi menjadi workflow terpisah |
| D3. Siapa menulis capsule? | Controller menyatakan working state terstruktur; engine memvalidasi dan merender secara deterministik | Offline dan lintas-model; engine tidak mengarang ringkasan semantik. Adapter LLM hanya proposal opsional kemudian |
| D4. Kapan kandidat menjadi pengetahuan? | Promosi eksplisit melalui preview → validate → CAS commit; dedup identik boleh otomatis jika policy host mengizinkan | Tidak menganggap semua observation sebagai fakta. Perubahan keputusan proyek atau konflik substantif perlu review yang sesuai |
| D5. Bagaimana kompatibilitas dijaga? | Read v1 + v2; aktivasi fitur tulis pada root v2 baru; copy-upgrade hanya bila nanti ada store v1 yang memang perlu dipindahkan | Tidak perlu migrasi data personal sekarang. Fixture membuktikan kompatibilitas; binary lama tidak boleh menjadi co-writer store v2 |

Keputusan lain beserta tradeoff tercantum lengkap pada bagian 13. Bila lima ini belum selaras dengan tujuan pengguna, revisi dokumen sebelum task implementasi dimulai.

## 2. Tujuan, perubahan arah, dan batas produk

### 2.1 Yang ingin dicapai

Agent Core Memory harus membantu controller masa depan memahami arah proyek, alasan desain, metode yang pernah berhasil, kegagalan dan kondisi pemicunya, keadaan historis, serta pekerjaan yang masih terbuka. Model AI boleh berganti; pengalaman yang sudah dicatat tetap dapat ditemukan dan dipakai.

Kualitas pengalaman yang dapat digunakan lebih penting daripada jumlah note. Consolidation menghubungkan pengalaman baru dengan benang lama, mempertahankan perbedaan kondisi, dan membuat knowledge aktif lebih ringkas. Keberhasilan perlu menyimpan **apa, mengapa, bagaimana, batas penerapan, hasil pemeriksaan, dan kapan boleh dipakai lagi**. Kegagalan perlu menyimpan observasi, percobaan, sebab yang benar-benar diketahui atau masih dugaan, koreksi, dan bukti.

Koreksi terakhir terhadap ide pembersihan menjadi dasar desain: mengurangi paparan aktif tidak boleh menghilangkan sejarah penting. Frasa lama seperti “discard noise”, “clear staging”, atau “raw log boleh dibuang” tidak dipakai sebagai izin purge. Jika data ditolak saat capture karena rahasia atau kebijakan akses, engine mencatat ketidaktersediaannya secara aman; prinsip preservation bukan alasan menangkap data yang tidak diizinkan.

### 2.2 Lima jalur, satu workflow

1. **Progressive disclosure:** cari ringkasan/abstract terlebih dahulu, buka record, episode, dan evidence ketika diperlukan.
2. **Episodic staging:** action, observation, keputusan, kegagalan, dan keberhasilan berada dalam episode provisional sebelum dipromosikan.
3. **External task capsule:** state eksternal kecil untuk melanjutkan pekerjaan tanpa membaca seluruh riwayat.
4. **Temporal dan epistemic semantics:** bedakan sifat pernyataan, kekuatan buktinya, kapan berlaku, dan apa yang mengoreksinya.
5. **Lifecycle evals:** buktikan kualitas capture → consolidate → retrieve → disclose → use → outcome → archive.

Urutan tersebut adalah prioritas implementasi, bukan lima sistem baru yang terpisah. Evaluasi dan safety ikut setiap tahap; bukan ditambahkan setelah semuanya selesai.

### 2.3 Visi jangka panjang yang dipertahankan

Episodic, semantic, procedural, causal, temporal, prospective, operational autobiography, dan metamemory adalah cara melihat pengetahuan, bukan alasan membuat delapan database. Episode menyediakan kronologi; lesson/procedure menyediakan applicability, langkah, avoidance, dan verification; hubungan dan provenance menyediakan konteks. Causal chain hanya disebut terbukti bila ada dukungan yang sesuai. Future relevance boleh direkam tanpa menjalankan automation.

Intent-aware retrieval, causal ranking, entity memory, reranker terkalibrasi, skill extraction, dan kompresi berbantuan model dapat dievaluasi belakangan bila ada gap yang terukur. “Memory entropy” atau formula nilai knowledge dari brainstorming belum merupakan metrik ilmiah atau scoring function yang disetujui. Fitur donor harus menjelaskan gap, owner, manfaat, biaya, dan test pembeda.

## 3. Baseline aktual: yang ada, parsial, dan belum ada

Rujukan file relatif berikut merujuk baseline di atas. “Ada” berarti teridentifikasi pada source, bukan telah lolos eksekusi pada mesin ini.

| Area / owner | Perilaku yang terverifikasi secara statis | Implikasi rencana |
|---|---|---|
| [standalone.ts](../../../../SubProject/agent-core-memory/src/standalone.ts), [index.ts](../../../../SubProject/agent-core-memory/src/index.ts) | `initializeStandaloneMemory(options = {}): Promise<MemoryService>`; `baseDir`, `memoryRoot`, `embedder`, `foundationTitle`; membuat foundation bila belum ada | Pertahankan entry point. Tambahan opsi harus opsional |
| [service.ts](../../../../SubProject/agent-core-memory/src/memory/service.ts) | `MemoryService.initialize(baseDir, memoryRoot?, embedder?)`; orchestration remember/read/update/search/batch/link lifecycle/transfer/ledger | Tambah facade kecil dan domain owner, jangan menumpuk semua logic baru ke service yang sudah 1.404 baris |
| [store.ts](../../../../SubProject/agent-core-memory/src/memory/store.ts), [transaction.ts](../../../../SubProject/agent-core-memory/src/memory/transaction.ts), [lock.ts](../../../../SubProject/agent-core-memory/src/memory/lock.ts) | File Markdown; shared process lock; `mutate`, `create`, `batch`; journal dan expected file fingerprint | Reuse primitives; perlu snapshot konsisten untuk state lintas-file, recovery di bawah lock, dan CAS proposal |
| [retrieval.ts](../../../../SubProject/agent-core-memory/src/memory/retrieval.ts) | Legacy, BM25, fusion/RRF, neighbor expansion, semantic opsional, dedup, scope workspace | Jangan mengganti ranking dahulu. Perbaiki selection scope dan presentation |
| [search-projection.ts](../../../../SubProject/agent-core-memory/src/memory/search-projection.ts) | Projection full → compact → minimal → head/tail preview; default service 20.000 karakter, clamp 500–100.000 | Sudah ada budgeting, tetapi belum compact-first; nama `compact` masih dapat berisi body penuh |
| Service search return | `DeliveredMemorySearchResult[]` masih menyertakan `record` lengkap. Formatter khusus membentuk payload kecil, tetapi tidak diekspor dari root package | JSON return service tidak otomatis memenuhi budget projection. Facade baru harus mengeluarkan DTO tanpa record tersembunyi |
| [consolidation.ts](../../../../SubProject/agent-core-memory/src/memory/consolidation.ts) | `findConsolidationCandidates(records, index, options)` menghasilkan `review-merge`/`review-overlap`; `consolidate()` tidak menggabungkan source | Candidate finder dapat dipakai; staged promotion/atomic merge belum tersedia. Scope belum terdapat dalam options finder |
| [types.ts](../../../../SubProject/agent-core-memory/src/memory/types.ts), [relations.ts](../../../../SubProject/agent-core-memory/src/memory/relations.ts) | Schema record v1; `validFrom`, `validTo`, `referenceTime`, `evidenceRefs` pada link; link aktif pada interval `[from,to)` | Belum ada record-level epistemic/validity atau episode. `asOf` belum berarti historical fact query |
| Search visibility | Service menghapus kandidat currently superseded/expired/forgotten memakai waktu sekarang sebelum lower-level retrieval memakai `asOf` | Query sejarah perlu selection sendiri; jangan sekadar meneruskan parameter lama |
| [feedback.ts](../../../../SubProject/agent-core-memory/src/memory/feedback.ts), [retirement.ts](../../../../SubProject/agent-core-memory/src/memory/retirement.ts) | Forget/restore mengubah visibility; retirement review preview-only; `delete()` dan batch delete menghapus note dan memperbaiki incoming links | Forget bukan archive lengkap; delete memang destruktif. Workflow baru tidak boleh memanggilnya sebagai retirement |
| [revisions.ts](../../../../SubProject/agent-core-memory/src/memory/revisions.ts), note format | Revisions maksimal delapan, target ukuran sekitar 1 MB; hanya body change; evolution history maksimal 64 | Bukan arsip sejarah lengkap. Satu snapshot besar masih dapat melampaui target ukuran; metadata-only history perlu owner berbeda |
| [source-snapshot.ts](../../../../SubProject/agent-core-memory/src/memory/source-snapshot.ts), [provenance.ts](../../../../SubProject/agent-core-memory/src/memory/provenance.ts) | Snapshot menyimpan digest/ukuran, bukan salinan byte. Ada policy/path guard, identity repo/worktree, status current/changed/unavailable | Tidak dapat merekonstruksi source yang hilang dari digest saja. Arsip evidence harus eksplisit dan tetap mengikuti policy |
| [retrieval-ledger.ts](../../../../SubProject/agent-core-memory/src/memory/retrieval-ledger.ts), [workflow-evidence.ts](../../../../SubProject/agent-core-memory/src/learning/workflow-evidence.ts) | Attempt/exposure/use receipt, digest binding, dedup receipt, outcome bisa unavailable; ledger 4.000 → 3.000 | Fondasi evaluasi berguna; bukan unlimited archive atau bukti kausal keberhasilan |
| [workflow-verifier.ts](../../../../SubProject/agent-core-memory/src/learning/workflow-verifier.ts) | Host-owned verification manifests; deterministic report recheck; byte resolution tidak membuktikan semantic support | Jangan biarkan controller mendaftarkan “oracle” lalu memverifikasi klaimnya sendiri |
| [transfer.ts](../../../../SubProject/agent-core-memory/src/memory/transfer.ts) | Transfer/1 memilih field tertentu, maksimum 500 records; tidak mengekspor pin, revisions, lifecycle, ledger, atau timestamp asli lengkap | Bukan backup lengkap. Schema baru memerlukan transfer/2 terpisah dan roundtrip test |
| [tests](../../../../SubProject/agent-core-memory/tests), package | Tiga test files: integrity, phase8–10, standalone smoke. Manifest mencatat 45 source closure files; package memiliki build/test/verify; tidak ada lockfile tracked pada baseline | Jumlah/hasil historis tidak menggantikan baseline Linux baru. Dependency resolution dan lockfile perlu ditetapkan di T0 |

### 3.1 Hazards yang harus tetap terlihat

- `loadAll()` dan beberapa read berjalan tanpa mutation lock; recovery saat initialize juga belum dibungkus lock itu. Journal bukan bukti snapshot publik lintas-file sudah linearizable.
- Index refresh serta feedback reconciliation berada setelah canonical commit. Gagal reindex tidak boleh dianggap canonical commit gagal, kemudian diulang dan menghasilkan duplikasi.
- `feedback.reset()`/`reconcile()` dan batas 512 feedback records/64 events dapat memangkas metadata lama. Ledger dan recent revisions boleh bounded sebagai telemetry/cache; bukti yang diperlukan pengalaman tidak boleh bergantung hanya padanya.
- Link dinormalisasi berdasarkan pasangan target/type, maksimal 32 links dan 16 evidence refs. Validity duplicate bisa digabung. Jangan menyimpan seluruh lineage atau episode temporal berbeda hanya pada array ini.
- Workspace filter adalah scoping data, bukan sistem autentikasi multi-tenant. Foundation pinned saat ini lintas-filter. Facade harus memakai root/identity yang dibatasi host; pengguna berbeda memakai root berbeda.
- Embedder yang dipasang juga mengaktifkan automatic metadata/related-link evolution pada beberapa write. Pengujian harus membedakan efek retrieval dan efek write ini.

## 4. Cookbook: apa yang diambil, diadaptasi, dan tidak diambil

Referensi berikut adalah sumber pola, bukan ketergantungan runtime atau jaminan bahwa demo cocok langsung. Detail implikasi Agent Core di bawah merupakan keputusan desain usulan. Tautan dipertahankan agar review dapat kembali ke sumber resmi.

### C1. Context personalization

[OpenAI Cookbook: Context Personalization](https://developers.openai.com/cookbook/examples/agents_sdk/context_personalization)

Pola sumber: catatan sesi menampung kandidat, consolidation memindahkannya ke memory reusable; evaluasi mencakup capture, consolidation, dan injection. Capture mengutamakan informasi eksplisit dan berguna; memory tidak mengalahkan intent terkini.

**Adopsi:** staging yang terlihat statusnya; gate sebelum promosi; test duplicate, conflict, no-invention, dan precedence pada tiga boundary. **Adaptasi:** scope menjadi task/episode lintas-controller, bukan semata session. Consolidation menghasilkan diff berbukti dan commit transaksional. **Tidak disalin:** clear buffer destruktif, recency-wins universal, replacement global list setelah parsing kasar, atau fallback append kandidat ketika hasil model malformed. Pada engine ini parse gagal berarti canonical tidak berubah dan episode tetap ada. Konflik harus membedakan ruang lingkup, jenis klaim, dan bukti; archive baru terjadi setelah commit promotion terkonfirmasi. Relevansi implementasi: T3, T5, T7, T8.

### C2. Reliable agents: memory compaction

[OpenAI Cookbook: Building Reliable Agents with Memory and Compaction](https://developers.openai.com/cookbook/examples/agents_sdk/building_reliable_agents_memory_compaction?utm_source=chatgpt.com)

Pola sumber membedakan state run aktif dari lesson lintas-run; compaction dapat dipicu pressure, threshold, atau checkpoint aplikasi. Artifact dan working state harus tetap bisa dipakai. Contoh live memiliki kebutuhan runtime/credential sendiri.

**Adopsi:** checkpoint pada boundary bermakna dan pemisahan compaction dari consolidation. **Adaptasi:** Agent Core hanya mengendalikan state eksternal yang ia simpan/kirim. Capsule tidak menghapus pesan lama dalam context ChatGPT, tidak membaca sisa token internal, dan tidak mengatur reasoning model. **Tidak disalin:** asumsi runtime engine memiliki agent session, atau larangan menyimpan case findings yang khusus untuk skenario investigasi contoh. Knowledge proyek yang diperiksa justru perlu dipertahankan di sini. Ukur total output dan keberhasilan continuation, termasuk biaya read tambahan. Relevansi: T4, T8.

### C3. Short-term session memory

[OpenAI Cookbook: Session Memory](https://developers.openai.com/cookbook/examples/agents_sdk/session_memory?utm_source=chatgpt.com)

Pola sumber membandingkan recent-turn trimming dengan summarization plus recent turns. Ia membahas distortion, akumulasi error, latency, auditability, serta state summary berisi issue, percobaan, hasil, identifiers, milestones, dan next action. Proses summarization mengambil snapshot, melepas lock selama pekerjaan lambat, lalu memeriksa ulang state.

**Adopsi:** struktur operational state dan snapshot–compute–CAS. **Adaptasi:** capsule deterministik/controller-authored dahulu; original episode tetap immutable dan dapat dibuka. **Tidak disalin:** last-N trimming sebagai kebijakan menghapus pengalaman, batas jumlah turn yang universal, atau ketergantungan implementasi Python. Unknown tetap unknown; output model tidak otomatis authoritative. Generasi lambat yang memakai revision lama harus gagal apply bila event baru datang. Relevansi: T3–T5, E12, E14–E15.

### C4. Sandboxes dan progressive disclosure

[OpenAI Agents guide: Sandboxes](https://developers.openai.com/api/docs/guides/agents/sandboxes)

Pola sumber memisahkan conversation session dari reusable sandbox memory. Paparan awal berupa summary, kemudian handbook/detail rollout dibuka sesuai kebutuhan; persistent memory directory menentukan reuse lintas-run.

**Adopsi:** discovery ringan dengan jalan ekspansi yang eksplisit. **Adaptasi:** vocabulary bernama map, abstract, record, episode, evidence; task capsule adalah working state sendiri. Raw evidence tier di sini merupakan kebutuhan desain Agent Core, bukan klaim bahwa guide mensyaratkan empat tingkat universal. **Tidak disalin:** asumsi injection otomatis oleh harness atau session-close callback selalu datang. Controller eksternal perlu kontrak tool yang benar-benar dipakai; crash harus dapat dilanjutkan tanpa close. Identitas sandbox, conversation, task, dan user jangan disatukan. Relevansi: T1, T3, T9.

### C5. Temporal agents with knowledge graphs

[OpenAI Cookbook: Temporal Agents](https://developers.openai.com/cookbook/examples/partners/temporal_agents_with_knowledge_graphs/temporal_agents)

Pola sumber membedakan atemporal, static historical, dan dynamic statements serta fact, opinion, prediction. Validity dan evidence invalidation diperiksa dengan memperhatikan hubungan antarevent, termasuk urutan masuk yang berbeda. Contoh juga mengakui keterbatasan date disambiguation dan intra-batch/refinement.

**Adopsi:** validity berbeda dari ingestion time; invalidation memiliki evidence; dua arah konflik diperiksa. **Adaptasi:** tambah unknown konservatif; observation/hypothesis adalah perluasan Agent Core; decision/instruction berada pada record kind, sehingga RULE tidak disisipkan ke enum epistemic secara ambigu. **Tidak disalin:** graph database/LLM stack, inference tanggal diam-diam, atau model yang membatalkan fakta hanya karena similarity/recency. Semantics dan boundary `[from,to)` perlu test sendiri; diagram bukan bukti. Relevansi: T6.

### C6. Oracle durable findings

[OpenAI Cookbook: Deep Research with Durable Memory](https://developers.openai.com/cookbook/examples/vector_databases/oracle_db/deep_research_openai_agents)

Pola sumber memisahkan SDK session replay dari curated findings melalui memory tool, walau keduanya bisa memakai database yang sama. Fresh-session recall diuji terhadap store yang sama.

**Adopsi:** intentional promotion; session JSON tidak otomatis durable finding; uji continuation dari controller baru. **Adaptasi:** file-native store, task identity lintas-controller, dan host-scoped root/workspace. **Tidak diambil:** Oracle, skema tabel contoh, atau anggapan file persisten sudah membuktikan controller dapat melanjutkan pekerjaan. Uji harus memeriksa next step, constraints, ketidakpastian, dan penemuan kembali keberhasilan lama. Relevansi: T3, T5, T9.

### C7. Agent improvement loop

[OpenAI Cookbook: Agent Improvement Loop](https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop)

Pola sumber menghubungkan trace, human feedback, eval, diagnosis harness, dan perbaikan. Feedback manusia perlu dibedakan dari insight model; satu demo pass belum menjadi regression suite.

**Adopsi:** fixture berbasis kegagalan nyata yang sudah disanitasi, oracle independen, before/after, dan laporan evidence. **Adaptasi:** gunakan ledger/use receipt/verifier yang sudah ada; simpan evidence penting sebelum rotasi telemetry. **Tidak diambil:** Promptfoo, HALO, atau Codex sebagai dependency engine; hasil eval bukan izin mengedit/deploy proyek secara otomatis. Search hit, penggunaan, hasil terkait, dan causation tetap metrik berbeda. Relevansi: T7–T9.

## 5. Workflow yang diusulkan

### 5.1 Read path: perubahan pertama

1. Host mengikat controller pada root pengguna, workspace, task, dan identitas controller yang sah.
2. `recall()` menyeleksi kandidat di scope tersebut menggunakan ranking yang ada, lalu membuat map/abstract DTO dengan budget kecil.
3. DTO membawa ID, revision, status, dan target ekspansi. Ia tidak membawa `MemoryRecord` tersembunyi.
4. Controller memilih `expand()` untuk satu record, satu episode, atau satu artifact tertentu. Pagination terikat revision; tidak ada fetch seluruh archive tanpa permintaan eksplisit.
5. Payload mencatat disclosure level, freshness, completeness, dan estimasi token. Status unknown/stale tidak ditutupi demi membuat jawaban lebih singkat.

Default recall meliputi active + durable. Archive dapat dicari dengan `retention: 'all'` atau `'archive'`; hasil kosong memberitahu bahwa pencarian archive tersedia, tanpa menyisipkan isinya otomatis. Archived success tetap bisa direkonstruksi melalui lesson → episode → evidence.

### 5.2 Write path: pengalaman menjadi knowledge

1. `startEpisode()` membuat episode milik task; session controller hanyalah metadata.
2. `appendEvent()` merekam action/observation/decision/failure/success/correction beserta source refs dan status bukti. Kandidat belum menjadi canonical fact.
3. `checkpoint()` menerima state terstruktur dan membuat capsule deterministik pada boundary bermakna.
4. `prepareConsolidation()` membandingkan kandidat dengan knowledge scope yang sama; mengeluarkan preview create/amend/merge/supersede/retain/conflict.
5. `applyConsolidation()` hanya menerima plan yang tervalidasi, scope cocok, referensinya nyata, dan revision belum berubah.
6. Satu commit menyimpan canonical result, input snapshots yang harus dipertahankan, promotion receipt, dan status episode terkait. Episode unresolved tidak otomatis ditutup.
7. Index dan ringkasan dibangun ulang setelah commit; kegagalan index dilaporkan degraded, bukan alasan mengulang write yang telah berhasil.
8. Archive mengurangi default exposure; sumber tetap ada. Reuse dan outcome dicatat tanpa mengubah uncertainty menjadi fakta.

### 5.3 Checkpoint yang bermakna

Trigger yang didukung: `phase-complete`, `decision`, `verified-correction`, `state-change`, `milestone`, `failure-resolved`, `budget-pressure`, `handoff`, dan `explicit`. Trigger idempotent memakai operation ID. Berulang kali membaca file atau setiap sepuluh turn tidak otomatis memicu pemanggilan model.

`budget-pressure` berasal dari batas output eksternal yang diatur host, bukan perkiraan hidden context controller. Controller yang lupa mengirim close tetap dapat resume dari checkpoint/event terakhir; diagnosis menunjukkan episode masih open.

## 6. Kontrak data usulan

Nama dan signature pada bagian ini **belum ada di baseline**, kecuali disebut sebagai existing. Ini rancangan yang dapat diubah saat review; implementer tidak perlu menebak hubungan antarmodul. Gunakan validasi strict melalui Zod yang sudah menjadi dependency, bukan menerima object ekstra lalu membuang field diam-diam.

### 6.1 Dimensi yang tidak boleh dicampur

| Dimensi | Nilai usulan | Makna |
|---|---|---|
| Disclosure view | `map`, `abstract`, `record`, `episode`, `evidence` | Representasi yang sedang dikirim |
| Retention tier | `active`, `durable`, `archive` | Default penemuan/paparan; bukan izin delete |
| Episode status | `open`, `paused`, `completed`, `abandoned` | Lifecycle task experience; tidak sama dengan truth |
| Record kind | `note`, `project-direction`, `decision`, `instruction`, `observation`, `lesson`, `procedure` | Fungsi pengetahuan |
| Epistemic type | `unknown`, `fact`, `observation`, `hypothesis`, `prediction`, `opinion` | Jenis klaim; decision/instruction tidak disamakan dengan verified fact |
| Temporal class | `unknown`, `atemporal`, `static`, `dynamic` | Ketergantungan klaim pada waktu |
| Verification | `unverified`, `supported`, `verified` | Status dukungan dengan metode dan evidence; bukan skor popularitas |
| Applicability | `current`, `historical`, `superseded`, `conflicted`, `unknown` | Hasil evaluasi scope + valid-time + relationship |
| Freshness | `current`, `stale`, `unknown` | Kesamaan revision turunan terhadap sumber; bukan kebenaran faktual |

Tidak ada field `level: 0..3` yang menggabungkan retention, disclosure, epistemic, dan hierarchy. Record archive dapat memiliki abstract; task aktif dapat mengacu ke evidence lama; fakta historis yang benar tidak berubah menjadi salah hanya karena tidak berlaku sekarang.

### 6.2 Identitas, revisions, waktu, dan reference

```ts
type Digest = string; // harus sha256:<64 lowercase hex>
type IsoInstant = string; // RFC3339 dengan offset eksplisit; disimpan UTC
type RecordKind = 'note' | 'project-direction' | 'decision' | 'instruction'
  | 'observation' | 'lesson' | 'procedure';
type RetentionTier = 'active' | 'durable' | 'archive';
type EpistemicType = 'unknown' | 'fact' | 'observation'
  | 'hypothesis' | 'prediction' | 'opinion';
type TemporalClass = 'unknown' | 'atemporal' | 'static' | 'dynamic';
type SourceRef = {
  kind: 'memory' | 'episode' | 'event' | 'artifact' | 'manifest';
  id: string;
  revision: Digest;
};
type TimeValue =
  | { precision: 'instant'; value: IsoInstant }
  | { precision: 'day' | 'month' | 'year'; value: string; timezone?: string }
  | { precision: 'unknown'; text?: string };
type Validity =
  | { state: 'unknown' }
  | { state: 'known'; from: TimeValue | null; to: TimeValue | null };
type Verification = {
  status: 'unverified' | 'supported' | 'verified';
  evidence: SourceRef[];
  method?: string;
  verifierRevision?: string;
  verifiedAt?: IsoInstant;
};
type RecordExperience = {
  schemaVersion: 1;
  kind: RecordKind;
  retention: RetentionTier;
  epistemic: EpistemicType;
  temporal: TemporalClass;
  observedAt?: TimeValue;
  validity: Validity;
  verification: Verification;
  sourceRefs: SourceRef[];
};
```

Validation yang mengikat:

- ID memakai batas/karakter aman setara `validateMemoryId`; operation IDs maksimum 200 karakter. Task, workspace, dan controller IDs diikat host, bukan dipercaya dari body model.
- `Digest` revision semantik berbeda dari fingerprint byte transaksi dan content digest feedback lama. Ketiganya tidak boleh saling ditukar.
- Revision semantik record mencakup body, title, metadata relevan, provenance, typed relationships, dan `experience`; mengecualikan retrieval count, last access, serta history event `retrieved`. Membaca memory tidak membuat capsule stale.
- `SourceRef` menunjuk revision tertentu yang tetap dapat dibaca dari archive, bukan string bebas path atau session URL. Revision event/artifact adalah digest object immutable; episode reference menunjuk manifest snapshot tertentu. `manifest` mewakili satu bentuk immutable untuk audit, promotion lineage, atau source-group: `{ schemaVersion: 1, id, purpose, sourceRefs, details }`. Ia dibuka melalui view `evidence` dengan paging; tidak memerlukan ref kind/reader baru untuk setiap jenis audit. `ExpansionPage.sourceRefs` memuat refs pada halaman tersebut, bukan seluruh lineage tak berbatas.
- `recordedAt` adalah waktu write engine. `observedAt` adalah waktu observasi sumber. Validity adalah waktu klaim berlaku. Tidak satu pun otomatis menggantikan yang lain.
- Nilai day/month/year tetap pada presisinya. Tanggal parsial tanpa timezone tidak diam-diam menjadi midnight UTC. `null` pada validity known berarti open-ended; validity unknown berbeda dari open-ended.
- Interval exact menggunakan `[from,to)`. Range terbalik ditolak; range exact kosong tidak dipakai untuk state fact. Event sesaat diwakili observation/time, bukan interval nol yang pura-pura aktif.
- Tidak ada confidence numerik default. `supported` berarti ada dukungan teridentifikasi yang telah dinilai; `verified` membutuhkan validator/hasil pemeriksaan yang dapat direcheck. Digest yang cocok sendirian tidak cukup.

### 6.3 Canonical record v2 dan original-source retention

Usulan: beri nama tipe lama `MemoryRecordV1` tanpa mengubah layout-nya; tambahkan `MemoryRecordV2 = Omit<MemoryRecordV1, 'version'> & { version: 2; experience: RecordExperience }`. Ekspor `MemoryRecord` sebagai union v1/v2 dan accessor yang konservatif untuk record v1. Public method lama tetap ada, tetapi konsumen TypeScript yang mengasumsikan literal `version: 1` perlu mengikuti perubahan versi package. Ini harus tertulis di catatan kompatibilitas.

Dalam store v2, write baru mengisi `experience`; data legacy yang belum diklasifikasi menggunakan `unknown`, `unverified`, `validity: unknown`, dan retention `durable`. Jangan mengklasifikasi content lama dengan model saat migrasi. Foundation pinned tetap khusus dan tidak menjadi pintu promosi authority baru.

Untuk increment pertama, satu record yang dipromosikan mewakili satu klaim/lesson/procedure dengan scope dan validity yang koheren. Note legacy yang mencampur fakta, dugaan, dan banyak periode tetap unknown; jangan memberi label verified pada seluruhnya. Splitting menjadi beberapa record memerlukan proposal dengan mapping setiap hasil ke sumbernya.

Archive menyimpan:

- snapshot canonical sebelum perubahan semantik, termasuk metadata-only change;
- semua event episode yang diterima, urutan, dan input revisions;
- keputusan promotion/supersession/retention beserta before/after refs;
- evidence artifact yang benar-benar diizinkan untuk disalin, dengan byte digest dan origin;
- checkpoint/capsule lama beserta generator version dan dependency refs;
- evidence receipt penting yang dipakai oleh keputusan, terlepas dari rotasi recent telemetry.

Existing recent revisions tetap berguna sebagai fast undo; ia bukan source-of-truth sejarah. Existing source snapshots tetap berguna untuk staleness; metadata digest tidak diganti namanya menjadi salinan source.

`captureEvidence()` di bawah hanya menerima file relatif dalam workspace yang sudah diizinkan atau text eksplisit dari controller. Reuse `memorySourcePathAllowed`, evidence policy, `readEvidenceSnapshot`, dan file-identity checks. Secret, private reasoning, path escape, symlink/reparse alias, serta file di luar policy ditolak. Evidence >2 MiB per dokumen atau >32 MiB per operasi tidak disalin sebagian lalu disebut lengkap. Simpan status `reference-only`/`unavailable` dan alasan; keberadaan original file di luar archive tidak dijamin.

Artifact manifest memiliki `id`, `schemaVersion: 1`, `origin`, `capturedAt`, `availability`, `bodyDigest?`, `bytes?`, `mediaType`, dan `reason?`. Byte yang lolos tersimpan immutable menurut `bodyDigest`; manifest revision adalah digest seluruh manifest. Tidak ada path absolut host yang diekspos melalui API. `SourceRef(kind='artifact')` memakai manifest revision; isi dibaca dan digest-nya diverifikasi lagi saat expansion.

### 6.4 Episode dan working state

```ts
type WorkingItemKind = 'goal' | 'constraint' | 'decision' | 'current-state'
  | 'successful-strategy' | 'failed-path' | 'blocker' | 'obligation'
  | 'next-action' | 'changed-file' | 'important-id';
type WorkingItem = {
  id: string;
  kind: WorkingItemKind;
  text: string;
  critical: boolean;
  state: 'active' | 'resolved';
  sourceRefs: SourceRef[];
  verification: Verification;
};
type WorkingStateChange =
  | { op: 'upsert'; item: WorkingItem }
  | { op: 'resolve'; itemId: string; reason: string; sourceRefs: SourceRef[] };
type EpisodeEventKind = 'action' | 'observation' | 'decision' | 'failure'
  | 'success' | 'correction' | 'checkpoint' | 'status-change';
type EpisodeEvent = {
  schemaVersion: 1;
  id: string;
  episodeId: string;
  sequence: number;
  operationId: string;
  kind: EpisodeEventKind;
  summary: string;
  recordedAt: IsoInstant;
  observedAt?: TimeValue;
  origin: { controllerId: string; sessionId?: string; role: 'controller' | 'tool' | 'user' };
  sourceRefs: SourceRef[];
  stateChanges: WorkingStateChange[];
};
type EpisodeHeader = {
  schemaVersion: 1;
  id: string;
  taskId: string;
  workspaceKey: string;
  startKey: string;
  status: 'open' | 'paused' | 'completed' | 'abandoned';
  revision: number;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
  eventCount: number;
};
```

Episode ID dibuat engine. `startKey` membuat start idempotent dalam task. Default satu episode belum selesai per task; subtask memakai task ID host tersendiri dan referensi eksplisit, bukan tree scheduler baru. Controller baru memakai task/episode yang sama. Dua controller boleh membaca bersamaan; write harus menyatakan `expectedRevision`.

`appendEvent` menerima field kind/summary/time/refs/stateChanges, bukan engine fields seperti sequence/recordedAt/origin role. Host adapter mengikat origin; plugin tidak membiarkan model mengeklaim dirinya `user` atau validator independen. Role metadata mencatat sumber, bukan menetapkan izin.

Satu episode harus memiliki active goal. Working state adalah hasil reducer dari event immutable, bukan rangkuman bebas. `critical: true` tidak boleh diturunkan diam-diam; item critical yang aktif tidak bisa hilang lewat replacement array. Resolution memerlukan event reason dan source refs; engine memeriksa hubungan, revision, dan scope, sementara semantic correctness tetap objek review/eval. Perubahan keputusan menghasilkan correction event dan menyimpan keputusan lama.

Status completed tidak boleh mengabaikan blocker/obligation aktif: selesaikan secara eksplisit atau tautkan carry-forward ke task yang nyata. Paused/abandoned mempertahankan unresolved state dan tidak memproduksi klaim sukses. Event `success` dari controller tidak sendiri menghasilkan verification `verified`.

### 6.5 Capsule

```ts
type CheckpointTrigger = 'phase-complete' | 'decision' | 'verified-correction'
  | 'state-change' | 'milestone' | 'failure-resolved' | 'budget-pressure'
  | 'handoff' | 'explicit';
type TaskCapsule = {
  schemaVersion: 1;
  id: string;
  taskId: string;
  episodeId: string;
  episodeRevision: number;
  generatedAt: IsoInstant;
  generator: 'deterministic-v1';
  trigger: CheckpointTrigger;
  criticalItems: WorkingItem[];
  supportingItems: WorkingItem[];
  sourceRefs: SourceRef[];
  omittedSupportingItemIds: string[];
};
```

Capsule tidak menyimpan hidden reasoning. Ia menyimpan keputusan, alasan yang dapat dibagikan, observasi, bukti, dan langkah berikut. Semua active goal, constraints, user decisions, verified current state, significant successful/failed strategy, unresolved blocker, future obligation, next action, pentingnya changed file/ID, dan critical refs masuk mandatory set berdasarkan item classification dan `critical`.

Default engine menyalin teks item mandatory tanpa paraphrase. Item pendukung dipilih deterministik menurut kind lalu event sequence terbaru dan ID sebagai tie-break. IDs/error strings/path relatif tidak dipotong di tengah. Omission hanya untuk item pendukung; daftarnya dapat diekspansi.

Jika mandatory set plus envelope melampaui budget, return `insufficient-budget` dengan kebutuhan byte minimum. Jangan membuang constraint agar output tampak hemat. Controller dapat menaikkan budget atau memecah task secara eksplisit; checkpoint sumber tetap aman dan tidak diganti capsule cacat.

Adapter model boleh diusulkan kemudian sebagai `proposeCapsule(snapshot): Promise<unknown>`, tanpa key wajib dan tanpa engine-managed login. Hasilnya harus lolos schema, exhaustive mandatory-item coverage, source-reference, scope, freshness, dan no-invention checks; gagal/timeout kembali ke deterministik. Pemeriksaan ID saja tidak membuktikan paraphrase mempertahankan makna, sehingga paraphrase mandatory item tetap tidak diaktifkan pada increment pertama.

## 7. Public API usulan dan controller contract

### 7.1 Facade additive

Tambahkan `MemoryService.controller(scope: ControllerScope): ControllerMemorySession`. Method existing seperti `search`, `read(id, trackAccess = true)`, `remember`, `update`, `batch`, `consolidate`, `lifecycle`, dan `recordUseReceipt` tetap ada. New facade mendelegasikan ke owners; ia tidak mengekspor `FileMemoryStore` atau arbitrary file mutations ke controller.

`ControllerScope` berisi `workspaceKey`, `taskId`, `controllerId`, dan optional `sessionId`. Semua berasal dari host yang sudah mengotorisasi root tersebut. Di integrasi MCP, field scope tidak muncul sebagai parameter yang boleh diganti model. Shared daemon multi-user harus mengikat root per user di host; penambahan user ID ke JSON saja bukan isolation.

```ts
type ReadBudget = { maxBytes?: number }; // default 8192, valid 512..65536
type BudgetMetrics = {
  payloadBytes: number;
  estimatedTokens: number;
  tokenEstimator: 'unicode-codepoints/4-v1';
};
type Budgeted<T> =
  | { status: 'ok' | 'partial'; data: T; metrics: BudgetMetrics; warnings: string[] }
  | { status: 'insufficient-budget'; requiredBytes: number; metrics: BudgetMetrics; warnings: string[] };
type RecallInput = {
  query?: string;
  view?: 'map' | 'abstract'; // default abstract; query kosong hanya map
  retention?: 'active-durable' | 'archive' | 'all';
  asOf?: IsoInstant;
  limit?: number; // default 5, 1..20
  cursor?: string;
  budget?: ReadBudget;
};
type MemoryHit = {
  id: string;
  revision: Digest;
  title: string;
  abstract?: string;
  retention: RetentionTier;
  epistemic: EpistemicType;
  temporal: TemporalClass;
  verification: Verification['status'];
  applicability: 'current' | 'historical' | 'superseded' | 'conflicted' | 'unknown';
  freshness: 'current' | 'stale' | 'unknown';
  availableViews: Array<'record' | 'episode' | 'evidence'>;
  score?: number;
  retrievalEvidence: { attemptId: string; contentDigest: Digest; recordFingerprint: Digest };
};
type RecallPage = {
  snapshot: Digest;
  hits: MemoryHit[];
  nextCursor?: string;
  archiveSearchAvailable: boolean;
  completeness: 'complete' | 'partial';
};
type ExpandInput = {
  source: SourceRef;
  view: 'record' | 'episode' | 'evidence';
  cursor?: string;
  budget?: ReadBudget;
};
type ExpansionPage = {
  source: SourceRef;
  view: ExpandInput['view'];
  text: string;
  offset: number; // offset Unicode code point, bukan byte
  totalCodePoints: number;
  sourceRefs: SourceRef[];
  nextCursor?: string;
  availability: 'available' | 'reference-only' | 'unavailable';
};
```

Setiap hit membawa `retrievalEvidence` yang kompatibel dengan receipt binding existing; `revision` semantik tetap field terpisah. Ledger mencatat view dan digest payload yang benar-benar dikirim, sehingga abstract exposure tidak disamakan dengan full-record exposure. Receipt tetap bukan bukti kausal atau verifikasi isi.

`map` menggunakan judul/status/ID tanpa body; `abstract` memakai extract deterministik maksimum 240 Unicode code points atau abstract terkurasi yang revision-nya cocok. Extract diberi makna preview, bukan ringkasan semantik yang menjanjikan lengkap. Teks dan metadata panjang tetap tunduk pada total budget; record yang tidak muat menjadi next page, bukan nested full body.

`ExpansionPage.text` adalah serialisasi view yang terdokumentasi: record menyertakan body dan metadata relevan; episode mencakup header/event sequence; evidence menampilkan source bytes yang tersimpan. Chunk boundaries tidak memecah Unicode. Cursor mengikat scope, view, query/filter digest, source/snapshot revision, dan posisi. Scope mismatch atau stale cursor menghasilkan error eksplisit; tidak melanjutkan diam-diam pada snapshot baru.

Budget diukur atas seluruh JSON UTF-8 final termasuk metrics, warnings, provenance refs, cursor, trust notice, dan serialized field names. Estimator token menghitung code points pada payload final dibagi empat, dibulatkan ke atas; ini **estimasi kasar**, terutama untuk kode, Bahasa Indonesia, dan teks non-Latin. Ia bukan hard token cap. Host boleh mengukur tokenizer/model tertentu secara terpisah dan harus mencatat model/version. Metadata tambahan adapter juga dihitung di benchmark end-to-end.

### 7.2 Method dan input/result yang stabil

| Method pada `ControllerMemorySession` | Kontrak usulan |
|---|---|
| `capabilities(): ControllerMemoryCapabilities` | `{ contractVersion: 1, views, budgets: { defaultBytes: 8192, minBytes: 512, maxBytes: 65536 }, writeMode: 'legacy-read' \| 'experience-v2', temporalAsOf: boolean, advisory: true }` |
| `recall(input: RecallInput): Promise<Budgeted<RecallPage>>` | Read compact-first pada scope host; tanpa query hanya map; tidak mengubah authority |
| `expand(input: ExpandInput): Promise<Budgeted<ExpansionPage>>` | Mengambil revision/view tertentu; exact refs tidak otomatis diarahkan ke versi latest |
| `captureEvidence(input: CaptureEvidenceInput): Promise<ArtifactReceipt>` | Input operation ID + file relatif atau explicit text + observedAt; output `{ source: SourceRef, availability, bytes?, reason?, duplicate }` |
| `startEpisode(input: StartEpisodeInput): Promise<EpisodeHeader>` | Input `{ startKey, goal: string, sourceRefs: SourceRef[] }`; goal menjadi event/item pertama; same key/payload replay mengembalikan episode yang sama |
| `appendEvent(input: AppendEventInput): Promise<EpisodeAppendResult>` | Input `{ episodeId, expectedRevision, operationId, event: { kind, summary, observedAt?, sourceRefs, stateChanges } }`; output `{ episodeId, revision, eventRef: SourceRef, duplicate }` |
| `checkpoint(input: CheckpointInput): Promise<Budgeted<TaskCapsule>>` | Input `{ episodeId, expectedRevision, operationId, trigger, budget? }`; snapshot reducer, validasi invariants, deterministic render, CAS publication |
| `getTaskContext(input?: { budget?: ReadBudget }): Promise<Budgeted<TaskContext>>` | `TaskContext = { detail: 'full' \| 'handle-only', episode?: EpisodeHeader, episodeRef: SourceRef, freshness: 'current' \| 'stale' \| 'unknown', capsule?: TaskCapsule, staleSourceRefs?: SourceRef[], needsCheckpoint: boolean }`; episodeRef tersedia walau belum ada checkpoint; bila belum ada episode, typed not-found |
| `prepareConsolidation(input: ConsolidationInput): Promise<ConsolidationPlan>` | Input `{ episodeId, expectedRevision, operationId, proposal: unknown }`; schema + source/scoping validation; hasil preview tersimpan dengan digest, bukan canonical mutation |
| `applyConsolidation(input: ApplyConsolidationInput): Promise<PromotionReceipt>` | Input `{ planId, expectedPlanDigest: Digest, operationId }`; CAS exact source revisions; output `{ planId, receiptId, canonicalRefs: SourceRef[], episodeRevision, duplicate, indexStatus: 'current' \| 'degraded' }` |
| `setRetention(input: RetentionInput): Promise<RetentionReceipt>` | Input `{ memoryId, expectedRevision: Digest, operationId, tier: RetentionTier, reason, sourceRefs }`; output `{ memoryId, revision: Digest, tier, auditRef: SourceRef, duplicate }`; tidak menghapus source |
| `setEpisodeStatus(input: EpisodeStatusInput): Promise<EpisodeHeader>` | Input `{ episodeId, expectedRevision, operationId, status, reason, sourceRefs }`; completed gate memeriksa unresolved obligations; paused/abandoned bukan sukses |

Jika capsule belum tersedia atau mandatory capsule tidak muat dalam budget, `getTaskContext` mengembalikan minimal `TaskContext` berstatus partial dan `detail: handle-only`: episodeRef, freshness, `needsCheckpoint`, dan warning `capsule-omitted-budget` bila relevan. Full header, stale-ref list, dan capsule tidak disertakan pada handle-only; controller membuka manifest episode secara paged untuk detailnya. Capsule dihilangkan seluruhnya, bukan dipotong. Dengan handle kecil ini controller selalu dapat memakai paged episode expansion, termasuk bila capsule membutuhkan lebih dari batas 65536 bytes. Episode IDs dibuat engine sebagai UUID; minimal handle-only envelope diuji pada minimum 512 bytes, termasuk metrics dan warning, serta maximum-length task/workspace/controller identifiers yang tidak boleh tersalin ke handle-only. Jika hasil serialization tidak muat, naikkan supported minimum secara eksplisit pada capabilities sebelum rilis, jangan melanggar budget. Jangan mengklaim full EpisodeHeader selalu muat pada 512 bytes. Aturan checkpoint tetap ketat: mandatory state yang tidak muat menghasilkan insufficient-budget, bukan capsule parsial.

`CaptureEvidenceInput.source` adalah union `{ kind: 'workspace-file'; relativePath: string }` atau `{ kind: 'controller-text'; text: string; originRef?: string }`; role tetap host-bound. Batas input lebih besar dari output tetap ketat: maksimum 64 state changes/event, 64 source refs/input, 200.000 code points untuk proposed canonical body, dan maksimal 100 canonical operations/plan mengikuti batas batch. Input di atas batas ditolak tanpa partial accept. Lineage lengkap tidak dipotong ke 16 refs: gunakan manifest source group di archive dan reference manifest itu; tiap halaman ekspansi dibudgetkan.

T0/T1 boleh menyediakan read facade pada v1 dengan `writeMode: 'legacy-read'`; semua method write episode harus gagal `MEMORY_EXPERIENCE_NOT_ENABLED` sampai aktivasi store v2. Setelah temporal phase tersedia, `asOf` mengaktifkan semantics bagian 9; sebelum itu capability harus menyatakan temporal unsupported dan menolak `asOf` pada facade, bukan mengembalikan jawaban sejarah palsu.

Coded errors: `MEMORY_SCOPE_MISMATCH`, `MEMORY_SOURCE_UNAVAILABLE`, `MEMORY_REVISION_CONFLICT`, `MEMORY_OPERATION_CONFLICT`, `MEMORY_CURSOR_STALE`, `MEMORY_SCHEMA_UNSUPPORTED`, `MEMORY_CONSOLIDATION_INVALID`, `MEMORY_PRESERVATION_REQUIRED`, `MEMORY_EXPERIENCE_NOT_ENABLED`, dan `MEMORY_TEMPORAL_UNSUPPORTED`. Error message tidak memuat source body/credential. Same operation ID + same payload mengembalikan hasil lama; ID sama + payload berbeda selalu conflict.

### 7.3 Adapter controller

Dokumentasi integrasi menawarkan tool mapping `memory_recall`, `memory_expand`, `memory_task_start`, `memory_event_append`, `memory_task_context`, `memory_checkpoint`, dan `memory_consolidation_preview/apply`. Nama ini **usulan kontrak integrasi**, bukan tool yang sudah tersedia pada repository baseline.

Implementasi pertama berupa adapter transport-neutral yang mengeksekusi request allowlisted terhadap facade, tanpa server/network baru. MCP adapter nyata hidup pada host Agent Core bila sumber/integrasinya tersedia dan diizinkan pada task berikutnya. Engine tidak dapat memaksa semua AI memanggil tool; onboarding controller harus menetapkan urutan start/resume → recall → append/checkpoint → selective expand → completion/promotion.

Result DTO memuat `advisory: true` pada envelope adapter dan teks kontrak singkat yang menyatakan source data tidak menambah izin. Notice bukan pertahanan tunggal; schema allowlist, scope binding, source provenance, safety scan, dan perilaku controller tetap diuji.

## 8. Persistence, concurrency, recovery, dan consolidation

### 8.1 Layout file-native yang diusulkan

Canonical v2 tetap pada `notes/<id>.md`. Struktur berikut relatif terhadap memory root, bukan folder repository:

| Lokasi | Owner dan sifat |
|---|---|
| `state/experience-manifest.json` | Format/capability dan generation store; mengikat migration origin; bukan index |
| `state/episodes/<episodeId>/manifest.json` | Header, current revision, operation receipts, referensi working-state snapshot |
| `state/episodes/<episodeId>/events/<sequence>-<eventId>.json` | Event immutable; tidak memakai bounded recent-log sebagai satu-satunya source |
| `state/capsules/<episodeId>/<digest>.json` | Capsule immutable; manifest episode menunjuk capsule current |
| `state/consolidation/<planId>.json` | Preview tervalidasi, read set, exact proposed actions, state pending/applied/stale/rejected |
| `state/operations/<operationId>.json` | Result/digest binding untuk replay lintas-restart; scope menjadi bagian key dan isi |
| `archive/objects/<digest-hex>` | Snapshot/source bytes immutable, dedup dalam root yang sama |
| `archive/manifests/<id>.json` | Lineage/promotion/retention/artifact manifests yang menunjuk object dan source revisions |
| `index/disclosure.json` | Derived summaries/projections dan dependencies; boleh hilang lalu rebuilt |

Namespace replay diikat pada durable root identity + workspaceKey + taskId + method + operationId. ControllerId/sessionId hanya origin metadata dan tidak ikut namespace atau digest business payload, sehingga pergantian controller tidak menggandakan operasi. Same ID/payload dicek sebelum expectedRevision untuk replay yang sah; payload berbeda tetap conflict. Map operation ID ke path memakai normalisasi atau hash tuple tersebut, bukan string bebas ke filesystem. Archive objects tidak dihapus oleh rotation recent histories. Directory/file mode memakai primitive aman yang sudah ada; symlink dan path traversal ditolak. Seluruh root baru tetap di luar Git.

Mulai dengan individual immutable event files dan manifest atomik; jangan menambah database atau append-log framework lain. Bila jumlah file benar-benar menjadi bottleneck, pengemasan segmen lossless bisa menjadi task tersendiri sesudah benchmark. Tidak ada background purge pada increment ini.

### 8.2 Reuse store transaction tanpa nested-lock deadlock

Tambahkan internal extension berikut pada [store.ts](../../../../SubProject/agent-core-memory/src/memory/store.ts), bukan public controller API:

```ts
type StateSnapshot = { content: string | null; fingerprint: string | null };
type StoreSnapshot = {
  records: MemoryRecord[];
  state: ReadonlyMap<string, StateSnapshot>;
};
type StorePlan<T> = {
  records: MemoryRecord[];
  touchedIds: string[];
  stateWrites: Array<{ key: string; content: string }>;
  result: T;
};
// Method internal FileMemoryStore:
// transact<T>(stateKeys: readonly string[],
//   planner: (snapshot: StoreSnapshot) => StorePlan<T>
// ): Promise<{ records: MemoryRecord[]; result: T }>;
```

`stateKeys` hanya logical key dari owner internal yang allowlisted untuk episode/capsule/operation/archive; raw absolute path tidak diterima. Immutable destination harus belum ada atau memiliki byte sama; write berbeda ke ID immutable ditolak. State deletion tidak disediakan pada extension ini.

`transact` mengambil common process lock sekali, menjalankan recovery tervalidasi, membaca canonical bytes dan seluruh declared state keys, menyimpan fingerprint sebelum planner, menjalankan planner sinkron tanpa network/model, memvalidasi invariants, lalu membangun `MemoryTransactionMutation[]`. Canonical plus stateWrites masuk satu coordinator commit. Existing `batch` menjadi wrapper pada primitive yang sama; lock tidak dipanggil berlapis. New scoped snapshot read memakai lock yang sama untuk menghindari melihat setengah apply lintas-file.

`MemoryTransactionCoordinator` tetap engine atomic journal. Perlu memperkuat preflight duplicate targets, root containment, journal schema/path validation, dan recovery yang hanya menyentuh root miliknya. Unreadable/invalid journal dipertahankan dan menjadi diagnostic blocker; jangan “membersihkan” bukti rusak. Semua recover, termasuk startup, harus berada di bawah lock. Evaluasi reuse `writeOwnedFileAtomic` untuk replacement/retry tanpa mengubah journal semantics secara sembrono.

Jaminan yang dituju adalah crash-consistent operasi engine pada filesystem lokal yang didukung. Tidak mengklaim global atomicity terhadap editor/file writer luar yang mengabaikan lock, jaringan filesystem, power-loss di semua storage, atau binary lama. External byte drift harus terdeteksi ketika memungkinkan; direct edits pada live store bukan jalur tulis yang didukung untuk experience v2.

### 8.3 Snapshot–compute–CAS

Untuk pekerjaan yang mungkin lambat:

1. Di bawah lock, ambil snapshot source revisions dan episode revision, serta expected target state.
2. Lepaskan lock; jalankan candidate selection/proposal opsional/rendering.
3. Ambil lock lagi; bandingkan seluruh read set dan target fingerprints.
4. Jika drift, return `MEMORY_REVISION_CONFLICT` dan simpan proposal sebagai stale bila perlu. Jangan overwrite atau auto-merge keputusan.
5. Jika cocok, commit satu bundle dan simpan operation receipt dalam transaksi yang sama.
6. Rebuild derived index di luar commit; state committed tetap authoritative walau index gagal.

Same operation ID replay dilakukan sebelum efek baru, setelah scope/payload binding diperiksa. Caller yang kehilangan response dapat mengulang aman. Receipt tidak boleh dibuang setelah TTL pendek yang membuka kemungkinan double-promotion; kalau lookup index rusak, rebuild dari immutable receipts.

### 8.4 Kontrak plan consolidation

`ConsolidationPlan` memiliki `schemaVersion: 1`, `id`, `digest`, `episodeId`, `episodeRevision`, host scope, `createdAt`, `readSet: Array<{ source: SourceRef; requireCurrent: boolean }>`, `actions`, `warnings`, dan `status`. Digest mencakup seluruh isi actionable dan read set; perubahan status operasional tidak mengubah digest plan yang diterima caller.

Setiap action memiliki `actionId`, `kind`, `inputRefs`, `reason`, dan salah satu payload:

- `create`: full proposed `RememberInput` ditambah `RecordExperience`; target ID disiapkan engine.
- `amend`: target ID + expected semantic revision + full proposed resulting record. Archive before-image wajib.
- `merge`: beberapa input dalam scope yang sama, hasil baru atau amend target yang eksplisit, serta mapping setiap assertion/condition ke input refs. Input tidak dihapus.
- `supersede`: target lama, target baru, effective time, evidence, dan semantics transition bagian 9.
- `retain`: kandidat tetap berada pada episode/arsip; tidak dipromosikan menjadi canonical fact.
- `conflict`: simpan hubungan dan reason unresolved tanpa menentukan pemenang otomatis.

Engine membangun read set sendiri dari refs dan targets. Current merge/amend targets memerlukan `requireCurrent: true`; historical evidence yang sengaja dirujuk boleh memakai revision archived tanpa mengklaimnya current. Candidate comparison memanggil existing finder hanya dengan records scope relevan, bukan seluruh unpinned store.

Gate menilai scope, durability, kegunaan, explicitness, applicability, verification, dan sumber. Default automation hanya convergence duplikat identik dengan epistemic/validity/applicability yang identik, serta penambahan provenance yang tidak mengubah klaim. Similarity tinggi adalah saran review. Penggabungan prosa, mengganti keputusan penting, atau menyelesaikan kontradiksi bukan hasil ranking otomatis.

Fakta dapat dipromosikan sebagai unverified/supported sesuai dukungannya; hypothesis boleh disimpan sebagai hypothesis. “Belum sukses” tidak berarti pengalaman harus dibuang. Label success/verified tidak dapat berasal hanya dari classifier atau self-reported receipt.

### 8.5 Malformed output dan failure recovery

- Proposal bukan JSON valid, field tak dikenal, type salah, source ID buatan, unsupported `verified`, scope lain, atau revision stale: canonical tidak berubah; episode/staging tetap utuh; return reason codes yang aman.
- Tidak ada fallback “append semua candidate” jika model gagal parse.
- Crash sebelum journal prepared: belum ada publication; sumber masih ada, temporary owned files dapat ditangani recovery terikat operasi.
- Crash saat applying: rollback seluruh bundle dari journal. Test harus mematikan child process pada setiap boundary, bukan sekadar melempar exception sebelum commit.
- Crash setelah committed marker tetapi sebelum response: recover memperlakukan commit selesai; replay operation mengembalikan receipt yang sama. Cleanup journal sesudah marker adalah best-effort/retryable dan tidak boleh masuk rollback path. Baseline `commit()` saat ini menempatkan cleanup pada try/catch yang dapat rollback; perilaku ini harus diperbaiki dan difault-inject.
- Gagal menyalin evidence yang dibutuhkan preservation: jangan mark promotion/archival complete. Reference-only boleh dicatat, tetapi pengguna melihat keterbatasan reconstruction.
- Index gagal sesudah commit: canonical/result receipt tetap benar; return `indexStatus: degraded`, lexical fallback yang aman, dan retry reindex saja.
- Bukti missing/corrupt setelah commit: jangan membangun teks asli dari hash atau summary. Expansion mengembalikan unavailable; verified claim dievaluasi ulang/ditandai evidence-unavailable, bukan dihapus.

## 9. Temporal semantics, invalidation, dan clock

### 9.1 Makna query

`recall({ asOf })` pada facade berarti **state yang didukung evidence saat ini untuk waktu valid tersebut**, bukan “apa yang sistem sudah ketahui pada waktu itu”. Full bitemporal `knownAt` belum menjadi API increment ini. `recordedAt` tetap dipertahankan agar audit dapat menunjukkan bukti yang datang terlambat.

Select historical candidates sebelum ranking: jangan menerapkan expired/superseded-now filter terlebih dahulu. Retention dan disclosure tetap berlaku; forgotten merupakan explicit visibility choice dan tidak dibuka hanya karena `asOf` diisi. Recall archive perlu pilihan scope/tier yang eksplisit. `read`/`expand` langsung ke exact source revision tetap menjelaskan visibility/applicability-nya.

- Atemporal: tidak otomatis verified; waktu bukan pembatas penerapannya bila klasifikasi memang tepat.
- Static: kejadian historis yang tetap tentang periode tertentu; kedatangan record baru tidak membatalkannya.
- Dynamic: state yang dapat berubah; valid interval dan transition evidence diperlukan.
- Unknown/partial time: inclusion dengan status uncertain/unknown, atau opsi strict hanya exact evidence; jangan arbitrarily memilih tanggal.

Default hasil historical recall membawa known matching results lebih dahulu dan uncertain candidates sebagai hasil berlabel, bukan menyebut semuanya benar pada tanggal itu. Equality boundary diuji: T1 berlaku sebelum T2, dan successor berlaku mulai T2.

### 9.2 Transition dan conflict

Tambah `applyTemporalTransition(input)` sebagai helper internal domain, dipakai action `supersede`, bukan tool authority baru. Input tepat: `{ predecessor: SourceRef, successor: SourceRef, effectiveAt: IsoInstant, evidence: SourceRef[], reason: string }`. Result berupa planned updates kedua record, link `supersedes` baru dengan validFrom yang sama, dan immutable audit manifest.

Validator menolak self-transition, cycle, cross-scope, jenis klaim tidak kompatibel, waktu yang bertentangan dengan bukti, serta opinion/prediction yang mencoba membatalkan fact. Hanya supported correction atau state transition yang eksplisit dapat menutup interval. Bukti lemah atau equal-time contradictory facts menghasilkan `conflicted`; deterministic tie-break ID hanya untuk tampilan, bukan memilih kebenaran.

`invalidatedBy` adalah field hasil query yang diturunkan dari transition manifest/link, bukan field kedua yang dapat drift dari relasi aslinya. Original statement tetap tersedia. Distinct temporal segments tidak disatukan oleh normalizer link legacy yang menggabungkan target/type; episode/transition manifest menyimpan interval dan lineage lengkap di luar batas 32/16.

Pernyataan “preferensi sekarang berubah” dapat supersede preferensi scope yang sama dengan sumber eksplisit, tetapi tidak menjadi aturan universal “record terbaru selalu benar”. Current user intent di host tetap didahulukan terhadap semua memory historis.

### 9.3 Clock dan determinisme

Validasi instant dengan timezone eksplisit; normalisasi menjadi UTC. Waktu ambigu disimpan sebagai `TimeValue`, tidak memakai `Date.parse` permissive untuk menebak. Semua pure temporal tests menerima `now`/reference instant eksplisit. Runtime memakai satu reference time per operation; sequence/revision, bukan wall clock, menentukan order write.

Jika jam sistem mundur, record event menyimpan observed engine time dan diagnostic skew; ia tidak merombak event sequence atau mengubah valid-time. Latency diukur dengan monotonic clock. Untuk ledger lama yang menuntut completedAt ≥ startedAt, adapter menormalisasi representasi interval dan mencatat skew, tanpa mengklaim akurasi wall-clock eksternal. Test memakai fake clock dan dua timezone di batas tanggal.

## 10. Kompatibilitas, migration, dan safety boundary

### 10.1 Reader/writer strategy

1. Phase disclosure read-only bekerja pada v1 tanpa migrasi.
2. Implement reader union v1/v2, strict schema, dan typed experience defaults terlebih dahulu.
3. Write pengalaman baru memerlukan activation manifest v2. Implementasi awal memakai **root v2 baru yang kosong**. Bila pengguna kelak meminta upgrade store v1 berisi data, copy-upgrade membuat root tujuan baru dari snapshot terverifikasi dan mempertahankan source; sekarang hanya fixture synthetic yang menguji jalur itu.
4. Mode legacy tetap menulis v1 dan mempertahankan perilaku API lama. Mode experience v2 menulis v2 dan mengaktifkan preservation hooks untuk **semua write**, termasuk method lama. Protection berasal dari manifest store, tidak dapat dinonaktifkan hanya dengan menghilangkan opsi initialization.
5. Store v2 tidak boleh dipakai sebagai shared root oleh binary lama. Manifest tidak dapat memaksa binary lama menghormatinya; host harus menunjuk versi yang benar dan mencegah co-writer lama. Jangan memakai unknown fields v1 yang diam-diam dibuang parser lama.
6. Rollback berarti kembali membaca root v1 snapshot atau v2 snapshot yang didukung. Export turun ke v1 bersifat lossy dan hanya boleh explicit preview dengan daftar data yang tidak dapat diwakili; jangan menyebutnya rollback tanpa kehilangan data.

Update parser, serializer, semantic revision digest, import/export, related selectors, safe validation, and index fingerprint handling bersama schema. Jangan menambahkan field TypeScript saja: `normalizeRecord` dan transfer/1 saat ini membentuk ulang field allowlist.

### 10.2 Archive versus delete/reset

Default evolved store adalah preserve-history. `setRetention(..., 'archive')` mengubah metadata/exposure dengan before/after audit, tanpa memanggil `deleteWithLinkRepair`. Restore retention tidak membatalkan expiry atau supersession secara terselubung.

Legacy `delete` dan batch delete tetap ada untuk store legacy. Pada store experience v2 yang memiliki preservation invariant, kedua path harus menolak `MEMORY_PRESERVATION_REQUIRED`; jangan diam-diam menggantinya dengan archive sehingga caller mendapat makna palsu. Privacy purge explicit adalah desain terpisah dengan otorisasi dan impact review; tidak ada bypass flag generik pada API controller tahap ini.

`feedback.reset/reconcile`, reindex, recent revision pruning, dan bounded ledger compaction tidak boleh menghapus retained evidence/receipts. Uji setiap entry point yang bisa mereset auxiliary state. Existing `expiresAt` tetap visibility signal, bukan TTL untuk menghapus archive. Pin bukan satu-satunya cara melindungi sejarah.

### 10.3 Migration dan transfer

Untuk kompatibilitas, usulkan helper internal `upgradeLegacySnapshot(records: MemoryRecordV1[]): MemoryRecordV2[]` yang tidak melakukan filesystem I/O dan tidak mengklasifikasi ulang pengetahuan. Synthetic fixtures menguji copy-upgrade/restore menggunakan root temporary. UI/CLI migration dan maintenance API production ditunda sampai ada store nyata yang perlu dipindah; tidak perlu membangunnya hanya untuk data personal yang tidak ada dalam repository. Jika workflow migration production kelak dibuat, preview harus merinci versions, counts, source digests, unsupported/corrupt files, target baru, dan perkiraan ruang disk.

Untuk workflow copy-upgrade yang diuji fixture, apply mengambil snapshot stabil di bawah source lock, menulis destination terisolasi, memverifikasi checksum/count/ref reachability, lalu menulis completed manifest paling akhir. Interrupted destination tetap marked incomplete, tidak aktif. Replay melanjutkan/verifikasi berdasarkan receipt, bukan menimpa source. Tidak menebak data yang sudah hilang sebelum migration; delapan old revisions dan telemetry yang masih ada diimpor sebagai available historical evidence dengan completeness yang jujur.

Transfer/1 tetap untuk kompatibilitas record v1. Tambah transfer/2 untuk experience bundle: canonical v2, episode/event/capsule manifests, retained revision objects, artifact bodies yang diizinkan, dan essential receipts. Bundle manifest memiliki object digest, scope, stable source IDs, dan linkage; export paged/chunked dengan checksum agar batas existing 500 tidak menyebabkan loss. Import preview menolak unresolved/different-scope refs dan memeriksa seluruh bundle sebelum activation. Timestamps historis dan validity tidak diganti waktu import.

Export lengkap hanya ke destination yang diotorisasi. Export knowledge-only harus jelas menulis `completeness: 'knowledge-only'`, bukan menyamar sebagai recovery backup. Object archive tidak otomatis dipublikasikan ke GitHub/package.

### 10.4 Safety pada tiga boundary

- **Capture:** path/scope guard, redaction/rejection sesuai policy, source role host-bound, tidak menyimpan credential atau private reasoning. Existing regex safety menjadi lapis awal, bukan pembuktian semua serangan terblokir.
- **Consolidation:** data dari website/tool tetap data; label atau tulisan “approved” tidak memberikan authority. Proposals tidak boleh mengubah host policy, verifier registry, atau source roles. Safety validation dijalankan lagi pada resulting canonical content/metadata.
- **Disclosure:** serialize allowlist, advisory contract, source role/status, current intent precedence, revision-bound refs, dan budget final. Hindari menempelkan source text sebagai instruksi sistem.

Unsafe candidate ditolak secara aman; tidak otomatis disimpan verbatim ke “quarantine archive” yang menciptakan kebocoran baru. Catat rejection code dan origin reference yang aman bila diizinkan. Evidence hash adalah integritas byte, bukan authenticity, semantic entailment, izin, atau bukti bahwa controller benar-benar menggunakannya.

## 11. Rencana implementasi bertahap setelah review

Semua task di bawah belum dikerjakan. Setiap task memakai test gagal → implementasi minimum → test lulus → review diff → commit kecil. Tidak memerlukan implementasi body function di dalam plan. Fase dapat dihentikan pada gate-nya tanpa mengklaim fase selanjutnya tersedia.

### T0 / Fase 0 — Tetapkan baseline Linux yang bisa direproduksi

**Files:** inspect `package.json`, `tsconfig.json`, `EXTRACTION-MANIFEST.json`, `src/index.ts`, tiga existing test files; usulan create `package-lock.json` dan `docs/verification/memory-baseline.md` saat implementasi.

**Interface:** tidak mengubah API produk. Output baseline report memuat commit, Node/npm/OS, dependency versions, commands, exit codes, test names/counts, skipped/not-run, dan artifact hash.

- [ ] Catat `node --version`, `npm --version`, `git rev-parse HEAD`, dan working-tree state; pastikan Node memenuhi `>=24.15.0` sebelum menjalankan package.
- [ ] Resolusi dependency dari registry resmi dengan `npm install --package-lock-only --ignore-scripts`; review diff/version/integrity sebelum `npm ci --ignore-scripts`. Jika toolchain membutuhkan install script resmi, dokumentasikan kebutuhan dan otorisasi; jangan mengubah dependency range untuk menyembunyikan kegagalan resolusi.
- [ ] Jalankan `npm run build`, `npm test`, dan `npm run verify`; simpan stdout/stderr serta nama test yang benar-benar dieksekusi. Existing smoke harus membuktikan restart dalam root temporary.
- [ ] Tambahkan characterization tests pada `tests/memory-baseline-contract.test.ts` untuk merekam perilaku legacy yang benar-benar ada, termasuk full-record serialization dan `asOf` current-filter. Test ini menguji kontrak baseline, bukan mengeklaim gap sudah beres. Expected failing tests untuk perilaku baru ditambahkan saat T1/T6 dimulai; jangan meninggalkan intentional failing tests dalam full-suite gate task lain. Failure baseline yang tidak disengaja tetap dilaporkan apa adanya.
- [ ] Bedakan regressions baru, failure baseline, dan blocker lingkungan. Jika baseline tidak dapat dibangun, buat usulan fix bounded dahulu; jangan meneruskan perubahan besar di atas baseline tak dikenal.
- [ ] Review dan commit baseline/lockfile/report terpisah dari fitur.

**Gate G0:** kondisi baseline jelas dan dapat diulang. Tidak ada requirement menganggap “14/14 PASS dahulu” sebagai hasil sekarang.

### T1 / Fase 1 — Progressive disclosure yang langsung dapat dipakai

**Create:** `src/memory/disclosure.ts`, `src/memory/controller-session.ts`, `tests/memory-disclosure.test.ts`, `tests/memory-controller-scope.test.ts`.

**Modify:** `src/memory/service.ts`, `src/memory/search-projection.ts`, `src/memory/page.ts`, `src/index.ts`.

**Interfaces:** menghasilkan `MemoryService.controller`, `capabilities`, `recall`, `expand`, `Budgeted`, `MemoryHit`, dan cursor contract bagian 7. Menggunakan existing ranking, source/staleness/authority helpers dengan scope yang dikunci host. Fitur episode/v2 menolak write sampai diaktifkan.

- [ ] Tulis test E11–E13 untuk JSON final tidak memiliki nested full record, metadata panjang, ASCII/Unicode, batas 512/8192 bytes, continuation cursor, exact source revision, dan ekspansi ID yang dipilih saja. Tambahkan cross-workspace/pinned-foundation policy cases.
- [ ] Jalankan `npm test -- tests/memory-disclosure.test.ts tests/memory-controller-scope.test.ts`; kegagalan awal harus menunjuk DTO/facade yang belum ada atau characterization gap, bukan error fixture.
- [ ] Implement pure projection dan safe serialization; expose map/abstract default; gunakan `read(id, false)` untuk snapshot tanpa access mutation dan catat exposure secara terpisah. Jangan membungkus hasil `search()` lalu menganggap body tersembunyi hilang.
- [ ] Implement cursor revision/scope/query binding dan explicit overflow. Ekspor public facade/types dari root; jangan mengekspor arbitrary state-write primitive.
- [ ] Jalankan targeted tests, existing tests, dan `npm run build`; ukur actual payload legacy dibanding facade pada fixture sama.
- [ ] Review DTO, compatibility, dan diff; commit hanya increment disclosure.

**Gate G1 / increment pertama:** caller dapat menemukan record secara ringkas dan membukanya tepat sasaran pada store v1 tanpa key/model. Belum mengklaim episodic memory atau historical truth query.

### T2 / Fase 2A — Preservation, schema, transaksi, dan migrasi aman

**Create:** `src/memory/experience-types.ts`, `src/memory/archive.ts`, `src/memory/migration.ts`, `tests/memory-preservation.test.ts`, `tests/memory-experience-migration.test.ts`, `tests/memory-transaction-recovery.test.ts`.

**Modify:** `types.ts`, `note-format.ts`, `paths.ts`, `store.ts`, `transaction.ts`, `revisions.ts`, `service.ts`, `transfer.ts` di `src/memory/`; `src/standalone.ts`, `src/index.ts`; reuse `src/persistence/atomic-file.ts`.

**Interfaces:** v1/v2 union dan `RecordExperience`; internal `FileMemoryStore.transact`; archive snapshot/ref reader; pure `upgradeLegacySnapshot` dan synthetic copy-upgrade tests dari bagian 10, tanpa migration UI/CLI production. Tambahkan `MemoryServiceOptions = { experience?: { enabled: true } }` sebagai argumen keempat opsional `MemoryService.initialize(baseDir, memoryRoot?, embedder?, options?)` dan opsi standalone yang sama; tiga argumen lama tetap valid. Mode baru memerlukan activation manifest.

- [ ] Tulis E03–E04, E09, E23, E28, E32: legacy roundtrip, metadata-only revision preservation, lebih dari delapan perubahan, delete/batch-delete guard, reset/reconcile, interrupted migration, corrupt journal, path escape, same-process dan two-process contention.
- [ ] Jalankan tiga test files baru; amati failure terhadap preservation/recovery yang belum ada.
- [ ] Implement reader dulu, initializer root v2 kosong, pure legacy transformer, synthetic copy-upgrade ke target baru, dan archive immutable. Tangkap original state yang masih tersedia; jangan mengklaim merekonstruksi history yang sebelumnya sudah dipangkas.
- [ ] Extend transaksi dan startup recovery dengan shared lock; simpan source/target snapshots sebelum publish; validasi root containment dan CAS. Semua write di store v2 melewati preservation hook.
- [ ] Jalankan fault-injection child-process tests pada prepare/apply/commit/response boundaries. Tambahkan fault injection cleanup journal gagal setelah committed marker: canonical tetap committed dan replay identik. Run targeted suite, `npm run verify`; bandingkan counts/checksums/ref reachability sebelum/sesudah/restart.
- [ ] Review synthetic copy-upgrade manifest dan rollback readback; commit schema+preservation sebagai unit konsisten. Export v2 yang belum didukung harus fail explicitly, tidak turun ke transfer/1 diam-diam.

**Gate G2:** boleh menyimpan experience baru tanpa mengorbankan input source; legacy fixture root tetap ada; old writer restriction terdokumentasi; tidak ada kebutuhan memigrasikan data personal sekarang.

### T3 / Fase 2B — Episode lintas-controller dan staging

**Create:** `src/memory/episodes.ts`, `tests/memory-episodes.test.ts`, `tests/memory-episode-concurrency.test.ts`.

**Modify:** `controller-session.ts`, `experience-types.ts`, `archive.ts`, `service.ts`, `paths.ts`, `src/index.ts`.

**Interfaces:** `captureEvidence`, `startEpisode`, `appendEvent`, `setEpisodeStatus`, serta minimal `getTaskContext` berisi episodeRef dan optional header sesuai budget, tanpa capsule; types bagian 6.4/7.2; menggunakan `transact` dan archive dari T2. Controller role/task/scope berasal host.

- [ ] Tulis E05–E07 dan E24: duplicate start/event, same key different payload, restart unresolved task, controller B melanjutkan episode A, spoofed source role, critical item removal, dan complete dengan obligation masih aktif.
- [ ] Jalankan `npm test -- tests/memory-episodes.test.ts tests/memory-episode-concurrency.test.ts`; konfirmasi fail yang sesuai.
- [ ] Implement minimal task-context discovery (episodeRef + header jika muat, handle-only jika perlu) tanpa menunggu capsule; implement event reducer dan immutable event storage; idempotency receipt dan episode revision satu transaksi; tidak memasukkan staging ke default canonical recall.
- [ ] Implement bounded evidence capture dengan policy/identity checks; simpan original bytes yang diizinkan dan status unavailable yang jujur. Test changing file, missing source, symlink, oversize, dan secret-shaped content.
- [ ] Jalankan targeted suite, existing suite, build, dan proses-restart test tanpa embedder/API key.
- [ ] Review task identity dan boundary, lalu commit.

**Gate G3:** pengalaman masih provisional tetapi dapat dilanjutkan dari controller lain tanpa transcript controller lama.

### T4 / Fase 3 — Capsule deterministik dan freshness

**Create:** `src/memory/capsule.ts`, `tests/memory-capsule.test.ts`, `tests/memory-capsule-race.test.ts`.

**Modify:** `controller-session.ts`, `episodes.ts`, `experience-types.ts`, `disclosure.ts`.

**Interfaces:** `checkpoint`, perluasan `getTaskContext` dengan capsule/freshness, `TaskCapsule` pada bagian 6.5/7.2; consumes event reducer + revision refs dari T3. Default generator `deterministic-v1`, tanpa model adapter dahulu.

- [ ] Tulis E11–E12 dan E14–E17: seluruh mandatory item tetap sama, budget terlalu kecil, exact error/ID/path, repeated trigger idempotent, stale source, supporting omission, dan event baru masuk ketika compute ditahan.
- [ ] Jalankan `npm test -- tests/memory-capsule.test.ts tests/memory-capsule-race.test.ts`; pastikan failing assertions mencakup critical state, bukan hanya adanya file summary.
- [ ] Implement deterministic renderer dan snapshot–compute–CAS. Read capsule memeriksa dependency revisions; stale source menghasilkan `needsCheckpoint`, bukan kesimpulan current yang dibuat ulang dari sumber lama.
- [ ] Simpan checkpoint terdahulu; budget overflow tidak mempublikasikan capsule invalid. Test metadata-only source correction dan access-only counter change secara terpisah. Test mandatory capsule >65536 bytes: getTaskContext masih mengembalikan handle-only yang dapat diekspansi; checkpoint tidak mengklaim berhasil compact.
- [ ] Jalankan targeted tests, full tests, build; laporkan total emitted bytes dan extra read calls melawan full-history fixture.
- [ ] Review invariant coverage lalu commit. Adapter LLM tetap deferred sampai ada manfaat terukur dan izin konfigurasi.

**Gate G4:** capsule mempercepat orientasi tanpa kehilangan mandatory operational state; manfaat diukur pada output eksternal, bukan hidden context model.

### T5 / Fase 4 — Consolidation dan promotion yang dapat diaudit

**Create:** `src/memory/promotion.ts`, `tests/memory-promotion.test.ts`, `tests/memory-promotion-recovery.test.ts`.

**Modify:** `consolidation.ts`, `controller-session.ts`, `experience-types.ts`, `archive.ts`, `store.ts`, `service.ts`.

**Interfaces:** `prepareConsolidation`, `applyConsolidation`, `ConsolidationPlan`, `PromotionReceipt` bagian 7–8. Reuse `findConsolidationCandidates` dengan records pre-scoped; jangan mengubah `consolidate()` legacy menjadi auto-write.

- [ ] Tulis E07–E10, E15, E24: exact duplicate convergence, rare constraint berbeda, unresolved hypothesis, malformed output, fabricated refs, unsupported verification, stale targets, replay receipt, dan crash antara canonical publication/episode archival.
- [ ] Jalankan `npm test -- tests/memory-promotion.test.ts tests/memory-promotion-recovery.test.ts`; assert canonical bytes unchanged dan staging retained pada semua reject paths.
- [ ] Implement strict proposal parsing → engine-built read set → preview digest → apply CAS; clone input snapshots sebelum amendment. Pada tahap ini temporal supersede yang belum memenuhi T6 ditolak secara eksplisit.
- [ ] Commit canonical changes, lineage, operation receipt, dan episode status bersama. After-commit index failure mengembalikan committed/degraded; retry tidak mengulang promosi.
- [ ] Jalankan targeted/full tests dan build; audit setiap output assertion terhadap refs dan applicability. Nontrivial semantic merge memerlukan review, tidak dapat dijamin benar oleh validator struktur saja.
- [ ] Review before/after example lengkap dan commit.

**Gate G5:** curation memperbaiki benang pengetahuan tanpa menghapus input, mengarang evidence, atau mengubah hypothesis menjadi success.

### T6 / Fase 5 — Temporal dan epistemic query yang benar

**Create:** `src/memory/temporal.ts`, `tests/memory-temporal.test.ts`, `tests/memory-temporal-order.test.ts`.

**Modify:** `relations.ts`, `retrieval.ts`, `controller-session.ts`, `promotion.ts`, `experience-types.ts`, `disclosure.ts`, `transfer.ts`.

**Interfaces:** temporal candidate selector menerima records + explicit reference time; `applyTemporalTransition` menghasilkan planned mutation dari bagian 9; `recall.asOf` baru diaktifkan setelah gate terpenuhi.

- [ ] Tulis E18–E23: T1/T2 boundary, ingestion normal/terbalik/intra-batch, equal-time conflict, self/cycle invalidation, opinion/prediction/cross-scope, partial date, unknown timezone, backwards clock, dan expired/superseded-now historical recall.
- [ ] Jalankan `npm test -- tests/memory-temporal.test.ts tests/memory-temporal-order.test.ts`; pastikan characterized `asOf` failure T0 menjadi covered regression.
- [ ] Implement exact/uncertain time parsing dan selectors; reuse link `[from,to)` tanpa melebur distinct episodes. Make valid-time filtering terjadi sebelum ranking dan sekarang-filter.
- [ ] Implement explicit evidence-backed transition + before/after audit. Unknown lama tetap unknown; timestamp import tidak menjadi valid-from.
- [ ] Jalankan tests, build, serta roundtrip v1/v2; bandingkan jawaban kedua urutan ingestion, bukan hanya jumlah record.
- [ ] Review semantics dengan fixture timeline, lalu commit.

**Gate G6:** historical results menjelaskan apa yang berlaku, apa yang uncertain, dan bukti yang datang belakangan; tidak menjanjikan full bitemporal knowledge history.

### T7 / Fase 6A — Retention, safety, dan receipt integrity

**Create:** `tests/memory-retention.test.ts`, `tests/memory-safety-boundaries.test.ts`, `tests/memory-receipt-integrity.test.ts`.

**Modify:** `archive.ts`, `controller-session.ts`, `feedback.ts`, `retrieval-ledger.ts`, `safety.ts`, `service.ts`, `src/learning/workflow-evidence.ts`.

**Interfaces:** `setRetention`, `RetentionReceipt`; exposure records membedakan view/actual payload bytes; existing `recordUseReceipt` mempertahankan attempt, workspace, dan content binding. Tidak membuat verification oracle baru yang dapat diisi model.

- [ ] Tulis E16, E24–E28: archived success reconstruction, restore tanpa undo expiry, malicious capture/consolidation/disclosure, old instruction versus current correction, exposure tanpa use, use tanpa outcome, unrelated verification, repeated hypothesis retrieval.
- [ ] Jalankan tiga targeted test files dan pastikan negative cases benar-benar memanggil boundary masing-masing.
- [ ] Implement archive/restore visibility dengan audit; protect essential evidence sebelum bounded ledger/revision/feedback rotation; fail-safe pada missing visibility state untuk facade, tidak otomatis membuka forgotten data.
- [ ] Bedakan source byte availability, controller-reported use, independently rechecked outcome, dan causation. Jangan meningkatkan epistemic status dari salience/retrieval count.
- [ ] Jalankan tests/full build dan record-count-over-limit cases; verifikasi same receipt replay tetap idempotent sesudah restart/rotation index rebuild.
- [ ] Review batas perlindungan dan commit.

**Gate G7:** lifecycle mengurangi paparan aktif sambil mempertahankan pengalaman; advisory boundary diuji, bukan sekadar ditulis di prompt.

### T8 / Fase 6B — Lifecycle eval suite dan evidence report

**Create:** `tests/fixtures/memory-lifecycle/` (synthetic JSON corpus + expected answers), `tests/helpers/memory-eval.ts`, `tests/memory-lifecycle-evals.test.ts`, `docs/verification/memory-evolution-results.md`.

**Modify:** `package.json` hanya bila script test terarah benar-benar membantu; `.gitignore` bila diperlukan untuk runtime report output. Tidak menambah evaluation framework.

**Interfaces:** report fields bagian 12; oracle synthetic disegel/versioned dan tidak dihasilkan oleh proposal yang sedang dinilai. Existing verifier/ledger menjadi input, bukan satu-satunya penilai.

- [ ] Buat fixture semua E01–E32, label mandatory facts/obligations, expected historical answers, evidence digests, adversarial sources, dan expected next action secara eksplisit.
- [ ] Jalankan failing eval harness dengan sengaja merusak satu mandatory fact/ref agar terbukti oracle mendeteksi omission/no-invention.
- [ ] Implement comparison legacy/full-history versus facade/capsule/selective expansion pada workload yang sama; hitung semua response bytes, calls, elapsed monotonic time, dan model cost bila ada.
- [ ] Jalankan `npm test -- tests/memory-lifecycle-evals.test.ts`, seluruh test, dan build; catat median/p95 dari repeated trials serta corpus/engine revision. Laporkan unknown, skipped, dan unavailable sebagai status terpisah.
- [ ] Review hasil terhadap gates bagian 12; jangan memilih threshold setelah melihat hasil untuk menyebut semuanya lulus.
- [ ] Commit fixture, harness, dan report tersanitasi; raw user traces tidak dipublikasikan.

**Gate G8:** manfaat dan keterbatasan dapat diperiksa ulang, bukan hanya demonstrasi satu memory yang berhasil dibaca.

### T9 / Fase 7 — Controller continuation, transfer, dan portability readiness

**Create:** `src/memory/controller-protocol.ts`, `examples/controller-continuation.ts`, `tests/memory-controller-continuation.test.ts`, `tests/memory-transfer-v2.test.ts`, `tests/memory-portability.test.ts`, `docs/controller-integration.md`.

**Modify:** `transfer.ts`, `src/index.ts`, `README.md`, package file list bila contoh/docs memang ingin dikemas. `EXTRACTION-MANIFEST.json` tetap menyatakan provenance ekstraksi historis; jangan mengubah sejarahnya agar terlihat semua file baru berasal dari monolith.

**Interfaces:** transport-neutral request dispatcher allowlisted → `ControllerMemorySession`; transfer/2 bundle/preview/receipt bagian 10. Controller A/B hanya mendapatkan public contract, bukan internal store access atau transcript terdahulu.

- [ ] Tulis E23, E28–E32: fresh controller resume, stale capsule fallback, knowledge-only versus complete transfer, checksum failure, interrupted import, root isolation, path casing/Unicode/CRLF/rename, dan lock contention.
- [ ] Jalankan targeted tests; buktikan controller B gagal pada incorrect mandatory fixture supaya “continuation pass” bukan hanya keberhasilan API call.
- [ ] Implement adapter contract/example serta complete transfer/2 dengan source reachability; dokumentasikan host-bound identity dan aturan kapan controller memanggil tiap method.
- [ ] Jalankan Linux verification penuh, public package import dari clean temporary consumer, dan `npm pack --dry-run`; periksa package contents tidak mengandung runtime, private corpus, archive, key, atau absolute private paths.
- [ ] Jika environment/otorisasi tersedia, jalankan live controller A → B. Jika tidak, tandai **protocol replay PASS / live controller NOT RUN**. Jalankan Windows matrix terpisah sebelum klaim Windows-supported untuk fitur baru.
- [ ] Review final diff, unresolved limitations, migration instructions, evidence report, dan commit. Push source hanya pada task implementasi yang telah diotorisasi; release/deploy tetap scope terpisah.

**Gate G9:** siap untuk review integrasi. Full cross-controller claim memerlukan bukti penggunaan nyata, bukan library function saja.

## 12. Dataset, acceptance cases, dan ukuran keberhasilan

### 12.1 Fixture suite yang harus ada

Semua case adalah rencana test, **bukan hasil test sekarang**. Dataset sintetis meliputi proyek kecil, long-running repair task dengan 300 events, satu successful recovery lama, dua workspace dengan istilah sama, timeline dynamic fact, source yang berubah, mixed-language/Unicode, dan adversarial instruction payload. Data nyata hanya boleh dijadikan fixture setelah sanitasi dan review izin publikasi.

| ID | Acceptance case dan assertion utama | Pemilik |
|---|---|---|
| E01 | Clean Linux dependency resolution/build; catat exact toolchain/exit status | T0 |
| E02 | Existing suite sebelum/sesudah; selected/full/skipped dibedakan | Semua |
| E03 | Empty root → write/read/search → process restart tanpa monolith | T0,T2 |
| E04 | Manifest/package tidak berisi user data, secret, runtime, path pribadi | T0,T9 |
| E05 | Same event ID/payload = satu event; different payload = conflict | T3 |
| E06 | Unresolved goal/blocker/next action selamat setelah crash/restart | T3,T4 |
| E07 | Success + why/applicability + failure lesson tetap memiliki input lineage | T3,T5 |
| E08 | Malformed JSON/type/false verification/fake ref/stale revision tidak memutasi canonical | T5 |
| E09 | Kill process sebelum/during/setelah commit; tidak hilang atau double-promote | T2,T5 |
| E10 | Near-duplicate dengan satu constraint berbeda tidak dilebur tanpa distinction | T5 |
| E11 | Seluruh mandatory capsule items dan exact IDs/error strings tetap ada | T1,T4 |
| E12 | Budget terlalu kecil return insufficient-budget; tidak membuang hard constraint | T1,T4 |
| E13 | Compact search → selected record → episode → original evidence; payload aktual bounded | T1,T9 |
| E14 | Revise source setelah capsule; stale terdeteksi atau refresh benar | T4 |
| E15 | Event/decision baru ketika proposal dihitung; stale apply ditolak | T3,T4,T5 |
| E16 | Archived success bisa ditemukan serta why/how/evidence direkonstruksi | T4,T7 |
| E17 | Full-history vs capsule: total bytes/calls/latency dan correctness dibandingkan | T4,T8 |
| E18 | Dynamic T1 → T2; current/asOf mengikuti interval dan original provenance | T6 |
| E19 | Reverse ingestion dan intra-batch memberi supported answer set yang sama | T6 |
| E20 | Opinion/prediction/hypothesis/workspace lain tidak invalidasi fact | T6 |
| E21 | Self/cycle invalidation, reversed interval, partial date/timezone diperlakukan eksplisit | T6 |
| E22 | Equal-time conflicting facts tetap conflict; order kedatangan bukan truth | T6 |
| E23 | Reload/import/export legacy+typed mempertahankan validity/uncertainty/links | T2,T6,T9 |
| E24 | Injection ditangani terpisah pada capture, consolidation, disclosure | T3,T5,T7 |
| E25 | Current user correction mengalahkan remembered instruction yang salient | T7,T9 |
| E26 | Retrieval, use, verified outcome, unrelated evidence dibedakan dalam report | T7,T8 |
| E27 | Repeated retrieval tidak membuat hypothesis menjadi verified fact | T7,T8 |
| E28 | Migration/consolidation/rotation: semua retained refs reachable, recovery konsisten | T2,T7,T9 |
| E29 | Controller A berhenti; B tanpa transcript mengetahui next step/constraints/past success | T9 |
| E30 | B menghadapi stale capsule; memakai state terbaru atau menyatakan uncertainty | T9 |
| E31 | Tanpa credentials: deterministic replay dilaporkan partial, live step NOT RUN | T8,T9 |
| E32 | Linux + separate Windows: casing, newline, lock, atomic replace, evidence paths | T2,T9 |

Tambahan regression yang tidak boleh terlewat: semantic metadata-only revision, access-only non-staleness, more-than-eight revisions, >4.000 receipts, >512 feedback records, maximum refs/links, index deletion/rebuild, failed visibility loading, and reader concurrent multi-file apply. Existing bounds tetap boleh pada cache/telemetry selama essential audit evidence sudah retained.

### 12.2 Report schema dan perbandingan

Setiap report mencatat `schemaVersion`, `engineCommit`, `datasetRevision`, platform/toolchain, dependency lock digest, mode (legacy/disclosure/capsule), corpus size, trial count, estimator/tokenizer identity, timestamps, commands, raw exit status, dan test/eval result. Body report memisahkan:

- **Capture:** accepted/rejected/provisional counts, false durable promotion, source/ref coverage.
- **Consolidation:** mandatory distinctions retained, unsupported assertions, duplicates converged, unresolved conflicts, rejection/recovery correctness.
- **Retrieval:** relevant result rank/recall pada labeled corpus, unknown/no-result cases, archived retrieval success.
- **Disclosure:** final bytes, token estimates, omitted supporting items, critical items retained, deep fetch rate, duplicate-context rate, total tool calls.
- **Use/outcome:** exposures, controller receipts, verified associated outcomes, unavailable outcomes; tidak mengklaim causation dari association.
- **Preservation:** required objects/revisions present, refs reachable, original byte digest match, missing sources yang sudah diketahui.
- **Performance:** median/p95 latency, total wall time, offline/model overhead, memory/storage growth; dataset dan platform harus sama untuk before/after.
- **Continuation:** expected next action, constraints, unresolved obligations, evidence lookup, old success reuse; protocol versus live controller dibedakan.

Jangan menghitung penghematan dari response kosong/salah, dan jangan mengecualikan roundtrip `expand` tambahan. Rekam external model input/output/cost bila adapter opsional dipakai. Tidak ada angka penghematan 70% yang dijanjikan.

### 12.3 Gates kuantitatif usulan untuk review

- **Hard correctness:** 100% labeled critical items dan obligations pada deterministic acceptance corpus; 0 unauthorized scope leaks; 0 accepted fabricated refs; 0 silently lost protected objects; 0 duplicate commit akibat replay; semua exact temporal fixtures benar. Ini target test, bukan jaminan universal di dunia nyata.
- **No invention:** 0 unsupported assertions pada sealed corpus; natural-language merges di luar corpus tetap membutuhkan review/ketidakpastian, bukan klaim formal proof.
- **Budget:** seluruh success/partial payload valid ≤ requested maxBytes; overflow eksplisit; tokenizer estimates diberi label yang benar.
- **Continuity:** semua deterministic A→B fixtures lulus. Live A→B dan Windows masing-masing memiliki status PASS/FAIL/NOT RUN tersendiri.
- **Efficiency:** total emitted context lebih rendah pada long-history fixtures dengan correctness yang sama atau lebih baik. Besarnya dipublikasikan sebagai hasil, tanpa minimum persentase universal.
- **Latency guardrail awal:** tidak lebih buruk >20% pada median atau >30% pada p95 warm lexical read terhadap baseline platform/corpus sama. Ini provisional review threshold; cold migration/index rebuild dilaporkan terpisah. Jika gagal, investigasi dan tunjukkan tradeoff, jangan mengubah threshold diam-diam.
- **Storage:** laporkan bytes/event, snapshot dedup ratio, dan growth pada 10/100/1.000 records serta 300-event task. Bukan alasan purge otomatis; corpus lebih besar ditambahkan bila ukuran nyata menuntutnya.

## 13. Lima belas pertanyaan desain untuk review

Bukan daftar “TBD”: setiap pertanyaan memiliki default rekomendasi, tradeoff, dan fase yang terpengaruh. Menerbitkan plan tidak berarti default ini telah diterima.

| ID | Pertanyaan | Default rekomendasi dan tradeoff | Gate |
|---|---|---|---|
| Q01 | Vocabulary disclosure mana yang dipakai? | Named views `map/abstract/record/episode/evidence`; capsule terpisah. Sedikit lebih banyak nama, tetapi tidak mencampur L0–L3 yang maknanya berubah dalam brainstorming | D1, G1 |
| Q02 | Bagaimana retention, archive search, dan pertumbuhan storage? | Active+durable default; archive explicit; preserve accepted events/evidence tanpa automatic purge. Dedup byte dan paging dahulu; storage bertambah. Privacy deletion membutuhkan workflow terpisah | D2, G2/G7 |
| Q03 | Kapan episode dimulai/ditutup dan bagaimana dua controller bekerja? | Task-owned ID, satu unfinished episode/task, multi-day resume, shared revision/CAS; controller/session metadata. Lebih sederhana daripada nested task scheduler; konflik concurrent perlu re-read | G3 |
| Q04 | Siapa yang merangkum? | Controller menyatakan structured state; deterministic renderer menjaga mandatory truth. LLM proposal opsional kemudian. Kurang luwes untuk raw prose tetapi offline, dapat diuji, tanpa key/cost wajib | D3, G4 |
| Q05 | Siapa berwenang melakukan promosi? | Explicit API preview/apply di bawah host authorization; identik non-conflicting boleh otomatis menurut policy; substantive decision/conflict direview. Ada friction tambahan, mengurangi false certainty | D4, G5 |
| Q06 | Apakah RULE merupakan epistemic type? | Tidak; decision/instruction adalah record kind, epistemic dan verification orthogonal. Unknown untuk legacy/mixed claims. Lebih banyak metadata, tidak menempelkan authority pada label fact | G2/G6 |
| Q07 | Bagaimana observed/recorded/valid time dan tanggal parsial? | Pisahkan ketiganya; exact UTC `[from,to)`, partial date/unknown tetap eksplisit, asOf = valid-time menurut evidence terkini. Full bitemporal knownAt deferred | G6 |
| Q08 | Apa yang memenangkan konflik? | Evidence + same scope + explicit supported transition; recency saja tidak cukup. Equal-time/weak conflicting claims tetap unresolved. Jawaban bisa kurang tegas tetapi lebih jujur | G5/G6 |
| Q09 | Bagaimana freshness summary diketahui? | Revision-semantic digest + immutable source refs + generator version; CAS; stale notice/needsCheckpoint. Extra hashing/read overhead, menghindari summary lama tampil sebagai current | G4 |
| Q10 | Seberapa jauh backward compatibility? | Read v1/v2, legacy API dipertahankan; new writer mode di root v2 kosong; copy-upgrade untuk kebutuhan legacy nyata nanti diuji lewat fixture; old binaries dilarang co-write. Perubahan type union perlu catatan versi; tidak ada jaminan monolith otomatis kompatibel | D5, G2/G9 |
| Q11 | Library, MCP, atau service baru? | Additive facade + transport-neutral dispatcher; MCP mapping di host kemudian. Default 8192-byte DTO, explicit expansion/revision cursor. Membutuhkan integrasi caller; bukan daemon baru | G1/G9 |
| Q12 | Bagaimana budget token diukur? | Hard byte cap pada final DTO; code-point/4 hanya estimator berlabel. Tokenizer opsional di benchmark host. Tidak ada klaim exact model-token cap tanpa tokenizer/version | G1/G8 |
| Q13 | Seberapa dipercaya use receipt? | Host-bound task/exposure/revision, idempotency lintas-session, independent verifier bila tersedia; outcome unavailable bila bukti tidak cukup. Tidak menyimpulkan causation atau truth dari frekuensi | G7 |
| Q14 | Dataset dan release gates apa yang diterima? | Synthetic sealed corpus E01–E32, correctness/preservation hard gates, provisional latency thresholds bagian 12. Tambah sanitized real cases setelah izin. Target penghematan dilaporkan empiris | G8 |
| Q15 | Apa definisi “sudah teruji” di Linux/Windows/controller nyata? | Linux deterministic first; separate Windows matrix dan live A→B. Tanpa environment/key, tandai NOT RUN. Tidak menunda semua manfaat read-only, tetapi klaim readiness harus dibatasi | G0/G9 |

Prioritas review pengguna: D1–D5/Q01–Q02–Q04–Q05–Q10 dahulu. Pertanyaan lainnya sudah memiliki default sehingga tidak memaksa lima belas jawaban sekaligus. Perubahan yang disetujui harus dimasukkan ke dokumen sebelum pelaksanaan, bukan dibiarkan sebagai keputusan lisan yang berlawanan dengan kontrak.

## 14. Traceability kebutuhan lengkap

R01–R24 adalah identitas kebutuhan hasil sintesis diskusi desain. Tabel ini mempertahankan cakupan tanpa menyertakan transcript atau data pribadi dalam repo.

| ID | Kebutuhan | Desain / keputusan | Task dan bukti penerimaan |
|---|---|---|---|
| R01 | Engine standalone, privacy boundary | §§2,3,10; no mandatory model/database | T0,T9; E01–E04 |
| R02 | Tiap capability memiliki workflow purpose | §§2.2–2.3,4; reuse owner sebelum menambah | Census §3, phase gates, E17 |
| R03 | Evidence survive compaction/retirement | §§6.3,8,10.2; no auto purge | T2,T5,T7; E07,E09,E16,E28 |
| R04 | Project direction dan successful knowledge bertahan | §§2.1,6.4–6.5; what/why/how/boundary/result/reuse | T3–T5,T9; E07,E11,E16,E29 |
| R05 | Failure lessons dapat dipakai lagi | §§2.1,6.4; cause bisa unknown; archive raw allowed evidence | T3,T5; E07,E10,E16 |
| R06 | Capsule eksternal dengan impact nyata | §§4 C2,5,6.5; bukan internal-context control | T4,T8,T9; E11,E17,E29 |
| R07 | Critical-state invariant capsule | §§6.4–6.5; mandatory items dan explicit overflow | T4; E11–E12,E14–E15 |
| R08 | Trigger checkpoint bermakna | §5.3; operation-id replay dan revision | T3,T4; E05,E15 |
| R09 | Controller-neutral identity/episode ownership | §§6.4,7.1,8.3; host identity, task-owned state | T3,T9; E05–E06,E29–E30 |
| R10 | Explicit provisional episodic staging | §§5.2,6.4; tidak masuk canonical fact recall | T3,T5; E06–E10 |
| R11 | Evidence-aware promotion gate | §§8.4–8.5; status-aware preview/apply | T5; E07–E10,E24 |
| R12 | Consolidation menjaga distinctions/provenance | §§8.4,9.2; input tetap ada | T5,T6; E10,E18–E22 |
| R13 | Progressive disclosure adalah read contract | §§5.1,7; DTO final dan scoped expansion | T1,T9; E12–E13,E17 |
| R14 | Disclosure berbeda dari retention | §6.1; orthogonal dimensions | T1,T7; E13,E16 |
| R15 | Summary/capsule source revision consistency | §§6.2,8.3; stale/index recovery | T2,T4; E14–E15,E28 |
| R16 | Temporal type berbeda dari epistemic type | §§6.1–6.2,9; kind/verification orthogonal | T2,T6; E20–E23 |
| R17 | Invalidation mengubah applicability, menyimpan history | §§9.1–9.2; explicit transition lineage | T6; E18–E20,E23 |
| R18 | Ambiguous time/conflict tetap uncertain | §§6.2,9; no guessed timezone/date | T6; E19–E22 |
| R19 | Reuse canonical/locks/retrieval/evidence owners | §3 census, §§8.2,10; additive architecture | T0–T9; E02,E09,E23,E28 |
| R20 | Advisory memory tidak membuat izin baru | Global Constraints, §§7.3,10.4 | T7,T9; E24–E25 |
| R21 | Retrieval/use/outcome/confidence berbeda | §§3,10.4,12.2; byte identity bukan semantic truth | T7,T8; E26–E27 |
| R22 | Eval seluruh lifecycle termasuk disclosure | §§11 T8,12; independent oracle | T8; E01–E32 |
| R23 | Ukur manfaat dengan jujur | §§7.1,12.2–12.3; estimates, overhead, no 70%promise | T4,T8; E17,E26,E31 |
| R24 | Integrasi controller benar-benar memakai API | §§7.3,11 T9; A→B public-only flow | T9; E29–E31 |

## 15. Readiness akhir dan batas pekerjaan sekarang

### 15.1 Sebelum implementasi dimulai

- [ ] Pengguna telah mereview arah dan keputusan utama; koreksi tercermin di plan.
- [ ] Baseline commit dan scope repository masih cocok, atau perbedaan source ditinjau dahulu.
- [ ] Mode Linux, root temporary, dependency resolution, dan batas integrasi host telah jelas.
- [ ] Tidak ada isi personal memory atau transcript yang diperlukan sebagai fixture awal.

### 15.2 Sebelum menyebut fitur siap diintegrasikan

- [ ] G0–G9 yang relevan lulus dengan evidence nyata; setiap belum-dijalankan dinyatakan.
- [ ] Fresh package consumer dapat import, initialize, recall, expand, restart, dan resume.
- [ ] Canonical/protected archive/ref checksums utuh setelah migration, consolidation, restart, interrupted write, dan index loss.
- [ ] Full serialized response memenuhi budget; old `search()` compatibility dan new facade contract terdokumentasi.
- [ ] Source poison, old instruction, spoofed scope/role, stale proposal, and fake evidence ditolak/ditandai sesuai boundary.
- [ ] Temporal semantics dan reverse-ingestion corpus lulus; unknown dates tetap unknown.
- [ ] Loop controller A→B menunjukkan next action dan reuse pengalaman lama. Live test dan protocol replay tidak disamakan.
- [ ] Report memuat semua biaya/keterbatasan: extra reads, model opsional, storage growth, archive incompleteness, dan supported filesystem/platform.
- [ ] Windows baru disebut verified bila matrix Windows benar-benar dijalankan.
- [ ] Final source diff direview; package bebas data pribadi; push target/branch sesuai task. Tidak ada deployment/release yang diasumsikan.

### 15.3 Yang diserahkan pada pekerjaan dokumentasi ini

Dokumen ini dan navigation `docs/README.md` adalah rencana untuk review. Tidak ada perubahan source engine, migration store nyata, dependency installation, build/test run, live model/controller integration, atau benchmark yang diklaim sudah dilakukan pada tahap ini.

Keberhasilan tahap ini adalah keselarasan desain dan rencana yang dapat diuji. Setelah disetujui, langkah pertama tetap baseline Linux dan increment disclosure; pengalaman lama dipertahankan sepanjang evolusi berikutnya.
