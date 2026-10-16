# Integrasi Marginal Evidence dan Replay Abstraction — 16 Oktober 2026

**Status: TERINTEGRASI DAN TERVERIFIKASI — Completed.** Kedua draft ditutup setelah penerimaan source, build, caller eksternal/Native, dan proses resident. Status HOLD historis telah digantikan untuk dua proposal ini.

## Keputusan dan ruang lingkup

Permintaan pengguna mengizinkan integrasi dua proposal, rekonsiliasi kemampuan existing, verifikasi fungsi, penyelarasan status HOLD menjadi status integrasi yang akurat, dan penghapusan dua draft setelah penerimaan. Persetujuan ini menggantikan HOLD historis untuk ruang lingkup tersebut. Pengujian kecepatan, benchmark, dan eksperimen manfaat kausal tidak dijalankan.

Audit membaca proposal Marginal sebanyak 129 baris dan Replay sebanyak 1.948 baris hingga bagian 24. Dua celah konkret diperbaiki pada owner existing. Tidak dibuat ReplayService, compression engine, Memory store, scheduler, execution gate, dependency, atau folder versi paralel.

## Perubahan fungsi

1. **Salience dan penghentian verifikasi opsional.** `src/learning/salience-review.ts` menerima `requirement`, `resolution`, `deferralReason`, `marginalValue`, serta `stoppingContext`. Observasi mandatory, high/critical, atau severity unknown yang belum terselesaikan tetap terlihat walaupun sebelumnya reviewed-unchanged. Kontradiksi tetap mendapat pemeriksaan terbatas. Penghentian opsional memerlukan pemeriksaan wajib dan batas pengguna selesai, bukti tersedia, tidak ada risiko belum terselesaikan, dan tidak ada pemeriksaan berguna/baru yang belum ditinjau. Deferral membutuhkan alasan dan menyebut tindakan yang ditunda. Maksimal satu inspeksi disarankan; tidak ada eksekusi otomatis.
2. **Isolasi waktu historis.** `SubProject/agent-core-memory/src/memory/controller-session.ts` tidak lagi memanggil pemeriksaan freshness filesystem masa kini untuk recall `knownAt`. Hasil historis menyatakan `freshness: unknown` dan warning `historical-source-freshness-unknown`. `validAt` tanpa `knownAt` tetap memakai pemeriksaan sumber saat ini dan warning existing. Revision asli, late evidence, dan koreksi audit tetap dipertahankan.

Jalur eksternal `learning(action=decision)` dan Native `agent_core_strategy.decisionReview` memakai schema dan `LearningService.decisionReview` yang sama. Guidance kedua caller diperbarui. Semua field baru opsional sehingga payload lama tetap diterima. Saran stopping merupakan penilaian controller dengan sumber yang dapat diperiksa; tidak membuktikan kebenaran semantik, independensi sumber, manfaat keputusan, atau tambahan izin.

## Rekonsiliasi seluruh proposal

| Kebutuhan / bagian Replay | Owner dan disposisi |
| --- | --- |
| Marginal: mandatory checks, explicit constraints, unresolved risk, bounded stopping | Ekstensi salience existing; tidak menggunakan angka hipotetis P0/P1/P2 sebagai threshold. Evidence resolver existing memeriksa referensi dan read grant. |
| Replay 1–4, 8.1–8.3: proses, representasi, retrieval, keputusan dipisahkan | Memory synthesis, promotion, exact expansion, Learning decision review dan receipts digunakan kembali. Hitungan replay/ringkasan bukan outcome verification. |
| 5, 8.4–10: baseline, selection bias, neuroscience, information theory, energy | Rancangan penelitian, bukan kebutuhan owner produksi baru. Tidak dijalankan sebagai benchmark atau klaim hasil. |
| 6–7: reuse, otorisasi, tanpa runtime paralel | Menggunakan Memory/Learning/tracker/verifier/controller existing. HOLD historis digantikan permintaan implementasi saat ini. |
| 11–12: valid/shuffled/neutral content, mediator, persistent learning | Receipt existing mengikat delivery/use/revision/action; tidak mengidentifikasi sebab tersembunyi. Tidak menambahkan evaluator kausal otomatis. |
| 13: compiler success versus functional goal; conditional verification | Forecast teknis dan oracle fungsional tetap terpisah. Stopping opsional memakai ekstensi salience di atas. |
| 14–15: compression, rare exception, selective expansion | Synthesis menyimpan exact claims/refs/gaps; capsule menolak kehilangan mandatory content; preview memperingatkan abstraksi dan exact expansion mengembalikan sumber utuh. Tidak menyertifikasi semantik abstraksi controller secara otomatis. |
| 16: unknown criticality, authority, information value | Severity unknown tidak dianggap low; authority tetap terpisah. Tidak memasang threshold probabilitas/biaya universal. |
| 17: calibration, shift, context | Review strategi dan kalibrasi existing mempertahankan cohort/konteks/unknown serta tidak mengubah policy otomatis. |
| 18–20: factorial interaction, heterogeneity, transportability | Provenance, source version, applicability, exceptions, dan outcome tetap terpisah. Angka simulasi tidak menjadi kebijakan repository atau klaim generalisasi. |
| 21–22: validAt/knownAt, late evidence, revision lineage | Existing store/revisions/temporal/promotion mempertahankan publication time, scope, original observations, dan batas compiler-only claims. |
| 23–24: past controller information versus future evaluator truth | Celah live freshness pada knownAt diperbaiki. Public recall menguji snapshot sebelum/sesudah audit dan exact expansion revisi lama. Tidak dibuat AGM/paraconsistent inference engine. |

Tes Replay komposisional memakai konsolidasi publik, instance service baru, recall dan expansion: hipotesis tetap unverified, pengecualian tetap tersedia dalam sumber utuh, referensi sintesis tepat, audit kemudian menahan sintesis stale, dan sumber asli masih dapat dibaca. Ini membuktikan kontrak preservasi data yang diberikan; tidak membuktikan bahwa semua pengecualian yang belum dinyatakan sudah ditemukan controller.

## Bukti verifikasi

Penerimaan akhir: **230 tes berbeda, 16 file, seluruhnya lulus**. Receipt berada di `runtime/backups/marginal-replay-integration-20261016/`. Kasus bernama benchmark pada `memory-capsule.test.ts` tidak dijalankan; hanya suite `memory-capsule-content-integrity.test.ts` yang relevan dipilih. Harness penelitian Plan05/Plan19 tidak dijalankan.

| Kelompok | Bukti akhir |
| --- | --- |
| Root: salience, decision review, calibration, Native cumulative learning, curation/promotion, knowledge-use receipts, MCP manifest | `root-tests-final.json`: 72/72 tes, 7 file. |
| Memory: knownAt disclosure/history, temporal, replay integrity, synthesis/reuse, promotion, safety boundaries, capsule content integrity | `memory-tests-final.json`: 158/158 tes, 9 file; SHA-256 `b7e1ed7955f9950bcd52d49270efb906f72b79e2915a6b121297dde92e7c1d73`. |
| Build, path policy, release intent | `npm run build` dan `npm run release:check-intent` lulus; path policy 387 authored files, zero exceptions. `build-identity.json` mencatat hash source/build terkait. |
| Manifest lengkap | 79 tool, 130689 byte dari batas 131072; SHA-256 `3b191d95ef7f4b7e93a7c05c0c438148d61107ad7bdf1c3c750e16af3c4c368d`. Batas ini kompatibilitas handshake, bukan benchmark performa. |

Reproduksi knownAt sebelum perbaikan menghasilkan dua kegagalan dari empat kasus: view map dan abstract membaca freshness masa kini. Sesudah perbaikan, ketiga suite temporal/disclosure/history menghasilkan 41/41 lulus. Review independen juga menemukan prioritas contradiction kalah oleh reviewed-unchanged untuk risiko rendah/sedang; perbaikan dan regresinya termasuk penerimaan akhir. Run gabungan root awal 71/72 lulus ketika tes regresi baru menunjukkan edge case tersebut; revisi final 72/72 lulus. Run Memory awal 155/158 lulus: tiga fixture backend masih memakai `sourceDependencyStatus` yang telah diganti. Fixture diperbaiki memakai `synthesisEligibility()` existing; assertion 32/1/32, fallback, cycle, dan batas produksi tetap utuh. Rerun sembilan file 158/158 lulus. Tidak ada kegagalan yang diabaikan.

Code Intelligence melaporkan graph current sebelum perubahan; impact `reviewSalience` menunjuk `reviewDecisions` dan `LearningService.decisionReview`, sesuai source aktual dan caller MCP/Native. Graph merupakan pendapat kedua, bukan pengganti source atau izin eksekusi.

Reindex setelah perubahan sempat berstatus queued/dirty. Diagnostik akhir pada `2026-10-16T06:39:34.517Z` mengonfirmasi `index: current`, graph integrity `accepted`, dan coverage workspace lengkap. Tidak diperlukan perubahan provider, konfigurasi atau instalasi. Pemeriksaan source tetap menjadi dasar kesimpulan.

## Aktivasi dan penerimaan resident

Satu restart resmi melalui `scripts/windows/Invoke-Agent-Core-Restart.ps1 -Mode Run` memakai task manual yang sudah terpasang. Receipt `runtime/restart/b7e503e6e9b34fff8f1b8bbfa8156edc.json` mencatat exit 0, error null pada `2026-10-16T06:29:04.9286642Z`; launcher 19028 dan Core 20044. Health sesudah aktivasi `ok`, versi tetap `0.15.0-beta.3`, canonical Memory/Learning tersedia dengan issueCount 0.

Connector semula menolak field salience baru karena schema tersimpan lama. **Refresh tools** dilakukan pada aplikasi yang sama, `asdk_app_6ad1239cdf308191a3ccb8ba0cd49503`, tanpa instalasi ulang, akun baru, atau perubahan izin. Sesudahnya tool pada chat ini menerima field baru. `resident-acceptance.json` membuktikan tiga hasil aktual: low optional menghasilkan `stop-optional-checks`, critical mandatory unchanged tetap `continue-verification` dengan satu inspeksi, dan explicit deferral menghasilkan `defer-action`/`defer-affected-action`. Semuanya mempertahankan `actionAuthorization: unchanged`.

Recall resident `knownAt=2026-10-16T06:18:00Z` memakai task host yang sama dan mengembalikan revisi checkpoint historis dengan `freshness: unknown` serta warning baru. Store juga melaporkan `knowledge-history-legacy-unproven`: riwayat lama yang tidak memiliki bukti publikasi lengkap tetap partial, bukan dibuat seolah lengkap. Pengujian ini memverifikasi perilaku baru, bukan mengubah batas riwayat existing.

## Identitas draft dan penutupan

| Draft | SHA-256 sebelum penghapusan |
| --- | --- |
| Marginal-Evidence-Value-and-Safe-Verification-Stopping-Review.md | `a7c4bb02ee400ebe9e0f5149b4f4f1d059dec79987cfb5a6e379e3d6100869a5` |
| Replay-Abstraction-Validity-and-Decision-Impact-Review.md | `8c2716dbbe6e575baa7c2eff5583e9e2ff7ecd40d57ba59ea67c9c1612be2451` |

Kedua file draft telah dihapus setelah hash cocok dengan versi yang direview; read-back `proposal-closure.json` menyatakan `exists: false` untuk keduanya. README proposal dan catatan current CODEBASE menunjuk laporan ini. Canonical Memory `585b26d7-f26c-4df0-9dc8-b55054410037` (Replay) dan `cb10466b-c52f-474f-a64a-95f67fee7fec` (Marginal) berstatus **Integrated and verified**, masing-masing dibaca kembali. Riwayat keputusan lama dipertahankan sebagai riwayat yang digantikan, bukan status aktif. Canonical working Memory tetap Agent Core; Cortex dibaca sebagai referensi historis tanpa membuat penyimpanan kerja kedua.

## Ledger dan batas

Learning task `ext-6561dc90c09c40eb868731c2e32b1744` selesai dengan checkpoint **397**, key `marginal-replay-proposal-integration-20261016-final`, reason `verified-recovery`, dan scoped review `no-new-knowledge` pada `2026-10-16T06:41:12.670Z`. Read-back episode mengonfirmasi `pendingLearning: false`. Keputusan dan bukti integrasi sudah berada pada canonical Memory; review tidak membuat kandidat duplikat atau menutup pending review tugas lain. Receipt `learning-finalization.json` memisahkan hasil kerja dari status Learning.

Perubahan source terbatas pada salience, historical disclosure, dan guidance kedua controller. Tes existing diperluas dan dua tes Memory komposisional/public disclosure ditambahkan. Satu pending release intent `patch` ada pada `.changeset/marginal-evidence-historical-recall.md`; versi produk, baseline release, commit/push dan publish tidak diubah. Perubahan terdahulu pada worktree dipertahankan.

Tidak ada instalasi/download, perubahan izin, dependency baru, atau benchmark. Penutupan fungsi tidak mengubah hipotesis manfaat efisiensi, generalisasi, causal decision impact atau intelligence gain menjadi fakta. Dokumen ini adalah laporan engineering; canonical Memory dan finalisasi Learning tetap memakai owner Agent Core.
