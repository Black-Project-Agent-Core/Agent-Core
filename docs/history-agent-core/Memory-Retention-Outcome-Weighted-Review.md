# Memory Retention: Outcome-Weighted Review (Usulan)

## Penutupan pengukuran — 2026-10-29

Status: COMPLETED — pengukuran selesai; penggantian skor NO-OP karena bias berbahaya belum terbukti.

Instruksi penuntasan pengguna 2026-10-29 menjadi otorisasi pengukuran scope ini. Script read-only `scripts/verify/proposal-retention-review.mjs` memakai aktivasi canonical yang tervalidasi. Snapshot: 256 note, 4.697 retrieval, pangsa sepuluh teratas 23,845%, nol feedback eksplisit yang terikat revisi sekarang. Delapan diagnostik recall terbaru juga observational-incomplete tanpa receipt/feedback terases.

Counterfactual helpful-only mengubah nol anggota legacy-stale tetapi 26 anggota daftar forgetting pada salience/confidence yang dibekukan. Ini bukan outcome kausal; feedback kosong tidak membenarkan perubahan ranking/retensi. Curator tetap advisory. Tidak ada note diubah/dihapus dan tidak ada identitas/isi privat diekspor.

[Snapshot dan metode](../verification/Memory-Retention-Review.json), [keputusan dan batas bukti](../verification/Proposal-Completion.md). Kondisi langkah 2 proposal tidak terpenuhi; scope ditutup tanpa menyisakan implementasi bersyarat aktif. Revisi penutupan 2. Asal `docs/proposals/Memory-Retention-Outcome-Weighted-Review.md`; arsip setelah Learning `docs/history-agent-core/Memory-Retention-Outcome-Weighted-Review.md`.

## Proposal dan observasi awal — riwayat

Status: PROPOSAL, menunggu keputusan APPROVE / REVISE / HOLD / REJECT. Bukan implementasi, bukan bukti manfaat.

## Observasi (bukti source, belum diuji runtime)
- `src/memory/service.ts` `touch()` menaikkan `retrievalCount` + `lastAccessedAt` pada setiap read yang dilacak.
- `src/memory/retention-score.ts`: `accessTerm = sigma * log1p(retrievalCount) * exp(-mu * daysSinceAccess)`. Hitungan retrieval menambah skor retensi.
- `src/learning/curator.ts` memakai skor itu untuk menandai catatan stale (`reviewThreshold` 0.2) dan `legacyStale` (retrievalCount===0).
- Materi CME 01 Bagian 3 (catatan riset pengguna): retrievalCount/popularitas bukan bukti truth/confidence; risiko loop popularitas "sering di-retrieve → terlindungi → makin sering di-retrieve".

## Batas bukti
Efek log1p + decay sudah terbatas. Belum diperiksa: sumber `salience`, ranking di retrieval, dan apakah loop bias benar terjadi di data nyata (133+ record). Ini hipotesis risiko, bukan bug terbukti.

## Pemilik existing
`src/memory/retention-score.ts`, `service.ts`, `learning/curator.ts`, retrieval ledger/feedback (`memory_feedback`). Tidak perlu store baru.

## Perubahan terkecil
1. Ukur dulu (read-only): distribusi retrievalCount vs outcome feedback dari retrieval ledger; cek apakah catatan top-retrieved didominasi beberapa record.
2. Jika bias terbukti: ganti `retrievalCount` di `accessTerm` dengan hitungan retrieval yang dikaitkan hasil terverifikasi (memoryFeedback helpful/verified), atau batasi kontribusi akses (cap) dan hitung per-episode unik, bukan per-read.
3. Curator tetap hanya mengusulkan demote/archive/supersede; tidak ada delete otomatis.

## Manfaat yang diharapkan
Catatan jarang dipakai tapi benar tidak terkubur; catatan populer tapi usang tidak terlindungi. Belum terukur.

## Risiko
Perubahan skor menggeser daftar stale; data feedback mungkin tipis; regresi test retention/curator.

## Verifikasi
Snapshot skor sebelum/sesudah pada Memory nyata (dry-run), test unit retention-score/curator, bandingkan daftar stale, tanpa mutasi record.
