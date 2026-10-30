# Perkuatan recall kompaksi konteks Native
Tanggal: 2026-10-30
Revisi: 1
Status: APPROVED (revisi 1, scope P1+P2 build; belum diimplementasikan)
Jenis: Improvement
Asal dan bukti: `src/agent-context-compaction.ts` (batas per baris, `TURN_BUDGET_CHARS`, `compactTurnMessages`), `src/agent-chat-store.ts:327` dan `:674` (`chat_compaction_sources`, `getCompactionSource`), pesan pengguna 2026-10-30 (menyetujui alat pencarian riwayat chat).

## Masalah dan tujuan

Kompaksi dalam-giliran Native menggantikan bagian tengah sebuah giliran dengan ringkasan ekstraktif tanpa panggilan model. Ringkasan itu dapat kehilangan nuansa. Tujuan: nuansa yang hilang dapat dipulihkan saat dibutuhkan, tanpa panggilan model tambahan pada kompaksi dan tanpa memperbesar konteks secara permanen.

## Bukti dan ketidakpastian

Diperiksa langsung pada kode:

- Setiap baris dipotong tetap: catatan pengguna 400 karakter, teks asisten 300, argumen panggilan 160, hasil tool 240 (`messageLines`). Pemotongan ini berlaku walaupun total ringkasan masih jauh di bawah anggaran 12.000 karakter (`TURN_BUDGET_CHARS`).
- Bila anggaran terlampaui, hanya 3 baris pertama dan baris terbaru yang dipertahankan; sisanya menjadi "[... N earlier lines omitted ...]" (`fitLines`).
- Judul ringkasan sudah menyatakan bahwa ringkasan "can omit or distort facts" dan bahwa sumber persisnya diarsipkan.
- Arsip itu ada: tabel `chat_compaction_sources` menyimpan pesan asli beserta digest sha256, dan `getCompactionSource` memverifikasi digest saat membaca. Pencarian kode tidak menemukan pemanggil `getCompactionSource`, jadi model tidak punya jalan untuk membacanya.

Belum diukur: seberapa sering nuansa yang hilang benar-benar mengubah hasil. "Nuansa hilang" adalah kesimpulan struktural dari batas pada kode, bukan hasil pengukuran. Tidak ada benchmark yang diusulkan.

## Mekanisme dan owner existing yang dipakai

P1 — Pemulihan sumber (disarankan). Tambahkan aksi `compaction_source` pada alat baca-saja riwayat chat yang sudah disetujui pengguna. Masukan: id `cmp-…` dari judul ringkasan, dengan offset dan batas. Keluaran: potongan terbatas dari pesan asli, masked, setelah digest diverifikasi oleh `getCompactionSource`. Judul ringkasan diubah agar menyebut alat itu. Owner: `agent-chat-store.ts` (pembaca), alat riwayat chat (permukaan), `agent-context-compaction.ts` (judul).

P2 — Ekstraksi lebih setia (disarankan, deterministik). (a) Batas per baris naik secara adaptif selama total ringkasan masih di bawah anggaran, alih-alih selalu 300/240/160. (b) Catatan pengguna dalam giliran dan hasil tool berstatus ERROR diprioritaskan saat baris harus dibuang. Owner: `agent-context-compaction.ts`.

P3 — Ringkasan tulisan model (ditunda, tidak diusulkan untuk dibangun sekarang). Di belakang rekaman yang sama, dengan fallback ke ekstraktif, hanya bila P1 dan P2 terbukti kurang. Sinyal yang dapat dibaca tanpa benchmark: jumlah pemanggilan `compaction_source` per kompaksi pada langkah tool yang sudah direkam.

## Scope, batas Native, risiko dan otorisasi

- Hanya baca. Tidak ada penyimpanan baru, tidak ada jsonl, tidak ada grant baru. Alat tunduk pada izin giliran, dibatasi pada percakapan dan workspace yang sama, dan keluarannya dibatasi ukuran dan di-mask.
- Risiko P1: schema alat menambah token pada setiap permintaan; sumber yang dipulihkan menambah konteks saat dibaca. Mitigasi: batas ukuran per panggilan dan pembacaan berhalaman.
- Risiko P2: ringkasan sedikit lebih besar; tetap dibatasi anggaran total.
- Kompaksi tetap dapat dimatikan dengan `AGENT_CORE_AI_COMPACTION=off`.

## Manfaat yang diharapkan dan keterbatasan

Manfaat adalah harapan, belum terukur. P1 mengubah ringkasan yang lossy menjadi lossy-plus-dapat-dipulihkan tanpa biaya model. P2 mengurangi kehilangan yang tidak perlu. Keterbatasan: model harus memutuskan sendiri kapan memulihkan; bila ia tidak memanggil alat, ringkasan tetap lossy.

## Acceptance, evaluasi dan rollback

- Uji unit: batas adaptif naik hanya selama anggaran cukup dan tidak pernah melampaui anggaran total; prioritas ERROR dan catatan pengguna bertahan saat baris dibuang; `compaction_source` mengembalikan isi yang digest-nya cocok, menolak id dari percakapan lain, dan memotong keluaran pada batas.
- Verifikasi hidup: satu giliran panjang dengan `/compact`, lalu memanggil `compaction_source` dan memeriksa potongan yang kembali.
- Rollback: kembalikan konstanta batas, hapus aksi `compaction_source`; tidak ada migrasi data.

## Riwayat revisi

- Revisi 1 (2026-10-30): dokumen pertama.

## Keputusan pengguna dan scope

Sudah diputuskan di chat (2026-10-30): pengguna menyetujui penambahan alat pencarian riwayat chat baca-saja. Itu paket terpisah dan tidak bergantung pada dokumen ini.

APPROVE revisi 1, scope P1 + P2 (build), diberikan pengguna di chat pada 2026-10-30 dengan pesan "Setujui P1+P2" sebagai jawaban atas pertanyaan keputusan proposal ini. P3 tidak disetujui dan tidak diminta. Persetujuan ini tidak mencakup revisi berikutnya atau scope tambahan. Status APPROVED belum berarti selesai: implementasi, validasi, dan arsip ke `docs/history-agent-core` menyusul setelah acceptance terpenuhi.
