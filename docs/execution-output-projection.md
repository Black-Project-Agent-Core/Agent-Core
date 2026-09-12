# Kontrak Output Projection

Status: parser `2.0.0`, projection schema `1`, build berhasil dan [runtime pasca-restart sehat](../reports/output-projection/runtime-after.json). [Hasil terakhir per file mencakup 121 kasus lulus dalam 13 file](../reports/output-projection/test-verification.json), termasuk regresi dan rerun terarah; bukan satu invocation gabungan. Acceptance ChatGPT Web masih pending. Entri kanonis: [CAP-013](AGENT-CORE-CAPABILITIES.md#cap-013--raw-logs-dan-ringkasan-output-terstruktur).

Agent-Core membuat view terstruktur setelah managed attempt menghasilkan raw logs dan result marker. Proyeksi menambah informasi pada status execution existing; tidak mengubah command, scheduler, resource claims, exit code, atau bukti completion. Tidak ada tool/inferensi/dependency/tracker donor baru.

```text
stdout/stderr asli + terminal marker
  -> verifikasi SHA-256 dan ukuran seluruh raw stream
  -> window analisis per stream: paling banyak 128 KiB, full atau head/tail
  -> format, quality, diagnostics, repeated lines, presentation
  -> persist dengan run/node/attempt/hash/version binding
  -> execution_status untuk view; execution_logs untuk raw detail
```

## Integritas dan cakupan

[Log store](../src/execution/log-store.ts) memverifikasi seluruh byte terhadap marker dan menolak perubahan ukuran/hash selama pembacaan. Parsing hanya memakai window yang dipertahankan. Untuk output besar, head dan tail berbagi budget 128 KiB per stream; potongan baris pada batas window dibuang, sehingga examinedBytes dapat lebih kecil daripada budget. Encoding analisis harus UTF-8 valid; gagal baca/integritas/encoding menghasilkan degraded dengan kode failure, bukan hasil kosong yang dianggap lengkap.

`coverage.state` adalah `complete` atau `partial`, dengan `integrity=verified`. Setiap stream mempunyai `strategy`, `totalBytes`, `examinedBytes`, `omittedBytes`, dan rentang `[start,end)` dalam offset byte raw. Verifikasi hash penuh hanya membuktikan identitas raw bytes, bukan bahwa seluruh log telah diparse. Error di tengah rentang yang tidak dianalisis bisa tidak muncul dalam summary.

## Bentuk hasil

[Parser](../src/execution/output-parser.ts) mengikat node/attempt, exit code, raw hashes/bytes, parser version, run identity dan plan identity bila tersedia. `rawAccess` menunjuk tool `execution_logs`, run/node/attempt yang sama dan kebutuhan route context. [Store](../src/execution/store.ts) menolak metadata turunan yang tidak sesuai binding/coverage; salah identitas tidak diterima sebagai bukti attempt lain.

[Projection](../src/execution/output-projection.ts) mengenali bentuk Vitest/Jest, JSON test report terstruktur, TAP summary, TypeScript diagnostics dan repeated lines. Format campuran/tidak dikenal dinyatakan eksplisit. JSON tidak lengkap atau counts bertentangan tidak diterima sebagai test evidence. `quality=full/degraded/unknown` menjelaskan keterbacaan format/cakupan; `full` bukan sertifikasi semantik universal atau jaminan seluruh contoh/rentang ditampilkan. Omission counters dan limitations tetap harus dibaca.

Diagnostics dikelompokkan menurut file/severity/kode dengan lokasi dan contoh terbatas; warning dan error mempunyai jumlah dan identitas kelompok berbeda. Repeated lines dikelompokkan berdasarkan baris persis dalam stream yang sama. UUID, path, angka dan nilai pesan tidak dinormalisasi agar kejadian berbeda tidak melebur. Counts adalah jumlah pengamatan pada rentang yang dianalisis; kelompok dapat mempunyai `omittedRanges`, `omittedSamples`, atau indikator sample truncation. Original detail tetap dapat dibaca menggunakan rentang raw.

Presentation memilih summary hanya jika format cocok dan ukuran summary lebih kecil daripada raw excerpt yang tersedia. Batasnya paling banyak 8192 byte dan tidak melebihi ukuran window yang dianalisis; `measurement=utf8_bytes`. Jika summary tidak layak, view memakai bounded raw excerpt. Excerpt tersebut tetap tampilan turunan yang disamarkan/dibatasi; raw byte asli dibuka melalui `execution_logs`. Batas 8192 berlaku pada teks presentation, bukan seluruh metadata respons. Angka tersebut bukan token model atau pengukuran penghematan context. Sampel turunan melalui `safeDerivedText`; seluruh raw log tidak diklaim telah diredaksi.

Exit code/result marker tetap authority proses. Diagnostic sintetis pada proses exit 0 tidak mengubahnya menjadi failed; sebaliknya printed test summary tidak mengubah exit nonzero menjadi succeeded. Correctness, current-source/current-attempt evidence, artifact verification dan durable closure memakai gate existing.

## Recovery dan histori

Pengumpulan mengikuti completion attempt. [Execution service](../src/execution/service.ts) juga dapat merekonstruksi paling banyak dua proyeksi terminal yang belum tersedia pada satu pemanggilan status; sisanya menunjukkan `recovery=pending`. Pengumpulan yang sama memakai binding hash/parser/attempt dan berbagi operasi yang sedang berjalan. Kegagalan observasi yang sama dicoba sekali selama process lifetime; restart memungkinkan recovery berikutnya. Status tidak menjalankan command ulang dan tidak menelusuri ulang seluruh histori.

Record lama yang valid tetap terbaca. Bila belum memiliki coverage, view menunjukkan `coverageStatus=legacy_unknown`; pembacaan tidak menambahkan klaim bahwa parser lama telah memeriksa seluruh log. Proyeksi valid tidak dihapus oleh failure observer berikutnya. Repair record turunan yang rusak menambahkan observasi tervalidasi dan mempertahankan histori; urutan append mengendalikan repair pada versi parser yang sama. Ini berbeda dari `execution_retry`, yang memang operasi eksplisit untuk menjalankan attempt baru dengan histori tersendiri.

## Pemeriksaan yang belum selesai

[Handoff Web](../reports/output-projection/chatgpt-web-verification.txt) masih pending setelah pemeriksaan lokal dan deployment. Fixture baru menuntut late diagnostic, counts/ranges yang jujur, pemisahan node/attempt, captured hashes, raw offset readback, serta durable closure. Schema input 72 tool tetap sama pada pemeriksaan sekitar restart; perubahan ini menambah metadata output execution. Fixture lokal yang lulus tidak menjadi bukti bahwa alur Web tersebut sudah dijalankan atau seluruh repository/release telah stable.
