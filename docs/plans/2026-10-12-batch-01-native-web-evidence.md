# Plan Batch 1 — Pembacaan Web Native dan Bukti Sumber Terpadu

**Status terkini (Windows, 12 Oktober 2026): COMPLETE — SOURCE INTEGRATED / BUILD PASSED / RESIDENT ACTIVE / EXTERNAL MCP VERIFIED.** Implementasi Linux dan penyerahan repository terdokumentasi sebagai riwayat di Bagian 9; pemasangan serta verifikasi Windows tercatat di Bagian 10–11. Plan pemasangan Memory/Learning sebelumnya tetap ditutup dan tidak dibuka ulang.
**Tujuan:** AI eksternal yang mengontrol Agent Core dapat membaca halaman publik melalui kemampuan internal Agent Core, tanpa wajib memanggil jasa pembaca pihak ketiga, dengan asal sumber dan hasil pemotongan yang jelas.
**Batas kompleksitas:** satu capability utama, enam fase berurutan, satu penulis aktif per file. Maksimal tujuh fase diizinkan, tetapi tidak menambah fase hanya untuk memenuhi angka.
**Baseline:** checkout Linux `38b00b53650b2893017e50df852013ef270902eb`. Source Windows dapat lebih baru; cocokkan perubahan relevan satu kali dan pertahankan implementasi setara yang sudah ada.
**Pelaksana:** source dikerjakan pada checkout Linux utama; AI eksternal pengguna melanjutkan pemasangan pada Agent Core Windows. Tidak membutuhkan Native AI, model tambahan, API-key agent, atau subagent runtime baru.
**Arsitektur:** transport tetap `src/net/public-url-read.ts`; konversi tetap `src/rdc/document-projection`; orkestrasi research tetap `src/web-research/service.ts`; exposure tetap MCP existing. Satu jalur bytes aman dipakai ulang, bukan service donor atau adapter ke aplikasi donor.

## 1. Mengapa batch ini dipilih

Temuan berikut adalah baseline sebelum implementasi; status hasil ada pada bagian 9.

Inspeksi source menemukan kemampuan yang sebenarnya sudah tersedia tetapi belum tersambung pada jalur research yang dipakai controller:

- `readPublicUrlBytes()` sudah menyediakan koneksi HTTP/S publik yang mematok DNS/IP dan peer, memeriksa redirect, serta membatasi respons.
- `read_file` sudah mempunyai mode `networkPolicy: public-only`, tetapi mode itu menolak proyeksi Markdown eksplisit.
- `DocumentProjectionService` sudah mengubah HTML menjadi Markdown, menyelesaikan relative links, dan mempunyai decoder teks. Tidak perlu parser atau mesin ekstraksi baru.
- `WebResearchService.open()` masih memilih Jina/Parallel/Firecrawl/Browserbase; Jina dicoba walaupun tanpa key. Jalur reader native belum menjadi pilihan service ini.
- `src/index.ts` meneruskan service research, tetapi `src/mcp/handler.ts` tidak memasukkannya ke runtime hasil rekonstruksi. Akibatnya pendaftaran web tools pada jalur HTTP tidak mengikuti instance yang sudah dibuat.
- Web tools belum memberi metadata read-only yang lengkap. Metadata ini perlu benar tanpa memperluas grant atau izin yang dimiliki controller.

Batch ini menutup celah konkret tersebut. Search index internet dan layanan ekstraksi khusus tetap boleh eksternal ketika memang diperlukan. Pembacaan native masih membutuhkan jaringan ke situs tujuan, tetapi tidak membutuhkan jasa reader perantara.

## Prinsip kualitas, bukan sekadar keberadaan fitur

**Positive: [Purpose]** Tingkatkan atau ganti implementasi internal dengan mekanisme donor yang lebih kuat untuk kebutuhan nyata: ketepatan output, cakupan input, ketahanan kegagalan, keterlacakan, atau kemudahan pemakaian. Pertahankan satu owner dan pensiunkan jalur lama yang sudah digantikan. Reuse hanya tepat jika implementasi existing benar-benar memadai; bukan karena nama fiturnya sudah ada.

**Negative: [Purpose]** Menolak perbaikan yang lebih unggul hanya demi mempertahankan source lama, menyebut wiring sederhana sebagai adopsi seluruh engine, menambah donor sebagai service paralel, atau mengklaim lebih cepat/pintar tanpa bukti. Perbandingan source membuktikan perbedaan mekanisme; manfaat operasional tetap dilaporkan sesuai hasil pemakaian.

## 2. Kandidat dan keputusan adopsi

| Kandidat | Source yang diperiksa | Keputusan Batch 1 |
|---|---|---|
| #133 web-fetch | `code-yeongyu/web-fetch`, commit `9af775ff57af401afcce20b7ce5c53a051c630d2`, [scripts/web_fetch.py:338–491](https://github.com/code-yeongyu/web-fetch/blob/9af775ff57af401afcce20b7ce5c53a051c630d2/scripts/web_fetch.py#L338-L491); MIT | Adopsi semantik hasil pembacaan yang eksplisit: jalur aktual, hasil/error, final locator, ukuran, dan batas hasil. Adaptasi seperlunya ke TypeScript dan kontrak existing. Tidak menyalin Python runtime, browser impersonation, atau retry untuk melewati penolakan. |
| #73 web-content-extractor | `wrtnlabs/web-content-extractor`, commit `4cdefff7726a9612bb828d1416becfc5715f8310`; [extract-content.ts](https://github.com/wrtnlabs/web-content-extractor/blob/4cdefff7726a9612bb828d1416becfc5715f8310/src/extract-content.ts) dan [compute-text-density.ts](https://github.com/wrtnlabs/web-content-extractor/blob/4cdefff7726a9612bb828d1416becfc5715f8310/src/compute-text-density.ts); MIT | Adaptasi seleksi konten utama berbasis kepadatan/ancestor secara opt-in. Gunakan tree dari public translator hook node-html-markdown existing; jangan memasang cheerio/domhandler baru atau menyalin pembuangan elemen donor secara membabi buta. |
| #178 Qwen Code | `QwenLM/qwen-code`, commit `e9789d091133d9753decfc139df64c935a1866e6`; [tool-hook-context.ts:9–42](https://github.com/QwenLM/qwen-code/blob/e9789d091133d9753decfc139df64c935a1866e6/packages/core/src/core/tool-hook-context.ts#L9-L42); Apache-2.0 | Adaptasi pemotongan prefix yang tidak memisahkan surrogate pair UTF-16, beserta penanda truncation yang tetap masuk budget. Ganti pemotongan lemah pada jalur hasil web; tidak mengimpor hook engine atau Native AI. |
| #21 OpenSkill | source classifier/targeted research | Tidak dipasang. Pemilihan riset donor memakai model judge dan tidak menjadi kebutuhan reader native. Tidak ada pencarian otomatis dari error atau pengiriman error mentah. |

Tiga kandidat dipilih: #133 untuk kontrak reader, #73 untuk kualitas pemilihan konten HTML, dan #178 untuk pemotongan hasil yang tidak merusak pasangan Unicode. Jumlah kandidat bukan ukuran jumlah fitur yang harus ditambahkan. Source pihak ketiga yang benar-benar dipindahkan wajib mempertahankan lisensi/atribusi yang sesuai di `THIRD_PARTY_NOTICES.md` dan notice source yang diperlukan; gunakan utility Agent Core sendiri bila sudah setara. Checkout referensi tidak menjadi dependency produksi.

Seluruh 216 entri dicatat pada [register analisis bersama](../research/candidate-source-review-216-20261012.md), dengan detail source pada [JSON pendamping](../research/candidate-source-review-216-20261012.json). Kandidat lain bukan dianggap selesai diadopsi karena tidak masuk Batch 1. Hasil analisis yang belum final tidak dinaikkan menjadi klaim pemeriksaan source lengkap.

## 3. Kontrak yang dibekukan untuk implementasi

### 3.1 Antarmuka pengguna

Pertahankan nama `web_open` dan `web_search`. Tambahkan pada `web_open` dua field opsional:

- `reader: native | external`, default `native`.
- `contentScope: full | main`, default efektif `full` hanya pada route native. Field ini opsional tanpa schema-default global; `reader=external` dengan `contentScope` eksplisit menghasilkan argumen tidak didukung. Native `main` hanya menyeleksi HTML; media teks/PDF lain dikembalikan penuh dengan alasan `not-html`.
- `native` hanya memakai transport dan converter internal; tidak beralih ke reader cloud saat gagal.
- `external` secara eksplisit memilih rantai provider existing yang diizinkan konfigurasi/grant. Mode ini tidak diklaim memiliki jaminan transport native.
- Tidak ada mode fallback otomatis pada batch ini. Kegagalan native mengembalikan sebab yang jelas; controller memilih langkah berikut sesuai permintaan dan izin pengguna.

Default baru merupakan perubahan perilaku yang disengaja untuk kemampuan internal. Pemanggil yang membutuhkan perilaku cloud sebelumnya dapat memilih `external`. Nama/arti field lama dipertahankan. `web_search` tidak berubah menjadi crawler atau search engine lokal.

### 3.2 Ruang lingkup media

- HTML → Markdown terstruktur melalui converter existing; mode main menyeleksi HTML terlebih dahulu, lalu memakai converter yang sama dengan semua translator default.
- Plain text/Markdown/CSV/JSON/XML yang diterima transport → representasi teks melalui decoder existing, tanpa menjalankan konten. Helper memanggil `projectBytes()` hanya untuk HTML pada batch ini; jangan membiarkan pemilihan converter generik mengubah CSV/feed/XML menjadi kontrak lain.
- PDF → teks halaman dari satu snapshot bytes yang sudah diterima; gunakan parser bytes existing dan penanda batas halaman. Jangan mengunduh URL lagi di parser.
- Gambar dan media tanpa teks yang sesuai → hasil tidak didukung yang jelas, bukan sukses kosong, OCR otomatis, atau pengiriman cloud diam-diam.
- Tidak ada JavaScript rendering, login, cookie pengguna, OCR, arsip/ZIP, crawl banyak halaman, daemon browser, atau pembukaan akses jaringan tambahan.

### 3.3 Invariant transport dan privasi

- Masukkan URL mentah ke pemeriksaan native sebelum normalisasi yang dapat menyembunyikan ejaan IP ambigu.
- Pertahankan HTTP/S, port standar, penolakan kredensial di URL, seluruh DNS answer harus publik, peer pinning, Host/SNI/TLS, dan pemeriksaan ulang setiap redirect.
- Pertahankan batas transport existing: maksimal 10 MiB, 16 KiB headers, lima redirect, deadline 30 detik, dan cancellation. Batas lebih kecil dari pemanggil tidak boleh diperbesar.
- Penolakan kebijakan, TLS/peer, ukuran, encoding, redirect, dan cancellation tidak memicu route alternatif.
- `finalUrl` native saat ini disanitasi menjadi origin + pathname. Jangan memasukkan kembali query/fragment rahasia ke output, log, Memory, atau receipt.
- Bedakan locator yang disanitasi dari identitas dokumen lengkap. Gunakan digest snapshot bytes bila identitas konten diperlukan; jangan membuat penyimpanan bukti kedua.
- Redaksi locator berlaku pada metadata/log ringkasan. Body dan link di halaman sendiri dapat memuat query atau data sensitif; jangan mengklaim seluruh body bebas rahasia karena final URL sudah disanitasi. Jangan persist body/argumen mentah otomatis.
- Konten situs adalah data tidak tepercaya. Keberhasilan membaca tidak menjadikan instruksi situs aturan bagi AI.

### 3.4 Bentuk hasil

Perluas `WebOpenProvider` dengan `native`, dan pertahankan field hasil existing (`provider`, `url`, `title?`, `content`, `publishedAt?`). Tambahan pada tipe existing ditetapkan sebagai berikut:

- `WebOpenResponse.truncated: boolean` dan `returnedChars: number`, untuk kedua route. Hitung `truncated` dengan membandingkan teks sesudah redaksi sebelum batas output versus sesudah batas; `returnedChars` adalah panjang string `content` yang benar-benar dikembalikan.
- `WebOpenResponse.provenance.kind: "native-public" | "provider-reported"` dan `WebOpenResponse.provenance.untrusted: true`.
- Field provenance opsional: `contentType`, `converter`, `downloadedBytes`, `redirects`, dan `contentSha256`. Nilai tidak tersedia dihilangkan, bukan diisi perkiraan.
- Pada `FileMetadata.publicUrl`, pertahankan `networkPolicy`, `redirects`, `downloadedBytes`; tambahkan `finalUrl` (origin + pathname saja), `contentType`, dan `contentSha256` dari snapshot bytes native. Tambahkan `extractionScope?: "full" | "main"`, `selectionReason?: string`, `retainedTextChars?: number`, serta `droppedTextChars?: number` bila tahap seleksi menghitungnya. Jangan membuat tipe hasil file tandingan.
- `WebOpenResponse.url` native memakai `FileMetadata.publicUrl.finalUrl`; converter/format memakai metadata projection existing. Untuk hasil provider, provenance ditandai provider-reported dan tidak diisi bukti DNS/peer native.
- Propagasikan metadata seleksi yang tersedia ke `WebOpenResponse.provenance`; penanda scope dan alasan fallback wajib untuk permintaan `contentScope=main`. Jangan menyatakan main-content berhasil bila hasil sebenarnya full.
- `contentSha256` adalah SHA-256 bytes yang diterima, bukan hash URL, ringkasan, atau klaim bahwa isi benar. Gunakan Node crypto existing; tidak ada database digest baru.

Batas konten `web_open` tetap 80.000 karakter. Pemotongan harus terlihat, bukan seolah hasil lengkap. Jangan mengarang judul, tanggal publikasi, charset yang tidak diketahui, status HTTP detail yang tidak dikembalikan transport, atau confidence semantik.

## 4. Pembagian fase

### Fase 1 — Satukan exposure controller pada service asli

**Owner:** `src/mcp/handler.ts`, `src/mcp/web-research-tools.ts`; kontrak existing di `src/mcp/server.ts`.

- [x] Tambahkan dan teruskan `webResearch` pada opsi/factory HTTP yang saat ini membuangnya; gunakan instance yang sudah dibuat `src/index.ts`.
- [x] Lengkapi deskripsi `web_search`/`web_open` dan metadata read-only sesuai kontrak MCP terpasang.
- [x] Pertahankan penyaringan credential dan task grant existing. Pendaftaran capability tidak memberikan izin baru.
- [x] Hubungkan cancellation hanya melalui callback context SDK yang memang tersedia, tanpa membuat parameter signal palsu di schema publik.

**Hasil aktif:** controller HTTP yang memiliki grant dapat menemukan dan memakai service research yang sama. Tidak ada server, registry, atau service research kedua.

### Fase 2 — Satukan snapshot URL publik dengan proyeksi dokumen

**Owner:** `src/net/public-url-read.ts`, `src/rdc/document-projection/{service,types,markup-converters,helpers}.ts`, `src/rdc/tools/filesystem.ts`, `src/rdc/utils/files/base.ts`.

**Satu file internal baru:** `src/rdc/document-projection/public-url.ts`, mengekspor `readPublicDocument(rawUrl: string, options: { projection?: "native" | "markdown"; contentScope?: "full" | "main"; signal?: AbortSignal; maxBytes?: number }): Promise<FileResult>`. Gunakan tipe `FileResult` existing melalui type-only import dari `../utils/files/base.js`. Helper mengimpor service projection, tetapi service tidak mengimpor atau re-export helper, agar tidak membentuk cycle. Pindahkan orkestrasi strict read yang relevan ke helper; kedua pemanggil memakai fungsi ini.

**PDF:** converter projection PDF saat ini memerlukan localPath. Untuk URL gunakan byte parser existing `../tools/pdf/lib/pdf2md.js`; jangan menganggap `projectBytes()` sendiri sudah mendukung PDF remote.

- [x] Tempatkan orkestrasi public bytes → projection pada satu helper internal milik document-projection. Helper memanggil transport existing; jangan membuat HTTP client kedua atau mengimpor seluruh tool filesystem ke research service.
- [x] Bawa header charset sebagai `charsetHint?: string` pada `ProjectBytesOptions` dan `ProjectionInput`, terpisah dari normalized MIME. Gunakan decoder existing dan teruskan hanya metadata yang tersedia.
- [x] Resolve relative links terhadap tujuan akhir yang aman, bukan URL sebelum redirect; pertahankan redaksi query/fragment.
- [x] Izinkan kombinasi `read_file(networkPolicy=public-only, projection=markdown)` melalui helper yang sama. Jalur omitted/native dan jalur tanpa networkPolicy tetap mempertahankan kontraknya.
- [x] Pertahankan penolakan kombinasi spreadsheet/integrity yang tidak didukung. Tidak memperluas whitelist media/port atau batas transport karena converter mendukung lebih banyak format.
- [x] PDF memakai parser bytes existing satu kali. Untuk `projection=native`, pertahankan `FileResult.content` kosong dan `metadata.pages` existing. Untuk `projection=markdown`, isi `content` dari `pages[].text` dengan heading `## Page {pageNumber}`; jangan memasukkan gambar base64 ke teks web. Pertahankan metadata sumber dan halaman. Image tetap mengikuti kontrak file native atau ditolak pada proyeksi teks, bukan sukses kosong.

**Hasil aktif:** proyeksi Markdown publik berasal dari snapshot yang sama dengan pemeriksaan transport; tidak ada fetch kedua, parser baru, atau implementasi donor yang berjalan terpisah.

### Fase 3 — Tingkatkan ekstraksi HTML dengan seleksi konten utama

**Owner:** `src/rdc/document-projection/helpers.ts` dan helper baru `src/rdc/document-projection/html-main-content.ts`, dipakai oleh public URL helper fase 2. Tidak membuat parser, registry converter, atau reader kedua.

**Interface internal:** `selectMainHtml(html: string): { html: string; scope: "full" | "main"; reason: string; retainedTextChars?: number; droppedTextChars?: number }`. Input sudah didekode dengan charset yang benar; original-byte digest tetap berasal dari snapshot transport.

- [x] Port bagian `compute-text-density` dan pemilihan ancestor/subtree donor #73 yang diperlukan ke tree pada translator hook publik node-html-markdown 2.0.0. Node/parent dan `visitor.rootNode` sudah tersedia; tidak mengimpor parser melalui path internal/transitive dependency.
- [x] Gunakan hook hanya pada structural containers untuk mendapatkan tree dan menentukan selection, bukan override seluruh tag. `ctx.base` tidak mempertahankan built-in factory heading/list/code/table yang diganti. Setelah terpilih, gabungkan `outerHTML` root terpilih dalam urutan dokumen, lalu jalankan HTML→Markdown existing dengan translator default dan base URL akhir.
- [x] Prioritaskan tepat satu outermost `main` atau `article` dengan sedikitnya 300 karakter teks non-whitespace. Bila ada competing main regions, fallback full. Untuk selection tanpa semantic main, gunakan density donor dengan batas konservatif yang ditetapkan di bawah.
- [x] Batas seleksi: maksimal 10.000 node, kedalaman 128, dan delapan root hasil. Batas atau tree/hook tidak tersedia → full. Hitung teks dari leaf sekali, jangan menghitung ulang seluruh ancestor sebagai retained characters.
- [x] Density-only harus mempertahankan sedikitnya 300 karakter non-link, ≥65% teks non-link halaman, rasio teks link hasil ≤35%, dan mengurangi total teks ≥15%. Nilai ini keputusan desain awal yang konservatif, bukan konstanta donor atau klaim kualitas terukur.
- [x] Fallback full bila struktur tabel/index, code block, atau bukti penting di luar hasil akan dibuang dan tidak berada dalam semantic main/article yang diminta. Jangan menyalin blanket stripping header/nav/form/image donor. Kesulitan memilih main tidak menjadi error pembacaan; kegagalan converter sesungguhnya tetap dilaporkan sebagai error.
- [x] Kembalikan scope aktual, alasan seleksi/fallback, dan hitungan retained/dropped jika dihitung. Full-requested tidak perlu melewati prepass seleksi. Semua output tetap untrusted dan tetap dibatasi budget.

**Hasil aktif:** caller dapat meminta konten utama yang lebih fokus tanpa kehilangan akses full, dengan sumber dan scope yang terlihat. Implementasi lama HTML→Markdown tetap pemilik konversi, sedangkan seleksi yang lebih kuat ditanam sebagai tahap internalnya; tidak ada aplikasi extractor donor yang dipanggil.

### Fase 4 — Jadikan pembacaan native pilihan bawaan web_open

**Owner:** `src/web-research/service.ts`, `src/mcp/web-research-schemas.ts`.

- [x] Tambahkan `reader`, `contentScope`, dan varian provider native sesuai kontrak bagian 3.
- [x] Panggil helper fase 2–3 dari `WebResearchService.open()` dengan URL mentah dan sinyal pembatalan.
- [x] Pisahkan route native dan external secara eksplisit; jangan memasukkan native ke loop catch-all provider sehingga penolakan keamanan jatuh ke cloud.
- [x] Pertahankan provider eksternal existing untuk mode external, termasuk pembatasan respons dan endpoint credential existing.
- [x] Sajikan status native reader terpisah dari search/provider credentials. Ketiadaan search key tidak boleh disamakan dengan reader native tidak tersedia.

**Hasil aktif:** `web_open({url})` membaca media publik yang didukung tanpa key reader dan tanpa request ke Jina/Firecrawl/Parallel/Browserbase. Kebutuhan reader eksternal tetap dapat dipilih dengan sadar.

### Fase 5 — Pertahankan bukti, struktur, dan batas hasil

**Owner:** metadata public-read, tipe hasil research/file, `src/mcp/web-research-tools.ts`, `src/mcp/server.ts`; `src/tracker/tool-invocation.ts` dan `src/learning/external-controller.ts` tetap menjadi pemilik invocation/outcome, biasanya tanpa perubahan implementasi owner.

- [x] Propagasikan metadata sumber sesuai bagian 3.4 dari transport/projection sampai hasil MCP; bedakan nilai teramati dengan klaim provider.
- [x] Pertahankan Markdown, code fence, tabel/link sejauh converter existing mendukung; jangan mengubah seluruh dokumen menjadi satu baris atau mengklaim main-article extraction.
- [x] Ganti `.slice(0, MAX_CONTENT_CHARS)` pada hasil web dengan adaptasi safe-prefix donor #178 setelah redaksi. Jangan memotong tepat di antara high-surrogate dan low-surrogate; sisakan ruang untuk notice bila notice ditambahkan ke konten, dan pertahankan total ≤80.000 unit UTF-16. Fungsi ini tidak memperbaiki Unicode yang sudah rusak pada sumber/provider.
- [x] Terapkan batas 80.000 karakter dengan penanda truncation; jangan menyamakan hasil parsial, kosong, unsupported, atau cancelled dengan sukses lengkap.
- [x] Pertahankan hasil MCP `isError: true` untuk kegagalan, dengan kode error stabil dari owner existing dan pesan terbatas. Jangan menampilkan stack, token, query rahasia, atau body error mentah.
- [x] Hubungkan event panggilan web eksternal ke owner tracker dan Learning existing. Saat ini `registerWebResearchTools` melewati wrapper RDC yang mencatat invocation/outcome; jangan mengklaim receipt Native AI sudah mencakup controller eksternal.
- [x] Perluas `registerWebResearchTools(server, service, options?)`, dengan `options` memuat `externalLearning?: ExternalControllerLearningService` dan `controllerSessionId?: string`, yang diteruskan dari `src/mcp/server.ts`. Gunakan `beginToolInvocationEvidence(activityTracker, toolName, {readOnlyHint:true})`, tutup lewat `finish(success|handled-failure)` atau `fail()` tepat sekali, dan panggil `externalLearning.recordToolOutcome()` dengan session host, tool, argumentKeys, outcome, readOnly, dan invocationId. Jangan membuat task/session palsu bila binding tidak tersedia.
- [x] Rekaman otomatis cukup metadata: nama tool, key argumen, outcome dan invocationId. Jangan persist raw URL/query, konten halaman, atau raw exception; kegagalan observer bersifat fail-soft dan tidak menghapus hasil pembacaan yang sudah berhasil. Ini perluasan wiring owner yang ada, bukan event store baru.
- [x] Tidak membuat bank bukti, auto-Memory ingestion, classifier model, atau pemberian credit helpful otomatis. Capture metadata tidak sama dengan pembuktian manfaat Memory.

**Hasil aktif:** AI pengontrol dapat melihat apa yang dibaca, route yang dipakai, dan batas bukti tanpa mengira konten situs sebagai instruksi atau fakta yang otomatis benar.

### Fase 6 — Pasang pada jalur utama dan tutup pekerjaan

**Owner:** source/build/launcher existing serta dokumentasi dan Memory canonical.

- [x] Pada Windows, cocokkan perubahan upstream yang relevan dengan source utama yang sedang dipakai; pertahankan pekerjaan lokal yang sah. Jangan reset branch, menimpa seluruh checkout, atau membuat proyek salinan.
- [x] Integrasikan semua perubahan ke source utama dan build dist standar. Jangan patch dist secara terpisah atau membuat dist alternatif.
- [x] Gunakan lifecycle launcher existing untuk aktivasi yang memang diizinkan pada sesi implementasi; jangan mematikan proses lain atau memperluas izin tanpa kebutuhan.
- [x] Laporkan descriptor yang berubah: field `reader`/`contentScope`, provenance/truncation, varian provider native, metadata read-only, dan exposure HTTP `web_open`/`web_search`. Bila custom plugin perlu unggah ulang, beritahu pengguna satu kali beserta kontrak yang berubah.
- [x] Catat hasil operasional sebenarnya pada plan, dokumentasi proyek, dan Memory lokal melalui owner/Learning yang sama. Simpan penerapan, aktivasi, dan manfaat sebagai status berbeda.
- [x] Setelah tidak ada file aktif yang bergantung pada lokasi sementara dalam scope, selesaikan cleanup melalui mekanisme yang diizinkan dan dapat dipulihkan; jangan menghapus folder lain atau private runtime data sebagai jalan pintas.

**Hasil selesai:** kemampuan dipakai dari controller eksternal terhadap runtime utama; native route dan pilihan external jelas; pekerjaan tidak tertinggal sebagai salinan donor, temp, atau patch dist.

Tidak ada instruksi benchmark, speed test, audit berulang, atau fixture gate sebagai tahap tambahan. Klaim hasil harus mengikuti kondisi operasional yang benar-benar diamati; masalah spesifik diperbaiki pada owner terkait, bukan mengulang seluruh plan.

## 5. Batas Batch 1 terhadap pekerjaan berikutnya

Batch 1 memiliki read-path public URL, seleksi main-content HTML opt-in, projection metadata yang diperlukan, research reader selection, dan exposure MCP web tools. Interface bagian 3 menjadi acuan stabil untuk pekerjaan berikutnya.

Tidak termasuk perubahan ranking Memory, curation/promotion, skill learning/selection, recurring-sequence mining, tree search, optimizer, browser action engine, model training, scheduler, atau system prompt baru. P0–P5 sebelumnya tetap selesai.

Draft Batch 2 sudah disusun selama implementasi Batch 1: [pencarian Skill terikat revisi](2026-10-12-batch-02-revision-bound-skill-discovery.md). Draft tersebut menunggu review pengguna. Saat implementasi Batch 1 berjalan, penyusunan Batch 2 menggunakan hasil analisis kandidat dan status interface yang aktual. File yang sedang dikerjakan Batch 1 tidak boleh diedit paralel oleh batch lain; kebutuhan perubahan shared contract dicatat sebagai revisi terarah, bukan membuat implementasi tandingan.

## 6. Register keputusan dan kontinuitas

- Pertahankan ID asli 1–216; satu entri katalog tidak selalu satu repo.
- Untuk setiap entri, catat repository/commit, file source yang dibaca, akses source yang benar-benar tersedia, mekanisme, owner Agent Core, dan keputusan adopt/extend/reuse/defer/reject/no-source.
- Bedakan source tidak tersedia publik dengan kegagalan akses. README/paper tidak diberi label analisis implementasi.
- Setiap mekanisme mempunyai satu owner dan satu batch penanggung jawab. Repo yang menyumbang beberapa ide boleh dirujuk kembali, tetapi fungsi yang sama tidak diimplementasikan dua kali.
- Checkpoint kerja mencatat fase aktif, file yang berubah, keputusan interface, hasil terakhir, dan langkah berikut. Gunakan dokumen/status yang tersimpan, bukan ingatan sesi saja.

## 7. Instruksi handoff singkat

Kerjakan enam fase plan ini secara berurutan di source utama Agent Core. Periksa kecocokan jalur terkait sekali, gunakan fungsi yang sudah ada, dan lewati perubahan yang terbukti sudah setara. Utamakan fungsi native aktif tanpa memasang runtime donor. Tuntaskan wiring sampai runtime dan descriptor yang dipakai AI eksternal. Jangan memperluas scope ke kandidat atau sistem lain. Beri tahu pengguna hanya bila tindakan manusia benar-benar diperlukan, khususnya unggah ulang custom plugin. Simpan progres dan hasil pada dokumentasi serta Memory lokal. Jangan memulai Batch 2 dari dokumen ini.

## 8. Ringkasan bersama untuk Memory lokal

<!-- batch-01-memory-summary:start -->
Batch 1 diimplementasikan pada source utama Agent Core di Linux: tiga mekanisme donor #133 web-fetch, #73 web-content-extractor dan #178 Qwen Code masuk ke owner existing tanpa runtime donor atau dependency baru. web_open default native memakai satu snapshot public URL yang diperiksa, proyeksi HTML/teks/PDF, charset, provenance dan digest bytes; external hanya dipilih eksplisit tanpa fallback otomatis. Main-content opt-in memakai batas traversal dan fallback full bila bukti di luar seleksi density akan hilang, termasuk DIV dan bare text. Output dibatasi 80.000 unit UTF-16 dengan notice dan flag truncation. HTTP MCP meneruskan service yang sama, cancellation SDK dan invocation/Learning metadata-only; grant tetap berlaku. Build standar lulus, 76 kasus terarah pada delapan file lulus; ini bukan benchmark atau bukti manfaat Memory. Tidak ada provider berbayar, instalasi donor, restart resident atau aktivasi Windows. Sesuai arahan pengguna, hasil diserahkan melalui repository untuk dipasang AI pengguna kemudian; custom plugin perlu diunggah ulang sesudah runtime tujuan memakai descriptor baru. Draft Batch 2 enam fase untuk #7/#17/#195 telah dibuat dan belum diimplementasikan atau disetujui.
<!-- batch-01-memory-summary:end -->

## 9. Hasil implementasi dan penyerahan — 12 Oktober 2026

### Scope terakhir pengguna

Pengguna menyetujui implementasi kemudian menetapkan penyerahan melalui push repository, agar AI pengguna mengambil source dan arahan untuk pemasangan berikutnya. Pemasangan Windows bukan bagian eksekusi Linux ini. Checkbox fase 6 yang menyangkut mesin tujuan tetap menjadi handoff, bukan kegagalan source atau alasan mengulang tahap yang selesai.

### Hasil source dan build

- Fase 1–5 selesai pada owner utama. Helper internal baru hanya `public-url.ts` dan `html-main-content.ts` di document-projection existing. Tidak ada engine, server, penyimpanan, runtime donor atau dependency produksi baru.
- `read_file` strict public markdown PDF memakai proyeksi teks; handler tidak lagi memilih cabang native PDF bergambar saat hasil sudah merupakan document projection. HTML berlabel MIME `text/html` tidak dialihkan ke converter RSS karena sniffing body.
- Review menemukan density selector dapat membuang koreksi pada DIV/bare text. Dua kasus reproduksi diperbaiki melalui guard leaf non-link, tanpa mengubah opt-in semantic main. Fallback konservatif dapat mempertahankan halaman penuh; ini disengaja agar bukti tidak diam-diam hilang.
- `npm run build` lulus pada source final, termasuk path policy 363 file, build Memory subproject existing, dan TypeScript. Output tetap `dist/` standar. Tidak mengedit dist manual atau membuat dist tandingan.
- Pemeriksaan terarah final: 76/76 kasus pada delapan file terkait web service, MCP, public transport/file handler, HTML selection, document projection, manifest, schema dan invocation evidence. Batas manifest 128 KiB tetap dipertahankan. Bukan whole-repository suite, provider live, benchmark, atau pemasangan Windows.
- Notice donor dan perubahan perilaku dicatat pada `THIRD_PARTY_NOTICES.md` serta satu release intent. Tidak melakukan bump versi, release, deployment, perubahan credential atau pengaturan keamanan.

### Kontrak yang diambil AI pemasang

- Terapkan source yang dipublikasikan ke checkout utama tanpa menghapus pekerjaan lokal yang sah; build output standar dan gunakan lifecycle runtime existing. Tidak menyalin reference-sources sebagai runtime.
- `web_open({url})` kini native. Pemanggil yang memang memilih jasa cloud harus mengirim `reader: external`; `contentScope: main` hanya untuk native. Metadata provenance/truncation adalah kontrak hasil baru.
- Setelah runtime tujuan memakai source ini, unggah ulang custom plugin agar field `reader`/`contentScope`, metadata read-only dan exposure HTTP web tools terlihat. Nama tool dipertahankan; registrasi total pada manifest lengkap tetap 75.
- Tidak ada source aktif dari perubahan ini di temp. Checkout donor di luar proyek adalah bahan riset, tidak diimpor runtime dan tidak disalin ke build. Tidak menghapus runtime/private data atau pekerjaan sementara lain yang bukan hasil batch ini.
- Windows activation dan manfaat pada pekerjaan nyata harus dicatat oleh AI pemasang dari hasil yang benar-benar diamati. Jangan menyebut pemasangan Windows sudah terjadi dari hasil build Linux.

### Batch berikutnya

Draft Batch 2 tersedia untuk review, enam fase untuk discovery Skill pada owner existing, terpisah dari read-path Batch 1. Semua 216 entri tetap mempunyai keputusan source dalam register; enam kandidat yang dipilih lintas dua batch bukan klaim bahwa 210 lainnya telah diintegrasikan.

## 10. Pemasangan Windows — readback 12 Oktober 2026

**Status Windows pada checkpoint integrasi awal (historis):** SOURCE INTEGRATED / STANDARD BUILD PASSED / RESIDENT ACTIVATION PENDING. Bagian Linux 1–5 di atas tetap merupakan hasil source; bagian Windows ini merekam pekerjaan mesin tujuan saat itu. Status terkini ada pada Bagian 11 di bawah.

- Sumber handoff adalah commit referensi `a93502ce14bf8aac15c3e41b949efc1f8661a55c`; hash dokumen ini sama dengan file .md yang pengguna upload (`4ca446089ebd40592c694d95c4a280e6bcbb5762`).
- Ketiga belas file existing tepat sama dengan baseline `38b00b5` sebelum perubahan. Patch source/test terbatas menghasilkan 17/17 hash sama dengan commit handoff. Branch `codex/cumulative-learning-workflow` dan perubahan pengguna lainnya dipertahankan. Tidak ada reset/merge/pull/commit.
- Backup praubah: `runtime/backups/native-web-batch01-windows-20261012`. Dua helper document-projection serta dua file acceptance baru masuk `src/`/`tests/`, bukan runtime donor.
- `npm run build` standar: exit code 0, path policy 363/0, `build:memory` dan TypeScript root berhasil. Tidak ada broad test baru atau benchmark yang dijalankan pada Windows. Hasil Linux 76/76 bukan otomatis menjadi klaim verifikasi Windows.
- `docs/CODEBASE.md`, register 216 kandidat, `THIRD_PARTY_NOTICES.md`, release intent minor, root `MEMORY.md` dan canonical local Memory harus mempertahankan status sebenarnya ini.
- Fase 6 integrasi source/build dan dokumen selesai. **Belum ada restart resident atau readback HTTP MCP native** dalam sesi ini; tidak boleh disebut live-activated.
- Sesudah restart yang diotorisasi melalui launcher existing, cek descriptor `web_open.reader`, `web_open.contentScope`, provenance/truncation, metadata read-only, dan exposure HTTP `web_open`/`web_search`. Custom plugin mungkin memerlukan unggah ulang/reinitialize oleh pengguna. Tidak membuka Batch 2 atau mengubah policy grants.

## Windows activation readback - 12 October 2026

After the user's manual restart, Windows Agent Core Node PID 17884 started at 21:04 local with /health=ok, version 0.15.0-beta.3. The resident Web Research health returned nativeReaderAvailable=true, externalReaderConfigured=true, and openProviders starting with native. A live read_file MCP call to https://example.com/ with public-only Markdown projection succeeded: 577 bytes, zero redirects, untrusted source. This proves the shared native public-document path works on the resident server. Direct web_open MCP invocation was not possible from this ChatGPT connector, whose exposed manifest does not include web_open; options reader/contentScope and live result metadata therefore remain external-controller acceptance pending. No server restart or credential changes were performed by the assistant. Some additional terminal smoke calls were blocked by the tool safety boundary and were not bypassed.

## 11. Penutupan Fase 6 Windows — external-controller readback, 12 Oktober 2026

**STATUS TERKINI: SOURCE INTEGRATED / STANDARD BUILD PASSED / RESIDENT ACTIVE / EXTERNAL MCP VERIFIED.** Status `activation pending` di Bagian 10 adalah checkpoint historis sebelum restart manual dan refresh descriptor.

- Pada runtime Windows yang sedang berjalan, `/health` melaporkan `status=ok`, versi `0.15.0-beta.3`, dan `webResearch.nativeReaderAvailable=true`, dengan `native` pada urutan awal `openProviders`.
- Pemanggilan langsung dari controller eksternal `web_open({url:"https://example.com/"})` berhasil dengan `provider=native` tanpa memilih reader. Hasil: `returnedChars=156`, `truncated=false`, `provenance.kind=native-public`, `untrusted=true`, HTML→Markdown, `downloadedBytes=577`, `redirects=0`, dan digest SHA-256 snapshot bytes tersedia; URL hasil disanitasi.
- `web_open({url:"https://example.com/", reader:"native", contentScope:"main"})` berhasil dengan `extractionScope=full` dan `selectionReason=insufficient-main-text`. Ini adalah fallback konservatif yang sesuai kontrak, bukan klaim main-content berhasil diekstrak.
- Kombinasi `reader=external` dengan `contentScope=main` ditolak sebagai `WEB_RESEARCH_CONTENT_SCOPE_UNSUPPORTED`; tidak ada fallback diam-diam. `web_search` juga berhasil dipanggil dari konektor, melalui provider pencarian eksternal `exa` (query verifikasi: `IANA reserved example domains`).
- Descriptor custom Agent Core pada controller ini sekarang memperlihatkan `web_open`/`web_search` beserta field `reader` dan `contentScope`, sehingga **tidak perlu unggah ulang untuk sesi ini**. Konektor lain yang masih memakai descriptor lama mungkin perlu refresh oleh pengguna.
- Fase 6 telah tercapai untuk integrasi sumber, build standar, aktivasi resident oleh restart manual pengguna, pembacaan native MCP, dan pelaporan. Tidak ada sumber runtime yang diimpor dari folder donor/temp atau penghapusan file privat; backup lama dipertahankan.
- Pemeriksaan ini bukan benchmark, broad regression suite, jaminan main-content extraction semua situs, ataupun pembuktian manfaat Learning/Memory. Tidak ada build/restart asisten, `release:apply`, bump versi, commit, push, publish, deploy, atau perubahan credential. Pengerjaan Batch 1 pada sesi ini **tidak memulai atau mengubah Batch 2**.

### 11.1 Laporan pelengkap keterlacakan: sumber dan pemasangan

**Basis:** hanya bukti implementasi/readback yang telah tercatat pada sesi Batch 1; laporan tambahan ini bukan audit atau acceptance baru. Penutupan bagian 11 di atas tetap menjadi status terkini.

- **Upstream/handoff:** revision `a93502ce14bf8aac15c3e41b949efc1f8661a55c`; baseline pembanding `38b00b53650b2893017e50df852013ef270902eb`. Blob dokumen handoff asli `4ca446089ebd40592c694d95c4a280e6bcbb5762`. Mekanisme Windows adalah **selective scoped patch/adoption**, bukan Git merge/reset/pull maupun penyalinan runtime donor.
- **Checkout:** `E:\Projects\Agent-Core`, branch `codex/cumulative-learning-workflow`; catatan provenance existing menyimpan local HEAD `639cdf77fd7288a722131862e22eecaff4a90f07` ketika source dicapture. HEAD ini **bukan** upstream revision, bukan tanda patch sudah di-commit, dan bukan digest installed runtime.
- **Paritas patch historis:** 13 target existing awalnya cocok dengan baseline; setelah patch 17/17 selected source/test Git blobs cocok dengan upstream handoff. Perubahan unrelated tetap dipertahankan, tanpa checkout baru. Daftar lengkap 17 blob tidak dirinci per-path dalam bukti ringkas ini; jangan mengisi daftar yang hilang dengan dugaan.
- **Jalur source utama yang tercatat:** `src/web-research/service.ts`, `src/mcp/{handler,server,web-research-tools,web-research-schemas}.ts`, `src/rdc/document-projection/{public-url,html-main-content,service,types,helpers,markup-converters}.ts`, `src/rdc/tools/filesystem.ts`, `src/rdc/utils/files/base.ts`. Dua helper **baru** adalah `public-url.ts` dan `html-main-content.ts`; transport `src/net/public-url-read.ts` dan converter existing **direuse** sebagai owner, bukan engine kedua. Daftar ini menyatakan owner utama dari plan, bukan semua path dipastikan berubah.
- **Donor yang diadaptasi selektif:** #133 web-fetch (kontrak reader), #73 web-content-extractor (seleksi HTML), #178 Qwen Code (pemotongan UTF-16 aman). Tidak menjalankan donor sebagai runtime/layanan baru.
- **Build Windows terdahulu:** `npm run build` dari checkout utama, exit code **0**; path-policy **363/0**, termasuk `build:memory` dan TypeScript root. Output `dist/` standar; tidak ada dist tandingan/patch manual. Linux mencatat **76/76** tes terarah, tetapi ini **bukan** hasil tes Windows baru.
- **Aktivasi historis:** restart `Agent Core.exe` manual oleh pengguna pada **12 Oktober 2026**. Readback lama mencatat Node Core **PID 17884**, start **21.04 waktu lokal WIB**, `/health=ok`, versi `0.15.0-beta.3`, `webResearch.nativeReaderAvailable=true`, urutan `openProviders` dimulai `native`. PID adalah identitas **pada readback saat itu**, bukan jaminan PID saat laporan dibaca.
- **Digest installed dist / waktu build yang presisi / ID restart:** **tidak tercatat dalam bukti sesi**. Jangan disamakan dengan Git HEAD atau digest halaman web.

### 11.2 Bukti pemanggilan MCP yang telah terjadi

| Bukti existing | Input / hasil aktual | Batas penafsiran |
|---|---|---|
| `web_open` default | `{url:"https://example.com/"}` → `provider=native`, scope `full` (`selectionReason=full-requested`); `returnedChars=156`, `truncated=false` | Tanpa reader key; tidak membuktikan semua situs/format. |
| Metadata native | `provenance.kind=native-public`, `untrusted=true`, `contentType=text/html; charset=utf-8`, `converter=html-markdown`, `downloadedBytes=577`, `redirects=0` | Locator `https://example.com/` disanitasi; konten situs tetap untrusted. |
| Digest snapshot nyata | `contentSha256=25ddf2c883e0d1958ea971d279a7e4f0fd446724ee3db7db19dadabd4a62e484` | Digest **bytes dokumen**, bukan hasil build, Git commit, hash URL, atau verifikasi kebenaran isi. |
| `web_open` main | `{url:"https://example.com/",reader:"native",contentScope:"main"}` → sukses `provider=native`, **actual `extractionScope=full`**, `selectionReason=insufficient-main-text`, `retainedTextChars=146`, `droppedTextChars=0` | Fallback konservatif; bukan klaim ekstraksi main berhasil. |
| `web_open` kombinasi tak didukung | `{url:"https://example.com/",reader:"external",contentScope:"main"}` → `INVALID_ARGUMENT` / `WEB_RESEARCH_CONTENT_SCOPE_UNSUPPORTED` | Validasi schema, **bukan** bukti provider reader eksternal berhasil; tidak ada fallback otomatis. |
| `web_search` | `{query:"IANA reserved example domains",mode:"web",limit:2}` → pencarian sukses via provider **exa** | Web search tetap provider eksternal, **bukan** search index internet lokal. |
| `read_file` public Markdown (readback sebelumnya) | `https://example.com/` → 577 bytes, 0 redirect, content trust untrusted | Membuktikan jalur shared native public document, berbeda dari bukti `web_open` langsung. |

- **Tanggal bukti MCP:** 12 Oktober 2026. **Jam tepat setiap panggilan `web_open`/`web_search`, request ID/invocation ID yang terikat ke masing-masing panggilan, dan digest hasil `web_search`: tidak tercatat dalam bukti sesi.** Jangan membuat ID/waktu perkiraan.
- **Descriptor controller saat itu:** custom plugin pada sesi ChatGPT sudah mengekspos `web_open`, `web_search`, input `reader`/`contentScope`, serta hasil provenance/truncation. Tidak diperlukan unggah ulang plugin/restart **untuk sesi tersebut** hanya karena checkpoint lama menyebut pending; client lain mungkin memiliki manifest cache berbeda.

### 11.3 Dokumen, Memory dan checkpoint yang sudah tersimpan

- **Plan authority dan laporan tunggal:** `E:\Projects\Agent-Core\docs\plans\2026-10-12-batch-01-native-web-evidence.md`, terutama **Bagian 11** dan rincian pelengkap 11.1–11.4. Bagian 9 tetap penyerahan Linux; Bagian 10 adalah checkpoint pemasangan Windows yang saat itu belum aktif, **bukan** status terkini.
- **Peta arsitektur:** `E:\Projects\Agent-Core\docs\CODEBASE.md`, section `2026-10-12 — Batch 1 native web evidence, external-controller acceptance`. **Ringkasan naratif proyek:** `E:\Projects\Agent-Core\MEMORY.md`, `2026-10-12 — Batch 1 native public web evidence (Windows)`.
- **Canonical Agent Core Memory:** owner penyimpanan `E:\Projects\Agent-Core\runtime\memory`, record **`cad9fb5d-32b5-4642-b533-a72e746a16ca`**. Judul `Batch 1 Native Web Evidence Windows — resident and external MCP verified 2026-10-12`; revisi terakhir yang terbaca `2026-10-12T15:35:38.313Z`. Record existing **di-update in-place pada sesi penutupan sebelumnya**, tidak digandakan.
- **Cortex Semantic Memory eksternal:** existing record **`0d923b6a-59dd-4a44-b6ea-fecad274789b`**, `https://skynetlab-cortex.com/?m=0d923b6a-59dd-4a44-b6ea-fecad274789b`, tersimpan `2026-10-12T15:36:14.976Z`. Ini catatan lintas-sesi pada layanan Cortex, **bukan** canonical file store Agent Core ataupun pengganti `runtime\memory`.
- **Pembagian authority:** canonical file note Agent Core merupakan sumber ingatan lokal; derived index adalah indeks turunan. `MEMORY.md` dan `CODEBASE.md` adalah ringkasan/dokumentasi proyek. Cortex adalah catatan semantik eksternal atas fakta yang sama, **bukan** gudang baru di Agent Core.
- **Learning checkpoint existing:** **337**, `idempotencyKey=batch01-windows-native-web-external-closure-20261012`; review yang sudah dilakukan berstatus **`no-new-knowledge`**, `complete=true`, `captured=0`, `proposal=0`, `duplicate=0`, `rejected=0`. Tidak diperlukan pembuatan record penutupan baru.
- **Backup historis:** `runtime/backups/native-web-batch01-windows-20261012`; release intent minor `.changeset/20261012124354-db717f.md` tetap belum diaplikasikan. Hasil patch/build Windows dan hasil acceptance sebelumnya tetap tercatat sebagai bukti historis, tanpa diperiksa ulang dalam pekerjaan pelaporan ini.

### 11.4 Verdict dan batas laporan

**Batch 1 COMPLETE pada lingkup source Windows, standard build, aktivasi resident setelah restart manual pengguna, dan pemanggilan MCP langsung dari controller ChatGPT.** Detail tambahan ini disusun dari bukti existing, **tanpa** implementasi ulang, test suite, benchmark, instalasi, restart, credential change, release, commit, push, publish atau deployment.

Pekerjaan sesi ini **tidak mengerjakan Batch 2** dan tidak menyatakan status global Batch 2 di luar sesi ini. Jangan meminta restart atau unggah ulang custom plugin lagi hanya berdasarkan checkpoint historis yang menyebut activation pending. Cakupan semua PDF/HTML/situs, ketahanan operasional lintas situs, kualitas ekstraksi secara umum, serta manfaat jangka panjang Memory/Learning tetap **belum dibuktikan** oleh acceptance terbatas ini.
