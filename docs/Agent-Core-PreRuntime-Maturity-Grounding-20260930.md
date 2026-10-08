# Agent Core: Grounding Kematangan Tubuh dan Memory sebelum Runtime AI

> **Historical audit; phase superseded.** [MRR closure](Pre-Runtime-Body-Memory-Learning-Closure-20260930.md), [Native Runtime Phase 1](history-agent-core/Native-Agent-Runtime-Phase-1-Plan.md), and subsequent [Native chat acceptance](history-agent-core/Agent-Core-Interactive-Agent-Chat-Plan-20261002.md) supersede the activation-pending and runtime-deferred sequencing below. These paragraphs preserve the 2026-09-30 audit, not the current implementation state. See [Product Direction](Agent-Core-Product-Direction.md) and [CODEBASE](CODEBASE.md).

> **Post-audit update:** G1/G2 have now been implemented and targeted/compiled verified in `Memory-Reuse-Reliability-20260930.md`; resident activation is pending. Findings below remain the original audit evidence, not a claim that fixes were absent after this update.

> **Status audit:** SELESAI UNTUK CAKUPAN SOURCE DAN OBSERVASI READ-ONLY. Ini bukan acceptance kematangan produk dan bukan implementasi perbaikan.
> **Tanggal:** 2026-09-30 WIB.
> **Root yang diamati:** `E:\Projects\Agent-Core`; path implementasi tetap memakai root project dinamis.
> **Urutan yang ditegaskan pengguna:** matangkan tubuh/sistem dan mekanisme Memory lokal terlebih dahulu; pembangunan runtime AI/model melalui API key atau endpoint lokal dimulai pada fase berikutnya setelah penilaian kematangan dan keputusan pengguna.
> **Authority:** tujuan di `Agent-Core-Product-Direction.md`, implementasi di `CODEBASE.md`, aturan operasi di `AGENTS.md`, percakapan sumber di `Target-Feture.md`.

## 1. Keputusan scope

Agent Core sekarang diaudit sebagai tubuh, alat observasi/aksi, penyimpan pengetahuan, dan mekanisme yang membantu controller menggunakan hasil belajar. Controller MCP eksternal yang sudah terhubung tetap menjadi pelaku penilaian semantik pada fase ini. Tidak diperlukan pembangunan otak/model baru untuk memeriksa integritas dan hubungan mekanisme tersebut.

Ketiadaan native chat, provider adapter, model loop atau scheduler AI **bukan defect yang harus ditutup dalam audit ini**. Komponen tersebut sengaja berada pada fase berikutnya. Audit ini tidak menilai kematangan dengan menuntut Agent Core berpikir sendiri tanpa controller, dan tidak menurunkan target akhir menjadi penggunaan controller eksternal selamanya.

Tidak ada clone/adopsi donor baru, inspeksi protected references, pembacaan secret, credential baru, perubahan source executable, instalasi, tes/benchmark, build, restart, reindex graph, release atau perubahan Git-history. Outputnya adalah peta hubungan, temuan source, prioritas usulan perbaikan, dokumentasi dan konteks Memory.

## 2. Bukti dan batas pemeriksaan

Identitas **433 file** source/scripts/tests dicatat, termasuk **268 file di src**. Ini sensus path/ukuran/SHA-256 untuk mendeteksi perubahan, bukan klaim semua file/cabang dibaca semantik. `package.json` yang dibaca menyatakan versi 0.14.0; HEAD lokal yang berhasil dibaca dengan scoped safe.directory adalah `639cdf77fd7288a722131862e22eecaff4a90f07`.

Pembacaan semantik berfokus pada MCP composition, Memory service/store/retrieval/provenance, Learning review/sinks, Skills, evidence tracker, Reflexion advisory, dan beberapa fixture/CLI. `source-anchors.json` menyimpan hash serta nomor baris untuk owner utama. Source terbaru lebih berwenang daripada graph atau ringkasan plan.

Kode bukti: **S** = source/caller dibaca; **L** = hasil tool read-only saat audit; **H** = artifact pengujian/closure terdahulu dibaca, tidak dijalankan ulang; **T** = isi test yang dibaca, bukan PASS baru; **P** = usulan, belum dilakukan.

Grafel menunjukkan current/available, integrity accepted, 9.659 entities dan 51.413 relationships. Dua entity yang diminta ditemukan. Namun query incoming `MemoryLearningSink` menampilkan caller test dan tidak menampilkan constructor production di `src/learning/service.ts:84`. Ini bukti keterbatasan caller coverage pada sampel, bukan dasar menyebut sink tidak digunakan. Tidak dilakukan graph repair.

Read-only diagnostics dengan workspace `agent-core`, limit 100, maxAgeDays 7 memperlihatkan 18 retrieval attempts dan 42 exposure yang diserahkan ke controller; semuanya belum mempunyai qualifying explicit-feedback assessment. Ada 18 linked feature outcomes, tetapi source menunjukkan retrieval completion sendiri menghasilkan outcome. Angka ini bukan bukti pemakaian pengetahuan dalam task, bukan seluruh riwayat, dan bukan bukti bahwa pembelajaran tidak pernah terjadi.

Skills status available/artifact-only dengan skillCount 0. Query pattern `memory retrieval learning` mengembalikan tiga item yang seluruhnya memiliki reject_reason dari probe historis; ini bukan census semua patterns atau semua prosedur dalam Memory. Tidak ada pattern dipromosikan.

Bukti audit: `../runtime/tmp/preruntime-grounding-20260930/` berisi before.json, before/ dokumen, source-anchors.json, observations.json dan health-observation.json. Artifact closure CORAL/GEA/MetaClaw terdahulu dipertahankan sebagai H; status COMPLETE wave tersebut tidak dibuka ulang.

## 3. Matriks keterhubungan tujuan terhadap implementasi

Status di bawah berlaku pada hubungan yang disebut, bukan nilai lulus/gagal seluruh subsystem. Observasi administratif atau source tidak menggantikan acceptance perilaku lintas sesi.

| Tahap / kemampuan tubuh | Owner dan jalur yang dibaca | Bukti | Status dan batas |
|---|---|---|---|
| Kontrak controller | `mcp/agent-protocol.ts:6-20` -> `mcp/server.ts:160-169` | S, L pemanggilan MCP | Terhubung; kontrak dibaca. Ada instruksi Hermes lama yang bertentangan dengan retirement, diklarifikasi pada dokumentasi audit ini. |
| Eksekusi dan observasi | `mcp/server.ts:178-205` -> handler filesystem/process/browser; `browser-control-handlers.ts:4-44` | S, L operasi inspeksi | Tool body tersedia. Tidak mengklaim semua GUI/peripheral atau seluruh action telah diuji pada audit ini. |
| Bukti hasil operasi | wrapper `mcp/server.ts:72-157` -> `tracker/tool-invocation.ts:34-76` | S | ID invocation, hasil dan durasi terhubung; tool sukses belum tentu tujuan pengguna tercapai. |
| Gangguan / percobaan gagal | `tool-invocation.ts:95-137`, `failure-loop-advisor.ts:81-166` | S | Interrupted outcome tetap unknown; advisory mengenali pengulangan. Diagnosis dan perubahan strategi tetap tanggung jawab controller. |
| Persistence pengetahuan | `memory/service.ts:617-766` -> `memory/store.ts:141-253` | S, T, L read canonical | Owner canonical, lock, revision dan transaksi ada. Cross-session keberhasilan task belum dibuktikan hanya oleh persistence. |
| Capture hasil review | `learning-tools.ts:43` -> `LearningService.review` -> review coordinator -> Memory/Grafel sink | S, graph sebagian | Jalur ada; sink generik kehilangan workspace sebelum scoped recall (G1). |
| Recall dan pemilihan konteks | `memory/service.ts:951-1129` -> `retrieval.ts:150-230/368+` -> `search-projection.ts` | S, L diagnostics | Ranking, filter, dedup, active links dan truncation ada. Handoff bukan bukti penerapan prosedur. |
| Freshness terhadap source | `memory/provenance.ts:87-181`, `repository-identity.ts:11-23/55-95` | S, L record dan Git helper | Ditemukan ketidaksamaan jalur Git; sebagian anchored note dapat berstatus source-unavailable (G2). |
| Hubungan pengetahuan | `memory/relations.ts`, `intelligence.ts:92-148`, `retrieval.ts:205-227` | S | Link berjenis/temporal ada. Similarity hanya membentuk related; bukan pembuktian supports/causes atau synthesis otomatis. |
| Koreksi pengetahuan | `memory_update`, `memory_batch`, typed links, revisions; `learning/review.ts:98-102` | S, T | Edit/relasi eksplisit tersedia; declared correction tidak otomatis memutasi catatan lama. Jangan menganggap receipt sebagai koreksi telah diterapkan. |
| Feedback terikat isi | `memory/service.ts:306-330`, `memory/feedback-target.ts`, MetaClaw closure | S, H | Optional body guard sudah diuji pada wave sebelumnya; bukan identitas task/use yang lengkap (G3). |
| Procedural knowledge | `skills-tools.ts:18-33`, `skills/service.ts:520-549`, `code-pattern-sink.ts` | S, L catalogue/query | Memory prose, Skills dan Patterns punya jalur berbeda. Tidak ada positive reusable-skill acceptance pada sampel sekarang (G4). |
| Review dan refinement | `learning/review.ts`, `curator.ts`, `feature-outcome-pool.ts` | S | Validasi, dedup dan proposal ada; semantic review/controller attestation tidak diganti oleh verifier otonom. |
| Pengukuran manfaat | `retrieval-ledger.ts:246-331`, `retrieval-evaluation.ts:29-54`, offline CLI | S, L diagnostics | Infrastruktur evidence ada; hubungan per-use ke keputusan/action/outcome belum cukup untuk klaim improvement (G3/G5). |
| Riwayat lintas sesi | canonical note/revision + explicit read/search; `memory-phase8-10.test.ts` | S, T | Test persistence/fallback tersedia. Belum merupakan pilot task baru dengan controller baru dan kondisi bervariasi. |
| Future native AI runtime | Tidak dikerjakan; fase setelah tubuh/Memory dinilai matang | Instruksi pengguna | DEFERRED BY SEQUENCE, bukan blocker yang harus diimplementasikan sekarang. |

**Kesimpulan matriks:** fondasi tidak kosong dan tidak perlu diganti. Prioritasnya memperbaiki beberapa sambungan data serta membuktikan penggunaan hasil belajar dengan controller yang sudah ada. Audit ini belum cukup untuk merekomendasikan mulai pembangunan runtime AI.

## 4. Temuan yang memengaruhi kematangan sebelum runtime

### G1 — Workspace terputus pada capture pembelajaran generik

**S: terkonfirmasi dari argumen yang diteruskan.** `LearningCandidate.workspace` dipertahankan oleh validasi review, tetapi `MemoryLearningSink.capture` (`src/learning/memory-sink.ts:51-64`) hanya mengirim title/content/context/tags/category/source ke `memory.remember`. Tidak ada provenance.workspace. Di sisi pembaca, `MemoryService.list` dan kedua jalur ranking pada `retrieval.ts:165-167,368-372` menyaring non-pinned record berdasarkan provenance.workspace.

Akibat jalur ini: pelajaran generik hasil review dapat tersimpan tetapi tidak masuk kandidat retrieval ber-workspace. Ini bukan kegagalan seluruh Memory dan bukan pernyataan bahwa workspace merupakan batas keamanan credential. Pencarian tanpa scope masih mungkin menemukannya.

`findDuplicates` pada sink yang sama memakai daftar global dan kecocokan isi atau title+category. Penanganan scope dan perbedaan isi perlu diperiksa bersama agar perbaikan capture tidak mempertahankan cross-workspace duplicate yang tidak dimaksudkan. Catatan global yang disengaja tetap harus punya perilaku jelas; jangan menebak workspace catatan lama dari similarity.

**P: prioritas perbaikan awal.** Pertahankan workspace eksplisit melalui owner provenance yang sudah ada, tentukan perilaku dedup global/scoped, dan usulkan acceptance review -> persist -> scoped recall setelah reinitialize. Belum ada perubahan source atau migrasi Memory.

### G2 — Freshness source dapat unavailable walaupun identitas repository berhasil dicatat

**S + L: diagnosis terbatas dengan bukti selaras.** Helper Git dalam `repository-identity.ts:11-23` memakai safe.directory per-command; helper di `provenance.ts:87-95` tidak. Capture provenance memperoleh identity lebih dahulu, lalu mencoba mengambil top-level gitCommit melalui helper kedua dan menelan kegagalannya secara fail-soft. `assessMemoryStaleness` membutuhkan top-level gitCommit dan mengembalikan source-unavailable bila field itu kosong.

Pada record arah produk yang dibaca saat audit, identity.checkpoint.head tersedia tetapi gitCommit kosong; staleness menyatakan capture commit is unavailable. Perintah Git helper audit tanpa safe.directory juga ditolak karena filesystem tidak mencatat ownership, lalu berhasil dengan pengecualian per-command untuk root yang sama. Ini mendukung diagnosis mismatch helper, bukan bukti hilangnya commit atau kerusakan canonical Memory. Fungsi production tidak diubah atau diuji ulang secara sintetis.

**P: prioritas perbaikan awal.** Selaraskan akses Git yang root-scoped tanpa global configuration. Jangan sekadar menyalin checkpoint.head ke gitCommit: capture pada dirty/untracked source dan perubahan setelah capture tetap perlu makna freshness yang tepat. Nilai current tidak boleh dinyatakan hanya karena HEAD sama. Gunakan primitive identity/digest yang sudah ada bila sesuai, dan biarkan unsupported/unavailable tetap eksplisit.

### G3 — Feedback isi belum membentuk bukti pemakaian per tugas

**S: batas kontrak yang terkonfirmasi, bukan bug pada body guard.** MetaClaw menjaga agar feedback mengacu ke isi yang dibaca. Namun diagnostics (`retrieval-ledger.ts:279`) mengaitkan event menurut memoryId dan waktu event sesudah retrieval. Ia tidak membandingkan event.contentDigest dengan body yang terekspos dan tidak membatasi event ke satu task/attempt. Satu event kemudian dapat berasosiasi dengan beberapa retrieval sebelumnya.

Exposure memakai fingerprint id/updatedAt (`memory/service.ts:1046`), sedangkan body guard memakai digest id/content. `recordOutcome` pada baris 1094-1100 menyatakan retrieval selesai, bukan task berhasil karena Memory. Source sudah memberi caveat observasional; caveat tersebut benar dan tidak boleh dihapus untuk membuat score tampak lebih kuat.

**L:** sampel 18 attempts/42 exposures tidak mempunyai qualifying feedback assessment. Ini menunjukkan bukti manfaat belum lengkap pada sampel, bukan kesimpulan nol pembelajaran. **P:** rancang receipt minimal record/body-digest -> applicability decision yang ringkas -> invocation/evidence -> outcome. Reuse tracker/ledger yang ada; jangan membuat database baru, mengarang causal proof, atau menafsirkan old events sebagai observed use secara retroaktif.

### G4 — Jalur prosedur tersedia, tetapi penggunaan nyata belum menjadi bukti kematangan

**S:** Learning memiliki sink Memory dan Grafel, bukan sink otomatis ke SkillService. Skills memang artifact-only: `inspect` mengembalikan summary/metadata; controller dapat membaca SKILL.md melalui read_file, bukan mengeksekusinya lewat layanan Skills. Ini pemisahan owner yang sah, bukan alasan menambahkan skill executor atau model runtime sekarang.

**L:** catalogue Skills berisi 0 artifact, dan query Patterns terarah hanya menghasilkan tiga record rejected. Prosedur dalam Memory atau pattern lain mungkin tetap ada; jumlah nol pada catalogue bukan bukti tidak ada pengetahuan prosedural sama sekali. **P:** pilih satu prosedur dari koreksi nyata yang telah diperiksa, tetapkan precondition/postcondition/evidence/reuse-condition dalam owner yang sesuai, lalu buktikan controller lain dapat menemukan, membaca dan menerapkannya. Ekstraksi awal dapat dilakukan controller; automatic skill generation bukan syarat fase ini.

### G5 — Evidence pengujian perlu dibedakan dari bukti keberhasilan lintas tugas

**S + T:** CLI `evaluate-retrieval.mjs` membaca cohort/observations yang sudah direkam, memverifikasi ulang dan menghasilkan candidate verified=false. `retrieval-evaluation.ts:29-54` mengukur hit-at-k, bukan menjalankan agent untuk menyelesaikan tugas. Laporan novelty/curve/pareto dan qualification modul tidak boleh disimpulkan sebagai cumulative task improvement.

Ada pula ketidakcocokan fixture yang terlihat secara statis: `tests/learning-decision-evidence.test.ts:15-16` membuat stateStore dengan load/save lalu memanggil `LearningService.prototype.review`, sementara implementasi sekarang (`service.ts:190-196`) memanggil stateStore.mutate. Ini kandidat perbaikan fixture sebelum menggunakan suite tersebut sebagai evidence baru. **Tidak ada test yang dijalankan di audit ini; tidak ada klaim suite saat ini FAIL.**

**P:** scope-kan pengujian yang relevan terhadap perbaikan dan satu pilot lintas sesi. Pertahankan bukti sebelumnya sebagai H dengan tanggal dan batasnya, bukan menjumlahkan seluruh PASS historis sebagai skor kematangan.

### G6 — Konteks operasi harus mengikuti fase produk dan retirement aktual

`AGENTS.md` masih memuat bagian Hermes A2A lama seolah aktif, walaupun konteks arah dan source registrasi sekarang menyatakan bridge sudah retired. Bagian itu diberi penanda historis/non-operasional pada pembaruan dokumentasi audit ini. Ini tidak mengubah atau menghidupkan backend apa pun.

Instruksi terbaru pengguna juga memperjelas bahwa native runtime hanya dimulai setelah tubuh/Memory matang. Dokumen arah sebelumnya membuka kemungkinan membawa runtime lebih awal jika dianggap dependency. Rumusan itu diganti dengan urutan terbaru; pilih slice yang menggunakan controller MCP sekarang. Header source/runtime snapshot yang sudah dated tidak dipakai sebagai klaim kesiapan produk terkini.

## 5. Prioritas tindak lanjut: Memory Reuse Reliability, bukan runtime baru

**P — belum diimplementasikan dan belum menjadi izin tes.** Urutan yang direkomendasikan setelah review hasil grounding ini:

1. **Perbaiki sambungan scope dan freshness (G1/G2).** Owner existing Memory/Learning/provenance, tanpa store baru. Acceptance harus mencakup global/scoped notes, workspace yang berbeda, missing source, dirty/untracked capture, dan perubahan source setelah capture.
2. **Perjelas bukti pemakaian (G3).** Desain field/receipt yang paling kecil untuk mengikat pengetahuan yang benar-benar dibaca dengan tindakan dan verification artifact. Data yang tidak lengkap tetap unknown; telemetry tidak memberi otorisasi dan tidak menentukan model reasoning.
3. **Buktikan satu prosedur lintas sesi (G4/G5).** Pakai controller eksternal saat ini, Memory/Skills/Patterns existing sesuai jenis pengetahuan, serta task fixture lokal terbatas. Test definitions dan acceptance dipilih terlebih dahulu; tidak membuat runtime AI untuk menjalankan pilot ini.

Jika implementasi native sudah mencukupi, prioritaskan wiring dan evidence. Grounding donor berikutnya hanya untuk gap terpilih yang tidak terselesaikan secara wajar dengan primitive yang ada. Tidak diperlukan daftar donor baru untuk menyatakan G1/G2; source Agent Core sendiri sudah menunjukkan titik sambungannya.

## 6. Usulan bukti kematangan untuk dibahas sebelum fase runtime

Kriteria berikut adalah usulan engineering, bukan ambang yang telah disetujui atau dicapai. Tidak ada persentase kesiapan dari jumlah tools, notes, graph entities, checkpoint atau file test.

| Skenario yang nanti dipilih | Bukti yang dibutuhkan |
|---|---|
| Penyelesaian pertama | Fakta/error, pendekatan yang berubah, hasil yang diperiksa, dan pelajaran dengan source serta kondisi penggunaan. |
| Capture -> scoped recall | Record hasil review tetap berada pada scope yang dimaksud, muncul lewat retrieval yang relevan, dan bertahan setelah pembukaan ulang komponen. |
| Sesi controller baru | Tanpa history chat lama, controller menemukan pengetahuan yang benar dan tindakannya memperlihatkan penggunaan pengetahuan tersebut. Bukan simulasi dengan mengaku sesi ini sesi baru. |
| Kondisi berbeda atau source usang | Controller memeriksa applicability, tidak mengikuti prosedur secara buta, dan membedakan unchanged/changed/unavailable berdasarkan evidence yang memadai. |
| Hasil dan biaya | Task outcome/verification artifact serta langkah atau waktu yang didefinisikan sebelum pengujian. Pembanding sebanding diperlukan untuk klaim peningkatan, bukan hanya satu demo berhasil. |
| Kegagalan/interupsi | Existing evidence mempertahankan unknown/refused/failed, tidak menjalankan ulang mutasi secara buta, dan tidak merusak pengetahuan lain. |
| Batas otorisasi dan data | Hanya fixture yang disetujui, tidak memakai Memory produksi sebagai eksperimen, tidak merekam credential atau jejak penalaran internal. |

Sesudah gap relevan diperbaiki dan acceptance pada scope yang disepakati mendukung kematangan tubuh/Memory, laporkan evidence dan keterbatasan kepada pengguna. Barulah usulkan fase pembangunan native model/runtime; tidak dimulai otomatis oleh hasil audit atau satu tes sukses. Model API/local tetap target akhir dan bukan pemasangan dalam pekerjaan ini.

## 7. Penutupan audit dan ketidakpastian

Grounding ini menemukan dua celah aliran data yang konkret (scope capture dan freshness helper), satu batas atribusi yang perlu diperjelas, serta kebutuhan bukti prosedural/cross-session dan penyesuaian fixture. Fondasi persistence, retrieval, actions, integrity, feedback guard, review dan proposal refinement yang sudah ada tetap berguna. Tidak ada alasan dari audit ini untuk mengganti keseluruhan arsitektur.

Source yang tidak dibaca semantik, semua perilaku yang belum diuji, seluruh donor dan future runtime tetap di luar klaim audit. Graph tidak dipakai untuk menyimpulkan bahwa caller yang tidak terpetakan tidak ada. Health available tidak menjamin freshness/applicability setiap pelajaran. Bukti observed handoff tidak disamakan dengan model use atau causal improvement.

Pembaruan pada tugas ini terbatas pada laporan ini, arah fase dalam Product-Direction/AGENTS/README/MEMORY, bagian audit CODEBASE dan canonical Memory. `Target-Feture.md`, source/scripts/tests, package dan reference tidak diedit. Snapshot awal serta readback akhir disimpan dalam direktori evidence audit; readback menguji penulisan/integritas dalam cakupan tersebut, bukan melakukan acceptance produk.

**Kesimpulan keputusan:** tubuh Agent Core mempunyai fondasi yang dapat dipakai untuk tahap penguatan berikutnya, tetapi kematangan learning/reuse end-to-end belum dibuktikan oleh evidence yang diperiksa. Kerjakan usulan pre-runtime Memory Reuse Reliability terlebih dahulu setelah disetujui. Native AI runtime tetap ditunda sesuai urutan pengguna.
