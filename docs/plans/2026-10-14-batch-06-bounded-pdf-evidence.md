# Batch 6: Proyeksi PDF berbatas yang mempertahankan bukti

**Status pelaksanaan 14 Oktober 2026 Asia/Tomsk: IMPLEMENTATION/INTEGRATION COMPLETE.** Parser, projection, caller dan adapter keluaran sudah terintegrasi. PDF Mozilla TraceMonkey dibaca terpisah melalui web_open `pdfPages:{start:2,count:1}` dan read_file lokal `offset:1,length:1`; keduanya melaporkan SHA256 `3662ff519e485810520552bf301d8c3b2b917fd2f83303f4965d7abed367e113`, 1016315 byte, 14 halaman total, 32 item/219 omitted, coverage partial, approximate-text-item dan semanticVerification not-performed. Output lokal juga membawa 10 image blocks. Kontrak rinci berikut tetap menjadi acuan. [Laporan integrasi dan receipt](../Batch-05-06-Windows-Integration-20261014.md) mencatat aktivasi awal, koreksi diagnostik dan verifikasi resident koreksi. Status COMPLETE berlaku untuk kontrak implementasi/integrasi, bukan klaim manfaat retrieval atau akurasi ekstraksi.

Build produksi resmi gabungan lulus (371 authored files/0 exceptions, Memory lalu Core). Pemeriksaan lexical: 1 passed/6 skipped; dua pemeriksaan batas/pengiriman PDF lulus. Schema resmi 78 tools/130150 byte (baseline Consumer yang sama 129815 byte, delta +335; reviewed75 terpisah 124014/131072 byte), SHA256 `3c553f0cecfdcf53c126992c1bcdbda3548b2acb632bb079f5d433321072b7cb`. ZIP `SubProject/Agent-Core-ChatGPT-Plugin-Batch-05-06-v1.0.3.zip`, SHA256 `003dadefc28351ecf9b8af24e15c240e3df9572b2f23d4ac95ac931ab286d7ac`, sudah diunggah sebagai plugin 1.0.3 release `pluginrel_6ace893c75588191bc7d7b1d17ec6261`; app/name/binding existing tetap. Runtime product tetap 0.15.0-beta.3.

Restart pengguna memiliki receipt `a779c6cf88604708a503d7b18efdf819`, exit 0 pada `2026-10-13T19:41:53.0630171Z`; launcher PID18824/node PID10960 berjalan setelah build awal. Seluruh 18 pasangan hash source/build cocok sebelum koreksi, dan client memuat pdfPages, autoCheckpoint, retrievalPlan serta imageReview. Penggunaan nyata menemukan output-truncated palsu pada PDF web akibat normalisasi whitespace; helpers.ts kini membedakan pemotongan byte aktual dan service meneruskan boolean tersebut. Build koreksi resmi PID10624 lulus exit 0 dalam 16,10 detik, 371 authored files/0 exceptions. Kontrak/schema/ZIP tidak berubah; upload ulang tidak diperlukan. Restart koreksi, verifikasi web/lokal pada resident baru, cleanup recoverable serta finalisasi native Memory/Learning selesai dengan receipt dan readback. Artefak final/log berada di SubProject dan runtime/backups/batch05-06-integration-20261014, di luar temp.

Koreksi diaktifkan melalui satu restart dengan script existing setelah izin pengguna untuk auto-approve demi perkembangan Agent Core. Receipt `runtime/restart/2a92ce7b93384ed1bcf12ff05c96c780.json` mencatat completed/exit 0 pada 20:05:34 UTC. Core PID6968, parent launcher PID13436, mulai 20:05:36.1814640 UTC; executable runtime/node/node.exe dan dist/index.js diverifikasi, tunnel PID4168. Seluruh 19 pasangan source/emitted cocok setelah restart, changed[]. Pemanggilan web_open pada 20:09:33 UTC dan read_file pada 20:10:00 UTC mengirim PdfEvidence halaman 2 sampai controller; output-truncated palsu sudah hilang. Coverage partial kini hanya beralasan item-limit: 251 item terpilih, 32 dikirim, 219 omitted; reader lokal tetap mengirim 10 image blocks.

Cleanup selesai melalui pemindahan recoverable dengan Move-Item, proses PID2468 exit 0 pada `2026-10-13T20:15:46.5822634Z`. Seluruh node-compile-cache dipindahkan ke `runtime/backups/batch05-06-integration-20261014/cleanup-recovered-20261014`: 95 file, 309004 byte, 2 direktori, seluruh 95 SHA256 cocok. Preflight mencatat 0 reparse, 0 referensi proses aktif, 0 referensi Scheduled Task dan hasil handle No matching. Keadaan akhir terverifikasi: `E:/Projects/Agent-Core/temp` tidak ada; `E:/Projects/Agent-Core/runtime/tmp` kosong, 0 child. Receipt `activation-evidence/cleanup-preflight.json` dan `activation-evidence/cleanup-receipt.json` telah dibaca ulang; activation-receipt.json diperbarui in-place untuk resident koreksi, caller dan cleanup.

Canonical Memory existing `4b6d0835-b21e-431f-a724-bc9160c9f6ea` pada root runtime/memory diperbarui dan dibaca ulang pada `2026-10-13T20:22:38.852Z`; riwayat dipertahankan. feedbackTargetDigest `sha256:4404ed57196654c2ffc155042195adb18df0f466c444256d2975a2be2a9fc224`, freshness current/local-byte-snapshot, 3 source anchors, changed[] dan unavailable[]; capture `2026-10-13T20:22:37.798Z`. Learning checkpoint 358, key `batch05-06-20261014-activation-closure`, dibuat `2026-10-13T20:18:52.618Z`; review scoped task selesai dengan no-new-knowledge, complete:true dan 0 candidate pada `2026-10-13T20:19:15.348Z`, lalu status dibaca ulang. evidenceRefs persisted[] tetap kosong; bukti rinci berada di laporan/receipt. Review pending milik pekerjaan lain tidak disentuh. Dokumen ini tetap proyeksi status, bukan owner Memory kedua.

Batch 5–6 telah menyelesaikan implementasi/integrasi sesuai kontrak; fallback lexical aktual belum teramati dan manfaat retrieval/akurasi ekstraksi tidak diukur. Kelanjutan siap menuju Batch 7 lalu Batch 8 dari register 216 kandidat, maksimal dua plan sekaligus. Keduanya belum dimulai; status kesiapan ini tidak mengklaim rencana Batch 7/8 telah disusun atau source/plan telah direview. Consumer/Batch 3–4 tidak dibuka kembali; tidak ada Consumer tambahan atau Invocate.

| Fase | Status pelaksanaan |
|---|---|
| 1 — Rekonsiliasi/kontrak | Selesai pada owner source existing; satu tipe PdfEvidence, dependency/app binding tetap. |
| 2 — Evidence sebelum flattening | Source selesai; cap, selection, geometri approximate dan cleanup parser diterapkan. |
| 3 — Satu snapshot | Source selesai pada local/native, projection, public serta legacy URL; PDF lokal dan web nyata melaporkan hash sumber yang sama. |
| 4 — Keluaran controller | Adapter source dan dua pemeriksaan batas/pengiriman lulus; pemakaian PDF nyata teramati. Koreksi diagnosis output-truncated aktif dan terverifikasi pada resident koreksi; partial yang tersisa hanya item-limit. |
| 5 — Build/schema/ZIP | Build resmi/schema full78 selesai; plugin 1.0.3 sudah diunggah. Build koreksi lulus tanpa perubahan kontrak/schema/ZIP. |
| 6 — Aktivasi/pemakaian nyata | Upload/restart awal/descriptor client, restart koreksi serta read_file lokal dan web_open nyata selesai; evidence mencapai controller dan output-truncated palsu hilang. |
| 7 — Dokumentasi/Memory/cleanup | Dokumen dan canonical Memory diselaraskan/readback; Learning checkpoint 358 selesai no-new-knowledge; cleanup recoverable 95 file/95 SHA256 cocok, temp tidak ada/runtime/tmp kosong. |

Checkbox fase 1–7 ditutup berdasarkan source/build, aktivasi, pemakaian nyata, canonical persistence dan cleanup yang tercatat. Geometri tetap approximate; OCR tidak dilakukan dan kualitas ekstraksi tidak diukur.

## Tujuan dan batas batch

AI eksternal yang memanggil `web_open(reader="native")` atau `read_file` harus menerima teks PDF disertai identitas snapshot, halaman, geometri teks pendekatan, kemampuan ekstraksi, dan keterangan bagian yang tidak dikirim. Perbaikan masuk ke parser, proyeksi, dan adapter keluaran Agent Core yang sudah ada.

Satu kelompok adopsi: #120 ParserTry + #140 OpenDataLoader PDF. #120 memberi pola deklarasi kemampuan; #140 memberi pola metadata halaman/geometri/asal ekstraksi. Implementasi kontrak native secara independen, tanpa menyalin source #120 yang lisensinya belum jelas. Dependency PDF existing tetap dipakai.

Batch 3 dan 4 sudah selesai diimplementasikan dan diintegrasikan. Hasil planned recall `partial/deadline` adalah keluaran sah kontraknya; tidak perlu membuat semua subquery selesai untuk membuka Batch 6. Batch 5 mengurus konteks/recall Memory. Batch 6 tidak mengubah ranking Memory, Learning authority, root `runtime/memory`, atau kemampuan visual Batch 4.

Di luar batch: OCR, struktur tabel semantik, model layout/vision, mesin pemilih parser, Java/PyMuPDF/Docling, provider/store/service kedua, Native Chat/API agent, replay, progress advisor #90/#69, procedure advisory #127, dan Invocate. Tidak ada rangkaian test, benchmark, atau audit berulang dalam rencana ini. Build produksi dan penggunaan fitur nyata merupakan bagian integrasi, bukan proyek evaluasi baru.

## Baseline sumber yang dipakai

- GitHub resmi `Black-Project-Agent-Core/Agent-Core`, default branch `main`, terkonfirmasi pada `73e9fd270ee96fe7d9782b9e87ccc70dbbae986d`. Commit itu berisi pendalaman dokumentasi; ia bukan bukti bahwa perubahan Windows Batch 3/4 belum terpasang.
- Laporan `Batch-03-04-Windows-Integration-20261013(2).md` menjadi overlay kontrak instalasi: checkout Windows pada HEAD `639cdf77fd7288a722131862e22eecaff4a90f07` dengan perubahan terpasang; build/runtime aktif, client telah diperbarui, planned context callable dan review nyata berhasil. Riwayat PARTIAL lama di laporan bukan status sekarang.
- Body source remote di bawah dibaca pada pin main tersebut. Checkout historis cloud `8d1f158` tidak dipakai sebagai source terkini dan tidak dimodifikasi.
- Saat pelaksanaan, cocokkan satu kali hanya file yang disentuh dengan source terpasang. Pertahankan perubahan Batch 3/4; jangan menimpa file dari baseline remote atau membuka ulang integrasinya.

## Bukti donor dan transfer mekanisme

### #120 ParserTry

Pin `efc01d8ab1a350f14d74f614443f01bcba5d1071`, repo `leeryong/ParserTry`.

Caller nyata `_run_parse_job` → `get_parser` → `BaseParser.parse` → `PyMuPDFParser._parse_impl`. BaseParser membedakan parser tidak tersedia dengan kegagalan eksekusi. Adapter PyMuPDF berjalan per halaman/blok/baris/span dan mempertahankan ukuran halaman serta posisi span.

- [Caller job, baris 527–612](https://github.com/leeryong/ParserTry/blob/efc01d8ab1a350f14d74f614443f01bcba5d1071/backend/main.py#L527-L612)
- [Registry, baris 35–91](https://github.com/leeryong/ParserTry/blob/efc01d8ab1a350f14d74f614443f01bcba5d1071/backend/parsers/registry.py#L35-L91)
- [BaseParser, baris 10–119](https://github.com/leeryong/ParserTry/blob/efc01d8ab1a350f14d74f614443f01bcba5d1071/backend/parsers/base.py#L10-L119)
- [Adapter PyMuPDF, baris 52–146](https://github.com/leeryong/ParserTry/blob/efc01d8ab1a350f14d74f614443f01bcba5d1071/backend/parsers/pymupdf_parser.py#L52-L146)

Yang diambil hanya ide kontrak kemampuan/hasil. Jangan membawa fallback donor dari subset gagal ke seluruh PDF, klasifikasi heading dari ukuran font, engine rekomendasi, atau runtime Python. [README](https://github.com/leeryong/ParserTry/blob/efc01d8ab1a350f14d74f614443f01bcba5d1071/README.md#L7-L25) memiliki badge MIT, tetapi tree penuh pada pin tidak memuat LICENSE/LICENCE/COPYING. Status lisensi tetap unresolved; tidak ada source substantif #120 yang disalin.

### #140 OpenDataLoader PDF

Pin `2fd4b076f7e175aa33cd4d4e51f72a9447c51920`, repo `opendataloader-project/opendataloader-pdf`.

`JsonWriter.writeToJson` memasang metadata, menulis setiap object melalui codec, dan membersihkan konteks dalam `finally`; `ParagraphSerializer.serialize` memanggil `SerializerUtil.writeEssentialInfo`, `writeTextInfo`, dan `writeMetadataIfPresent`. Body terakhir benar-benar menulis nomor halaman, bounding box, asal teks, metode pencocokan kata, dan metadata opsional.

- [JsonWriter, baris 47–134](https://github.com/opendataloader-project/opendataloader-pdf/blob/2fd4b076f7e175aa33cd4d4e51f72a9447c51920/java/opendataloader-pdf-core/src/main/java/org/opendataloader/pdf/json/JsonWriter.java#L47-L134)
- [ParagraphSerializer, baris 26–40](https://github.com/opendataloader-project/opendataloader-pdf/blob/2fd4b076f7e175aa33cd4d4e51f72a9447c51920/java/opendataloader-pdf-core/src/main/java/org/opendataloader/pdf/json/serializers/ParagraphSerializer.java#L26-L40)
- [SerializerUtil, baris 34–146](https://github.com/opendataloader-project/opendataloader-pdf/blob/2fd4b076f7e175aa33cd4d4e51f72a9447c51920/java/opendataloader-pdf-core/src/main/java/org/opendataloader/pdf/json/serializers/SerializerUtil.java#L34-L146)
- [Lisensi Apache-2.0](https://github.com/opendataloader-project/opendataloader-pdf/blob/2fd4b076f7e175aa33cd4d4e51f72a9447c51920/LICENSE)

Yang diadaptasi adalah pemeliharaan metadata melalui serialisasi. Jangan mengimpor Java, ThreadLocal, hybrid OCR, confidence/AI-score donor, atau swallow-error pada writer sebagai definisi sukses. Jika kelak ada potongan berlisensi yang benar-benar disalin, sertakan atribusi/notice yang berlaku; desain ini tidak memerlukannya.

### Dependency native yang sudah tersedia

Lockfile Agent Core mematok `@opendocsg/pdf2md` 0.2.9, MIT, integrity `sha512-VHjnMdAsVNAxoJlvuMYxWhLcn/Fe815wbk77h9vUMKIFqyBuns5tyNz0LjfKIwfOF0qRB9eLjoFDMUmEcKke6Q==`. Pin source upstream versi 0.2.9 yang dibaca: `opengovsg/pdf2md@2f414b103cea7c93ac12e6c16a6e9b229a0cf798`.

- [Lock native, baris 740–751](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/73e9fd270ee96fe7d9782b9e87ccc70dbbae986d/package-lock.json#L740-L751)
- [Manifest upstream versi 0.2.9](https://github.com/opengovsg/pdf2md/blob/2f414b103cea7c93ac12e6c16a6e9b229a0cf798/package.json), [MIT](https://github.com/opengovsg/pdf2md/blob/2f414b103cea7c93ac12e6c16a6e9b229a0cf798/LICENSE)
- [`parse`, baris 54–111](https://github.com/opengovsg/pdf2md/blob/2f414b103cea7c93ac12e6c16a6e9b229a0cf798/lib/util/pdf.js#L54-L111) membentuk TextItem x/y/width/height sebelum transform. Posisi dibulatkan, tinggi heuristik, dan page-number removal dapat terjadi.
- [`transform`](https://github.com/opengovsg/pdf2md/blob/2f414b103cea7c93ac12e6c16a6e9b229a0cf798/lib/util/transformations.js#L18-L45) memakai referensi pages; [`ToMarkdown`](https://github.com/opengovsg/pdf2md/blob/2f414b103cea7c93ac12e6c16a6e9b229a0cf798/lib/models/transformations/ToMarkdown.js#L11-L40) mengganti page.items menjadi string.

Ini bukti kemampuan struktur intermediate, bukan klaim bahwa bytes paket yang terpasang telah dibandingkan dengan tarball registry atau bahwa geometri adalah kotak glyph akurat. Tidak ada upgrade dependency dalam batch.

## Gap native dan consumer yang benar-benar menerima hasil

1. [`pdf2md.ts:29–38,69–124`](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/73e9fd270ee96fe7d9782b9e87ccc70dbbae986d/src/rdc/tools/pdf/lib/pdf2md.ts#L29-L124): halaman keluar sebagai text/images/pageNumber. Struktur sebelum transform hilang. Blok cleanup sekarang baru melindungi bagian return; perlu melindungi seluruh pemakaian dokumen yang berhasil diperoleh.
2. [`ProjectionResult`](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/73e9fd270ee96fe7d9782b9e87ccc70dbbae986d/src/rdc/document-projection/types.ts#L27-L70) belum memiliki PDF evidence. [`pdfProjectionConverter`](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/73e9fd270ee96fe7d9782b9e87ccc70dbbae986d/src/rdc/document-projection/office-converters.ts#L367-L393) membuka ulang localPath, meskipun `projectLocalFile` telah menerima bytes berbatas.
3. [`readPublicDocument:35–76`](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/73e9fd270ee96fe7d9782b9e87ccc70dbbae986d/src/rdc/document-projection/public-url.ts#L35-L76) sudah menghitung digest dan parse dari snapshot bytes yang sama. Pertahankan ini. Remote PDF belum lewat PDF converter dalam service.
4. [`WebResearchService.open:748–783`](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/73e9fd270ee96fe7d9782b9e87ccc70dbbae986d/src/web-research/service.ts#L748-L783) hanya memproyeksikan provenance ringkas; metadata halaman PDF tidak sampai ke controller. [`registerWebResearchTools:93–99`](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/73e9fd270ee96fe7d9782b9e87ccc70dbbae986d/src/mcp/web-research-tools.ts#L93-L99) adalah consumer MCP eksternal sebenarnya.
5. [`projectionToFileResult:362–376`](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/73e9fd270ee96fe7d9782b9e87ccc70dbbae986d/src/rdc/tools/filesystem.ts#L362-L376) dan [`handleReadFile:138–172,220–241`](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/73e9fd270ee96fe7d9782b9e87ccc70dbbae986d/src/rdc/handlers/filesystem-handlers.ts#L138-L241) juga harus membawa metadata sampai content model-facing. Hanya menambah interface internal tidak cukup.

Jalur akhir: MCP `web_open` → WebResearchService → readPublicDocument → transport publik existing → bytes PDF → DocumentProjectionService/pdf2md → metadata berbatas → WebOpenResponse → content MCP. Jalur lokal: MCP `read_file` → filesystem → service atau PdfFileHandler → byte parser yang sama → FileMetadata → handler model-facing. Tidak ada owner/adapter paralel.

## Positive — Purpose / expected behavior

- Adopsi mekanisme yang berguna ke parser/proyeksi/caller asli sampai dapat dipakai AI eksternal; source donor menjadi referensi, tidak menjadi runtime baru yang harus dipanggil.
- Satu snapshot bytes mendasari teks, digest dan geometri; semua batas serta omission diteruskan sampai response controller.
- Utamakan implementasi internal dengan dependency PDF existing; metadata baru additive dan backward-compatible untuk format lain.
- Hasil integrasi menghasilkan ZIP plugin siap Upload new version dengan versi paket meningkat, binding app/tunnel/auth tetap, serta dokumentasi dan Memory lokal yang selaras.

## Negative — Purpose / unexpected behavior

- Jangan berhenti pada helper, dokumentasi, schema snapshot, atau adapter yang tidak tersambung ke caller nyata.
- Jangan membuat parser/store/provider kedua, duplikasi codebase, metadata tanpa batas, atau source data aktif yang tertinggal di folder temp.
- Jangan menyamakan geometri pendekatan dengan glyph/pixels terverifikasi, status partial dengan gagal otomatis, atau build berhasil dengan client sudah diperbarui.
- Jangan membuat loop audit/test/benchmark, menambah syarat di luar plan, mengganti identitas plugin, atau mengulang registrasi credential/tunnel sebagai prosedur pembaruan normal.

## Kontrak keputusan yang harus diimplementasikan

### Bentuk payload additive

Definisikan satu tipe `PdfEvidence` pada owner PDF existing. `PdfParseResult`, `ProjectionResult`, `FileMetadata`, dan `WebOpenResponse` memakai field opsional `pdfEvidence` dengan tipe yang sama melalui type-only import. Jangan membuat field PDF wajib untuk HTML/Office/format lain atau menyalin empat definisi yang dapat drift.

Isi PDF evidence:

- `version: 1`, `sourceSha256`, `sourceBytes`, `observedAt`, `extractor: {name, version}`, `totalPages`
- `textSource: "pdf-text-layer"`; ini keluaran text layer yang diproses dependency, bukan label OCR
- `capabilities`: text extraction supported; approximate text-item geometry supported bila data tersedia; OCR dan semantic table structure `supported:false, attempted:false`; embedded-image extraction ditandai sesuai jalur aktual
- `coverage`: halaman yang diminta dan dikirim, item dikirim/dihilangkan, batas byte, bytes metadata aktual, status `complete|partial|empty`, alasan penghentian, serta `nextPage` bila ada halaman lanjutan
- `pages[]`: nomor fisik halaman 1-based; viewBox/rotation/userUnit hanya jika tersedia dari dokumen yang sama; status geometry; `items[]`
- item: `id` lokal seperti `p3:t12`, index TextItem sebelum transform, cuplikan teks berbatas, dan `position:{x,y,width,height}` bila nilai finite dan dimensi sah
- identitas item selalu tuple `(sourceSha256, extractor version, pageNumber, item id)`. ID tidak berlaku lintas revisi/parser dan bukan handle Memory atau `viewId` gambar
- `geometryFidelity:"approximate-text-item"`, `coordinateSpace:"pdf-user-space"`, `rotationApplied:false`, `clipStatus:"not-applied"`, `textOrientation:"unknown"`, `semanticVerification:"not-performed"`

Jangan menyebut posisi itu glyph-box, bounding box layar, hasil crop, atau bukti telah melihat pixels. x/y dependency adalah posisi PDF mentah yang dibulatkan; tinggi heuristik. ViewBox tidak harus berawal nol. Jangan mengubahnya menjadi top-left/screen coordinates hanya dengan membalik y; rotasi/teks miring tidak dapat dipulihkan dari empat angka tersebut. Metadata hilang atau non-finite menghasilkan geometry unavailable/partial yang eksplisit, bukan angka nol rekaan.

`observedAt` berarti saat bytes snapshot selesai diterima/dibaca, bukan tanggal penerbitan, revisi terakhir, atau semantic confidence. CreationDate/ModDate PDF bila ditampilkan tetap metadata yang dinyatakan dokumen, terpisah dan unverified. Digest mengikat bytes; ia tidak membuktikan kebenaran isi atau kualitas ekstraksi.

### Batas dan pemilihan

Angka cap/selector berikut adalah keputusan desain baru untuk Batch 6, bukan klaim tentang kemampuan yang sudah ada saat perencanaan.

- Maksimal 32.768 byte UTF-8 untuk objek `pdfEvidence` yang diserialisasi, maksimal 8 halaman, maksimal 32 item per halaman, cuplikan teks maksimal 160 karakter tanpa memecah surrogate pair. Header/count/truncation wajib ikut dalam budget.
- Urutan deterministik: nomor halaman fisik naik, lalu index TextItem sebelum transform. Salin nilai scalar yang diperlukan sebelum transform; jangan menyimpan reference mutable ke page.items, seluruh buffer PDF, atau seluruh graph parser.
- Alokasikan metadata kecil dahulu, tambah item selama masih muat. Bila tidak muat, keluarkan partial dan hitungan omission yang benar. `nextPage` hanya menjanjikan halaman berikutnya, bukan kelanjutan item yang dipotong di halaman sekarang. Omission item di halaman tetap dilaporkan; tidak menambahkan cursor store.
- `read_file` memakai offset/length existing sebagai pemilihan halaman pada jalur PDF; lengkapi forwarding yang sekarang terlewat di proyeksi. Geometri hanya untuk maksimal delapan halaman pertama dari rentang itu. Default text/images existing tidak dipangkas diam-diam demi metadata baru.
- `web_open` memperoleh parameter opsional `pdfPages:{start:number,count:number}`: integer start >=1, count 1–8. Berlaku hanya untuk reader native dan PDF. Bila ada selector, teks serta evidence memakai halaman terpilih; explicit selector untuk external/non-PDF ditolak dengan kode aman. Tanpa selector, kontrak teks lama tetap berlaku dan evidence mengambil maksimum delapan halaman pertama, dengan cakupan dokumen yang parsial bila memang parsial.
- Pisahkan `all pages` yang diminta secara eksplisit di internal parser dari `selection=[]` karena range kosong/tidak valid. Rentang kosong tidak boleh jatuh kembali ke seluruh file. Perbaiki pemetaan urutan pageNumber bersama selection pada seam yang sama.
- Batas teks `web_open` existing 80.000 karakter tetap berlaku; metadata mempunyai cap byte tersendiri. Setelah redaksi/truncation adapter akhir, angka coverage menjelaskan evidence yang benar-benar dikirim. Posisi tidak diklaim sebagai offset karakter dalam Markdown akhir.
- Batas metadata/selection bukan janji CPU/time bound parser. Dependency 0.2.9 masih membaca dokumen sebelum memilih halaman. Pertahankan admission byte/timeout existing, tandai batas ini di dokumentasi, dan jangan menyelundupkan parser streaming atau worker baru.

### Semantik hasil

Text-layer kosong tidak membuktikan halaman blank atau tidak relevan; OCR yang tidak dicoba tidak boleh disebut gagal. Parse failure dan engine unavailable tetap kegagalan yang terpisah dari keberhasilan kosong. Metadata-only hasil scan boleh menjelaskan text empty dan OCR unsupported, tanpa mengklaim isi telah dibaca. Bila jalur `web_open` lama tetap memakai kode `PUBLIC_URL_NO_TEXT`, sertakan hanya diagnosis aman yang disepakati dan jangan mengubahnya menjadi sukses tekstual palsu.

Tidak ada angka confidence semantik, ranking bukti baru, automatic retry, atau promotion Memory. Semua text/excerpts tetap untrusted dan melalui redaksi output existing. Metadata tidak memuat raw signed URL/query/fragment/userinfo, HTTP headers, credential, local temporary path, atau exception mentah. Public locator tetap sanitasi native origin+pathname.

## Tujuh fase pelaksanaan

### Fase 1 — Rekonsiliasi seam dan tetapkan kontrak

File: wrapper PDF, types/service/office-converters/public-url, filesystem/base/PdfFileHandler/handler, web-research service/schema/tools yang disebut di atas.

- [x] Ambil perubahan relevan yang telah dipublikasikan ke https://github.com/Black-Project-Agent-Core/Agent-Core lewat pembacaan/fetch resmi. Bandingkan dengan source lokal aktual dan integrasikan bagian yang belum ada ke file owner asli; jangan menimpa dirty work, membuat checkout produk kedua, atau melakukan merge/reset otomatis.
- [x] Cocokkan file terpilih pada checkout aktif dengan baseline dan overlay Batch 3/4. Rekam identitas source yang akan dibangun; pertahankan pekerjaan terpasang dan perubahan pengguna.
- [x] Tetapkan `PdfEvidence` satu kali, cap/selection/semantik di atas, dan catat keadaan plugin/client saat mulai. Jangan mengubah owner Memory atau dependency.

Hasil: kontrak kecil yang dapat diikuti seluruh caller, tanpa pekerjaan ulang Batch 3/4.

### Fase 2 — Pertahankan evidence sebelum flattening

File utama: `src/rdc/tools/pdf/lib/pdf2md.ts`; `src/rdc/tools/pdf/utils.ts` bila diperlukan untuk selection; `src/rdc/tools/pdf/markdown.ts` hanya untuk forwarding opsi bytes/parser existing.

- [x] Tambahkan opsi internal evidence selection dan ekstraksi images pada `pdf2md` secara backward-compatible. Bangun `PdfEvidence` dari snapshot input dan salinan scalar TextItem sebelum `transform` mengubah pages.
- [x] Ambil viewBox/rotation/unit yang tersedia dari pdfDocument yang sama; jangan parse ulang file/path untuk identitas geometri. Nilai yang tidak dapat dipastikan tetap unknown/unavailable.
- [x] Lindungi seluruh transform, pengambilan metadata, dan penggunaan dokumen dengan cleanup/finally sejak dokumen berhasil diperoleh. Jalur text-only proyeksi tidak perlu mengekstrak gambar yang tidak dikirim; default pembacaan PDF native yang mengirim gambar tetap dipertahankan.
- [x] Terapkan byte budget, deterministic selection, empty-range yang tidak memperluas cakupan, dan identity page/item yang stabil dalam snapshot tersebut.

Hasil: return parser mengandung metadata berguna yang sudah berbatas, bukan dump seluruh item.

### Fase 3 — Satu snapshot pada seluruh jalur PDF yang disentuh

File: `src/rdc/document-projection/{types,service,office-converters,public-url}.ts`, `src/rdc/tools/filesystem.ts`, `src/rdc/utils/files/pdf.ts`, `src/rdc/utils/files/base.ts`.

- [x] Ubah `pdfProjectionConverter` agar memakai `input.bytes` melalui byte parser existing. Hapus keharusan localPath pada converter; sourceName/path hanya locator, bukan perintah membuka ulang. Jangan memperluas autoTopLevel untuk format lain.
- [x] Jalur publik markdown memilih service byte projection dan native PDF memilih byte parser, sekali per cabang. Keduanya mempertahankan snapshot admitted yang sama untuk digest/text/geometry. Jangan parse dahulu lalu memanggil service yang parse lagi.
- [x] Jalur lokal/native membaca bytes satu kali melalui bounded regular-file reader existing sebelum parse. Jalur URL legacy PDF yang sudah mempunyai response memakai bytes response itu, bukan fetch kedua melalui URL. Admission/grant/network policy masing-masing tetap berlaku.
- [x] Forward pdfEvidence melalui ProjectionResult → projectionToFileResult → FileMetadata dan rentang halaman melalui caller existing. Satu snapshot berarti satu input bytes, bukan klaim bahwa library image extraction tidak pernah membuka parser internal kedua.

Hasil: evidence selalu mengacu pada bytes yang benar-benar menghasilkan teks, termasuk jalur lokal yang semula reopen-path.

### Fase 4 — Sampai ke AI eksternal dan kontrak client

File: `src/web-research/service.ts`, `src/mcp/web-research-{schemas,tools}.ts`, `src/rdc/handlers/filesystem-handlers.ts`, `src/rdc/tools/schemas.ts` hanya bila descriptor read_file perlu penjelasan.

- [x] Tambahkan pdfPages native-only ke schema web_open dan forward ke owner PDF. Pakai kode error allowlisted untuk invalid/unsupported selection; error tidak mencetak URL mentah.
- [x] `WebOpenResponse.pdfEvidence` tetap muncul dalam JSON textResult yang sudah dipakai MCP. Terapkan redaksi/cap metadata pada batas keluaran yang sebenarnya; jangan hanya menyimpannya di service.
- [x] Untuk `read_file` model-facing, append satu text block metadata PDF berbatas, baik native pages maupun markdown projection. Metadata UI boleh additive, tetapi jangan menggantungkan consumer eksternal pada structuredContent khusus `origin:"ui"`.
- [x] Pertahankan text/image blocks existing, annotations read-only, tracker invocation, owner task/session, dan finalisasi hasil yang sudah ada. Jangan membuat observer/store baru atau menyatakan sumber menjadi trusted.

Hasil: controller yang memakai dua tool existing menerima evidence, tanpa tool baru atau native agent baru.

### Fase 5 — Build, schema aktual, dan ZIP Upload new version

- [x] Setelah source batch ini final, gunakan build produksi resmi dari source akhir. Batch 6 tidak mensyaratkan implementasi ulang Batch 5. Bila Batch 5 dan 6 berada pada aktivasi yang sama, hasilkan satu build/manifest/ZIP gabungan; bila terpisah, Batch 6 memakai versi aktual setelah Batch 5.
- [x] Regenerasi schema melalui registration/Zod resmi dan jalur `release:compat --manifest-only` existing. Jangan mengedit JSON snapshot manual. Bedakan cohort aktual: 78 tools/128476 bytes milik schema client yang terakhir diberikan pengguna tidak sama dengan snapshot 75 tools/122340 bytes. Batas reviewed 131072 byte menyisakan 2596 byte pada cohort 78-tool tersebut sebelum perubahan Batch 5/6. Ukur cohort final yang sama, jaga selector/descriptor ringkas, dan jangan mencampur baseline atau menghilangkan tool agar muat.
- [x] Karena parameter/descriptor berubah, buat ZIP custom plugin yang benar, naikkan package version dari versi aktual terbaru, dan siapkan instruksi pengguna “Upload new version” lalu refresh tool. Jangan menetapkan 1.0.2 bila Batch 5 sudah memakainya.
- [x] Pertahankan `.app.json` binding `asdk_app_6acd4cde8b008191bf289261ed843a17`, key/name `dev-6acd4cde8b008191bf289261ed843a17`, metadata presentasi, serta `.codex-plugin/plugin.json` dan apps binding existing. ZIP sukses terdahulu berversi 1.0.1 merupakan contoh kemasan, bukan versi tujuan permanen.
- [x] Pisahkan versi runtime, schema contract, dan plugin wrapper. JSON schema terpisah bukan ZIP upload; ZIP wrapper bukan runtime installer. Jangan menghapus plugin, mendaftar ulang app/tunnel, atau mengganti authentication/grant.

Hasil: build akhir dan artifact client yang benar siap digunakan. Ini belum berarti fitur telah aktif pada client pengguna.

### Fase 6 — Aktivasi satu kali dan penggunaan nyata

- [x] Gunakan launcher/restart existing hanya sesuai otorisasi yang berlaku. Gabungkan kebutuhan aktivasi ke satu permintaan yang jelas, bukan meminta izin pada setiap fase. Jalur source kerja dapat selesai sebelum tindakan manusia untuk upload/aktivasi.
- [x] Setelah plugin Upload new version/refresh dan runtime yang sesuai aktif, gunakan satu PDF nyata yang relevan dan sudah dapat diakses melalui tool eksternal. Jangan membuat fixture sintetis atau mengejar seluruh PDF sebagai syarat selesai.
- [x] Catat output nyata: source digest konsisten, nomor halaman, metadata approximate, capabilities, dan omission/partial yang benar-benar diterima oleh controller. Jika local read_file dan web_open adalah dua jalur yang diklaim aktif, keduanya harus mempunyai bukti penggunaan nyata masing-masing; jangan mengklaim satu caller membuktikan caller lainnya.
- [x] Tidak perlu semua halaman/item terkirim: bounded partial adalah hasil yang sah. Jika client masih memakai descriptor lama atau salah satu jalur belum dipakai, laporkan batas itu dan jangan menyebut integrasi jalur tersebut selesai.

Hasil: kemampuan baru aktif pada consumer yang dituju, bukan hanya kompilasi, metadata internal, atau checklist tertutup.

### Fase 7 — Dokumentasi, Memory, dan cleanup bersyarat

- [x] Sinkronkan rencana/status, CODEBASE.md, MEMORY.md/proyeksi dokumentasi yang berlaku, dan record canonical Memory melalui owner existing. Bedakan selesai source, aktivasi runtime, client upload, penggunaan nyata, serta batas cakupan. Jangan membuat store atau root Memory baru.
- [x] Finalisasi Learning hanya untuk pekerjaan bermakna pada task/key yang benar; simpan evidence ringkas yang telah disanitasi. Tidak ada klaim semantic verification, auto-promotion, atau checkpoint unrelated yang dibuka ulang.
- [x] Setelah integrasi terpasang/aktif dan tidak ada file yang masih dipakai, kosongkan seluruh isi `E:\Projects\Agent-Core\temp` dan `E:\Projects\Agent-Core\runtime\tmp`, bukan hanya file buatan batch. Sebelum itu, pindahkan hasil kerja/data unik yang perlu dipertahankan ke lokasi final/backup resmi di luar dua folder tersebut dan perbarui referensi aktifnya. Tidak ada pengecualian yang membiarkan isi tetap tinggal di runtime/tmp.
- [x] Gunakan penghapusan recoverable dalam dua scope tepat tersebut. Jangan mengikuti symlink/reparse keluar scope, melakukan permanent purge, atau menghapus runtime/memory, backup resmi dan artifact final di luar scope. Catat kedua direktori kosong atau tidak ada setelah pengguna filenya selesai; jika sudah kosong, tidak perlu membuat cleanup berulang.
- [x] Bila file masih dipakai atau integrasi belum terpasang, selesaikan kebutuhan tersebut dahulu dan lanjutkan pembersihan setelah aman. Jelaskan kebutuhan intervensi manusia hanya bila benar-benar diperlukan, tanpa menganggap seluruh pekerjaan harus berhenti.

Hasil: dokumentasi dan kontinuitas sesuai kemampuan aktif; workspace bersih tanpa kehilangan pemulihan.

## Syarat restart pengguna: dependency aktivasi, bukan fitur batch baru

Instruksi pengguna: “1. Perubahan rebuild yang harus di bawa setelah Agent Core.exe di re-start, 2. Perubahan system yang tidak membutuhkan re-upload costum plugin dari platform web ChatGPT, jika kedua kriteria memenuhi syarat, capability restart boleh/auto-approve tanpa meminta izin ulang.”

Script yang disebut pengguna adalah `E:\Projects\Agent-Core\Restart-Agent-Core.cmd`, sudah dibuat dan dicoba pengguna. Aturan gate otomatis belum dinyatakan terimplementasi. Batch 6 di atas mengubah client selector/descriptor dan membutuhkan Upload new version, sehingga kondisi kedua tidak terpenuhi: aturan ini sendiri tidak memberi auto-approval restart untuk aktivasi Batch 6. Minta persetujuan aktivasi yang diperlukan satu kali atau ikuti tindakan pengguna, tanpa mengubah script, memasang Scheduled Task/service, memicu UAC baru, atau memperluas privilege/security. Bila ada langkah aktivasi terpisah yang benar-benar memenuhi kedua kondisi, evaluasi faktanya saat itu; jangan menganggap seluruh batch otomatis memenuhi syarat.

## Definisi selesai

Batch 6 selesai ketika parser existing mempertahankan metadata berbatas dari snapshot yang sama, semua sambungan source yang disebut sudah terpasang, schema/ZIP versi baru sesuai app existing, dan jalur eksternal yang diklaim aktif benar-benar mengembalikan pdfEvidence pada penggunaan nyata. Partial, unsupported OCR, geometry unavailable, dan omission yang jujur tetap dapat menjadi hasil yang benar. Keberhasilan ini tidak berarti seluruh PDF bisa dibaca, geometri akurat secara visual, extraction accuracy meningkat terukur, atau isi dokumen telah diverifikasi semantik.
