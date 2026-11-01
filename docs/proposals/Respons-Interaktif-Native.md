# Respons Interaktif Native

Tanggal: 2026-11-01 (Asia/Tomsk)
Revisi: 1
Status: APPROVED — tahap 1 diaktifkan 2026-11-01; manfaat end-to-end belum terukur
Jenis: Improvement
Asal dan bukti: [Diagnosis latensi interaktif](../verification/Native-Interactive-Latency-Diagnosis.md), source runtime/controller/provider dan metadata runtime read-only.

## Masalah dan tujuan

Pembaruan kecil memvalidasi seluruh riwayat Native berulang kali. Kandidat cache sudah berada di worktree tetapi belum masuk dist resident. Tahap pertama menuntaskan review, build, aktivasi dan pengukuran kandidat sebelum refactor berikutnya.

## Bukti dan ketidakpastian

State 184 task/7.697 episode/4.424.410 byte. Empat sampel normalisasi current dist: median 1.026 ms; warm cache kandidat 20,5 ms, hasil deep-equal. Tes cache synthetic 5/5 lulus. Belum ada bukti latency chat live turun. Effective reasoning ceiling, TTFT provider dan kontribusi UI belum diukur langsung.

## Mekanisme dan owner existing yang dipakai

Gunakan `src/agent-runtime.ts`, tes existing, pipeline build dan launcher/restart resmi. State tetap `runtime/agent-runtime/state.json`. Tidak membuat store, daemon, cache authority atau model router baru.

## Scope, batas Native, risiko dan otorisasi

Tahap pertama yang diajukan:

1. Review cache existing beserta invalidasi, validasi, isolasi hasil dan batas cache. Pertahankan perubahan pengguna lain.
2. Jalankan pemeriksaan terarah yang diperlukan, build source dan verifikasi dist memuat kandidat yang tepat.
3. Periksa task aktif; lakukan satu aktivasi resmi pada waktu aman; verifikasi PID/build/health. Jangan melanjutkan resumable turn lama secara otomatis.
4. Bandingkan fase lokal pada workload terbatas yang sama, catat cold/warm serta residual dan apakah sasaran interaktif tercapai.

Tidak mencakup pergantian provider/model/effort/key, pembacaan/perubahan `.env`, migrasi storage, penghapusan history, pelemahan validasi, penonaktifan Memory/Learning, adapter streaming baru, concurrency baru, commit/push/release atau rewrite stack. Tahap lanjutan mengikuti hasil pengukuran dan scope tersendiri.

Risiko: invalidasi/aliasing cache; build memasukkan perubahan lain yang belum siap; restart menginterupsi task. Review per-file, fixture isolasi, pemeriksaan worktree/build dan task sebelum restart tetap wajib.

## Manfaat yang diharapkan dan keterbatasan

Mengurangi validasi task yang tidak berubah diharapkan memperkecil gap antartool serta startup/finalisasi. File I/O masih tumbuh dengan history dan belum dibatch. Reasoning, recall dan UI tetap mempunyai biaya. Tidak menjanjikan parity desktop atau persentase speedup chat.

## Acceptance, evaluasi dan rollback

- Cache on/off memberi hasil setara; mutation hasil tidak mencemari panggilan berikut; batas task/cache terjaga.
- Dist dan resident yang diukur benar-benar memuat kandidat yang disetujui.
- Whole-turn dan fase lokal dibandingkan pada workload setara; hasil dalam noise atau masalah tersisa dilaporkan.
- Cancellation dan durable side-effect checkpoints tetap benar; tidak replay turn historis.
- Kill switch existing `AGENT_CORE_RUNTIME_NORMALIZE_CACHE=off` dapat menjadi rollback. Perubahan konfigurasi aktual mengikuti scope pemulihan yang disetujui; tidak menghapus data/history.

## Riwayat revisi

- Revisi 1: tahap pertama dari diagnosis; belum implementasi/aktivasi oleh task diagnosis.

## Keputusan pengguna dan scope

APPROVE untuk revisi 1, hanya tahap 1 (review, build, aktivasi, pengukuran cache existing): diberikan pengguna di sesi controller Claude pada 2026-11-01 setelah ringkasan lingkup dan rencana eksekusi. Tidak mencakup tahap 2 sampai 5, commit/push/release, atau perubahan konfigurasi/provider/storage.

Eksekusi tahap 1 (2026-11-01): `npm run build` exit 0; dist memuat cache; satu restart resmi (`capabilitiesChanged=false`), PID baru 15800 mulai 10:27:56Z, `build.stale=false`, nol running turn, satu resumable turn dibiarkan, 184 task utuh. Pengukuran pada salinan state (185 task, 4,42 MB, `bumpMetrics`, 5 sampel): dist lama 3,8 sampai 4,1 s per mutasi; dist baru cache off 3,9 sampai 4,4 s; cache on 1,77 sampai 1,83 s; `normalizeState` 1,0 sampai 1,3 s menjadi 27 sampai 35 ms; 2580 dari 2771 normalisasi memakai cache. Sisa waktu mutasi hampir seluruhnya `writeStateFile` (1,62 sampai 1,79 s per tulis pada pengukuran ini; baca, parse, stringify 11, 15, 22 ms).

Status acceptance: kesetaraan hasil cache dan kill switch tercakup tes existing (5/5 pada diagnosis, tidak dijalankan ulang di sini). Durasi step pada chat nyata setelah aktivasi belum diukur; hit rate di proses resident belum terlihat. Karena sisa mutasi didominasi penulisan state, ambang yang diusulkan saat persetujuan (rata-rata step di bawah sekitar 1,5 s) diperkirakan tidak tercapai (perkiraan sekitar 3 s per tool call, belum terukur). Angka pengukuran ini lebih tinggi daripada angka di CODEBASE.md (sekitar 0,65 s per mutasi dengan cache) diduga karena biaya I/O tulis berbeda antar-run (beban mesin atau kondisi disk; belum diisolasi). Tahap berikutnya (mengurangi jumlah tulis state penuh per tool call) memerlukan scope dan keputusan tersendiri.
