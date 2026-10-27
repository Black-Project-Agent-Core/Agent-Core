# Proposal Upgrade Kognitif dan Penguatan Modul Memori Agent Core

Tanggal: 2026-10-27
Revisi: 2
Status: COMPLETED - kesembilan pilar diimplementasikan, diuji dan didokumentasikan 2026-10-27; default nonaktif; build resmi, restart dan aktivasi lima fitur (Paket A) di produksi atas pilihan pengguna selesai 2026-10-27 (lihat "Hasil implementasi dan validasi")
Jenis: Improvement (System Memory Architecture)
Asal dan bukti: Analisis struktural modul `src/memory/` (store.ts, retrieval.ts, relations.ts, evolution.ts, retention-score.ts, consolidation.ts)
Path asal: `docs/proposals/Advanced-Memory-Cognitive-Upgrades.md`
Path arsip: `docs/history-agent-core/Advanced-Memory-Cognitive-Upgrades.md`

## Masalah dan tujuan
Meskipun modul `src/memory` pada Agent Core telah memiliki fondasi transaksional, multi-strategy retrieval, dan provenance tracking yang solid, agent otonom jangka panjang masih menghadapi tantangan pada:
1. Akumulasi memori usang (*stale memories*) dan potensi kontradiksi antar fakta seiring bertambahnya sesi.
2. Bobot retrieval hybrid (vector vs BM25) yang masih statis tanpa *query intent classification* dinamis.
3. Ketiadaan siklus konsolidasi latar belakang otomatis (analog siklus REM) untuk mengubah log episodik mentah menjadi pengetahuan prosedural/semantik.
4. Absennya peluruhan algoritmik (*forgetting curve* Ebbinghaus) dan skor keyakinan epistemik (*epistemic confidence*) yang membedakan fakta terverifikasi dan asumsi/inferensi.
5. Ketiadaan pemisahan tier memori (L1/L2/L3) yang memicu latensi tinggi dan potensi pembengkakan token.
6. Keterbatasan penjelajahan relasional multi-hop saat retrieval data struktural kompleks.
7. Risiko inkonsistensi jangka panjang akibat *orphaned links* atau *embedding drift* tanpa self-repair otomatis.
8. Ketiadaan lapisan sanitasi privasi otomatis (*secret-masking*) sebelum data diserap ke *durable store*.

Tujuan proposal ini adalah merancang dan mengusulkan penambahan 9 pilar penguatan kognitif dan keamanan memori secara komprehensif tanpa merusak struktur transaksional yang sudah ada di `src/memory`.

## Bukti dan ketidakpastian
- Bukti: Berdasarkan inspeksi filesystem pada `src/memory/`, modul saat ini sudah mendukung *store*, *retrieval* (vector & BM25), *revisions*, *evolution*, *retirement*, *relations*, dan *consolidation*, namun penambahan tiering, multi-hop traversal otomatis, self-repair, dan privacy masking belum terintegrasi sebagai satu kesatuan pipeline kognitif.
- Ketidakpastian: Overhead komputasi saat background worker (REM consolidation & self-repair) berjalan serta tuning parameter sanitasi privasi.

## Rekomendasi Tambahan (Pilar 6 s.d. 9)
Empat pilar tambahan berikut sangat direkomendasikan untuk melengkapi aspek performa, keamanan, dan integritas struktural:
1. **Tiered Memory Hierarchy (L1 Working Cache vs L2 Episodic vs L3 Long-term):** Memisahkan akses cepat berbasis tier untuk efisiensi token dan latensi.
2. **GraphRAG Multi-Hop Relational Traversal:** Memanfaatkan `src/memory/relations.ts` untuk menelusuri rantai relasi entitas hingga 2-3 hop saat retrieval.
3. **Autonomous Memory Self-Repair & Index Re-embedding:** Background worker untuk mendeteksi *orphaned links* dan *embedding drift* secara mandiri.
4. **Pre-flight Privacy Sanitization & Secret-Masking Gateway:** Lapisan penyensoran otomatis terhadap kredensial atau kunci API sebelum disimpan ke dalam *durable blobs*.

## Mekanisme dan owner existing yang dipakai
- Owner existing: `src/memory/store.ts`, `src/memory/retrieval.ts`, `src/memory/relations.ts`, `src/memory/consolidation.ts`, `src/memory/retention-score.ts`.
- Mekanisme usulan: Menambahkan modul pendukung (*composable extensions*) di dalam namespace `src/memory/` tanpa mengubah kontrak inti penyimpanan transaksional (`src/memory/transaction.ts` dan `src/memory/mcp/tools.ts`).

## Scope, batas Native, risiko dan otorisasi
- Scope: Perancangan skema dan modul opsional untuk:
  1. *Adaptive Hybrid Fusion Weighting* (Query intent router).
  2. *Active Contradiction Resolution & Truth Pruning* (Automated conflict invalidation).
  3. *Autonomous Memory Consolidation* (Background REM consolidation loop).
  4. *Epistemic Confidence & Uncertainty Scoring* (Metadata `verified` vs `inferred`).
  5. *Algorithmic Forgetting / Ebbinghaus Curve Adaptation* (Decay scoring based on access frequency).
  6. *Tiered Memory Hierarchy* (L1/L2/L3 caching).
  7. *GraphRAG Multi-Hop Relational Traversal* (Enhanced relation path expansion).
  8. *Autonomous Memory Self-Repair & Index Re-embedding* (Integrity and drift healer).
  9. *Pre-flight Privacy Sanitization & Secret-Masking Gateway* (Storage-level privacy shield).
- Batas Native: Tidak mengubah Native AI agent runtime, tidak memerlukan tool eksternal baru, tetap di bawah kontrol owner `src/memory`.
- Risiko: Peningkatan kompleksitas metadata, potensi false-positive pada kontradiksi, serta overhead enkripsi/sanitasi privasi.
- Otorisasi: Memerlukan persetujuan eksplisit pengguna (`APPROVE`).

## Manfaat yang diharapkan dan keterbatasan
- Manfaat: Meningkatkan akurasi retrieval, mencegah pencemaran konteks (*context pollution*), menjaga keamanan data sensitif dari penyimpanan mentah, mengoptimalkan latensi & token, serta menjamin integritas jangka panjang basis data memori.
- Keterbatasan: Belum diuji pada skala jutaan record memori; memerlukan tuning parameter yang disesuaikan dengan pola penggunaan nyata.

## Acceptance, evaluasi dan rollback
- Acceptance: Modul penguatan berhasil diimplementasikan secara modular, lulus pengujian unit test TypeScript/Node tanpa merusak backward compatibility penyimpanan existing.
- Evaluasi: Membandingkan metrik relevansi retrieval (MRR/Precision), latensi token, dan efektivitas sanitasi privasi sebelum dan sesudah pembaruan.
- Rollback: Menonaktifkan flag fitur tambahan tanpa mengubah struktur data store dasar.

## Hasil implementasi dan validasi (Revisi 2)
Selesai 2026-10-27. Semua pilar dibangun penuh dan dipasang pada owner existing; tidak ada modul yang berdiri tanpa pemanggil. Isi revisi 2 tidak diubah; bagian ini hanya mencatat hasil.

### Pemetaan pilar
| # | Pilar | Modul baru di `src/memory/` | Titik pemasangan | Flag |
| --- | --- | --- | --- | --- |
| 1 | Adaptive Hybrid Fusion Weighting | `query-intent.ts` | RRF berbobot di `retrieval.ts`; `MemoryService.search` dan jalur `rank` controller (digest ranking ikut berubah hanya bila flag aktif) | `adaptiveFusion` |
| 2 | Contradiction Resolution & Truth Pruning | `contradiction.ts`, `cognitive-maintenance.ts` | `MemoryService.resolveContradictions` (preview default) dan siklus; loser disembunyikan lewat link `supersedes` existing, tidak dihapus | `contradictionResolution` |
| 3 | Autonomous (REM) Consolidation | `rem-consolidation.ts`, `cognitive-maintenance.ts` | `MemoryService.runCognitiveMaintenance` dan `IntervalLoop` (unref, tanpa reentrancy, berhenti di `dispose()`); digest ekstraktif idempoten bertag `inferred` dengan link `derived-from` | `remConsolidation` |
| 4 | Epistemic Confidence | `epistemic-confidence.ts` | pengaruh ±0.04 pada fusion, pemenang kontradiksi, skor lupa, `MemoryService.epistemicAssessment` | `epistemicConfidence` |
| 5 | Forgetting Curve (Ebbinghaus) | `forgetting-curve.ts` | `MemoryService.retirementReview` (ambang 0.3) dan tinjauan di siklus; hanya melapor, tidak menghapus | `forgettingCurve` |
| 6 | Tiered Memory L1/L2/L3 | `memory-tiers.ts` | `MemoryService.search`; tier diturunkan dari `lastAccessedAt`/`updatedAt`/pin/retention, tanpa state baru | `tiering` |
| 7 | GraphRAG Multi-Hop | `graph-traversal.ts` | menggantikan kedua loop neighbor di `retrieval.ts`; `search-projection.ts` menampilkan `hops`/`viaPath`/`tier` | `multiHop` |
| 8 | Self-Repair & Index Re-embedding | `self-repair.ts`, `cognitive-maintenance.ts` | `MemoryService.scanIntegrity/repairIntegrity` dan siklus; refresh indeks lewat antrean repair embedding existing | `selfRepair` |
| 9 | Privacy Sanitization & Secret-Masking | `privacy-masking.ts` | `MemoryService.remember/update/batch` sebelum tulis canonical; `scanMemorySafety` tetap menolak yang tidak dikenali | `secretMasking` |

Konfigurasi di `cognitive-config.ts`; `MemoryServiceOptions.cognitive` untuk kode dan variabel host `AGENT_CORE_MEMORY_COGNITIVE` (`all`, `none`, atau daftar dipisah koma; nama tak dikenal diabaikan). File lain yang diubah: `retrieval.ts`, `service.ts`, `search-projection.ts`, `initialize.ts`, `host-runtime.ts`. Tidak diubah: format note canonical, `transaction.ts`, `mcp/tools.ts`, Native runtime. Dokumentasi: bagian 4 `docs/CODEBASE.md` dan `.changeset/memory-cognitive-upgrades.md` (minor).

### Pengaman yang ditambahkan selama peninjauan sendiri
- Repair integritas menahan diri bila ada note yang tidak terbaca (`canonicalComplete=false`): link ke note rusak bukan orphan, dan referensi yang ada pada pemindaian lengkap tidak pernah dihapus.
- Siklus otonom memangkas paling banyak 10 kontradiksi per siklus; anggaran dihitung per percobaan agar pasangan tak terselesaikan tidak menghalangi yang bisa diselesaikan.
- Record yang di-pin tidak pernah menjadi winner maupun loser. Digest REM yang cuplikannya tidak lolos `scanMemorySafety` dilewati.

### Validasi
- Tes baru: `tests/memory/memory-cognitive-{privacy,scoring,retrieval,maintenance}.test.ts` — 74 tes lulus (mode v1 dan `initializeMemoryRoot` experience-v2 yang dipakai produksi). Mencakup: kesetaraan eksak perilaku lama saat bobot netral atau hop=1, eskalasi tier sama dengan pencarian biasa, idempotensi masker, reversibilitas pemangkasan, repair pada kerusakan nyata di file note, isolasi kegagalan antar langkah siklus, loop timer dengan fake timers.
- `tsc -p tsconfig.json --noEmit` bersih; `project-structure.mjs` (structure:check) lulus, 446 direktori.
- Regresi: seluruh 94 file tes yang mengimpor modul yang diubah (`retrieval`, `service`, `search-projection`, `initialize`, `host-runtime`, `facade`, `relations`, `safety`, `mcp/*`) dijalankan dengan `--testTimeout=240000` karena mesin lambat, dan semuanya lulus: 25 file di `tests/` root, 19 di `tests/memory/`, 50 di `tests/memory/engine/` (antara lain 29 file / 486 tes, 7 file / 78 tes, dan 19 file / 167 tes dalam satu run). Seluruh suite repo (333 file) tidak dijalankan; itu tidak praktis di mesin ini.
- Kegagalan yang muncul pada percobaan pertama semuanya `Test timed out` karena mesin lambat, bukan kegagalan fungsi: `memory-code-cursor`, `memory-baseline-contract` dan `memory-capsule-race` lulus dengan `--testTimeout=240000`; `memory-episode-concurrency` (5 tes "child killed") dan `memory-promotion-recovery` (6 tes "real process kill") punya batas keras 20 detik di dalam file tesnya dan lulus pada salinan sementara ber-timeout 240 detik (salinan sudah dihapus; file tes asli tidak diubah); satu tes browser Native di `native-donor-workflows` (batas 30 detik) gagal di bawah beban dan lulus 1/1 saat dijalankan sendiri. `memory-baseline-contract` menjalankan `dist/` lama sehingga tidak mungkin dipengaruhi source baru.
- Build produksi (tambahan setelah tinjauan penyelesaian): `tsc -p tsconfig.json` penuh dengan `--outDir` sementara di `runtime/tmp` (tanpa menyentuh `dist/`) exit 0 dan memancarkan 77 file JS di `memory/` termasuk 11 modul baru. Smoke test pada JS hasil build itu lulus 14/14 dengan kesembilan fitur aktif: masker, pencarian `legacy`/`bm25`, urutan `fusion` identik dengan baseline tanpa fitur, preview dan apply kontradiksi, loser tersembunyi, assessment epistemik, scan integritas, siklus pemeliharaan tanpa galat, dan `retirementReview` 0.3. Folder sementara dihapus.
- `npm run path:check` GAGAL dengan tepat **satu** pelanggaran: `runtime/skills/capability-packs/mind-control` (`[skill-storage-ownership]`; `SKILL.md` sudah berstatus modified sebelum pekerjaan ini dan berisi `name: mind-control-master`, tidak sama dengan nama direktori, bersama tiga file `references/` baru yang belum terlacak). Nol pelanggaran berasal dari file pekerjaan ini. Pengguna mengonfirmasi bahwa perubahan itu adalah upgrade pola/mekanisme Skill yang sedang ia kerjakan sendiri; karena itu tidak disentuh dan gerbang tidak dilewati. Akibatnya `npm run build` resmi, restart aktivasi, dan flag di host menunggu upgrade Skill itu selesai.
- Gerbang resmi pada salinan bersih (`git archive HEAD` + tepat 23 file pekerjaan ini, `node_modules` sebagai junction, snapshot struktur diregenerasi hanya di dalam salinan; salinan dan junction dihapus aman setelahnya, repo asli tidak berubah): `path:check` **PASS** (PATH POLICY 493 file, 0 pengecualian; Skill storage ownership 40 sumber; Project structure), `structure:check` PASS, `tsc -p tsconfig.json` exit 0 dengan 77 JS di `memory/`, dan 4 suite kognitif 74/74 lulus. Langkah `build:browser-transport` tidak dijalankan di salinan karena butuh toolchain Go di `runtime/` asli dan tidak tersentuh pekerjaan ini. Jadi satu-satunya penghalang `npm run build` pada pohon asli adalah pelanggaran Skill `mind-control` di atas.
- Gerbang resmi pada pohon asli (setelah pengguna menyelaraskan `name:` Skill `mind-control`, 2026-10-27 23:23): `path:check` **PASS** (PATH POLICY 493 file, 0 pengecualian; Skill storage ownership 40 sumber dan 43 artifact katalog; Project structure 446 direktori). `npm run build` resmi (`path:check` + `build-open-browser-use-transport` + `tsc -p tsconfig.json`) **exit 0**; transport "current", `dist/memory/` memuat 11 modul baru.
- Aktivasi: `restart_agent_core(capabilitiesChanged=false)` dipanggil satu kali. Resident baru (pid 14592, mulai 23:25) melaporkan `/health` status ok, versi 0.15.0, `build.stale: false`, Memory available (254 catatan, 0 masalah, index dan embedding available). Handshake kontrak diulang dengan digest identik (`sha256:263fbaef…`). `AGENT_CORE_MEMORY_COGNITIVE` pada saat itu masih kosong.
- Aktivasi produksi, Paket A (pilihan pengguna 2026-10-27 setelah penjelasan bahwa flag dapat digabung; sembilan fitur dikelompokkan menjadi paket A/B/C): satu baris ditambahkan ke `.env` secara append-only (isi lain tidak dibaca; hash 9.224 byte awal terverifikasi tidak berubah): `AGENT_CORE_MEMORY_COGNITIVE=adaptiveFusion,epistemicConfidence,multiHop,forgettingCurve,secretMasking`. `loadConfig()` memuat `.env` lewat `process.loadEnvFile` sebelum `initializeAgentCoreMemory`. Restart kedua (sekali): pid 20720, `/health` ok, `build.stale: false`, Memory 254 catatan 0 masalah; handshake kontrak diulang dengan digest identik.
- Validasi di resident, sebelum vs sesudah `.env` (tool MCP `memory_search` fusion dan `memory_retirement_review`, keduanya hanya-baca selain pencatatan akses normal): kueri "cognitive upgrades" memberi hasil langsung dan urutan yang sama, tetapi `selection.rrfScore` berubah 0.04813947 → 0.05295342 (bobot channel kueri "keyword" aktif: `adaptiveFusion`) dan `components.epistemicInfluence` yang sebelumnya tidak ada kini hadir (`epistemicConfidence`); skor retirement kini membawa `retrievability` dan `stabilityDays` (`forgettingCurve`). `multiHop` dan `secretMasking` tidak dapat diamati langsung tanpa menulis ke Memory hidup atau grafik berkedalaman dua; keduanya berasal dari daftar flag yang sama dan tercakup tes (termasuk mode experience-v2 produksi). Catatan: skema tool MCP `memory_retirement_review` memberi default `retentionThreshold: 0.2`, sehingga ambang 0.3 hanya berlaku bila pemanggil internal tidak mengirim ambang.
- Learning: checkpoint dan review tercatat (status `awaiting-verification`; kandidat pelajaran tetap berstatus proposal, bukan Memory). Receipt dua Skill (`mind-control` applied, `performance-oriented-software-engineering` adapted) tercatat dengan hasil `unavailable`. Receipt sempat ditolak (`EXTERNAL_RECEIPT_REVISION_NOT_DELIVERED`) karena session MCP berotasi setelah sebuah timeout sehingga ikatan ke episode hilang; dipulihkan dengan reconnect `taskKey` yang sama. `controller_learning(episode, verify)` hanya dapat `pass` untuk kasus workflow tersegel yang didaftarkan host (`recheckWorkflowReport`; "No MCP action may register an oracle"), sehingga verifikasi independen memang tidak tersedia untuk tugas ini.

### Keterbatasan yang diterima
- Aktif di produksi hanya lima fitur (Paket A). `contradictionResolution`, `selfRepair`, `remConsolidation` (loop REM) dan `tiering` tetap mati dan baru berjalan bila ditambahkan ke `AGENT_CORE_MEMORY_COGNITIVE` disertai restart; loop otomatis hanya hidup bila `remConsolidation` aktif, sedangkan API manual dengan preview selalu tersedia. Rollback = mengosongkan atau menghapus baris itu di `.env` dan restart.
- Evaluasi MRR/latensi skala besar dan perbandingan before/after yang tertulis di bagian Evaluasi tidak dijalankan (aturan pengguna: mesin lambat, tanpa benchmark kecepatan). Yang ada hanyalah fixture relevansi kecil (4 kueri berlabel, MRR 1.0 baik netral maupun adaptif) sebagai uji non-regresi; manfaat peningkatan retrieval belum terbukti.
- Label epistemik berasal dari field yang dikontrol penulis (tag, `source.type`) kecuali record v2 yang membawa `experience.verification`; karena itu pemangkasan otonom bersifat saran, dibatasi 10 per siklus, dan dapat dibatalkan dengan menghapus satu link.
- Digest REM bersifat ekstraktif tanpa model bahasa; ia memudahkan retrieval tetapi bukan sintesis semantik.
- Tiering menukar kelengkapan dengan biaya: bila L1/L2 sudah memuat `limit` hasil berbukti kuat, hasil L3 yang lebih baik tidak diperiksa. Pada hasil lemah selalu eskalasi ke seluruh kandidat.
- Pilar 1 dan 4 memengaruhi profil `fusion` saja; profil `legacy` dan `bm25` tidak berubah. Masker tidak menyamarkan PII non-kredensial (email, telepon). Fitur hanya tersedia lewat API `MemoryService`; tidak ada tool MCP baru (di luar scope).

## Riwayat revisi
- Revisi 1 (2026-10-27): Penyusunan awal proposal dengan 5 pilar kognitif memori.
- Revisi 2 (2026-10-27): Penambahan 4 pilar lanjutan (Tiered Hierarchy, GraphRAG Multi-Hop, Self-Repair, dan Privacy Sanitization) berdasarkan rekomendasi komprehensif.
- Keputusan (2026-10-27): APPROVE revisi 2 oleh pengguna; isi tidak berubah.
- Penyelesaian (2026-10-27): implementasi dan validasi dicatat di atas; status COMPLETED; dokumen dipindahkan ke `docs/history-agent-core`.

## Keputusan pengguna dan scope
- 2026-10-27 — APPROVE, revisi 2, path `docs/proposals/Advanced-Memory-Cognitive-Upgrades.md`. Keputusan diberikan langsung oleh pengguna dalam sesi ini melalui instruksi `/goal`: promosikan proposal, ubah status menjadi approve, tuntaskan seluruh persyaratan tanpa codebase yang dibangun secara parsial, lalu ubah status APPROVED → COMPLETE dan ikuti guide selengkapnya.
- Scope yang disetujui: kesembilan pilar pada bagian "Scope" revisi 2, seluruhnya. Tidak ada pilar yang boleh dikirim setengah jadi; bila satu pilar tidak dapat dituntaskan, status tidak boleh menjadi COMPLETE.
- Batas yang tetap berlaku: tidak mengubah kontrak transaksional inti (`src/memory/transaction.ts`, `src/memory/mcp/tools.ts`), tidak mengubah Native runtime, tidak ada tool eksternal baru, tanpa commit/push/merge tanpa persetujuan eksplisit terpisah, dan tanpa benchmark kecepatan/latensi (aturan pengguna untuk mesin yang lambat; verifikasi bersifat fungsional).
- Pencatatan keadaan terpisah: keputusan diterima = 2026-10-27; implementasi, validasi, keterbatasan dan penyelesaian dicatat pada "Hasil implementasi dan validasi (Revisi 2)" di atas. Build resmi, restart dan aktivasi Paket A selesai 2026-10-27 atas pilihan pengguna (lihat "Hasil implementasi dan validasi"); commit, push dan merge tidak termasuk dan belum dilakukan (perubahan berada di branch lokal `feature/advanced-memory-cognitive-upgrades`, belum di-commit).
