# Peluang Adopsi Source Kandidat — Pendalaman 12 Oktober 2026

**Status: RISET SAJA. Bukan plan Batch 5/6 dan bukan perintah implementasi.**

Baseline source Agent Core: `86fe9efe53dcfa8da61616c5e5d34e724e0a1891`. Source produk lokal tidak berubah dari commit tersebut pada awal riset. Dokumen donor dibaca pada pin yang dirinci di register; ini tidak mengklaim semua donor memakai versi upstream paling baru.

## Ringkasan

- Seluruh **216 ID** dipetakan tepat sekali; semuanya pernah menjalani first-pass sebelumnya.
- **8 kandidat** tetap milik Batch 1–4; **208 entri** lain ditinjau status/peluangnya.
- Putaran ini membaca ulang **143 kandidat pada body kode berpinned**, **2 source parsial tanpa pin**, **5 interface**, **1 konfigurasi**, dan **7 dokumentasi/metadata**.
- **50 entri** memakai bukti putaran sebelumnya tanpa pembacaan body donor baru; **8 reserved** juga tidak dihitung sebagai inspeksi donor baru. Daftar ID dan batas tiap entri ada di JSON. Tidak semua entri yang dipetakan berarti engine-nya terbuka atau dibaca penuh.
- Ditemukan **17 kelompok peluang dari 18 kandidat**. #120 dan #140 digabung dalam satu gap PDF. Ini bukan 17 instalasi wajib dan bukan klaim donor lebih unggul secara terukur.
- Fokus adopsi: mekanisme yang memperbaiki owner internal untuk AI eksternal pengendali Agent Core. Modul, store, runtime donor dan dependency eksternal tidak otomatis diadopsi.

## Klasifikasi peluang

| Kategori | Jumlah | Makna |
|---|---:|---|
| Gap source untuk controller eksternal | 6 | Ada perbedaan mekanisme konkret; tetap memerlukan pencocokan ulang setelah Batch 3/4 |
| Peluang eksternal bersyarat | 4 | Bergantung consumer, evidence, scope atau kontrak tambahan |
| Bukti/evaluasi saja | 4 | Tidak otomatis menjadi fitur runtime, gate atau instruksi menjalankan pengujian |
| Producer/aplikasi opsional | 2 | Hanya relevan bila producer/worker yang sesuai memang dibutuhkan |
| Native-only | 1 | Dicatat untuk kelengkapan, bukan prioritas AI eksternal |

## Syarat sebelum plan Batch 5 dan 6

Dokumen peluang adalah riset pada snapshot source, bukan plan implementasi. Semua peluang berstatus belum dipilih. Batch 3 dan 4 harus sudah terintegrasi sebelum penyusunan plan Batch 5–6. Tidak cukup hanya file plan tersedia atau laporan lama menyebut selesai.

Saat prasyarat itu tercapai, lakukan satu rekonsiliasi terarah terhadap peluang yang akan dipilih:
1. Catat commit/codebase hasil integrasi aktual, kontrak tool yang dipakai AI eksternal, dan batas bukti aktivasi. Pisahkan source dari runtime/manifest client.
2. Baca ulang jalur donor yang dirujuk pada pin yang tercatat; jika pin berubah, jelaskan perubahan dan lisensi file terkait.
3. Baca ulang owner penerima dan caller yang benar-benar dapat dijangkau AI eksternal. Kehadiran nama file atau helper belum membuktikan fungsi aktif.
4. Bandingkan gap dengan hasil Batch 3 dan4. Jika sudah tertutup, tandai tercakup; jangan mengadopsi ulang atau membuat owner paralel. Jika sebagian tertutup, batasi sisa gap.
5. Pastikan tidak mengubah kontrak multi-query/revisi/disclosure/grants/receipt Batch3 atau batas view/source/semantic-assessment Batch4 tanpa alasan yang eksplisit.
6. Gabungkan peluang donor yang menutup gap native sama menjadi satu pilihan mekanisme, dengan perbandingan bukti, bukan beberapa instalasi. Nilai lisensi, dependency yang tersisa, biaya integrasi dan consumer konkret.
7. Setelah itu barulah pilih isi dua batch baru. Perbarui status selected/covered/deferred/rejected dan alasan di register yang sama. Penilaian source statis tidak boleh berubah menjadi klaim manfaat runtime tanpa bukti.

Konsep Invocate tetap ditunda. Riset ini tidak mengotorisasi pembangunan, pergantian engine, pemasangan provider, aktivasi model/API, atau perubahan memory store. Nama penyimpanan tetap runtime/memory.

## Daftar peluang terkelompok

| ID kandidat | Peluang | Kategori |
|---|---|---|
| #30 | Membedakan recall kosong dan recall gagal | external-runtime-gap |
| #34 | Cakupan bagian dan disclosure omission pada knowledge packet | external-runtime-gap |
| #44 | Bukti negatif untuk pemilihan Skill yang opsional | evidence-evaluation-only |
| #47 | Diversitas lexical ketika embedding tidak tersedia | external-runtime-gap |
| #82 | Advisory sumber/metode berbasis evidence lintas task, conditional | conditional-external |
| #83 | Task-conditioned failure-local recall untuk controller eksternal | external-runtime-gap |
| #90 | Advisory progress dengan isolasi run/task dan hasil sukses yang unchanged | external-runtime-gap |
| #94 | Evaluasi pemilihan respons tool yang membedakan slot, relevansi, dan completion | evidence-evaluation-only |
| #120, #140 | Proyeksi PDF berbasis kemampuan, halaman, wilayah, dan asal ekstraksi | external-runtime-gap |
| #123 | Serialisasi per aplikasi untuk worker non-reentrant | producer-or-optional-application |
| #127 | Saran prosedur terverifikasi yang terikat konteks halaman | conditional-external |
| #131 | Batas turn utuh untuk context Native Agent Chat | native-only-not-current-target |
| #135 | Cakupan klaim eksplisit terhadap evidence exact-revision | conditional-external |
| #144 | Freshness artefak dari dependency set yang diketahui producer | producer-or-optional-application |
| #164 | Paket bukti revisi Skill dengan cakupan keberhasilan lama dan defect probe | evidence-evaluation-only |
| #183 | Penjelasan freshness berbasis bukti konfirmasi pada retirement preview | conditional-external |
| #192 | Propensity yang dapat diputar ulang untuk evaluasi recall | evidence-evaluation-only |

## Cara menggunakan register

[JSON pendamping](candidate-adoption-opportunities-20261012.json) memuat setiap ID, kedalaman pembacaan aktual, source pin/range/simbol, pembanding native, batas lisensi, coupling, hipotesis manfaat, serta syarat pemeriksaan setelah Batch 3/4. Field analysis mempertahankan detail masing-masing kelompok agar caveat donor tidak hilang. [Ledger awal](candidate-source-review-216-20261012.md) tetap menyimpan keputusan first-pass; penelitian ini menambah atau mengoreksi bukti spesifik, tidak mengubahnya menjadi status implementasi.

## Pendalaman kandidat 001–054

Baseline Agent Core: `86fe9efe53dcfa8da61616c5e5d34e724e0a1891`, 12 Oktober 2026. Target tetap AI eksternal yang memakai owner Agent Core existing. Ini riset source, bukan rencana Batch 5/6 atau implementasi.

### Hasil utama

Tiga peluang menyentuh perilaku runtime/response controller eksternal; satu peluang tambahan bersifat evaluasi opsional. Tidak ada klaim peningkatan performa terukur.

#### #47 Grok Build: diversitas saat embedding tidak tersedia

Celah lama dikonfirmasi kembali. `maxSemanticRedundancy` native mengembalikan nol untuk kandidat tanpa vector dan melewati pasangan selected tanpa vector. Exact-signature dedup tidak menyelesaikan near-duplicate lexical. Donor [MMR token-Jaccard](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-memory/src/mmr.rs#L19-L120) menyediakan pembanding tanpa embedding.

Seam riset: fallback pasangan lexical berbatas dalam selector canonical yang sama. Jangan mengganti jalur pasangan vector lengkap, fusion, feedback atau penyimpanan. Native menerima pool yang dapat lebih besar daripada asumsi donor; cache/token/comparison bounds perlu jelas. Dua token set kosong pada donor dianggap identik, sehingga tidak layak disalin tanpa penyesuaian. Lisensi Apache-2.0.

Batch 3 sudah menunda #47 secara eksplisit karena ranking global berbeda dari orchestration multi-query. Periksa lagi source hasil integrasi sebelum memilihnya.

#### #30 Mem0: bedakan recall kosong dari recall gagal

Peluang baru yang sempit. Donor [memisahkan generation error dari hasil kosong](https://github.com/mem0ai/mem0/blob/b7ad69afda6b6ed030347c66d48a13e4de9dec08/mem0/memory/main.py#L957-L991). Native `ExternalControllerLearningService.context` dan `failureContext` mengubah exception pencarian Memory menjadi `[]`, lalu memakai wording tidak ada Memory relevan. Dengan demikian kegagalan lookup dapat tampak seperti pencarian sukses tanpa hasil.

Seam riset: status read bounded dan reason code tersanitasi pada response existing, sambil tetap fail-soft. Tidak ada retry otomatis, web fallback, provider atau gate baru. Fallback lexical yang memang berhasil tetap hasil valid. Donor sendiri masih mengubah parse error menjadi kosong; jangan meniru seluruhnya. Lisensi Apache-2.0.

Overlap kuat dengan Batch 3: planned retrieval sudah dirancang mempunyai partial/blocked status. Recheck apakah implementasi aktual juga menyelesaikan jalur legacy single-query dan failure capsule. Bila sudah, tutup peluang ini.

#### #34 OpenViking: cakupan packet saat budget habis

Peluang baru pada komposisi packet. Donor [memberi floor detail dahulu, lalu memperdalam, dan melaporkan item yang hilang](https://github.com/volcengine/OpenViking/blob/4a2909b44f0b89b0069527bd9da022739f9c1fa1/openviking/retrieve/context_assembler/budget.py#L44-L194). Native `buildKnowledgeSynthesisPacket` memfilter line menurut urutan tetap dan sisa 16.000 unit UTF-16; tidak ada ringkasan omission/coverage per section. Contradictions dan evidence gaps berada dekat akhir sehingga dapat hilang ketika budget sempit.

Seam riset: komposisi section-aware serta omission yang eksplisit, memakai output terpilih yang sama dengan atribusi artefak existing. Canonical Memory sudah memiliki byte budgeting dan Skill sudah mempunyai diagnostik omission; tidak perlu owner baru.

Berkas donor berlisensi AGPL-3.0: referensi konsep saja, tanpa rekomendasi menyalin source. Tidak mengadopsi VLM, cooldown ledger, prefetch atau store donor. Batch 3 mengubah owner synthesis yang sama; recheck wajib setelah integrasi, dan jangan menyamakan cap 32 KiB blok Memory dengan seluruh packet/transport.

#### #44 Anthropic skill-creator: bukti negatif untuk seleksi Skill, opsional

Donor [membedakan should-trigger dan should-not-trigger](https://github.com/anthropics/skills/blob/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/skill-creator/scripts/run_eval.py#L184-L241). Evaluator native `memory-retrieval-hit-at-k` mensyaratkan expected ID nonempty, sehingga tidak mewakili kasus “Skill ini seharusnya tidak dipilih”. Unit test native untuk non-trigger sudah ada; ini bukan klaim ketiadaan pengujian.

Jika nanti diminta bukti kualitas seleksi, proyeksi offline kecil dengan positive/negative/unknown dapat berguna. Bukan fitur runtime, pengulangan instalasi Batch 2, benchmark wajib atau gate penerimaan. Donor punya jebakan: kegagalan subprocess dihitung False, query duplikat dapat kolaps, dan set “test” berulang kali dipakai memilih pemenang. Pertahankan unavailable terpisah dan final holdout yang benar-benar belum dipakai. Lisensi komponen Apache-2.0; tidak mengadopsi Claude CLI atau loop optimisasi.

### Cakupan dan batas

- Semua 54 ID tercatat tepat sekali di `candidate-adoption-opportunities-20261012.json`
- 47 kandidat dibaca ulang pada potongan code berpinned; ini bukan audit penuh 47 repository
- #49: snapshot code dari URL raw resmi dibaca kembali, tetapi pin historis tidak diketahui dan path tidak ada pada tree checkout sekarang
- #46: dokumentasi resmi dibaca ulang, tanpa mengklaim engine source
- #50/#54: README/lisensi dan inventory release dibaca; tidak ada training engine pada tracked tree tersebut
- #7/#17/#25: bukti donor diteruskan dari ledger karena alokasi Batch 2/3 sudah ada; bukan inspeksi donor baru
- 53 pemeriksaan HEAD kandidat cocok dengan pin input; beberapa kandidat berbagi repository
- Disposisi: 4 deepened, 43 rechecked tanpa gap baru, 3 reserved, 3 docs-only, 1 pinned-source unavailable

Kesimpulan reuse/defer/reject lama tidak diubah secara massal. Banyak donor hanya menawarkan loop model, training, replacement store atau mutation tanpa bukti yang lebih lemah daripada kontrak native. Contoh penting: Hindsight membedakan grounding hilang dari semua grounding tidak-teresolusi, sementara native sudah mempunyai nested exact-revision dependency checks; tidak perlu membuka ulang instalasinya.

Sebelum adopsi apa pun: Batch 3 dan 4 harus diintegrasikan, lalu dokumentasi dibandingkan dengan source hasil sebenarnya. Artefak JSON mencatat seam, prerequisite, overlap, SHA/file/symbol/range dan recheck spesifik untuk tiap peluang.

Tidak ada code donor/native yang dieksekusi, pengujian/build, instalasi, perubahan produk/config/proses/Windows, Memory write, commit atau push. Perubahan worker ini hanya artefak riset dalam direktori penugasan.

## Pendalaman kandidat 55–108

Riset statik, 12 Oktober 2026. Baseline Agent Core `86fe9efe53dcfa8da61616c5e5d34e724e0a1891`. Tidak ada implementasi, instalasi, build/test atau perubahan Windows. Keputusan ledger sebelumnya tetap dipertahankan; ini catatan peluang, bukan rencana batch baru.

### Hasil utama

Empat peluang nyata atau conditional dicatat dengan source donor, SHA, simbol/range, native caller, lisensi, seam internal dan pemeriksaan pasca-Batch3/4 di JSON pendamping. Tidak ada klaim manfaat terukur.

1. **#83 AMD: task-conditioned failure recall.** Donor menyaring fungsi lalu memakai query turn untuk memilih contoh. Native external failure recall sudah ada, tetapi query hanya tool/failure-family/argument keys; episode taskFamily/taskKey tidak dipakai. Ini perbaikan spesifisitas di owner existing, bukan alasan store baru. Sumber tidak memiliki root license yang ditemukan; jangan menyalin kode atau raw reasoning.
2. **#90 EXAONE: advisory progress yang benar-benar task-scoped.** External HTTP handler membagikan satu FailureLoopAdvisor, dan success memutus streak tanpa result-state signal. Donor membentuk state per run. Isolasi task perlu diperjelas sebelum mencoba advisory successful-but-unchanged. Hard duplicate blocking, automatic stop dan model sufficiency donor ditolak karena polling/retry sah.
3. **#94 FunctionChat-Bench: coverage evaluasi respons tool.** Native routing harness menilai trigger boolean; effectiveness harness menilai final-answer exact match. Taxonomy slot-missing, irrelevant/unsupported, completion dan calls dapat mengungkap failure yang tidak terwakili secara eksplisit. Pertahankan existing harness, heldout dan exact schemas; jangan copy comparator donor yang menyamakan case/spasi atau hanya memeriksa first call.
4. **#82 AutoRAG: lesson advisory source/method lintas task.** Seams internal ada melalui Learning/Memory context, tetapi readiness masih conditional pada real verified source/method outcomes. Frekuensi judged evidence bukan kualitas. Donor reset store, early pending drain, confidence yang hanya naik, dan clustering lima token tidak layak dibawa. Jangan membuat learned router atau store kedua.

### Koreksi hasil pemeriksaan

- **#97 PREPING:** verification-before-memory tidak unconditional. `validation_policy.py:24–41` mengembalikan semua results bila validation_stats kosong. Jalur ini tidak layak menjadi authority native.
- **#100 SLA:** source/paper read-only dan network-none hanya pada Docker branch; non-Docker branch tidak menegakkan immutability melalui mount.
- **#67 Sai:** suppression setelah write_memory hanya melihat tool call, bukan keberhasilan/digest; jangan mengadopsinya buta.
- **#86 Membrane:** partial judge reply dapat membuang candidate tanpa verdict; parser menerima verdict string yang belum ditutup ke enum. Native tidak boleh kehilangan evidence hanya karena model melewatkan item.
- **#107 UniversalRAG:** normalizer menolak duplikat/unknown tetapi menerima `no+paragraph`; closed enum tidak sama dengan validasi semantic combination.
- **#108 Adaptive-RAG:** native subquestion helper memang ada, tetapi external context masih single-query. Gap wiring adalah reservasi Batch3 #25, bukan pekerjaan baru untuk #108.
- **#71 Agentica:** satu file orchestration resmi berhasil terbaca via cached raw web; API repo memberi404 dan SHA tidak terverifikasi. Dicatat partial-unpinned, tidak diklaim fully inspected/current engine.

### Cakupan yang jujur

- 54/54 ID tercatat tepat sekali.
- 31 kandidat mendapat read kode donor lokal berpinned;2 hanya dokumen (#55/#68); #71 partial kode web tanpa SHA.
- 20 kandidat hanya carried-forward/reserved pada tahap ini: #60, #62, #63, #65, #69, #73, #74, #75, #76, #77, #78, #79, #80, #81, #88, #92, #93, #96, #101, #102.
- 20 file owner/harness native dibaca; semua range dan hash ada di JSON.
- Disposisi: docs-only-no-engine=2; existing-source-rechecked-no-new-gap=21; carried-forward-out-of-scope=9; unavailable-source=10; deepened-source=10; partial-unpinned-source=1; reserved-prior-batch=1.

##73 reserved Batch1. Sumber closed/hosted yang tidak memberi engine dan kandidat training/runtime yang jelas di luar lingkup tidak dikejar ulang tanpa alasan. Riwayat keputusan dan bukti lama disimpan terpisah dari range yang dibaca pada task ini. Semua local Git HEAD berpinned yang diperiksa cocok dengan input; source-only Motif menggunakan hash snapshot. Atria dibaca dari Git object karena worktree hanya berisi metadata repository.

### Batas dan pemeriksaan wajib

Sebelum mempertimbangkan adopsi apa pun, tunggu Batch3/4 terintegrasi lalu cocokkan dokumentasi dengan source dan hasil aktual. Baca kembali scope episode/owner, serial multi-query limits, late-settlement semantics, exact revision/receipt, metadata-only visual handling, dan manifest/evaluation schema. Root Memory tetap `runtime/memory`. Tidak ada model/runtime/store donor, permission gate, autonomous promotion, atau rencana Batch5/6 di riset ini.

File detail: `candidate-adoption-opportunities-20261012.json`.

## Pendalaman kandidat 109–162

**Status: riset statik saja, 12 Oktober 2026.** Baseline Agent Core: `86fe9efe53dcfa8da61616c5e5d34e724e0a1891`. Tidak ada integrasi, rencana Batch 5/6, eksekusi donor, build, test, instalasi, perubahan Windows pada tahap inspeksi source.

### Hasil utama

Peluang paling konkret untuk **AI eksternal yang memakai Agent Core** adalah satu kelompok gabungan **#120 ParserTry + #140 OpenDataLoader PDF**: mempertahankan metadata kemampuan ekstraksi, halaman, wilayah teks, dan asal ekstraksi pada owner PDF existing. Lima kelompok lainnya sengaja dibedakan sebagai bersyarat atau di luar target eksternal sekarang. Jumlah kelompok bukan jumlah pekerjaan yang disetujui.

Semua **54 ID tercatat tepat sekali** dalam [JSON lengkap](candidate-adoption-opportunities-20261012.json). Verdict ledger sebelumnya tidak diubah.

| Disposisi | Jumlah |
|---|---:|
| Source diperdalam | 8 |
| Source dibaca ulang, tanpa gap baru yang cukup kuat | 16 |
| Docs-only dibaca ulang, tanpa engine | 2 |
| Reserved Batch terdahulu | 2 |
| Source lama dibawa maju, tanpa membaca badan source baru | 19 |
| Paper/docs/access-limited dibawa maju, implementasi tak terverifikasi | 7 |

Artinya **24 kandidat mendapat pembacaan code baru**, 2 pembacaan docs-only, dan 26 memakai bukti review sebelumnya ditambah 2 reserved Batch 1/4. Pemeriksaan HEAD/tree clone bukan klaim bahwa seluruh source telah dibaca. Semua clone yang tersedia cocok dengan SHA pin ledger. #133 reserved Batch 1; #138 reserved draft Batch 4, belum terintegrasi pada baseline ini.

### Peluang yang layak disimpan

#### 1. #120 + #140: proyeksi PDF yang mempertahankan bukti

**Gap struktural terkonfirmasi; manfaat belum diukur.** ParserTry menyatakan capability dan memisahkan parser tidak tersedia dari error, lalu [adapter PyMuPDF](https://github.com/leeryong/ParserTry/blob/efc01d8ab1a350f14d74f614443f01bcba5d1071/backend/parsers/pymupdf_parser.py#L52-L146) mempertahankan bbox per span dan ukuran halaman. OpenDataLoader [SerializerUtil](https://github.com/opendataloader-project/opendataloader-pdf/blob/2fd4b076f7e175aa33cd4d4e51f72a9447c51920/java/opendataloader-pdf-core/src/main/java/org/opendataloader/pdf/json/serializers/SerializerUtil.java#L51-L146) benar-benar mengeluarkan halaman/bbox dan metadata seperti sumber teks stream/OCR, metode pencocokan kata, dan inferensi heading.

Native `PdfPageItem` berisi text/images/pageNumber; `pdf2md.ts:89–101` meratakan hasil transformasi menjadi string. `ProjectionResult` tidak menyatakan kapabilitas OCR/tabel/region yang tidak didukung atau tidak dicoba. Ini kehilangan struktur yang berguna untuk controller, bukan bukti extractor donor lebih akurat.

**Feasibility internal cukup kuat:** dependency yang sudah terpasang, `@opendocsg/pdf2md` versi 0.2.9, membentuk TextItem x/y/width/height sebelum transform (`lib/util/pdf.js:68–85`). Tidak otomatis perlu PyMuPDF, Java, Docling, atau model OCR baru. Namun posisi dibulatkan dan tinggi bersifat heuristik; konvensi koordinat, rotasi, clipping dan approximation harus eksplisit.

Seam riset: wrapper PDF dan hasil `DocumentProjectionService` existing, dengan satu bytes snapshot dan output bounded. Batch 1 public reader sudah memakai bytes yang sama untuk digest dan parsing (`public-url.ts:35–76`); kontrak itu harus dipertahankan. Region PDF bukan `viewId` inspector dan bukan bukti controller telah melihat pixels.

Lisensi #140 Apache-2.0. #120 hanya mempunyai badge MIT yang menunjuk LICENSE tak ada pada tracked tree; engine recommendation masih obfuscated. Jangan menyalin source substantif #120 sebelum lisensinya jelas. Pola kontrak kecil dapat diimplementasikan independen.

#### 2. #127 OpenChrome: saran prosedur sesuai halaman

**Bersyarat, relevan untuk controller eksternal sebagai saran.** [Action cache donor](https://github.com/shaun0927/openchrome/blob/e2ee5e30fa54f44e1fa0202ad5bc83d8702f1417/src/actions/action-cache.ts#L337-L403) membedakan URL/signature mismatch, kebijakan replay, dan variabel yang belum disubstitusi. Native sudah mempunyai guard observation/action/focus yang kuat, tetapi pemilihan prosedur di context masih berbasis teks, bukan kecocokan dengan observasi halaman saat ini.

Pola kecil yang mungkin berguna: proyeksi match/mismatch/unknown atas **prosedur existing yang sudah punya bukti terverifikasi** dan metadata observasi sekarang. Tidak membawa action cache, confidence donor, store domain baru, replay otomatis, atau ID elemen lama. Perlu kasus nyata saran prosedur basi sebelum diprioritaskan. Lisensi MIT.

#### 3. #135 RLM-FORGE/Ouroboros: cakupan klaim eksplisit

**Bersyarat dan mungkin tidak diperlukan sesudah Batch 3/4.** [TraceGuard](https://github.com/Q00/rlm-forge/blob/e7d1a6691025a406e0cc21a3f18369df0afa494f/src/rlm_forge/traceguard.py#L184-L278) memvalidasi fact ID terhadap chunk ID. Native sudah punya coverage subquestion dan identitas revision, tetapi itu belum sama dengan cakupan seluruh klaim pada suatu laporan.

Hanya layak jika ada consumer laporan yang jelas setelah Batch 3/4: expected claim IDs → exact evidence handles → missing/invalid/unknown yang eksplisit. Tidak menambah subsystem laporan atau model jury. Donor menerima kumpulan klaim kosong secara vakum dan dictionary dapat menimpa fact ID duplikat; kedua perilaku tidak layak diadopsi. Binding handle bukan pembuktian entailment atau kebenaran. Lisensi MIT.

#### 4. #144 slides-grab: freshness dependency set milik producer

**Bersyarat untuk producer artefak, bukan kemampuan build generik Agent Core.** [Donor](https://github.com/NomaDamas/slides-grab/blob/49bdaed950584a46437fb2b80939a7f5e0c8e4d0/src/design-gate-state.js#L104-L219) membandingkan hash source, aset lokal, report dan preview. Native mempunyai byte integrity satu artefak dan snapshot file terpilih. Presentation Bridge mengetahui source/previews/report, tetapi belum memproyeksikan satu dependency set yang dapat dicek kembali sebagai hubungan producer.

Koreksi penting: donor hanya menemukan src/poster dan CSS url dalam HTML (`270–289`), **bukan closure dependency transitif** stylesheet/font/import. Peluangnya terbatas pada set dependency yang benar-benar diketahui producer. Setelah Batch 4, exact emitted-view digest bisa menjadi referensi evidence; digest itu sendiri tidak membuktikan source slide atau font masih current. Tidak mengadopsi export gate/dual oracle. Lisensi slides-grab MIT; tiga repo lain dalam keluarga #144 hanya dibawa maju dari review lama.

#### 5. #131 senpi: batas turn Native Chat

**Gap nyata tetapi native-only, di luar prioritas controller eksternal sekarang.** [Donor](https://github.com/code-yeongyu/senpi/blob/792eb9c38e19947828a666a5c84b8442ef34277c/packages/agent/src/harness/compaction/compaction.ts#L322-L434) memilih cut point dan mengenali split turn. Native `boundedContextMessages` memotong suffix message pada batas 24 pesan/48.000 unit UTF-16 tanpa disclosure omission.

Jalur native tersebut hanya membaca user dan assistant final, jadi jangan menyebutnya menghasilkan orphan tool-result. `messages.slice(-256)` pada checkpoint merupakan pertanyaan reachability terpisah, belum dibuktikan gagal. Seam hanya owner Native Chat; bukan kontrol terhadap context AI eksternal. Tidak mengimpor runtime atau summarizer donor. Lisensi MIT dengan atribusi upstream.

#### 6. #123 Aspen-MCP: kepemilikan aplikasi non-reentrant

**Bersyarat, khusus worker aplikasi opsional.** [ComFunnel](https://github.com/EPEL-SNU/Aspen_Plus_MCP/blob/eebd0ad1881b6fa8030137dc0d7da97cf4f76430/src/com_funnel.py#L33-L54) menserialisasi operasi dan menghindari deadlock nested call. Presentation Bridge memulai conversion secara independen, dan worker Keynote meluncurkan proses osascript terpisah. Namun script memakai docRef eksplisit; belum ada kegagalan concurrency yang teramati.

Simpan sebagai hipotesis owner-local singleflight bila kelak ada workflow Keynote paralel yang bermasalah. Jangan mengimpor antrean donor yang tidak bounded, Python/COM, atau aplikasi Aspen. Tidak menjadi blocker Linux/current external controller. Lisensi MIT.

### Temuan yang memperkuat reuse/defer

- **#150 Mandol:** kegagalan resolusi space [mengembalikan None](https://github.com/AgentCombo/Mandol/blob/6d7af4f004e1b311fb5c93d3e14fab90677942d8/src/mandol/retrieval/graph_context_expander.py#L515-L533), yang mematikan filter kandidat; hasil dapat tetap diberi label space_restricted. Native memperluas hanya dari `scopedRecords`. Ini observasi source, bukan exploit teruji.
- **#148 TencentDB / #152 MemoryOS:** kegagalan cabang retrieval dikonversi menjadi list kosong. Jangan menganggap empty set sebagai bukti pencarian lengkap.
- **#151 openJiuwen:** promote-before-checkpoint berguna, tetapi checkpoint corrupt menjadi empty set. Native mempertahankan outcome per kandidat dan review yang belum selesai.
- **#155 Trace2Skill:** final merge yang gagal mengembalikan `current[0]`, menghilangkan kontribusi lain; native revision/resource preservation lebih sesuai.
- **#156 SkillClaw:** verifier yang dinonaktifkan tidak menahan jalur upload. Native verification-backed use dan proposal-only review tetap lebih sesuai.
- **#158 SkillNet:** graph expansion mempunyai mekanisme berbeda, tetapi belum ada kegagalan katalog besar yang membuktikan kebutuhan. `expand` mempertahankan semua seeds, meskipun seeds melampaui limit; jangan menyalin batas itu tanpa validasi.
- **#110 CoLoR / #160 AFlow:** source mengandung fallback/loop yang tidak layak dijadikan peningkatan tanpa evaluasi; native quality/resource evidence tetap owner.

### Syarat sebelum keputusan adopsi berikutnya

Tunggu Batch 3 dan 4 terintegrasi, lalu cocokkan dokumentasi dengan source dan hasil aktual. Baca kembali owner yang tersentuh, exact-revision/origin/omission Batch 3, emitted-view digest/criteria coverage Batch 4, serta kontrak digest/bytes Batch 1. Hilangkan peluang yang sudah tertutup; jangan membuat Batch 5/6 dari hitungan kandidat.

JSON menyimpan SHA, file/symbol/rentang yang benar-benar dibaca, file digest, links, lisensi, coupling, seam, prerequisites dan recheck spesifik per kelompok. Konsistensi JSON/ID/digest/rentang diperiksa. Itu validasi artefak riset saja, bukan test produk atau bukti peningkatan kemampuan.

## Pendalaman kandidat 163–216

Riset statik pada Agent Core `86fe9efe53dcfa8da61616c5e5d34e724e0a1891`, 12 Oktober 2026. Target tetap AI eksternal yang mengendalikan tubuh Agent Core. Ini catatan peluang, **bukan rencana integrasi Batch 5/6**.

### Hasil utama

Tiga mekanisme layak disimpan sebagai peluang bersyarat di owner existing. Tidak ada bukti peningkatan performa terukur, tidak ada gate baru, dan semua keputusan ledger lama tetap dipertahankan.

#### #164 Skill Self-Play: cakupan bukti revisi Skill

Donor memeriksa paket revisi, memvalidasi sampel keberhasilan lama dan probe defect, lalu menolak bila ada isu. Native sudah mengikat digest kandidat/baseline, lineage sumber, bukti dan keputusan pengguna, tetapi jalur yang dibaca belum membawa paket cakupan retained-positive/defect-probe untuk revisi yang tepat.

Peluang kecil: artefak bukti advisory yang direferensikan proposal/staging existing, dengan identitas baseline/kandidat, kasus, verifier/oracle, hasil dan cakupan yang hilang. Controller eksternal menafsirkan hasil; keputusan aktivasi tetap existing.

Batas penting: donor memvalidasi kontrak **sampel**, bukan menjalankan eksperimen performa tugas baseline versus kandidat. Anchor boleh kosong; `tests.jsonl` yang tidak ada melewati tahap tes lokal; checker berasal dari paket Python. Jangan membawa validator executable donor atau menyebut hasilnya bukti independen.

- [Donor: validasi paket, anchor, probe](https://github.com/Qwen-Applications/skill-self-play/blob/bb693c89fee66e1f824d6a777759a49b7a295a83/tool_call/refine_skills.py#L449-L669)
- [Native: promoteRevision](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/86fe9efe53dcfa8da61616c5e5d34e724e0a1891/src/skills/service.ts#L1100-L1141)
- Apache-2.0 diperiksa ulang. Tidak membutuhkan vLLM, training stack atau model reasoning baru.

#### #183 DeerFlow: membedakan umur konfirmasi dari umur edit/akses

Donor mempunyai komponen `lastConfirmedAt`, fallback waktu pembuatan yang lebih lemah, dan access heat yang terpisah. Native retirement preview memakai `updatedAt`, jumlah/waktu akses dan salience. Native juga sudah mempunyai metadata `verifiedAt` serta source refs, sehingga celahnya bukan absennya penyimpanan waktu/bukti.

Peluang: penjelasan tambahan pada preview read-only existing, untuk memperlihatkan apakah freshness berasal dari bukti konfirmasi yang sah, pengeditan, akses, atau masih unknown. Belum ada dasar untuk mengubah bobot, ranking atau menghapus memori otomatis. `verifiedAt` juga tidak otomatis berarti pengguna mengonfirmasi klaim.

Donor mendeteksi reinforcement lewat regex pada pesan manusia; itu bukan bukti konfirmasi untuk tiap fakta. Otoritas konfirmasi exact-revision harus ditentukan sebelum scoring dipertimbangkan. Status lama **defer** tetap benar.

- [Donor: confirmation freshness dan access heat](https://github.com/bytedance/deer-flow/blob/65fa321ec18a8e97b5ee60b023afbd95b0eba83b/backend/packages/harness/deerflow/agents/memory/backends/deermem/deermem/core/eviction.py#L73-L154)
- [Native: scoreMemoryRetention](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/86fe9efe53dcfa8da61616c5e5d34e724e0a1891/SubProject/agent-core-memory/src/learning/retention-score.ts#L26-L39)
- MIT diperiksa ulang. Hanya mekanisme penjelasan/scoring yang mungkin portabel; harness dan store donor tidak dibutuhkan.

#### #192 Kagura: propensity untuk evaluasi recall

Donor menerima pool yang sudah diurutkan, mencampur top-k deterministik dengan subset uniform, menolak exploration floor yang tidak mungkin, dan melaporkan probabilitas inklusi sebenarnya beserta seed/policy. Ledger native yang dibaca mempunyai rank, disposition, digest dan delivery, tetapi belum mempunyai probabilitas seleksi/identitas randomisasi.

Peluang ini **khusus evaluasi terikat tujuan dan budget**, bukan randomisasi recall produksi. Metadata dapat hidup pada artefak evaluasi existing. Ia membuat bias paparan dapat diaudit; tidak dengan sendirinya membuktikan manfaat kausal atau mengizinkan feedback positif.

Batch 3 sangat relevan: probabilitas sebelum merge bukan probabilitas hasil akhir setelah beberapa query, dedup, relevance filtering dan pemangkasan byte. Jika probabilitas akhir tidak dapat dihitung benar, jangan menamainya propensity final.

- [Donor: selector evaluasi dan probabilitas](https://github.com/kagura-ai/memory-cloud/blob/487602c0b95f863555fce40b756bdf31c026add9/backend/src/services/recall_selection.py#L1-L125)
- [Native: kontrak exposure/receipt](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/86fe9efe53dcfa8da61616c5e5d34e724e0a1891/SubProject/agent-core-memory/src/memory/retrieval-ledger.ts#L25-L103)
- Apache-2.0 diperiksa ulang. PostgreSQL/Qdrant/Redis donor tidak dibutuhkan. Reproduksi seed perlu identitas algoritme RNG; seed yang sama tidak menjamin Python dan JavaScript menghasilkan pilihan sama.

### Temuan pembatas yang memperkuat keputusan lama

- **#193 TreeQuest, #194 ShinkaEvolve, #209 Optuna:** benar-benar mempunyai alokasi/sampling kandidat; native portfolio/series merupakan analisis hasil, bukan implementasi optimizer tersebut. Namun belum ada tujuan pencarian eksternal yang konkret. Tetap lead tertunda, bukan alasan membuka ulang P4. TreeQuest memindahkan trial ke finished sebelum pembaruan tree berikutnya; Optuna `skip_if_finished` tidak membandingkan reward baru, dan validator yang dibaca menolak NaN tetapi tidak infinity. Jangan menyalin perilaku itu melewati kontrak finite/digest native.
- **#177 MS-Agent:** donor menghitung pengulangan argumen tanpa memeriksa outcome, menyisipkan pesan `user`, lalu menghentikan runtime. Native FailureLoopAdvisor memakai kegagalan aktual, keluarga error, pengecualian polling dan reset saat sukses. Tidak ada alasan mengambil otoritas atau stop gate donor.
- **#185 WeKnora:** body tiap chunk dipisahkan kembali dari konteks ranking yang diperluas. Ini invariant attribution yang berguna untuk recheck Batch 3; native excerpt/synthesis sudah mempunyai revision/span/source refs.
- **#181 MiniMax Code, #210 J-tau, #216 ELYZA:** masing-masing memperlihatkan batas yang tidak boleh disalin: verifikasi bergantung billing route; reward 1 saat kriteria tidak ada; `critical_violation_free=True` sebagai placeholder. Native missing/unknown dan pelanggaran eksplisit tetap dipertahankan.
- **#204–207:** mekanisme LoRA/KV-cache/fast-weight/expert tensor memerlukan akses internal model. Tidak dipromosikan sebagai peningkatan AI eksternal melalui Memory.
- **#208/#215:** konfigurasi/provider atau client HTTP yang terbuka tidak membuka engine koordinasi/retrieval hosted. Tidak ada klaim audit engine tersebut.

### Cakupan yang benar-benar dikerjakan

Seluruh **54 ID tercatat tepat satu kali** dalam `candidate-adoption-opportunities-20261012.json`.

- 47 entri mempunyai pembacaan ulang source/interface/config pada pin SHA yang tercatat: 41 focused source excerpts, 5 boundary/interface-only, 1 configuration-only
- Total 52 pasangan file donor dibaca sebagai excerpt, ditambah identifikasi lisensi untuk enam kandidat; bukan 52 file diaudit seluruhnya
- 9 entri ditandai deepened-source; 38 existing-source-rechecked-no-new-gap
- 5 docs-only dibawa dari bukti terdahulu: #167, #186, #199, #203, #214. Tidak dilakukan pencarian publik baru atau klaim ketiadaan source secara global
- 2 reserved dipertahankan: #178 Batch 1 dan #195 Batch 2. Donornya tidak dibuka ulang
- Sibling repo/file yang tidak tercantum pada `currentPassInspection.donorEvidence` tetap bukti terdahulu, bukan pembacaan baru

JSON memisahkan setiap bukti lama dari file, simbol, baris dan SHA yang dibaca pada pass ini; peluang dilengkapi owner native, lisensi, coupling, seam, prasyarat dan recheck spesifik.

### Sebelum prioritas lanjutan dipilih

Tunggu Batch 3/4 benar-benar terintegrasi, lalu cocokkan dokumentasi dengan hasil nyata. Periksa ulang snapshot/digest Skill dan delivery pada Batch 3, asal/probabilitas hasil recall setelah merge, serta batas deklaratif review visual Batch 4. Review visual tidak menjadi oracle performa Skill maupun konfirmasi kebenaran memori. Jika kontrak baru sudah menutup celah, hapus duplikasi usulan.

### Ledger tindakan

Hanya artefak riset partisi ini dibuat. Tidak ada perubahan source produk, donor execution, tes/build produk, instalasi, panggilan provider, perubahan Windows, commit atau push. Dirt dokumentasi existing dipertahankan. Satu path katalog TreeQuest yang diasumsikan salah diperbaiki ke clone existing yang sudah tercatat; tidak ada download baru. Pemeriksaan akhir hanya validitas JSON, keanggotaan ID, batas line evidence dan keberadaan berkas hasil.

## Batas hasil pekerjaan

Tidak ada engine donor dijalankan, dependency dipasang, source produk diubah, build/test/benchmark dijalankan, atau runtime Windows diubah pada riset ini. Pin source dan pembacaan kode memberi bukti struktur/control flow, bukan hasil performa. Tidak ada plan Batch 5/6 dibuat. Invocate tetap ditunda. Dokumen ini harus direkonsiliasi dengan hasil integrasi Batch 3/4 sebelum dipakai memilih batch selanjutnya.

## Ringkasan kesinambungan

Pendalaman source kandidat pada 12 Oktober 2026 adalah riset saja untuk AI eksternal pengendali Agent Core. Seluruh 216 ID dipetakan: 8 tetap milik Batch 1–4 dan 208 entri lainnya ditinjau peluangnya. Putaran ini membaca 143 body kode berpinned, 2 source parsial tanpa pin, 5 interface, 1 konfigurasi, dan 7 dokumentasi/metadata; 50 entri memakai bukti lama dan 8 reserved tidak dihitung sebagai pembacaan donor baru. Ditemukan 17 kelompok peluang dari 18 kandidat: 6 gap eksternal, 4 peluang eksternal bersyarat, 4 bukti/evaluasi saja, 2 producer/aplikasi opsional, dan 1 native-only di luar prioritas. #120/#140 digabung sebagai satu peluang PDF. Source pin, owner penerima, batas lisensi, coupling, dan hipotesis manfaat dicatat tanpa klaim keunggulan terukur. Tidak ada implementasi, donor execution, instalasi, build/test/benchmark atau perubahan Windows. Batch 5–6 belum dibuat dan hanya boleh disusun setelah Batch 3–4 terintegrasi serta temuan dicocokkan ulang terhadap source dan kontrak hasil integrasi. Invocate tetap ditunda; penyimpanan canonical tetap runtime/memory.
