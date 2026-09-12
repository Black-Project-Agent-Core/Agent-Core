# Penilaian Integrasi Kemampuan RTK

Tanggal pemeriksaan: **10 September 2026**.

Status: **mekanisme output terpilih sudah diimplementasikan, dibangun dan dimuat ke runtime Agent-Core; acceptance Web masih pending**. Parser `2.0.0` memakai runtime, log store, dan penyimpanan existing; paket/runner/tracker donor tidak dipasang. [Hasil terakhir per file: 121 kasus lokal lulus](../../reports/output-projection/test-verification.json), mencakup regresi serta rerun terarah setelah perbaikan. [Runtime pasca-restart sehat](../../reports/output-projection/runtime-after.json), 72 schema tool tetap sama. Tidak ada benchmark. Kontrak saat ini dijelaskan di [output projection](../execution-output-projection.md) dan [CAP-013](../AGENT-CORE-CAPABILITIES.md#cap-013--raw-logs-dan-ringkasan-output-terstruktur).

## Identitas dan batas pemeriksaan

Checkout donor adalah `referensi/rtk`. [Cargo.toml](../../referensi/rtk/Cargo.toml), baris 1–7, menyatakan versi **0.42.4** dan Rust minimum **1.91**. Ref lokal `develop` menunjuk commit `5e10aa6462f7ffbba1a779055d213f1631711def`. Identitas tersebut berasal dari file lokal; bukan klaim tentang versi upstream terbaru atau bahwa seluruh working tree donor identik dengan commit tersebut.

Manifest yang sama mencatat lisensi `Apache-2.0` dan [upstream RTK](https://github.com/rtk-ai/rtk). Jika source dipilih untuk transplant berikutnya, catat file/ref yang benar-benar diambil beserta bukti lisensi/atribusi melalui kontrak craft existing.

Audit awal membaca jalur dispatch, capture/streaming, filter diagnostics/test/search/log, raw recovery, tracking, dan penanganan Windows. Saat audit awal, pencarian pada source/build/manifest produk belum menemukan integrasi RTK. Temuan historis tersebut kini dilanjutkan oleh implementasi internal output projection; tidak berarti seluruh paket RTK menjadi dependency atau semua kemampuan donor diterapkan. Audit ini bukan pemeriksaan semua program yang terpasang di mesin.

## Kegunaan untuk AI pengendali

RTK memadatkan hasil command sebelum hasil itu dibaca AI. Contohnya, log berulang dapat disajikan sebagai contoh pesan beserta jumlah kejadian; compiler errors dikelompokkan menurut file dan kode; hasil test diringkas dengan informasi kegagalan yang relevan.

Manfaat yang masuk akal adalah mengurangi kebisingan dalam konteks percakapan, membantu AI menemukan diagnostics penting, dan mengurangi pembacaan ulang output yang sama. Pengaruhnya berada pada kualitas penyajian informasi kepada AI. RTK tidak membuktikan desain paling sederhana, meningkatkan kemampuan model secara langsung, menjamin correctness, atau mengatasi keterbatasan CPU/RAM mesin. Persentase penghematan token dan peningkatan kecepatan tidak diukur pada audit ini.

Kemampuan pemrosesan output yang diperiksa menggunakan parser dan aturan lokal. Tidak diperlukan model atau API key inferensi tambahan untuk mekanisme tersebut. Bahkan [source summarizer](../../referensi/rtk/src/cmds/system/local_llm.rs), baris 1–30 dan 131–178, menggunakan heuristik/regex; parameter model dan download pada entry point tersebut tidak digunakan. Nama modul tidak menjadi bukti adanya inferensi.

## Cara kerja donor yang teramati

```text
Command, atau rewrite hook opsional
  -> pemilihan handler program/subcommand
  -> eksekusi program native
  -> capture atau streaming stdout/stderr
  -> parser dan filter deterministik
  -> ringkasan, batas hasil, dan recovery hint bila tersedia
  -> exit code command diteruskan
  -> estimasi penggunaan dicatat oleh tracker donor
```

Implementasi penting:

| Bagian | Perilaku yang ditemukan | Bukti source |
|---|---|---|
| Capture dan streaming | Memiliki mode filter biasa, filter yang menerima exit code, streaming, dan passthrough; beberapa handler meneruskan stdin atau memakai output mentah ketika gagal. | [runner.rs](../../referensi/rtk/src/core/runner.rs), baris 36–159; [stream.rs](../../referensi/rtk/src/core/stream.rs), baris 241–261 |
| Diagnostics compiler | Mengelompokkan diagnostics berdasarkan file/kode dan menangani kegagalan yang tidak menghasilkan diagnostics yang dikenal. | [tsc_cmd.rs](../../referensi/rtk/src/cmds/js/tsc_cmd.rs), baris 113–162 dan 300–308 |
| Hasil test | Membedakan parse JSON penuh, hasil degraded, dan passthrough. | [vitest_cmd.rs](../../referensi/rtk/src/cmds/js/vitest_cmd.rs), baris 336–353 |
| Log berulang | Menghitung errors/warnings/info dan mengelompokkan baris setelah normalisasi. | [log_cmd.rs](../../referensi/rtk/src/cmds/system/log_cmd.rs), baris 71–119 dan 222–235 |
| Search | Bentuk output native tertentu tidak difilter; stderr dan exit code tidak disamakan dengan hasil pencarian kosong. | [search.rs](../../referensi/rtk/src/cmds/system/search.rs), baris 548–582 |
| Batas penyajian | Batas bersama yang diperiksa adalah errors 20, warnings 10, list 20, dan inventory 50. | [truncate.rs](../../referensi/rtk/src/core/truncate.rs), baris 4–11 |
| Guard ukuran | Memilih output mentah jika ringkasan lebih panjang menurut estimasi. Estimasi memakai pembulatan panjang byte UTF-8 dibagi empat. | [guard.rs](../../referensi/rtk/src/core/guard.rs), baris 6–11; [tracking.rs](../../referensi/rtk/src/core/tracking.rs), baris 1657–1659 |
| Raw recovery | Dapat menyimpan output mentah dan mengembalikan petunjuk lokasi, dengan aturan mode, ukuran, serta rotasi. | [tee.rs](../../referensi/rtk/src/core/tee.rs), baris 89–175 dan 322–350 |

Batas penyajian tersebut bukan sistem umum yang menyesuaikan diri terhadap sisa context window AI. Guard ukuran juga memakai estimasi, bukan tokenizer model tertentu. Karena itu istilah “budget adaptif AI” atau “token exact” tidak tepat untuk kemampuan yang dibuktikan di sini.

## Kemampuan Agent-Core yang sudah tumpang tindih

Agent-Core sudah memiliki tempat yang sesuai untuk perluasan ini. Membawa seluruh runner atau tracker donor akan menggandakan tanggung jawab yang tersedia.

| Kemampuan existing | Bukti | Implikasi integrasi |
|---|---|---|
| Capture stdout/stderr, byte budget, SHA-256, real exit code, dan result marker | [execution/runner.ts](../../src/execution/runner.ts) | Capture asli tetap authority; ringkasan dibuat setelahnya. |
| Pembacaan log berhalaman | [execution/log-store.ts](../../src/execution/log-store.ts) | `offset`, `nextOffset`, `totalBytes`, dan `eof` membuka detail tanpa menjalankan ulang command. |
| Parsing test/build/error | [execution/output-parser.ts](../../src/execution/output-parser.ts), [projection](../../src/execution/output-projection.ts) | Kini diperluas dengan format, quality, coverage dan sample limitations eksplisit. |
| Binding operasi ke run, node, attempt, plan, serta hash input/output | [runtime/services.ts](../../src/runtime/services.ts), [execution/store.ts](../../src/execution/store.ts) | Ringkasan tidak mengganti identitas bukti, result marker, atau completion gate. |

### Celah coverage awal dan perbaikan source saat ini

Parser sebelumnya membaca 128 KiB pertama per stream tanpa coverage eksplisit, sementara metadata memuat hash/byte count output penuh. Diagnostic di bagian akhir dapat tidak terlihat pada hasil turunan. Ini tidak berarti runner otomatis mengubah exit nonzero menjadi sukses; masalahnya berada pada cakupan informasi yang disajikan.

Implementasi saat ini membaca seluruh raw stream untuk memverifikasi SHA-256/ukuran terhadap terminal marker, tetapi mempertahankan paling banyak 128 KiB per stream untuk parsing: seluruh isi bila muat, atau head/tail dengan potongan baris dibuang. Coverage memuat `complete/partial`, strategy, byte ranges, examined/omitted bytes; quality format adalah `full/degraded/unknown`. Hash penuh tidak menjadi klaim semantic parsing penuh. Diagnostic yang berada di tengah rentang yang dihilangkan masih dapat terlewat; raw detail tetap tersedia.

Counts diagnostics/repeated lines berlaku pada rentang yang diperiksa. Exact dedup mempertahankan perbedaan stream, UUID, path, kode, serta nilai penting; metadata menyediakan contoh/rentang dan jumlah omission. Presentation memakai guard byte UTF-8 dan raw excerpt bila summary tidak cocok, tanpa klaim token savings. Record lama tanpa coverage tampil `legacy_unknown`, bukan diberi klaim lengkap secara retrospektif.

## Prioritas kemampuan yang layak diambil

P1/P2 di bawah sudah memiliki implementasi source pada CAP-013 dan pengujian lokal terkait; verifikasi deployment/Web tetap pending. P3 masih kandidat. Entri "tidak disarankan" tidak dibawa ke produk.

| Prioritas | Kandidat | Manfaat dan batas |
|---|---|---|
| P1 | Status parse `full/degraded/unknown` dan coverage eksplisit | AI dapat membedakan hasil lengkap, potongan, format tidak dikenal, dan kegagalan baca. Seluruh keadaan tersebut harus tampak tanpa flag verbose tambahan. |
| P1 | Parser diagnostics/test sesuai jenis command | Lebih mudah menemukan lokasi dan penyebab kegagalan; tetap terikat ke output asli dan attempt yang sama. |
| P1 | Ringkasan yang menunjuk detail asli | Pengendali membuka log yang sudah tersimpan melalui pagination; tidak menjalankan ulang pekerjaan untuk mendapatkan detail. |
| P2 | Dedup log dengan count, contoh, dan rentang | Mengurangi repetisi tanpa menghilangkan kemampuan menelusuri masing-masing kejadian. |
| P2 | Guard ukuran ringkasan | Gunakan ringkasan jika benar-benar membantu; jika tidak, gunakan view mentah yang dibatasi dan diberi penanda. Ukuran byte atau estimasi harus disebut sesuai metodenya. |
| P3 | View ringkas untuk search, diff, dan listing | Hanya tambahan penyajian; tidak menggantikan inventory lengkap, source receipt, atau pemeriksaan dampak. |
| Tidak disarankan | Runner, auto-rewrite hook, dan tracker donor sebagai subsistem baru | Akan menambah authority, jalur eksekusi, dan penyimpanan yang tumpang tindih. |

## Konflik yang harus dicegah

### Perubahan command atau eksekusi ulang tersembunyi

RTK tidak seluruhnya bekerja sebagai filter output murni. [Handler Git](../../referensi/rtk/src/cmds/git/git.rs), baris 79, 163, dan 289–295, menggunakan bentuk query atau panggilan tambahan. [Handler test](../../referensi/rtk/src/cmds/js/vitest_cmd.rs), baris 321–322, melewatkan beberapa flag. [Handler search](../../referensi/rtk/src/cmds/system/search.rs), baris 570–573, menjalankan jalur passthrough lagi ketika bentuk awal tidak dapat diparse.

Untuk Agent-Core, command, arguments, cwd, resource claims, dan identitas attempt yang disetujui harus tetap sama. Kegagalan parser harus membuka raw output yang sudah ada. Filter tidak boleh menjalankan command pengganti, mererun command, atau mengubah graph tanpa keputusan workflow yang sesuai.

### Source grounding dan nomor baris

[Filter source](../../referensi/rtk/src/core/filter.rs), baris 162–203 dan 251–288, dapat membuang comments atau body. [Read handler](../../referensi/rtk/src/cmds/system/read.rs), baris 67–72, menerapkan window lalu memberi nomor pada teks setelah filtering. Nomor tersebut tidak selalu identik dengan nomor source asli.

Ringkasan source tidak dapat menggantikan `craft_source` receipts, parser simbol, atau klaim semua caller dalam cakupan. Jika kelak tersedia sebagai preview, preview harus menandai transformasi dan tetap menunjuk rentang source asli yang dapat dibaca kembali.

### Identitas kejadian dan bukti mentah

[Normalisasi log donor](../../referensi/rtk/src/cmds/system/log_cmd.rs), baris 230–235, mengganti UUID, hex, angka, dan path. Pendekatan itu dapat menggabungkan kejadian yang sebenarnya berbeda. Jangan terapkan normalisasi tersebut pada task ID, attempt ID, plan hash, source hash, atau artifact hash. Pengelompokan boleh menjadi view, tetapi identitas dan pesan aslinya harus tetap tersedia.

[Raw tee donor](../../referensi/rtk/src/core/tee.rs) secara default menggunakan mode failures-only pada baris 325–329; isi file dapat dipotong pada baris 146–157 dan file lama dirotasi pada baris 66–87. Petunjuk raw recovery donor tidak otomatis berarti bukti lengkap atau durable. Agent-Core harus memakai log store dan aturan evidence miliknya sendiri.

### Penyimpanan dan komunikasi tambahan

[Manifest donor](../../referensi/rtk/Cargo.toml) menyertakan dependency database tracking lokal tersendiri secara bundled dan nonoptional. Dependency tersebut tidak sesuai dengan keputusan penyimpanan proyek. Ambil fungsi pemrosesan yang diperlukan tanpa membawa tracker atau database tambahan. Tracking jumlah keluaran command juga berbeda dari memori keputusan proyek.

Ada jalur telemetry opsional pada [telemetry.rs](../../referensi/rtk/src/core/telemetry.rs), baris 33–78. Kode tersebut berhenti bila endpoint tidak dikompilasi, consent tidak diberikan, atau pengiriman dinonaktifkan. Audit ini tidak mengklaim telemetry selalu berjalan. Jalur tersebut tidak diperlukan untuk kemampuan yang disarankan.

### Windows dan multi-command

Donor memiliki resolusi PATH/PATHEXT pada [utils.rs](../../referensi/rtk/src/core/utils.rs), baris 481–525, serta decoder console OEM/ANSI pada baris 720 dan 755–776. Itu tidak membuktikan seluruh hook atau command sudah mempunyai semantik PowerShell yang sama. [Lexer](../../referensi/rtk/src/discover/lexer.rs), baris 586–593, serta [pipeline rewrite](../../referensi/rtk/src/discover/registry.rs), baris 979–1057, harus dipahami sebagai implementasi grammar shell tertentu.

Pertahankan pengelolaan proses dan shell Agent-Core. Setiap node/attempt harus mempunyai state parser sendiri agar output dari dua command yang overlap tidak tertukar. Agregasi hasil dilakukan sesudah identitas dan hasil masing-masing node direkonsiliasi. Kemampuan output tidak boleh memaksa scheduler menjadi serial atau menyediakan executor kedua.

## Arsitektur integrasi source saat ini

```text
Plan dan resource claims yang disetujui
  -> execution engine existing
      -> node A / attempt A -> stdout/stderr asli -> hash dan result marker
      -> node B / attempt B -> stdout/stderr asli -> hash dan result marker
  -> rekonsiliasi masing-masing attempt
  -> validasi hash/ukuran seluruh raw stream
  -> parser/proyeksi output pada bounded head/tail per attempt
      -> ringkasan, quality, coverage, omission counts
      -> referensi raw log, hash, offset, dan parser version
  -> pengendali membaca ringkasan atau membuka detail asli
  -> correctness, engineering review, memory decision, sync, closure existing
```

Jalur authority tetap membaca exit code, source/current-attempt evidence, dan artifact asli. Proyeksi tidak mengubah result marker atau menggantikan bukti completion. Store memvalidasi binding run/attempt, raw hashes/bytes, coverage, dan rawAccess. Sample text tetap data turunan yang dibatasi; raw output tidak dianggap seluruhnya telah diredaksi.

Pengumpulan proyeksi mengikuti completion attempt existing secara otomatis. `execution_status` dapat memulihkan paling banyak dua proyeksi terminal yang belum tersedia per panggilan; sisanya menunjukkan pending. Kegagalan observasi yang sama tidak diulang terus selama proses hidup; restart memberi kesempatan recovery, tanpa rerun command. Record historis valid tidak ditulis ulang sebagai bukti baru. `execution_logs` tetap memakai pagination raw dan scope existing. Tidak ada tool, executor, inferensi, database atau tracking donor baru.

## Acceptance dan pekerjaan yang masih pending

Gunakan fixture output terisolasi dan command yang sudah disetujui; jangan mengejar target kecepatan atau menjalankan benchmark.

1. Error, warning, test gagal, skipped, exit nonzero, dan format tidak dikenal tetap terlihat; parse failure tidak menjadi hasil kosong yang dianggap sehat.
2. Output lebih besar dari 128 KiB dengan failure di bagian akhir menghasilkan coverage yang jujur dan akses ke failure tersebut. Pembacaan terpotong atau gagal ditandai eksplisit.
3. Ringkasan selalu mengacu ke run/node/attempt, stream, hash raw, dan versi parser yang benar; membaca detail tidak membuat execution baru.
4. Dua writer independen yang sudah didukung execution engine tidak mengalami perubahan command, resource claims, urutan dependensi, atau pencampuran output akibat parser.
5. Kegagalan filter menghasilkan view raw yang tersedia, bukan retry command; output JSON atau bentuk machine-readable tidak diubah sembarangan.
6. Dedup mempertahankan counts dan akses kejadian asli; perbedaan identitas, path, kode error, dan nilai yang penting tetap dapat dibuktikan.
7. Pemulihan proyeksi yang hilang/gagal memakai raw evidence tersimpan tanpa mengulang pekerjaan sukses; record historis tanpa coverage tetap ditandai legacy_unknown.
8. Source receipts, caller coverage, engineering review, memory preflight, artifact checks, serta durable closure tetap memakai kontrak existing dan lulus regresi terkait.
9. Tidak ada dependency inferensi, database tracking, telemetry donor, executor, atau auto-rewrite hook baru.

Hasil lokal dan deployment dicatat pada [laporan implementasi](../../reports/output-projection/verification.md). [Satu alur Web pada fixture baru](../../reports/output-projection/chatgpt-web-verification.txt) masih diperlukan: dua emitter independen dengan diagnostic sintetis di luar 128 KiB dan exit 0, kemudian verification dependent. Controller wajib membandingkan captured hashes, ranges, dan raw reads. Tidak ada intentional failure/retry atau klaim overlap pada jalur Web tersebut. Durable checkpoint/readback melalui koneksi itu tetap diperlukan sebelum menyatakan acceptance selesai.
