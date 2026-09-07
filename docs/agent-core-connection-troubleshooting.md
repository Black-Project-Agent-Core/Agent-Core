# Agent Core: Panduan Setelah Penerapan Perbaikan

Tanggal 6 September 2026. Status terakhir: **DEPLOYED_LOCAL_VERIFIED**.

## Status yang harus dipakai sesi berikutnya

Perbaikan OAuth dan pemulihan audit SUDAH diterapkan ke instalasi utama. Laporan lama yang menyebut VERIFIED_NOT_DEPLOYED adalah riwayat, bukan status terkini. Baca `reports/connection-cutover-20260906/Agent-Core-Cutover-Result-2026-09-06.md` terlebih dahulu, lalu periksa keadaan aktual.

Proyek utama tetap `E:\Projects\Agent-Core`. Launcher tetap `SubProject\Agent-Code\Agent Code Native.exe`. Jangan menjalankan launcher dari worktree kandidat atau membuat controller kedua.

## Penyimpanan aktif

```text
runtime\persistence.json
  schemaVersion: 1
  generation: 20260906

runtime\persistence-20260906\data
runtime\persistence-20260906\logs
```

`src/config.ts` memilih generasi tersebut melalui `src/runtime/persistence-paths.ts`, termasuk ketika launcher mengirim path bawaan `runtime/data` dan `runtime/logs`. Override shadow yang terpisah tetap dipertahankan.

File autentikasi dan log lama tetap disimpan sebagai bukti. Jangan menghapus pointer atau mengganti data aktif dengan snapshot lama; grant baru bisa hilang atau credential lama bisa hidup kembali. Database memory/execution tidak dipindahkan dalam perbaikan ini.

## Bukti terakhir

Kandidat 71/71 PASS; instalasi utama setelah tambahan pembatas penemuan tes 73/73 PASS dalam 15 file. Build kandidat dan typecheck produksi PASS. Audit lama 28.608 record disalin identik, rotasi berhasil, record 28.609 meneruskan head lama, dan verifier canary valid sampai 28.681. Semua sampel canary menunjukkan healthy dan error tulis audit 0.

Dua klien SDK legacy/modern, 14 panggilan status, peer close dan reconnect lulus di server produksi lokal. Tool list berisi 69 alat termasuk subagentcore. Canary memakai API key yang sudah terdaftar, hanya pada loopback; tidak mencetak key atau membuat grant OAuth. Ini bukan pengujian dua chat ChatGPT nyata atau soak jangka panjang.

## Urutan pemeriksaan berikutnya

Discovery tool host, status nyata, kesehatan rinci, autentikasi, scope routing, dan log adalah lapisan terpisah. Jangan menyatakan server mati hanya karena namespace atau alat tertentu tidak tersedia. Pada pesan penerapan, Agent Core terpasang tetapi namespace tidak diekspos oleh host; checkpoint DMF tidak ditulis melalui konektor.

Untuk proyek ini, gunakan hanya `E:\Projects\Agent-Core` sebagai root target pada konteks routing. Jangan menyalin semua allowed roots ke task yang sama dan kemudian menganggap WORKSPACE_PROJECT_AMBIGUOUS sebagai koneksi putus.

Endpoint lokal yang relevan: `http://127.0.0.1:8765/health`, `http://127.0.0.1:8765/health/metrics`, dan readiness tunnel `http://127.0.0.1:8787/readyz`. Cari audit aktif di generasi yang dipilih, bukan hanya direktori log lama yang memang sudah menjadi snapshot historis.

Sebut/pilih Agent Core secara eksplisit pada pesan yang membutuhkan aksi konektor. Masih perlu uji dua chat nyata untuk menutup gate host. Jangan mengklaim gate itu lulus berdasarkan probe loopback.

## Pengamanan dan artefak

Jangan membaca atau mencetak nilai `.env`, raw API key, access/refresh token, client secret, atau isi penuh penyimpanan autentikasi ke percakapan. Pemakaian credential untuk pengujian yang sah harus tetap di mesin dan tidak masuk laporan.

Folder hasil: `reports/connection-cutover-20260906`. Bukti offline-deployment, deployed-green-tests, live-canary, final-verification dan hash artefak adalah catatan kelanjutan. Laporan lama dipertahankan. `offline-cutover.py` bukan launcher harian dan menolak penerapan ulang; jangan mengakali guard-nya.

Tidak ada commit/push pada pekerjaan ini. Worktree kandidat tetap berisi overlay pekerjaan sebelumnya; jangan commit semuanya. Vitest mengecualikan `**/reports/**` agar source arsip tidak dianggap sebagai tes aplikasi.

**Bagian lokal sudah diterapkan dan terverifikasi; kondisi terkini serta koneksi host harus diuji ulang sebelum menyatakan seluruh sistem stabil.**

Catatan monitoring: `audit.written` adalah penghitung per proses dan dapat kembali kecil setelah restart. Gunakan sequence audit persisten dan identitas proses untuk memeriksa kemajuan lintas restart. Setelah canary teramati pergantian proses dengan audit tetap sehat dan sequence meningkat; pemicu pergantian tersebut belum ditetapkan. Lihat `post-canary-process-observation.json`.
