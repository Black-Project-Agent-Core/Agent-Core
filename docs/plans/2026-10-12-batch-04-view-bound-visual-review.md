# Plan Batch 4 — Review visual terikat gambar dan view

Tanggal: 12 Oktober 2026. Status: **draft perencanaan, belum diimplementasikan**.

Baseline desain adalah kelanjutan **Batch 2 → Batch 3 → Batch 4**, dengan asumsi Batch 2 sudah terpasang dan kontrak Batch 3 yang direncanakan dipertahankan. Ini asumsi desain yang diminta pengguna, bukan klaim aktivasi yang diamati. Baseline source yang dibaca ialah Agent Core `1657e52be193c8f55cb306397b5d0004d595bd8b` di Linux beserta clone donor berpinned; laporan resident Windows tidak diperiksa dalam tugas perencanaan ini.

## 1. Keputusan dan tujuan

Pilih **#138 Sindie** untuk satu peningkatan pada owner `image_inspect` existing: controller eksternal dapat mengirim assessment visual per kriteria, lalu Agent Core mengikat referensinya ke overview/crop yang benar-benar dibuat oleh inspector dalam scope sesi yang sama dan ke snapshot file sumber yang masih cocok.

**Positive: [Purpose]** membuat review gambar yang sudah dilakukan controller dapat ditelusuri ke versi gambar serta view yang tepat; menunjukkan kriteria yang belum dinilai; membedakan penilaian gagal dari bagian yang tidak dapat dinilai melalui pixels yang tersedia.

**Negative: [Purpose]** tidak menjadikan Agent Core penilai kualitas visual, tidak menambah model/provider atau runtime Sindie, tidak menganggap hash sebagai bukti kebenaran assessment, dan tidak membuat gate ekspor, permission, Learning, atau penyelesaian task.

Consumer konkret adalah alur external MCP yang sudah tersedia: `image_inspect(overview)` → crop seperlunya → controller menilai pixels → `image_inspect(review)` → controller memakai laporan bounded tersebut dalam jawabannya. `review` merupakan action read-only tambahan pada tool yang sama. Overview/crop biasa tetap dapat dipakai tanpa membuat review.

## 2. Bukti celah dan perbandingan implementasi

### Native yang dipertahankan

- [`src/rdc/tools/image-inspect.ts:20–43`](../../src/rdc/tools/image-inspect.ts#L20-L43) hanya menerima action overview/crop. View existing menyimpan canonical path, digest sumber, expiry, dimensi original/displayed dan source rectangle. Belum ada input kriteria, assessment, atau pemetaan kriteria ke view.
- [`image-inspect.ts:98–126`](../../src/rdc/tools/image-inspect.ts#L98-L126) membaca satu file melalui guard path/descriptor, memeriksa perubahan selama pembacaan dan menghasilkan SHA-256. [`baris 143–195`](../../src/rdc/tools/image-inspect.ts#L143-L195) menolak crop terhadap sumber berubah serta mengembalikan actual MCP image block. Ini sudah lebih cocok daripada mengadopsi file reader donor.
- [`src/mcp/handler.ts:130–152`](../../src/mcp/handler.ts#L130-L152) mempertahankan paling banyak 32 scope inspector, keyed oleh credential ID dan header sesi. Tiap inspector memiliki paling banyak 64 metadata view dengan TTL 15 menit. Headerless clients dengan credential sama berbagi namespace; jangan menjanjikan isolasi percakapan yang belum disediakan client.
- [`src/mcp/server.ts:287–312`](../../src/mcp/server.ts#L287-L312) mendaftarkan tool hanya untuk external controller, dengan grant existing dan response budget existing.
- [`src/mcp/result-budget.ts:107–125`](../../src/mcp/result-budget.ts#L107-L125), [`src/security/evidence-capture-policy.ts:270–285`](../../src/security/evidence-capture-policy.ts#L270-L285), serta [`src/rdc/utils/toolHistory.ts:345–373`](../../src/rdc/utils/toolHistory.ts#L345-L373) sudah mencegah spill hasil image_inspect dan membatasi persistence ke metadata-only. Mempertahankan aturan tersebut juga untuk hasil review yang hanya berisi teks.

### Mekanisme donor yang dipilih

**Sindie — `wrtnlabs/sindie`, commit `ac561568f77726df41cdd11022e2ef4ac0d90a20`.**

- [`validation.py:47–82`](https://github.com/wrtnlabs/sindie/blob/ac561568f77726df41cdd11022e2ef4ac0d90a20/src/sindie/validation.py#L47-L82) membandingkan ID yang diharapkan dengan ID assessment, termasuk duplicate, missing dan unknown.
- [`validation.py:126–207`](https://github.com/wrtnlabs/sindie/blob/ac561568f77726df41cdd11022e2ef4ac0d90a20/src/sindie/validation.py#L126-L207) membatasi evidence ke artefak yang benar dan memeriksa cakupan kriteria. Transfer mekanisme cross-reference dan cakupan ini, dengan UUID view native sebagai jangkar; jangan menerima daftar evidence buatan caller sebagai bukti bahwa view pernah dibuat.
- [`scoring.py:50–110`](https://github.com/wrtnlabs/sindie/blob/ac561568f77726df41cdd11022e2ef4ac0d90a20/src/sindie/scoring.py#L50-L110) membedakan fail dari unknown/not_assessable dan menahan agregasi ketika input belum memadai. Transfer pembedaan status saja. Weighted score, composite, comparison winner dan decision eligibility donor tidak dibutuhkan.
- [LICENSE](https://github.com/wrtnlabs/sindie/blob/ac561568f77726df41cdd11022e2ef4ac0d90a20/LICENSE) adalah MIT, copyright 2026 Wrtn Technologies. Implementasikan mekanisme kecil secara native memakai dependency existing. Jika memindahkan bagian source secara substansial, pertahankan notice dalam source dan `THIRD_PARTY_NOTICES.md`.

Perbaikan terhadap donor: Sindie memeriksa keanggotaan ID pada payload, tetapi payload itu sendiri tidak membuktikan bytes/view yang diterima controller. Native inspector sudah memiliki scope, source digest dan geometry yang dapat dijadikan authority untuk binding. Sebaliknya, keberadaan owner native saja belum menutup celah cakupan assessment; bagian itulah yang diadaptasi.

### Kandidat yang dibaca tetapi tidak dimasukkan

- **#144 slides-grab**, commit `49bdaed950584a46437fb2b80939a7f5e0c8e4d0`, [design-gate-state.js:104–220](https://github.com/NomaDamas/slides-grab/blob/49bdaed950584a46437fb2b80939a7f5e0c8e4d0/src/design-gate-state.js#L104-L220), [MIT LICENSE](https://github.com/NomaDamas/slides-grab/blob/49bdaed950584a46437fb2b80939a7f5e0c8e4d0/LICENSE): fingerprint slide, asset, report dan preview berguna untuk owner build artefak yang mengetahui dependency closure. `image_inspect` hanya mengetahui satu file raster. Mengklaim closure dari source slide/HTML/font/asset yang tidak dimiliki inspector akan keliru; export gate dan dual-oracle donor juga di luar kebutuhan. Tidak diadopsi pada batch ini.
- **#135 RLM-FORGE/Ouroboros**: [TraceGuard](https://github.com/Q00/rlm-forge/blob/e7d1a6691025a406e0cc21a3f18369df0afa494f/src/rlm_forge/traceguard.py#L184-L255) commit `e7d1a6691025a406e0cc21a3f18369df0afa494f`, [MIT LICENSE](https://github.com/Q00/rlm-forge/blob/e7d1a6691025a406e0cc21a3f18369df0afa494f/LICENSE), mencocokkan pasangan fact/chunk tetapi bukan semantic truth; daftar claim kosong dapat diterima. [Reviewer independence](https://github.com/Q00/ouroboros/blob/0e23d10403c0e7b11f5d29fa192474aaf1eccb43/src/ouroboros/evaluation/reviewer_independence.py#L1-L175) commit `0e23d10403c0e7b11f5d29fa192474aaf1eccb43` membedakan independence yang diketahui dari yang tidak diketahui. Kedua mekanisme bukan alasan menambah general report subsystem atau model jury. Sindie sudah mencakup kebutuhan cross-reference lokal batch ini.
- #164 tidak membuka ulang lifecycle Skill P3 yang selesai; #120 tetap di luar batch karena owner proyeksi dokumen berkaitan dengan Batch 1. Keduanya tidak dihitung sebagai adopsi Batch 4.

## 3. Owner dan batas perubahan

**Owner utama:** `src/rdc/tools/image-inspect.ts`.

**Helper subordinate yang boleh ditambah:** `src/rdc/tools/image-review.ts`, hanya schema/types dan fungsi murni penyusunan laporan. Tidak memiliki filesystem, session map, provider, persistence, timer, queue, atau API/tool sendiri. Bila cukup ringkas, helper dapat tetap di file owner; pemisahan bukan kewajiban arsitektur.

**Exposure:** schema native `imageInspectSchema`, deskripsi `image_inspect` di `src/mcp/rdc-tool-metadata.ts`, serta dokumentasi image inspector. Registrasi tool, grants, namespace sesi, budget transport, dan metadata-only capture yang ada dipakai ulang.

Tidak mengubah `src/web-research`, `src/rdc/document-projection`, `src/skills`, `src/memory`, `SubProject/agent-core-memory`, jalur retrieval Batch 3, scoring/evaluation Learning, `controller_learning`, atau Native AI Agent. Tidak membuat store hasil review, ekspor otomatis, report file otomatis, durable receipt, cache pixels, atau root runtime baru.

## 4. Kontrak action yang diusulkan

### 4.1 View authority

Pertahankan `viewId`, `digest` raw 64 hex dan `digestAlgorithm: 'sha256-original-file'` existing. Tambahkan metadata additive pada output overview/crop dan entry `View` yang sama:

- `viewDigest`: SHA-256 raw 64 hex dari buffer PNG/JPEG yang tepat dikembalikan sebagai image block.
- `viewDigestAlgorithm: 'sha256-returned-image-bytes'`.
- `createdAt`, serta `mimeType` dan `fidelity` yang sudah diketahui producer.

Hitung digest sebelum buffer dilepas, tanpa menyimpan pixels. Buat satu immutable metadata object untuk entry session dan output. Geometry, source digest dan view digest untuk review diambil dari entry tersebut, bukan dari field caller yang disalin kembali. Registrasi view hanya dari hasil overview/crop yang selesai dibentuk dan memenuhi budget; action review tidak dapat menciptakan atau memperbarui view.

View ID membuktikan referensi itu cocok dengan hasil yang dibuat oleh inspector pada scope tersebut. Ia bukan bukti bahwa model/manusia benar-benar melihat, memahami, atau menilai pixels. Pengiriman sampai client dan perubahan tampilan client tetap di luar jaminan inspector.

### 4.2 Input

Tambahkan `action: 'review'` dengan field berikut:

- `path`: satu local raster path melalui aturan owner existing.
- `viewId`: UUID acuan dari overview/crop existing, wajib dan masih hidup pada scope caller. Semua view assessment harus menunjuk canonical path dan source digest yang sama dengan acuan ini.
- `criteria`: 1–16 item `{ id, description, assessment? }`; ID unik, pola `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`, description nonblank maksimum 280 karakter.
- `assessment` opsional berada langsung dalam criterion terkait, berisi `{ status, reason, evidenceViewIds, counterEvidenceViewIds? }`. Tidak membuat array assessment paralel beserta join `criterionId`; satu row ini lebih kecil dan menghilangkan kemungkinan assessment tersambung ke criterion yang salah.
  - `status`: `pass | fail | unknown | not-assessable`.
  - `reason`: nonblank maksimum 500 karakter; ini teks controller, bukan hasil analisis Agent Core.
  - `evidenceViewIds`: maksimum 4 UUID unik per assessment; minimal satu untuk `pass` atau `fail`.
  - `counterEvidenceViewIds`: maksimum 4 UUID unik; default kosong. Jangan menghapus counterevidence hanya karena status yang dideklarasikan adalah pass.

Maksimum 8 view unik untuk seluruh permintaan, termasuk `viewId` acuan. Input utuh maksimum 24 KiB UTF-8 serialized sebelum pekerjaan I/O. Field geometry/digest buatan caller, action-field yang salah tempat, duplicate criterion ID, properti yang tidak dikenal, serta referenced view tak dikenal ditolak dengan reason code yang ringkas. Tidak memperbaiki binding rusak dengan fallback ke view terbaru.

Tidak ada bobot, skor komposit, confidence model, status approved, `verified=true`, task result, maupun action ekspor. Kriteria merupakan daftar eksplisit yang dikirim controller pada panggilan ini; daftar tersebut tidak membuktikan bahwa seluruh permintaan pengguna telah tercakup.

### 4.3 Binding sumber dan batas sumber daya

1. Parse dan validasi ukuran/ID terlebih dahulu. Resolve seluruh view di map inspector yang sama. Jangan menerima metadata view dari payload sebagai pengganti entry map.
2. Gunakan `readSource(path)` existing tepat satu kali. Bandingkan canonical path dan digest sumber terhadap view acuan serta semua evidence/counterevidence views. Tidak melakukan crop, decode atau panggilan model tambahan.
3. Cek expiry lagi setelah pembacaan dan sebelum penyusunan hasil; waktu pembacaan tidak memperpanjang TTL. Semua view harus masih cocok dengan snapshot sumber yang sama.
4. Pakai plafon dua operasi proses-wide yang sudah ada, input source maksimum 32 MiB, dan guard path/descriptor existing. Tidak mengantre atau memulai operasi ulang otomatis ketika busy, source berubah, view expired/evicted, atau scope tidak cocok.
5. Error tidak mengembalikan assessment parsial sebagai laporan terikat. Controller memperoleh alasan seperti `IMAGE_INSPECT_VIEW_NOT_FOUND`, `IMAGE_INSPECT_SOURCE_CHANGED`, atau reason review-input yang relevan, kemudian dapat memutuskan sendiri apakah perlu overview baru.

Freshness yang diklaim hanya kesamaan bytes satu file pada snapshot pembacaan itu. Perubahan sesudah response, source HTML/slide yang belum dirender ulang, referensi eksternal, font, build input, dan dependency closure lain tidak dicakup. Batas trusted-local-workspace Windows existing tetap dinyatakan apa adanya.

### 4.4 Output dan cakupan

Return satu MCP text block berisi envelope JSON bounded, tanpa image baru:

- `version: 1`, `action: 'review'`, `artifactScope: 'single-local-raster'`.
- Digest sumber, waktu snapshot, dan `views` berisi hanya maksimal 8 metadata view yang dirujuk: ID, source/view digest, sourceRect, original/displayed, mimeType, fidelity, createdAt, expiresAt. Jangan menambahkan canonical path ke output bila sebelumnya tidak diperlukan.
- `criteriaDigest`: fingerprint SHA-256 dari pasangan `{ id, description }` yang dinormalisasi secara deterministik menurut ID, tidak termasuk assessment; fingerprint ini hanya mengidentifikasi kontrak input, bukan mengautentikasi asal kriteria.
- Satu row untuk setiap criterion, urutan mengikuti input. Assessment yang hilang menjadi `status: 'unknown'`, `reasonCode: 'assessment-missing'`, evidence arrays kosong. Row yang disuplai tetap mempertahankan assessment/reason controller setelah validasi struktural.
- `coverage`: total kriteria, supplied assessments, missing assessments, declared pass, declared fail, declared unknown, dan declared not-assessable. Missing tetap count tersendiri agar tidak tersembunyi di antara unknown eksplisit. Tidak menghitung persentase kualitas atau verdict keseluruhan.
- `bindingStatus: 'current-source-snapshot'`, `assessmentAuthority: 'external-controller'`, `semanticVerification: 'not-performed'`, `executionAuthority: false`.

Output maksimum 32 KiB UTF-8 serialized. Tidak boleh memangkas row/evidence diam-diam untuk memuat budget; bila envelope tidak muat, kembalikan error bounded dan minta caller mempersempit criteria/teks. Outer image result budget tetap berlaku, tidak ada spill ke `runtime/tool-results`. Review tidak menaikkan Learning verification, Skill outcome, Memory feedback, atau status task menjadi sukses.

### 4.5 Kompatibilitas dan manifest

Overview/crop existing dan semantics koordinat tidak berubah. Field baru additive; action review tetap read-only dan external-controller-only. Tool tetap satu `image_inspect`; tidak ada tool tambahan atau privilege baru. Descriptor menjelaskan singkat bahwa review memproses assessment controller dan tidak menilai pixels sendiri.

Full MCP tools/list pada **cohort 75 tool yang sudah diukur** tetap tunduk pada plafon **128 KiB / perkiraan 32.768 token** existing di `tests/mcp-manifest-contract.test.ts`. Receipt publikasi Batch 2 mencatat **130.681 byte**, menyisakan **391 byte**. Ini hasil sebelumnya, bukan pengukuran ulang tugas ini; jangan menghitung penghapusan redundant annotation title/whitespace Batch 2 sebagai savings baru. Cohort tersebut tidak mencakup seluruh optional runtime, sehingga angka ini bukan bukti ukuran all-optional tools/list.

**Reservasi bersama:** Batch 4 boleh menambah paling banyak **256 byte serialized** pada node lengkap `image_inspect` dibanding baseline Batch 2; dengan owner lain tetap, cohort menjadi paling banyak **130.937 byte** dan menyisakan **135 byte**. Batch 3 tidak mengonsumsi reserve ini melalui tool lain dalam cohort 75. Perubahan optional `controller_learning` milik Batch 3 tetap dicatat terpisah; tidak mengklaim total all-optional lolos.

Jalur implementasi yang konkret agar reservation masuk akal:

1. Ganti schema publik union overview/crop yang menduplikasi `path`, `format`, dan `maxEdge` dengan **satu strict object berisi field terstruktur bersama**, lalu `superRefine` untuk matriks action. Required semua action: `action`, `path`; crop memerlukan `viewId` + rectangle dan hanya crop boleh zoom; review memerlukan `viewId` + criteria dan melarang format/maxEdge/rectangle/zoom; overview melarang viewId/rectangle/zoom/criteria. Default format/maxEdge/zoom diterapkan **sesudah validasi action** pada cabang yang sesuai, sehingga review tidak mendapat field rendering melalui default global. Jangan melonggarkan invalid-input behavior overview/crop.
2. Gunakan `criteria[].assessment?` pada §4.2, tanpa array/join criterion kedua, tanpa input geometry/digest duplikat dan tanpa schema descriptions berulang. Schema tetap memperlihatkan object, field, enum, bounds dan evidence UUID kepada client; tidak ada JSON opaque.
3. Ganti prose image_inspect sendiri dengan descriptor **maksimum 1.200 byte UTF-8**, termasuk petunjuk path singkat yang menggantikan ekspansi `${PATH_GUIDANCE}` pada tool ini saja. Pertahankan seluruh fakta operasional penting: external/read-only, local format+permission, koordinat original, source/session/TTL, recovery view, ukuran/encoding, status review dan metadata-only. Tool lain dan helper path global tidak diubah.

Perhitungan kertas atas schema JSON yang ditulis manual memberi perkiraan schema lama **1.249 byte**, flat schema baru **1.954 byte** (delta +705); ini **bukan output Zod yang dieksekusi**. Prose existing memuat 1.518 byte sebelum ekspansi path, ditambah minimal sekitar 311 byte path guidance. Descriptor contoh di bawah sekitar 1.200 byte, sehingga perkiraan net delta berada di bawah reserve +256 dengan ruang untuk perbedaan konversi schema. Bila hasil serialization implementasi nanti berbeda, tetap kecilkan duplikasi dalam node image_inspect ini; reservation bukan izin menaikkan plafon atau mengubah kontrak tool lain.

Contoh descriptor ringkas untuk implementasi (batas akhir tetap node serialized, bukan sekadar panjang teks):

> External controllers only. Local 8-bit PNG/JPEG/WebP, regular files, existing directory permissions; no URL/vector/animation. Use absolute paths, not ~. Container: use mounted paths.
> overview returns an oriented image and viewId. crop uses that viewId and displayed-pixel rectangle: top-left origin, right/bottom exclusive. Use returned dimensions, not client-resized pixels. Nested crops read original pixels; zoom 1-16 adds no detail.
> Views expire in 15min or on source change. Missing/expired/evicted view: request overview. Scope is credential plus MCP/Agent Core session header; headerless clients sharing credentials share views.
> Input:32MiB/24M pixels. Output:1536-edge/1.5M pixels/2MiB encoded/3MiB response. maxEdge128-1536 lowers size. PNG default; JPEG explicitly lossy. Oversize: lower maxEdge/zoom or crop smaller.
> review binds criteria[].assessment to current-source views; it does not judge pixels. Only review accepts criteria; only crop accepts rectangle/zoom. Missing assessment stays unknown. Pass/fail needs evidenceViewIds. Max16 criteria/8 unique views; review input24KiB/output32KiB.
> Transport-only images/reviews; metadata-only capture, stricter workspace omission retained.

Jangan menaikkan plafon, membuang petunjuk keamanan tool lain, atau memasukkan runtime baru demi budget. Integrasi dokumentasi/descriptor bersama Batch 3 menjadi satu tanggung jawab penulis utama.

### 4.6 Kompatibilitas urutan Batch 2 → 3 → 4

- **Batch 2 terpasang (asumsi):** SkillService discovery/read, active digest, lexical default, hybrid opt-in, catalog/proposal lifecycle dan Skill attribution tetap memakai kontrak existing. Batch 4 tidak membaca/mengubah katalog atau membuat receipt Skill dari review.
- **Batch 3 terpasang (target urutan):** Memory subquestion retrieval, delivery budget, task/workspace binding dan feedback receipt tetap di owner Batch 3. Review tidak mengubah context retrieval atau memakai UUID view sebagai Memory evidence/feedback.
- **Scope dan grants:** seluruh action image_inspect tetap satu grant yang dicek tiap request. Namespace credential/session existing bukan task/workspace ACL baru dan tidak disamakan dengan binding Memory.
- **Manifest bersama:** reserve image_inspect +256 byte dimiliki Batch 4; penulis utama mempertahankan cohort baseline dan tidak menjumlahkan optional runtime yang belum diukur seolah sudah termasuk.
- **Transport dan evidence:** no-spill serta metadata-only berlaku pada overview/crop/review. Hasil review hanya laporan deklaratif terikat snapshot; mekanisme independen yang sudah menilai outcome Learning tidak diganti.


## 5. Lima fase implementasi

Fase di bawah adalah rancangan untuk pekerjaan berikutnya. Tidak ada instruksi menjalankan suite, benchmark, loop audit, runtime donor atau provider pada plan ini.

### Fase 1 — Satu metadata view untuk hasil dan binding

**File:** `src/rdc/tools/image-inspect.ts`.

- [ ] Perluas entry metadata existing dengan waktu pembuatan, digest encoded view, MIME dan fidelity.
- [ ] Bentuk metadata output dan entry session dari nilai immutable yang sama; registrasi hanya berasal dari producer overview/crop yang berhasil membentuk hasil bounded.
- [ ] Pertahankan TTL, jumlah view/scope, format output, source-read guard dan batas pixels/bytes existing.

**Positive: [Purpose]** setiap view yang dirujuk mempunyai identitas source, identitas pixels hasil, dan geometry yang dapat diambil dari owner.

**Negative: [Purpose]** tidak menyimpan gambar, membuka registry baru, atau mengklaim penerima benar-benar melihat hasil.

**Hasil operasional:** overview/crop lama tetap menghasilkan gambar seperti sebelumnya, dengan metadata tambahan yang cukup untuk review dalam sesi yang sama.

### Fase 2 — Kontrak kriteria dan proyeksi cakupan

**File:** helper subordinate `src/rdc/tools/image-review.ts` bila diperlukan, serta schema di `image-inspect.ts`.

- [ ] Definisikan input/status/output §4.2–4.4 dengan batas eksplisit dan validasi ID.
- [ ] Implementasikan fungsi murni penyusunan rows, missing assessments, counts, dan criteriaDigest dari metadata view yang telah diselesaikan owner.
- [ ] Pertahankan teks/controller status sebagai deklarasi; jangan menambah scoring, judge, renderer, filesystem atau persistence di helper.

**Positive: [Purpose]** setiap kriteria yang dikirim caller muncul dan dapat dibedakan antara dinilai, hilang, belum diketahui, atau tidak dapat dinilai.

**Negative: [Purpose]** schema-valid bukan semantic-valid dan daftar criteria bukan bukti seluruh kebutuhan pengguna telah masuk.

**Hasil operasional:** report tidak bisa tampak lengkap hanya karena controller melewatkan assessment suatu criterion.

### Fase 3 — Hubungkan review ke view dan source owner

**File:** `src/rdc/tools/image-inspect.ts`.

- [ ] Tambahkan cabang action review yang benar-benar memanggil fungsi Fase 2 setelah resolusi map dan pembacaan source sekali.
- [ ] Ikat setiap evidence/counterevidence view ke scope, TTL, canonical path serta digest current snapshot; ambil seluruh geometry dari map.
- [ ] Tangani source drift, invalid/foreign/evicted view dan expiry setelah I/O tanpa fallback atau auto-repeat.
- [ ] Return envelope bounded sebagai text block; tidak memanggil sharp decode atau membuat view baru pada action ini.

**Positive: [Purpose]** controller dapat memakai assessment pada artefak yang tepat, dengan alasan konkret bila view sudah tidak cocok.

**Negative: [Purpose]** review tidak meloloskan input rusak dan tidak menjadi hak baru untuk membaca path.

**Hasil operasional:** jalur overview/crop → review tersedia end-to-end pada owner yang sama, bukan helper schema tanpa pemakai.

### Fase 4 — Exposure MCP dan persistence yang tetap minimum

**File:** `src/mcp/rdc-tool-metadata.ts`, schema native; perubahan kecil pada wrapper existing hanya jika benar-benar diperlukan untuk metadata action baru.

- [ ] Jelaskan `review` dan field action-specific secara ringkas pada descriptor `image_inspect`; pertahankan read-only/external-only registration dan existing grants.
- [ ] Pertahankan metadata-only capture, workspace omission, sanitized failure plumbing dan no-spill untuk semua action image_inspect, termasuk teks assessment controller.
- [ ] Jaga batas serialized output dan manifest §4.5 tanpa mengubah permission, tool lain, atau menghasilkan file laporan otomatis.

**Positive: [Purpose]** external controller dapat menemukan dan memanggil kontrak yang benar tanpa membocorkan assessment/pixels ke history baru.

**Negative: [Purpose]** tidak mengubah kegiatan inspect biasa menjadi mutasi dan tidak menandai laporan sebagai verification evidence yang lolos Learning.

**Hasil operasional:** hasil review hanya tersedia pada response pemanggil; aktivitas existing tetap mencatat metadata minimum sesuai kebijakannya.

### Fase 5 — Dokumentasi perilaku dan batas pemasangan

**File:** `docs/MCP-Image-Inspection-Design.md`, bagian terkait `docs/CODEBASE.md`, `docs/README.md`, `THIRD_PARTY_NOTICES.md` bila source substansial dipindahkan, dan plan ini.

- [ ] Dokumentasikan alur concrete consumer, contoh criteria/assessment, arti status/binding, expiry dan batas freshness satu raster.
- [ ] Catat asal mekanisme #138 serta penolakan scoring/model/runtime donor dan keputusan tidak memasukkan #144/#135.
- [ ] Bedakan source implementation, exposure descriptor, dan aktivasi client/resident berdasarkan bukti yang benar-benar tersedia kelak. Refresh custom plugin/Windows tidak dianggap terjadi hanya karena source selesai.

**Positive: [Purpose]** controller berikutnya tahu kapan menggunakan review dan batas klaim yang dapat dibuat dari hasilnya.

**Negative: [Purpose]** tidak menulis status aktif/bermanfaat/Windows selesai tanpa bukti, tidak membuka kembali Batch 1/2 atau P0–P5.

**Hasil operasional:** satu kontrak image_inspect terdokumentasi, dengan status perencanaan/implementasi/aktivasi yang tidak tercampur.

## 6. Dampak dan batas keputusan

Manfaat yang diharapkan ialah lebih sedikit assessment yang salah referensi atau kehilangan kriteria dalam review visual external controller. Itu hipotesis manfaat dari mekanisme, bukan hasil ukur pada Agent Core. Binding yang benar juga tidak membuat penilaian controller otomatis benar.

Tidak ada package baru, server baru, provider key, panggilan AI berbayar, task scheduler, source image copy, store permanen, export gate atau runtime Native baru. Source inspection tidak menjalankan donor maupun Agent Core. Penyusunan dokumen ini tidak mengubah kode produk, konfigurasi, grants, proses, atau Windows.

Handoff setelah rencana dipilih mengikuti urutan Batch 2 → Batch 3 → Batch 4 dengan lima fase pada owner image_inspect. Owner implementasi berbeda, tetapi kontrak lintas-batch pada §4.6 wajib dipertahankan. Penyelarasan dokumen bersama, budget manifest dan status ledger menjadi tanggung jawab penulis utama; asumsi pemasangan tidak diubah menjadi klaim observasi resident.


## 7. Ringkasan bersama untuk Memory lokal

<!-- batch-03-04-memory-summary:start -->
Perencanaan lanjutan 12 Oktober 2026 memakai asumsi Batch 2 sudah terpasang sesuai kontraknya; ini baseline desain, bukan klaim aktivasi Windows. Urutan rencana 2 → 3 → 4. Batch 3 memilih #25 SimpleMem dalam enam fase untuk menghubungkan rencana 2–4 subpertanyaan eksplisit ke recall Memory canonical berbatas melalui controller context existing. Tidak mengubah ranking global, tidak memakai planner LLM, dan mempertahankan snapshot/discovery Skill, digest, grants serta receipt Batch 2. #47 lexical MMR tetap gap tersendiri di luar batch. Batch 4 memilih #138 Sindie dalam lima fase untuk review visual per kriteria yang terikat source digest dan view overview/crop milik image_inspect existing; penilaian tetap berasal dari controller, bukan quality oracle atau gate ekspor. Batch 4 tidak mengubah retrieval Batch 3. Keduanya tanpa runtime donor, dependency produksi, store paralel, atau perubahan nama runtime/memory. Keenam kandidat Batch 1–2 sudah diimplementasikan pada source Linux; dua kandidat baru hanya dialokasikan ke draft, 208 entri lainnya tetap di ledger dengan keputusan masing-masing. Dua plan menunggu review pengguna; tidak ada implementasi Batch 3/4 atau pemasangan Windows pada pekerjaan perencanaan ini.
<!-- batch-03-04-memory-summary:end -->
