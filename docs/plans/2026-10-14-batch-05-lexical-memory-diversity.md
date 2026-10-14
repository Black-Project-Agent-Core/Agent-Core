# Batch 5 — Diversitas lexical pada retrieval fusion Memory

**Status pelaksanaan 14 Oktober 2026 Asia/Tomsk: IMPLEMENTATION/INTEGRATION COMPLETE.** Selector canonical dan revisi ranking terintegrasi. Fusion full menghasilkan 3 record dengan diversityVersion `semantic-lexical-mmr/v1`, basis none/semantic, lexicalPairsEvaluated 0, skipped 0 dan coverage complete. Cabang fallback lexical belum teramati pada pemanggilan ini; manfaat retrieval belum diukur. Kontrak rinci berikut tetap menjadi acuan. [Laporan integrasi dan receipt](../Batch-05-06-Windows-Integration-20261014.md) mencatat aktivasi awal, koreksi diagnostik dan verifikasi resident koreksi. Status COMPLETE berlaku untuk kontrak implementasi/integrasi, bukan klaim manfaat retrieval atau akurasi ekstraksi.

Build produksi resmi gabungan lulus (371 authored files/0 exceptions, Memory lalu Core). Pemeriksaan lexical: 1 passed/6 skipped; dua pemeriksaan batas/pengiriman PDF lulus. Schema resmi 78 tools/130150 byte (baseline Consumer yang sama 129815 byte, delta +335; reviewed75 terpisah 124014/131072 byte), SHA256 `3c553f0cecfdcf53c126992c1bcdbda3548b2acb632bb079f5d433321072b7cb`. ZIP `SubProject/Agent-Core-ChatGPT-Plugin-Batch-05-06-v1.0.3.zip`, SHA256 `003dadefc28351ecf9b8af24e15c240e3df9572b2f23d4ac95ac931ab286d7ac`, sudah diunggah sebagai plugin 1.0.3 release `pluginrel_6ace893c75588191bc7d7b1d17ec6261`; app/name/binding existing tetap. Runtime product tetap 0.15.0-beta.3.

Restart pengguna memiliki receipt `a779c6cf88604708a503d7b18efdf819`, exit 0 pada `2026-10-13T19:41:53.0630171Z`; launcher PID18824/node PID10960 berjalan setelah build awal. Seluruh 18 pasangan hash source/build cocok sebelum koreksi, dan client memuat pdfPages, autoCheckpoint, retrievalPlan serta imageReview. Penggunaan nyata menemukan output-truncated palsu pada PDF web akibat normalisasi whitespace; helpers.ts kini membedakan pemotongan byte aktual dan service meneruskan boolean tersebut. Build koreksi resmi PID10624 lulus exit 0 dalam 16,10 detik, 371 authored files/0 exceptions. Kontrak/schema/ZIP tidak berubah; upload ulang tidak diperlukan. Restart koreksi, verifikasi web/lokal pada resident baru, cleanup recoverable serta finalisasi native Memory/Learning selesai dengan receipt dan readback. Artefak final/log berada di SubProject dan runtime/backups/batch05-06-integration-20261014, di luar temp.

Koreksi diaktifkan melalui satu restart dengan script existing setelah izin pengguna untuk auto-approve demi perkembangan Agent Core. Receipt `runtime/restart/2a92ce7b93384ed1bcf12ff05c96c780.json` mencatat completed/exit 0 pada 20:05:34 UTC. Core PID6968, parent launcher PID13436, mulai 20:05:36.1814640 UTC; executable runtime/node/node.exe dan dist/index.js diverifikasi, tunnel PID4168. Seluruh 19 pasangan source/emitted cocok setelah restart, changed[]. Pemanggilan web_open pada 20:09:33 UTC dan read_file pada 20:10:00 UTC mengirim PdfEvidence halaman 2 sampai controller; output-truncated palsu sudah hilang. Coverage partial kini hanya beralasan item-limit: 251 item terpilih, 32 dikirim, 219 omitted; reader lokal tetap mengirim 10 image blocks.

Cleanup selesai melalui pemindahan recoverable dengan Move-Item, proses PID2468 exit 0 pada `2026-10-13T20:15:46.5822634Z`. Seluruh node-compile-cache dipindahkan ke `runtime/backups/batch05-06-integration-20261014/cleanup-recovered-20261014`: 95 file, 309004 byte, 2 direktori, seluruh 95 SHA256 cocok. Preflight mencatat 0 reparse, 0 referensi proses aktif, 0 referensi Scheduled Task dan hasil handle No matching. Keadaan akhir terverifikasi: `E:/Projects/Agent-Core/temp` tidak ada; `E:/Projects/Agent-Core/runtime/tmp` kosong, 0 child. Receipt `activation-evidence/cleanup-preflight.json` dan `activation-evidence/cleanup-receipt.json` telah dibaca ulang; activation-receipt.json diperbarui in-place untuk resident koreksi, caller dan cleanup.

Canonical Memory existing `4b6d0835-b21e-431f-a724-bc9160c9f6ea` pada root runtime/memory diperbarui dan dibaca ulang pada `2026-10-13T20:22:38.852Z`; riwayat dipertahankan. feedbackTargetDigest `sha256:4404ed57196654c2ffc155042195adb18df0f466c444256d2975a2be2a9fc224`, freshness current/local-byte-snapshot, 3 source anchors, changed[] dan unavailable[]; capture `2026-10-13T20:22:37.798Z`. Learning checkpoint 358, key `batch05-06-20261014-activation-closure`, dibuat `2026-10-13T20:18:52.618Z`; review scoped task selesai dengan no-new-knowledge, complete:true dan 0 candidate pada `2026-10-13T20:19:15.348Z`, lalu status dibaca ulang. evidenceRefs persisted[] tetap kosong; bukti rinci berada di laporan/receipt. Review pending milik pekerjaan lain tidak disentuh. Dokumen ini tetap proyeksi status, bukan owner Memory kedua.

Batch 5–6 telah menyelesaikan implementasi/integrasi sesuai kontrak; fallback lexical aktual belum teramati dan manfaat retrieval/akurasi ekstraksi tidak diukur. Kelanjutan siap menuju Batch 7 lalu Batch 8 dari register 216 kandidat, maksimal dua plan sekaligus. Keduanya belum dimulai; status kesiapan ini tidak mengklaim rencana Batch 7/8 telah disusun atau source/plan telah direview. Consumer/Batch 3–4 tidak dibuka kembali; tidak ada Consumer tambahan atau Invocate.

| Fase | Status pelaksanaan |
|---|---|
| 1 — Rekonsiliasi owner/donor | Selesai pada source existing; keputusan #47 selected, #92 supporting, kandidat deferred dipertahankan. |
| 2 — Fallback bounded | Source selesai; pemeriksaan lexical terarah lulus. Cabang lexical aktual belum teramati pada fusion nyata tersebut. |
| 3 — Ranking revision/coverage | Source selesai, hanya fusion; metadata diversityVersion/basis/coverage teramati tanpa mengubah policy baseline atau vector-vector. |
| 4 — Build/aktivasi/pemakaian | Build/schema/ZIP, aktivasi awal serta restart koreksi selesai; fusion full dan PDF web/lokal nyata teramati. Manfaat retrieval belum diukur; fallback lexical aktual belum teramati dan tidak dikejar lewat pemanggilan buatan. |
| 5 — Dokumentasi/Memory | Dokumen diselaraskan; canonical Memory existing diperbarui/dibaca ulang dan Learning checkpoint 358 selesai no-new-knowledge. |
| 6 — Cleanup | Selesai recoverable: 95 file/95 SHA256 cocok pada backup resmi; temp tidak ada dan runtime/tmp kosong, 0 child. |

Checkbox fase 1–6 ditutup berdasarkan implementasi, pemakaian nyata, canonical persistence dan cleanup yang tercatat. Cabang fallback lexical aktual tetap belum teramati; tidak ada pemanggilan tambahan untuk memaksanya.

**Tujuan:** Membuat recall fusion tetap mempertimbangkan redundansi antarhasil ketika salah satu vector pasangan tidak tersedia, melalui engine Memory yang sudah dipakai Agent Core.

**Pilihan:** #47 Grok Build saja. #92 Dataverse menjadi bukti pembanding, bukan adopsi kedua. Batch 3 dan 4 diterima **implementation/integration COMPLETE**. Hasil partial/deadline yang sesuai kontrak Batch 3 tetap sah; rencana ini tidak membuka kembali syarat seluruh subquery selesai.

**Arsitektur:** Perubahan berada pada selector fusion canonical dan pengikatan revisi ranking yang sudah ada. Agent Core tetap tubuh/tools/Memory/Learning bagi AI controller eksternal. Nama penyimpanan tetap `runtime/memory`; tidak ada store, engine, runtime, adapter, provider, atau tool baru. Invocate tetap ditunda.

## 1. Landasan source dan status yang tidak boleh dicampur

- Remote resmi aktif `Black-Project-Agent-Core/Agent-Core`, branch `main`, dibaca pada commit `73e9fd270ee96fe7d9782b9e87ccc70dbbae986d`. Package runtime pada source tersebut `0.15.0-beta.3`.
- Remote tersebut menyediakan baseline source berpinned, **bukan identitas lengkap instalasi Windows setelah Batch 3/4**. Laporan integrasi pengguna menyebut checkout Windows HEAD `639cdf77fd7288a722131862e22eecaff4a90f07` dengan perubahan integrasi lokal. Jangan mengambil source remote lama untuk menimpa perubahan itu.
- Laporan integrasi 13 Oktober mencatat final build, aktivasi combined build, refresh client, planned-context exact-revision berstatus partial/deadline, serta satu review gambar dengan binding source/view yang sesuai. Itu diterima sebagai overlay instalasi Batch 3/4. Pengguna kemudian menutup kedua batch sebagai COMPLETE.
- Checkout cloud historis `8d1f158` dengan dokumentasi kotor dan parent Git yang tidak tersedia bukan sumber instalasi terkini. Rencana ini tidak meminta reset, checkout, perbaikan Git, atau pull buta.
- Bukti riset: `candidate-adoption-opportunities-20261012.md` versi 2 dan JSON pendamping versi 2, khusus kelompok `AC-047-lexical-mmr-fallback`. Temuan statis tidak menjadi klaim peningkatan mutu atau kecepatan.

Pada awal implementasi, cocokkan **sekali dan hanya seam terpilih** dengan source Windows yang benar-benar akan dibangun. Catat commit bila tersedia, dirty delta relevan dan identitas file; pertahankan pekerjaan lokal. Bila fallback ternyata sudah ada pada seam tersebut, gunakan hasil existing dan tutup bagian yang tercakup, tanpa menambah implementasi paralel.

## 2. Rekonsiliasi kandidat

| Kandidat | Keputusan Batch 5 | Alasan |
|---|---|---|
| #47 Grok Build | **Selected** | `maxSemanticRedundancy` pada source canonical mengembalikan 0 bila candidate vector hilang dan melewati selected tanpa vector. Kontrak Batch 3 secara eksplisit menunda #47 dan tidak mengubah ranker. |
| #92 Dataverse | **Supporting only** | Menguatkan kebutuhan membedakan near-duplicate lexical, tetapi MinHash/Spark/GraphFrames dan penghapusan per connected component tidak dibutuhkan untuk selector ini. |
| #30 Mem0 | **Deferred dari batch ini** | Dua catch menjadi array kosong terlihat pada baseline, tetapi jalur planned Batch 3 sudah mempunyai status partial/blocked. Source installed pada caller legacy/failure tidak dibuktikan ulang di tugas planning ini; jangan menyebut gap pasti sudah tertutup atau memasukkannya demi jumlah adopsi. |
| #34 OpenViking | **Deferred dari batch ini** | Baseline synthesis belum mempunyai omission per section, tetapi owner itu diubah Batch 3. Sisa omission packet perlu keputusan terpisah jika memang masih dibutuhkan. Tidak menyalin source AGPL. |
| #83 AMD | **Deferred** | Failure-query enrichment memerlukan tujuan task semantik yang sah dan terkini. `taskKey` bukan tujuan semantik. Menambah kontrak goal/lifecycle akan memperluas batch di luar selector. |

Source donor #30, #34 dan #83 yang disebut riset dibaca kembali secara terarah untuk keputusan di atas. Status deferred tidak berarti rejected, implemented, atau covered. Register kandidat yang sama diperbarui; tidak membuat katalog baru.

## 3. Owner, rantai caller, dan gap yang tepat

### Owner aktif

1. `src/index.ts:74–85` mengambil service melalui `initializeAgentCoreMemory`.
2. `src/memory/host-runtime.ts:88–115` mempertahankan pilihan engine yang sudah dikonfigurasi. Pada experience-v2, service shared adalah engine dari `SubProject/agent-core-memory`, dengan root canonical `runtime/memory`.
3. Target utama: `SubProject/agent-core-memory/src/memory/retrieval.ts`.
4. `src/memory/retrieval.ts` adalah implementasi jalur fallback lama, bukan penanda bahwa seluruh repository bersifat legacy. Tidak mengubah dua engine sekaligus atau mengaktifkan mode lain untuk batch ini.

### Rantai controller eksternal

- Jalur single-query/failure: `controller_learning(context)` atau wrapper error MCP → `ExternalControllerLearningService.context/failureContext` → shared `MemoryService.search(... rankingProfile: 'fusion')` → `searchMemories` → `searchMemoriesFusion` → `selectFusionCandidates` → `maxSemanticRedundancy`.
- Jalur planned Batch 3: context existing → helper planned/subquestion existing → satu `memory.controller(scope, 'fusion-feedback-v1')` → dispatcher/recall existing → backend `rank` → selector fusion yang sama. Ini mengikuti kontrak integrasi Batch 3; nama/path helper installed harus dicocokkan dengan berkas aktual, bukan ditebak dari remote lama.
- Jalur observasi langsung: `memory_search` existing → shared service → `formatDeliveredMemorySearchResult`. Bentuk `full` sudah membawa `selection`; bentuk compact/minimal/preview tidak menjanjikan detail tersebut.
- `MemoryService.controller()` secara umum masih default `baseline-v1`. Hanya pemanggil yang memang memilih `fusion-feedback-v1` terpengaruh. Retrieval historis dan policy baseline tidak diubah.

### Source yang menentukan desain

Pada canonical `retrieval.ts:332–383`, pasangan dua vector menggunakan cosine yang di-clamp 0–1, lalu MMR menggabungkannya dengan relativeScore dan feedback. `FUSION_MMR_LAMBDA=0.8`, threshold ratio `0.2`, RRF `60`, tie-break RRF lalu ID tetap milik native.

Batas hasil bukan batas seluruh pekerjaan. Search biasa membatasi direct limit sampai 50, sedangkan backend controller `service.ts:286–323` dapat meminta `limit=records.length` untuk pagination. Karena itu, fallback lexical mendapat batas kerja sendiri dan tidak menyalin donor yang meranking ulang seluruh list tanpa batas lexical tersendiri.

## 4. Kontrak perilaku

### Positive — Purpose / expected behavior

- Dua vector tersedia: hasil kemiripan memakai jalur cosine native yang sama, tanpa interpolasi lexical.
- Salah satu atau kedua vector tidak tersedia: pasangan boleh memakai token-set Jaccard atas **content dari snapshot canonical yang sama**, sesudah pemeriksaan eligibility existing.
- Token kosong tidak dianggap identik. Metadata serupa, nama folder, tag, atau ID tidak dipakai sebagai bukti kesamaan isi.
- Hasil tetap memakai skor relevance/feedback, identity, revision, links dan kebijakan disclosure native. Penalti redundansi memengaruhi urutan seleksi; tidak menghapus atau menggabungkan Memory.
- Pekerjaan fallback deterministik, lokal, bounded, dan dilepas pada akhir invocation. Kondisi lexical yang tidak bisa dinilai tetap terlihat sebagai skipped/unavailable, bukan kemiripan pasti nol.
- Partial/deadline, exact revision, scope/grants, output budget, late settlement, conflict dan receipt Batch 3 tetap berlaku. Review gambar Batch 4 tetap deklaratif dari controller; fitur ini tidak menambah otoritas semantik.

### Negative — Purpose / unexpected behavior

- Jangan menganggap lexical mirip berarti fakta sama, Memory benar, pengalaman masih berlaku, izin eksekusi, atau bukti helpfulness.
- Jangan mengubah vector/vector, scorer query, bobot fusion, feedback salience, policy baseline, retrieval historis, atau strategi round-robin Batch 3.
- Jangan memotong candidate universe, menghapus contradiction/supersession, menambah hard-dedup lexical, atau menulis ulang source content untuk mengejar diversitas.
- Jangan menambah embedding call, API/model, retry, expand, continuation, process global cache, reindex/re-embedding, atau jalur provider baru.
- Jangan membocorkan raw token/content/query, exception, path privat, atau kredensial melalui metadata.
- Jangan menjadikan unavailable fallback sebagai recall berhasil/kosong palsu atau membuat receipt used/helpful otomatis.

### Batas lokal yang dipilih

Batas berikut adalah keputusan resource konservatif untuk batch ini, bukan angka yang diklaim optimal:

- Maksimum **256 candidate content** boleh dimaterialisasi ke token cache, mengikuti urutan candidate native yang deterministik.
- Maksimum **8.192 Unicode codepoints** diperiksa per content dan **512 token unik** disimpan per candidate.
- Content melebihi batas, token terpotong di batas, atau tokenization yang tidak lengkap membuat lexical candidate itu **unavailable**. Jangan membandingkan prefix saja seolah mewakili seluruh isi.
- Maksimum **8.192 pasangan lexical** dinilai per pemanggilan selector; setiap pasangan dinilai sekali. Simpan maksimum redundansi per candidate secara incremental agar pasangan lama tidak dihitung ulang.
- Batas ini tidak membatasi ulang kandidat native dan tidak mengubah pasangan dua vector. Saat lexical allowance habis, pasangan itu tidak menambah penalti baru dan dicatat skipped; hasil tidak diberi label full lexical coverage.
- Gunakan normalization/token primitives internal yang sesuai, tanpa mengubah tokenizer query bersama. Jangan memakai fallback tokenizer document yang kembali membaca seluruh string ketika batas lokal terlampaui.

## 5. Enam fase implementasi

### Fase 1 — Ikat perubahan ke owner dan donor yang tepat

**File:** canonical `retrieval.ts`, `service.ts`, host-runtime sebagai referensi read-only; `THIRD_PARTY_NOTICES.md`.

- [x] Ambil perubahan relevan yang sudah dipublikasikan ke https://github.com/Black-Project-Agent-Core/Agent-Core melalui pembacaan/fetch resmi; bandingkan dengan source lokal aktual dan integrasikan ke file owner asli bila belum ada. Jangan menimpa dirty work, membuat checkout produk kedua, atau melakukan merge/reset otomatis.
- [x] Cocokkan seam selected dengan source installed; pertahankan konfigurasi engine, root, dan perubahan Batch 3/4 yang belum terpublikasi.
- [x] Gunakan source donor #47 berpinned pada bagian 7. Adaptasi mekanisme kecil ke TypeScript native; tidak membawa crate, runtime, struktur database atau config donor.
- [x] Pertahankan atribusi Apache-2.0/SpaceXAI dan pemberitahuan perubahan pada materi adaptasi yang relevan di notice existing. Root NOTICE donor tidak ditemukan pada path yang dibaca; itu bukan klaim bahwa seluruh tree bebas notice tambahan.
- [x] Catat #47 selected dan #92 supporting pada register existing; tiga kandidat lain tetap deferred sesuai alasan di atas.

**Hasil teramati:** file target dan keputusan lisensi tertambat pada source yang akan dibangun; tidak ada engine/store baru.

### Fase 2 — Tambahkan fallback pasangan yang bounded

**File:** `SubProject/agent-core-memory/src/memory/retrieval.ts`; gunakan helper lokal dalam owner ini bila memadai.

- [x] Jadikan pemilihan kemiripan per pasangan: dua vector → cosine native; pasangan tanpa salah satu vector → lexical bounded.
- [x] Bangun token set dari content canonical saja. Terapkan batas codepoint/token/cache/pasangan di bagian 4; nilai Jaccard hanya bila kedua set lengkap dan nonempty.
- [x] Pertahankan native relevance, feedback, threshold, exact-signature dedup, tie-break, limit, linked expansion dan pengembalian record.
- [x] Cache maksimum tiap candidate dari selected yang baru ditambahkan. Jangan menyalin loop donor yang mengulang seluruh pasangan selected pada setiap putaran.
- [x] Buang cache setelah invocation; jangan menyimpan token atau plaintext tambahan ke disk.

**Hasil teramati:** fallback masuk selector fusion yang dipakai caller existing, termasuk pasangan mixed-vector; dua vector dan jalur policy lain tetap mengikuti behavior semula.

### Fase 3 — Pertahankan revisi ranking dan jelaskan coverage minimum

**File:** canonical `retrieval.ts`, `service.ts`; `controller-session.ts` dan `src/memory/search-projection.ts` sebagai consumer existing.

- [x] Tambahkan versi internal mekanisme/batas lexical ke `rankingRevision` **hanya untuk fusion**. Reuse digest dan cursor binding existing; cursor dengan kontrak ranking lama menjadi stale melalui jalur native. Tidak membump semantic-document/index atau membuat cursor/cache lain.
- [x] Perluas `selection` secara kecil dengan versi mekanisme, basis yang benar-benar dipakai (semantic/lexical/mixed/none), jumlah pasangan lexical dinilai/dilewati, serta coverage lengkap atau bounded. Jumlah field tetap konstan; tidak ada daftar token/pasangan.
- [x] Pastikan `redundancy` tetap skor numerik yang benar-benar dipakai MMR. “None” pada hasil pertama tidak mengaku sudah membandingkan lexical.
- [x] Metadata full search mengikuti proyeksi/budget existing. Bila proyeksi membuang detail, jangan mengklaim controller melihatnya. Tidak menambah public input, tool, transport adapter atau surface diagnostik baru.
- [x] Pertahankan ledger dan receipt native. `memory_retrieval_diagnostics` saat ini hanya agregat; jangan menyebut agregat itu bukti per-pasangan.

**Hasil teramati:** perbedaan ranking mempunyai identitas stabil; response full dapat menunjukkan mekanisme yang dipakai tanpa membuka isi baru atau mengubah authority.

### Fase 4 — Bangun, aktifkan, dan pakai lewat controller eksternal

**File/jalur:** build resmi existing, launcher existing, manifest resmi existing; `E:\Projects\Agent-Core\Restart-Agent-Core.cmd`.

- [x] Bangun source final melalui alur resmi yang sudah membangun Memory lalu Core. Catat identitas source/output yang dipakai; tidak membuat installer atau launcher baru.
- [x] Periksa descriptor aktual sekali. Target batch ini tidak menambah tool/public input. Bila perubahan benar-benar tidak memerlukan re-upload plugin **dan** rebuilt source memang memerlukan restart, dua kondisi pengguna untuk restart otomatis terpenuhi. Gunakan launcher existing; jangan membuat aturan/gate/restart helper baru, mengganti UAC atau setup sistem.
- [x] Bila ternyata ada penambahan tool atau perubahan descriptor yang memerlukan refresh paket, buat ZIP melalui jalur resmi dan **Upload new version** ke app yang sama. Naikkan versi package dari versi aktual saat itu; jangan mengasumsikan angka berikut bebas benturan. Pertahankan ID app `asdk_app_6acd4cde8b008191bf289261ed843a17`, konfigurasi serta kredensial existing. Minta tindakan pengguna yang diperlukan; kondisi restart otomatis di atas tidak berlaku bila re-upload diperlukan.
- [x] Referensi paket yang berhasil adalah `Agent-Core-ChatGPT-Plugin-Batch-03-04-v1.0.1.zip`, berisi `.app.json` dan `.codex-plugin/plugin.json` dengan versi package 1.0.1. Snapshot schema JSON bukan paket upload. Runtime version, schema/manifest identity, dan plugin package version dicatat terpisah.
- [x] Setelah build aktif, lakukan penggunaan nyata yang relevan melalui `memory_search` existing dengan fusion atau context existing yang memakai fusion. Simpan referensi invocation, attempt/revision yang benar-benar returned, dan metadata mekanisme yang tersedia. Untuk menunjukkan fallback lexical secara langsung, gunakan hasil full yang memang mempunyai pasangan missing-vector pada data yang sah.
- [x] Jangan mematikan provider, menambah Memory sintetis, mengulang sampai “bagus”, atau mewajibkan semua subquery selesai untuk memperoleh bukti. Jika data nyata tidak memicu fallback atau output menyusut ke compact, laporkan bagian tersebut sebagai belum teramati, terpisah dari aktivasi build. Tidak mengklaim keuntungan mutu/kecepatan dari satu panggilan.

**Hasil teramati:** controller eksternal mencapai build baru melalui tool existing. Label “fallback lexical teramati” hanya dipakai bila metadata invocation benar-benar mendukungnya; “Batch 5 COMPLETE” tidak didasarkan pada keberadaan file/helper saja.

### Fase 5 — Selaraskan dokumentasi dan Memory yang sudah ada

**File:** plan ini pada lokasi dokumen proyek yang disetujui, `docs/CODEBASE.md`, `MEMORY.md`, dokumen retrieval terkait dan register riset existing.

- [x] Perbarui in-place owner map, batas, attribution, keputusan kandidat, serta status source/build/activation/client/perilaku yang benar-benar diamati.
- [x] Jangan mempertahankan pernyataan “Batch 3/4 belum selesai” sebagai status terkini. Riwayat bertanggal tetap dipertahankan dan dibedakan dari status sekarang.
- [x] Simpan ringkasan faktual yang sama melalui owner Memory lokal canonical di `runtime/memory`; baca kembali record/revision yang diperbarui. `MEMORY.md` tetap proyeksi kontinuitas repository, bukan store kedua.
- [x] Finalisasi Learning pada task/checkpoint milik pekerjaan ini sesuai lifecycle existing. Jangan memberi feedback helpful atau menangkap reusable lesson hanya karena ranking telah berubah. Cortex hanya tambahan bila memang diotorisasi.
- [x] Pisahkan “implementation/integration complete”, “fallback branch observed”, dan “manfaat belum diukur” dalam ringkasan.

**Hasil teramati:** dokumentasi dan Memory lokal menyampaikan status yang sama dengan receipt pekerjaan, tanpa klaim keberhasilan tambahan.

### Fase 6 — Selesaikan file sementara setelah integrasi

**Scope tepat:** `E:\Projects\Agent-Core\temp` dan `E:\Projects\Agent-Core\runtime\tmp`.

- [x] Hanya setelah perubahan terintegrasi/aktif dan tidak ada pengguna file yang masih berjalan, inventaris isi kedua direktori secara terbatas pada scope tersebut.
- [x] Pindahkan artefak hasil yang memang harus dipertahankan ke lokasi output/backup resmi **di luar direktori temp**. Jangan mengecualikan isi tmp dari pembersihan dengan alasan “dipertahankan di sana”.
- [x] Bersihkan seluruh isi secara recoverable setelah penggunaan selesai. Jangan permanent purge, menghapus backup, menyentuh `runtime/memory`, atau mengikuti reparse/symlink keluar scope.
- [x] Bila file masih aktif, hentikan cleanup bagian itu, jelaskan file/proses yang masih memakai direktori, dan lanjutkan setelah aman. Jangan menutup cleanup sebagai selesai selama masih ada isi.
- [x] Catat keadaan akhir kedua direktori kosong atau tidak ada. Ringkasan akhir menggabungkan status source, build, activation, client, Memory/Learning dan cleanup yang nyata.

**Hasil teramati:** tidak ada file sementara tersisa dalam dua scope tersebut setelah aman, tanpa penghapusan area lain.

## 6. Batas selesai dan handoff

Batch ini selesai ketika mekanisme sudah menyatu dengan selector owner aktif, source final telah dibangun/diaktifkan melalui jalur existing, penggunaan tool eksternal mencapai build tersebut, status observasi dijelaskan jujur, dokumen/Memory diselaraskan, dan cleanup scoped tuntas. Bila aktivasi, upload atau cleanup menunggu tindakan yang belum diotorisasi/tersedia, sebutkan satu kebutuhan intervensi konkret; jangan mengklaim COMPLETE.

Tidak ada syarat test suite, benchmark, audit berulang, loop evaluasi, atau completion semua subquery dalam plan ini. Positive/Negative di atas adalah kontrak perilaku produk dan batas klaim.

Batch 6 dapat mengerjakan owner PDF/proyeksi dokumen secara terpisah. Tidak diperlukan migrasi engine, store, perubahan grants, atau penambahan Native/API agent untuk Batch 5.

## 7. Sumber terarah

Seluruh source berikut dibaca pada pin yang disebut; line range mengacu pada source remote tersebut, bukan nomor baris Windows setelah integrasi.

1. [Owner host dan root canonical](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/73e9fd270ee96fe7d9782b9e87ccc70dbbae986d/src/memory/host-runtime.ts#L88-L115), [wiring runtime](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/73e9fd270ee96fe7d9782b9e87ccc70dbbae986d/src/index.ts#L74-L85).
2. [Canonical pairwise redundancy/selector](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/73e9fd270ee96fe7d9782b9e87ccc70dbbae986d/SubProject/agent-core-memory/src/memory/retrieval.ts#L332-L383), [fusion filtering/output](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/73e9fd270ee96fe7d9782b9e87ccc70dbbae986d/SubProject/agent-core-memory/src/memory/retrieval.ts#L386-L524).
3. [Controller policy, rank dan rankingRevision](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/73e9fd270ee96fe7d9782b9e87ccc70dbbae986d/SubProject/agent-core-memory/src/memory/service.ts#L215-L333), [search eligibility/projection/ledger](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/73e9fd270ee96fe7d9782b9e87ccc70dbbae986d/SubProject/agent-core-memory/src/memory/service.ts#L1222-L1425).
4. [Snapshot dan cursor existing](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/73e9fd270ee96fe7d9782b9e87ccc70dbbae986d/SubProject/agent-core-memory/src/memory/controller-session.ts#L122-L215), [tokenizer native](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/73e9fd270ee96fe7d9782b9e87ccc70dbbae986d/SubProject/agent-core-memory/src/memory/identifier-tokenizer.ts#L1-L54).
5. [External failure caller](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/73e9fd270ee96fe7d9782b9e87ccc70dbbae986d/src/learning/external-controller.ts#L690-L734), [context caller baseline](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/73e9fd270ee96fe7d9782b9e87ccc70dbbae986d/src/learning/external-controller.ts#L840-L972), [tool output existing](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/73e9fd270ee96fe7d9782b9e87ccc70dbbae986d/src/mcp/memory-tools.ts#L160-L191).
6. [Kontrak Batch 3: #47 terpisah dan fusion-feedback](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/73e9fd270ee96fe7d9782b9e87ccc70dbbae986d/docs/plans/2026-10-12-batch-03-bounded-memory-subquestions.md#L45-L83). Status draft historis dalam berkas remote disupersede laporan integrasi dan keputusan COMPLETE pengguna.
7. [Grok Build MMR body](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-memory/src/mmr.rs#L14-L120), [caller search](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-memory/src/search.rs#L172-L220), [rerank sebelum truncate](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-memory/src/search.rs#L296-L367), [default enabled=true/lambda=0.7](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-config-types/src/memory.rs#L326-L346), [Apache-2.0 / Copyright SpaceXAI](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/LICENSE). Donor memberi dua set kosong similarity 1; keputusan native batch ini sengaja tidak menyalinnya. Komentar donor “opt-in” tidak mengalahkan default enabled=true yang dibaca.
8. [Dataverse MinHash](https://github.com/UpstageAI/dataverse/blob/a0adedc316a4269ae6292fa1527381cfc2688eec/dataverse/etl/deduplication/minhash.py#L230-L373), [lisensi](https://github.com/UpstageAI/dataverse/blob/a0adedc316a4269ae6292fa1527381cfc2688eec/LICENSE). Source memberi atribusi text-dedup; operasi akhir dropDuplicates(component) bukan selector provenance-aware. Ekspresi modulus pada baris 249 berisiko salah precedence; tidak diadopsi atau dijadikan dasar klaim mutu.
9. [Mem0 error versus empty](https://github.com/mem0ai/mem0/blob/b7ad69afda6b6ed030347c66d48a13e4de9dec08/mem0/memory/main.py#L957-L991), [Apache-2.0](https://github.com/mem0ai/mem0/blob/b7ad69afda6b6ed030347c66d48a13e4de9dec08/LICENSE). Parsing failure donor masih jatuh ke empty; tidak menyalin jalur ini.
10. [OpenViking budget dengan SPDX AGPL-3.0](https://github.com/volcengine/OpenViking/blob/4a2909b44f0b89b0069527bd9da022739f9c1fa1/openviking/retrieve/context_assembler/budget.py#L1-L194), [MCP membuang stats](https://github.com/volcengine/OpenViking/blob/4a2909b44f0b89b0069527bd9da022739f9c1fa1/openviking/server/mcp_endpoint.py#L575-L598). Referensi konsep saja.
11. [AMD function retrieval](https://github.com/taeilkim2465/agentic_memory_distillation/blob/2895d10c07105432325b088f4803dc94a10003c9/bfcl/common/memory/store.py#L219-L297), [error-only injection](https://github.com/taeilkim2465/agentic_memory_distillation/blob/2895d10c07105432325b088f4803dc94a10003c9/bfcl/common/memory/injection.py#L338-L400). Lisensi reuse belum ditetapkan dalam riset; tidak menyalin kode, store atau raw reasoning.
12. [Notice native existing](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/73e9fd270ee96fe7d9782b9e87ccc70dbbae986d/THIRD_PARTY_NOTICES.md), [diagnostics hanya agregat](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/73e9fd270ee96fe7d9782b9e87ccc70dbbae986d/SubProject/agent-core-memory/src/memory/retrieval-ledger.ts#L470-L588).

Identitas bahan pengguna: laporan riset Markdown versi 2 `libfile_da1b1f4273cc81919ad3a4ec7af90e5a`; JSON versi 2 `libfile_e300eb98b9ec8191b04842b5c9844978`; laporan Windows `libfile_350232341db88191a55f4c51508d07d0`; ZIP berhasil `libfile_00be9450e630819199067097843b7425`. Snapshot schema tambahan `libfile_5fe1c578f5488191ace4856210d2d947` adalah cohort 78 tools/128.476 bytes; jangan dibandingkan sebagai cohort identik dengan snapshot 75 tools dalam riwayat.

