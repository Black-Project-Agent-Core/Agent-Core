# Penyelesaian review Learning yatim dan sinyal reviewDue yang bermakna
Tanggal: 2026-10-25
Revisi: 1
Status: COMPLETED — 2026-10-25 (diarsipkan 2026-10-25)
Jenis: Improvement
Path asal: `docs/proposals/Penyelesaian-Review-Learning-Yatim.md`
Path arsip: `docs/history-agent-core/Penyelesaian-Review-Learning-Yatim.md`
Asal dan bukti: `src/learning/service.ts`, `src/learning/triggers.ts`, `src/mcp/learning-tools.ts`, `src/learning/external-controller.ts`, `runtime/learning/external-controller.json`, serta pembersihan 31 review tertunda pada 2026-10-25

## Keputusan pengguna dan scope (catatan penyelesaian)
Pengguna memerintahkan pengerjaan berurutan pada 2026-10-25: "kerjakan sesuai urutan, tidak perlu di revisi, nanti juga kena skip kalau memang sama, dan misalkan ada yang berbeda, tinggal kerjakan yang berbeda agar tidak terduplikasi". Ini perintah implementasi eksplisit, bukan pesan APPROVE berformat per revisi; dicatat apa adanya. Scope yang dikerjakan: seluruh tiga langkah di bagian "Mekanisme", digabung dengan R6-A/B/C dari Evidence-Gated-Harness-Self-Improvement-Lab (tampilan backlog kompak dan scaffold prosedur). Bagian yang sudah tercakup sebelumnya dilewati, bukan diulang. Tidak ada REVISE/HOLD terbuka untuk dokumen ini.

## Hasil penyelesaian (2026-10-25)
Implementasi ada di `src/learning/status-view.ts` (baru), `src/learning/procedure-scaffold.ts` (baru), `src/learning/{types,triggers,state,service,external-controller}.ts`, `src/mcp/learning-{schemas,tools}.ts`. Entri rinci: `docs/CODEBASE.md`, "Learning backlog visibility, stale-orphan closure and procedure scaffold". Release intent: `.changeset/20261025-learning-backlog-visibility.md` (minor).

| Langkah proposal | Hasil |
|---|---|
| 1. Simpan `summary` pada entri tertunda dan tampilkan | Selesai. Batas diperlebar dari 300 ke 500 karakter (batas skema `summary` yang sudah ada); dipindai keamanannya, teks berbentuk rahasia dibuang dan dilaporkan sebagai `summaryDropped`. Terbukti live: checkpoint nyata menyimpan `summary` pada entri tertunda. |
| 2. `reviewDue` hanya dari pekerjaan yang bisa ditinjau; laporkan umur yatim terpisah | Selesai dengan bentuk berbeda: bukan `orphanCount/oldestOrphanAt`, melainkan `freshReviewCount`, `staleReviewCount`, `oldestPendingAt`; `reviewDue` hanya menghitung entri yang lebih muda dari 7 hari, `pendingReviewCount` tetap total. Terbukti live untuk bentuk keluarannya (`backlog` mengembalikan 1 fresh, 0 stale). |
| 3. Jalur resmi menutup yatim dengan alasan tertulis | Selesai dengan bentuk berbeda: `resolution {kind:'stale-orphan', resolvedByTaskId, note, at}` pada keputusan, bukan `resolvedBy`. Syarat: lebih dari 7 hari, tidak ada task hidup atau episodenya tertutup/tak tersentuh selama itu, disposition dan alasan minimal 20 karakter di `summary`; kandidat ditolak; entri Native dan episode yang baru disentuh ditolak. |
| Tambahan (R6-B) | `learning(action=backlog)`: tampilan status kompak. Terbukti live. |
| Tambahan (R6-C) | `procedureScaffold` pada checkpoint `verified-recovery` eksternal. Terbukti live. |

## Validasi
- Tes baru `tests/learning-pending-review-health.test.ts` (14 tes) lulus; `tests/mcp-manifest-contract.test.ts` lulus; `tests/learning-finalization-continuity.test.ts` disesuaikan dan lulus; `npm run build` lulus.
- Acceptance proposal: yatim ditutup lewat jalur resmi dengan alasan (tes); entri berepisode hidup ditolak (tes); `reviewDue` tidak menyala hanya karena entri basi (tes); `summary` tersimpan dan terbaca (tes dan live).
- Resident: setelah restart resmi, `learning(action=backlog)` dan checkpoint/`procedureScaffold` diamati pada Core yang berjalan.

## Keterbatasan yang diterima
- Penutupan yatim basi belum diamati live karena tidak ada entri basi (lebih dari 7 hari) saat verifikasi; satu-satunya entri tertunda adalah entri finalisasi Native yang segar dan sengaja tidak disentuh. Bukti jalur ini hanya tes fixture.
- Acceptance "bukti hidup: reviewDue tidak menyala karena yatim" tidak diamati sebagai kejadian live, karena `reviewDue` menyala oleh entri segar yang sah.
- Suite penuh tidak dijalankan sampai selesai; kegagalan di grup lain (grants Native, reconstruction harness, capability parity, katalog image_inspect, memory engine/browser) dinilai tidak terkait lewat inspeksi dan belum di-bisect pada baseline bersih.
- Deskripsi tool `learning` dipersingkat karena batas manifest 128 KiB; worktree sudah melewati batas 17 byte sebelum perubahan ini.
- Tidak menjawab apakah gerbang penangkapan terlalu ketat dan tidak memulihkan isi checkpoint yang sudah hilang (batas asli proposal).

## Masalah dan tujuan
Review yang tertunda menumpuk tanpa jalan keluar resmi bagi controller eksternal, sehingga
`reviewDue` selalu menyala dan tidak lagi memberi informasi. Tujuannya: antrean review hanya berisi
pekerjaan yang benar-benar bisa ditinjau, dan checkpoint lama bisa ditutup secara sah dengan alasan
tertulis, tanpa menempelkan kunci ke episode lain.

## Bukti dan ketidakpastian
Diamati langsung:
- Sebelum pembersihan ada 31 review tertunda, 21 berumur 18 sampai 19 hari. 30 belum punya keputusan.
- `reviewDue` bernilai `enabled && pendingReviews.length > 0` (`service.ts:418`). Dengan satu entri
  tertunda saja, sinyal itu selalu benar; alasan yang ditampilkan diambil dari entri tertua.
- `learning(review)` eksternal hanya menerima kunci yang ada di `checkpointKeys` episode saat ini
  (`learning-tools.ts:110-131`). Kunci tanpa episode gagal dengan `LEARNING_EXTERNAL_CHECKPOINT_NOT_BOUND`;
  taskId milik episode lain gagal dengan `LEARNING_EXTERNAL_SCOPE_MISMATCH`. Keduanya teramati hari ini.
- Entri tertunda hanya menyimpan kunci, alasan, referensi bukti, workspace, waktu, dan taskId. Parameter
  `summary` pada `learning(checkpoint)` diterima oleh skema alat tetapi tidak diteruskan ke
  `LearningCheckpointInput` (`learning-tools.ts:84-91`, `types.ts:124-131`), jadi tidak tersimpan.
  Review yang tertunda lama kehilangan konteks yang dibutuhkan untuk ditinjau.
- 17 dari 31 entri berasal dari workspace selain `agent-core`. Untuk 15 di antaranya (Astra Content
  Factory) foldernya terverifikasi tidak ada di disk; proyek itu tertulis dengan empat ejaan jalur
  (garis miring, backslash, huruf kecil), dan dua entri lain memakai nama `Rifqi` dan
  `astra-volume-recovery` yang bukan jalur.
- Pembersihan hari ini hanya mungkin lewat dua jalur yang tampaknya tidak disengaja: mengirim ulang
  `learning(checkpoint)` dengan `idempotencyKey` yang sama (jalur duplikat tetap memanggil
  `recordLearningCheckpoint`, `external-controller.ts:896`) dan memulai ulang episode lama dengan
  `taskKey` yang sama. Keduanya dipakai atas perintah eksplisit pengguna.
- Dari 321 keputusan review yang tercatat: 203 `no-new-knowledge`, 113 `awaiting-verification`,
  5 `captured`.

Tidak diketahui: isi checkpoint lama (tidak tersimpan), apakah jalur duplikat memang disengaja, dan
apakah sedikitnya `captured` berarti memang sedikit pelajaran atau gerbang penangkapan terlalu ketat.

## Mekanisme dan owner existing yang dipakai
Hanya owner yang sudah ada: `src/learning/triggers.ts` (`applyCheckpoint`, `markReviewed`),
`src/learning/service.ts` (`review`, status), `src/mcp/learning-tools.ts` (pintu eksternal),
`src/learning/external-controller.ts` (episode). Perubahan terkecil, dalam urutan:
1. Simpan `summary` (paling banyak 300 karakter) pada entri tertunda dan tampilkan di `status`.
2. Hitung `reviewDue` hanya dari entri yang bisa ditinjau episode saat ini; laporkan jumlah dan umur
   entri yatim secara terpisah (`orphanCount`, `oldestOrphanAt`).
3. Satu jalur resmi untuk menutup yatim: `review` dengan parameter eksplisit, hanya untuk entri tanpa
   episode terbuka atau lebih tua dari ambang yang dikonfigurasi, mewajibkan disposition dan alasan teks,
   dan mencatat `resolvedBy`. Guard "jangan membuka checkpoint asing" tetap berlaku untuk entri yang
   episodenya masih hidup.

## Scope, batas Native, risiko dan otorisasi
Hanya jalur controller eksternal. Entri finalisasi Native (`agent-runtime:*`) tidak berubah dan tetap
ditutup oleh runtime Native. Satu entri semacam itu masih tertunda hari ini dan tidak disentuh.
Risiko: menutup tanpa tinjauan bisa menyembunyikan pengetahuan. Mitigasi: disposition hanya
`awaiting-verification` atau `rejected` untuk yatim tanpa ringkasan, alasan teks wajib, ambang umur,
dan keputusan lama tetap ada di `reviewDecisions`. Perubahan source membutuhkan APPROVE; tidak ada
yang dibangun atau diaktifkan oleh dokumen ini.

## Manfaat yang diharapkan dan keterbatasan
`pendingReviewCount` dan `reviewDue` mencerminkan pekerjaan nyata; sesi baru tidak lagi mewarisi
antrean yang tak bisa ditutup. Keterbatasan: tidak menjawab apakah gerbang penangkapan terlalu ketat,
dan tidak memulihkan isi checkpoint yang sudah hilang.

## Acceptance, evaluasi dan rollback
- Tes: entri yatim ditutup lewat jalur resmi dengan alasan; entri berepisode hidup tetap ditolak;
  `reviewDue` false bila hanya ada yatim; `summary` tersimpan dan terbaca di `status`.
- Bukti hidup: setelah satu siklus checkpoint, `reviewDue` tidak menyala karena yatim.
- Rollback: parameter baru bersifat tambahan; tanpanya perilaku lama berlaku.

## Riwayat revisi
- Revisi 1 (2026-10-25): draf awal dari pembersihan 31 review tertunda. Status saat itu: PROPOSED; keputusan "Belum ada keputusan; menunggu APPROVE / REVISE / HOLD / REJECT".
- 2026-10-25: dikerjakan atas perintah pengguna; isi proposal tidak direvisi. Catatan implementasi ditambahkan, lalu dokumen dilengkapi bagian penyelesaian di atas dan dipindahkan ke arsip.

## Sumber bukti penyelesaian
`docs/CODEBASE.md` (entri Learning backlog visibility); `tests/learning-pending-review-health.test.ts`; `.changeset/20261025-learning-backlog-visibility.md`; Learning checkpoint `learning-loop-health-r6-implementation-20261025` (review `no-new-knowledge`, 2026-10-25T06:39Z).
