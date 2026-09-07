# Agent Core — Resume Perbaikan Koneksi

Tanggal 6 September 2026. Status: **VERIFIED_NOT_DEPLOYED**.

## Baca ini sebelum menjalankan tindakan

Pengguna sudah menyetujui perbaikan. Kandidat diperbaiki dan lulus 71/71 tes terfokus, build, typecheck, dan patch dry-run. Penerapan terkontrol diblokir pemeriksaan keamanan alat. Jangan meminta ulang persetujuan substantif yang sama, tetapi jangan menerobos pembatasan eksekusi.

Akses `Agent_Core.agent_core_status` ditolak dengan `FORBIDDEN: This conversation does not support developer MCPs`. Remote Desktop Commander dapat membaca proyek dan mengerjakan kandidat di PC Windows `archi`. Jangan menyamakan penolakan host dengan server mati.

## Lokasi

Proyek: `E:\Projects\Agent-Core`.
Kandidat: `.worktrees\connection-review-20260906`.
Branch kandidat: `fix/oauth-concurrency-review-20260906`.
Laporan terbaru: `reports\connection-repair-20260906\Agent-Core-Repair-Result-2026-09-06.md`.
Patch: `reports\connection-repair-20260906\agent-core-connection-repair-candidate.patch`.
Bukti akhir: `reports\connection-repair-20260906\green-final-tests.json` dan `final-status.json`.

## Sudah dilakukan

Antrean OAuth dalam proses dan exchange satu snapshot diperkuat dengan lock lintas proses memakai SQLite bawaan Node sebagai mutex tanpa payload. Atomic snapshot tidak lagi menimpa credential lama saat rename gagal. Resolver persistence memilih hanya generasi lengkap dan valid; malformed/missing generation ditolak, shadow override dipertahankan.

Audit EPERM direproduksi sebagai masalah izin efektif: WRITE_DATA boleh, DELETE dan WRITE_DAC ditolak pada file lama. DACL meniru file lama membuat rename sintetis gagal; DACL pemilik aktif membuatnya berhasil. ACL produksi tidak diubah. Rantai audit lama 28.608 record tetap valid; jangan menghapus atau membuat-buat event untuk gap pencatatan.

## Belum dilakukan

Tidak ada deployment source/build produksi, perpindahan credential/audit, publikasi `runtime\persistence.json`, reset OAuth, restart, atau pembaruan checkpoint DMF. Direktori privat `runtime\persistence-20260906` sudah dibuat tetapi masih kosong. Server/tunnel terakhir terverifikasi tetap PID 10688/7740; PID ini historis, verifikasi ulang sebelum tindakan apa pun.

## Gate kelanjutan

Periksa ulang hash, proses pemilik, health, hasil tes, dan izin host; jangan mengasumsikan data handoff tetap terbaru. Native `Agent Code Native.exe` adalah pemilik lifecycle, bukan tray PowerShell lama. Pertahankan pengendali tunggal dan tunnel yang sudah hidup.

Penerapan memerlukan jalur eksekusi yang sah. Jangan mengulang operasi yang diblokir melalui encoding, tool, atau pemecahan perintah lain untuk melewati pemeriksaan. Jangan mengambil alih ACL lama dengan eskalasi tak sah.

Kandidat OAuth ketat jangan diterapkan sendirian pada direktori lama yang menolak replacement. Perpindahan data terverifikasi/pemulihan izin yang sah harus berjalan dalam cutover yang sama. Buktikan credential identik, audit sequence/hash kontinu dan rotasi berhasil, sebelum mengaktifkan pointer dan melakukan restart terkontrol. Jangan rollback ke credential lama setelah ada grant baru pada generasi aktif.

Worktree berisi overlay pekerjaan lain; jangan `git add .`, commit seluruhnya, atau menyalin seluruh src/dist. Hanya enam file source dan tujuh file tes berada pada patch hasil perbaikan.

Pemulihan penuh memerlukan audit produksi kembali menulis, restart sehat, sinkronisasi action host, dan pengujian dua chat ChatGPT nyata. Simulasi dua klien SDK bukan bukti pengujian dua chat nyata.

**Jangan menyatakan “sudah stable” sampai gate produksi dan host benar-benar terverifikasi.**
