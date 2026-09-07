# Agent Core — Hasil Pengerjaan Perbaikan Koneksi

Tanggal: 6 September 2026, Asia/Jakarta.
Status: **KANDIDAT DIPERBAIKI DAN TERVERIFIKASI; PENERAPAN PRODUKSI TERBLOKIR.**

Dokumen ini melanjutkan, bukan menghapus, review `reports/connection-review-20260906/Agent-Core-Connection-Review-2026-09-06.md`. Status lama “kandidat belum diterapkan” tetap benar. Perubahan sesi ini memperkuat kandidat dan diagnosis; bukan deployment yang selesai.

## 1. Ringkasan hasil dan batasnya

Pengguna telah menyetujui seluruh rekomendasi perbaikan, termasuk penerapan terkontrol. Akses langsung Agent Core dicoba kembali dan ditolak host percakapan dengan `FORBIDDEN: This conversation does not support developer MCPs`. Jalur pemeliharaan Remote Desktop Commander berhasil menjangkau mesin Windows `archi` dan proyek `E:\Projects\Agent-Core`.

Melalui jalur tersebut, source/kandidat, health metrics, izin efektif file, pengendali proses, dan hasil uji diperiksa. Kandidat OAuth diperkuat untuk koordinasi lintas proses dan kegagalan penyimpanan. Mekanisme pemilihan area penyimpanan runtime yang sudah diverifikasi ditambahkan agar perpindahan data dapat dilakukan tanpa mengubah identitas autentikasi atau membangun ulang aplikasi native.

**Penerapan otomatis kemudian diblokir pemeriksaan keamanan alat.** Tidak dilakukan percobaan menjalankan tindakan penerapan yang sama melalui cara lain. Pemeriksaan baca-saja sesudah penolakan memastikan script cutover tidak dibuat, manifest pemilihan belum ada, server dan tunnel tidak direstart, serta source produksi yang dipantau tetap sama.

| Bagian | Hasil sesi ini |
|---|---|
| Diagnosis audit `EPERM` | Bukti izin efektif dan reproduksi sintetis mengonfirmasi faktor ACL |
| Bug OAuth sesi/proses bersamaan | Kandidat diperbaiki dan diuji |
| Kegagalan atomic replacement OAuth | Kandidat menolak kegagalan tanpa overwrite langsung |
| Pemilihan runtime hasil pemulihan | Kandidat ditambahkan dengan validasi fail-closed |
| Pengujian kandidat | **71/71 tes terfokus lulus**, build dan typecheck lulus |
| Patch yang dapat diaudit | Diekspor; `git apply --check` lulus, tanpa diterapkan |
| Audit produksi, perpindahan data, restart | **Belum dilaksanakan** |
| Pemanggilan Agent Core dari percakapan ini | Ditolak host; belum dipulihkan |
| Ketidaksamaan daftar alat konektor | Temuan review sebelumnya belum terselesaikan di host |

## 2. Penyebab audit yang kini didukung bukti

Pada proses dengan identitas Windows yang sama dengan server, pemeriksaan handle file tanpa mengubah isinya menunjukkan:

| Hak yang diminta | File audit aktif, audit head, dan OAuth lama |
|---|---|
| `WRITE_DATA` | Diizinkan |
| `DELETE` | Ditolak, Win32 error 5 |
| `WRITE_DAC` | Ditolak, Win32 error 5 |

Pemilik file berasal dari SID lama yang berbeda dari SID pengguna aktif. Proses berjalan non-elevated. Source audit melakukan `rename` ketika file aktif melewati batas rotasi; izin menulis isi saja tidak cukup untuk semua operasi penggantian/rotasi file.

Reproduksi menggunakan file sintetis milik proses, dengan DACL efektif yang meniru file lama: rename gagal dengan `UnauthorizedAccessException`. Setelah DACL file sintetis tersebut diberikan kepada pemilik aktif, rename berhasil. File probe dihapus setelah pengujian. **ACL dan pemilik file produksi tidak diubah.** Bukti utama: `effective-file-access.json` dan `audit-acl-confirmed.json`.

Probe awal yang memakai pewarisan ACL secara tidak setara sempat berhasil rename; hasil itu bukan bukti perbaikan. Reproduksi akhir mengendalikan pewarisan dan menguji ulang hak efektif. Dokumen ini menggunakan hasil akhir, bukan menutupi hasil awal.

Audit yang tersimpan masih memiliki rantai valid: 28.608 record, sequence 1–28.608, head hash `cb2087b1b54ac7b565acdb9ad41280d9a1be7c5cde37f46fdeca5bd59cc357fe`. Entri terakhir tetap 6 September 2026 pukul 00:50:02.873 WIB. Hitungan kegagalan tulis meningkat dari 909 menjadi setidaknya 1.160 selama pemeriksaan; ini penghitung percobaan tulis yang gagal, bukan jumlah insiden login pengguna.

**Tidak ada bukti baru yang cukup untuk menjelaskan seluruh kejadian “hilang setelah satu kali akses” dengan satu penyebab tunggal.** Bug OAuth, ACL penyimpanan, ketersediaan alat host, dan penolakan developer MCP adalah lapisan berbeda.

## 3. Perbaikan source pada kandidat

Lokasi kandidat: `E:\Projects\Agent-Core\.worktrees\connection-review-20260906`.
Branch: `fix/oauth-concurrency-review-20260906`.

`src/oauth/store.ts` dan `src/oauth/service.ts` mempertahankan perbaikan review sebelumnya: operasi file diserialkan dalam proses; satu authorization code/refresh token tidak dapat dikonsumsi dua kali secara bersamaan; konsumsi grant dan penerbitan pengganti disimpan sebagai satu snapshot.

`src/oauth/file-lock.ts` menambahkan koordinasi lintas proses. SQLite bawaan Node digunakan **hanya sebagai kunci antarproses**, tanpa tabel atau payload credential/memori. Penantian `BUSY` dibatasi dan dilakukan dengan jeda asinkron. Antrean dalam proses tetap ada. Lock diuji dapat dilepas setelah callback gagal dan setelah proses pemegang lock dihentikan pada pengujian sintetis. Ini tidak membuat otoritas memori kedua.

`src/oauth/atomic-file.ts` menulis snapshot ke file sementara, melakukan sinkronisasi file, lalu rename. Bila rename gagal, operasi ditolak; **tidak** dilanjutkan dengan menimpa file credential lama secara langsung. Tes memastikan snapshot lama tetap identik. Ini bukan klaim sertifikasi seluruh skenario listrik padam atau kegagalan media penyimpanan.

`src/runtime/persistence-paths.ts` dan perubahan terbatas pada `src/config.ts` membaca pointer pemulihan `runtime/persistence.json`. Pointer memilih generasi penyimpanan di bawah proyek dan memvalidasi direktori, file wajib, format, serta batas path/symlink. Pointer rusak atau generasi tidak lengkap menyebabkan penolakan startup, bukan diam-diam membuat identitas kosong. Path launcher lama diarahkan hanya ketika cocok dengan default lama; override shadow yang eksplisit tetap dipertahankan.

**Jangan menerapkan OAuth ketat sendirian pada direktori lama yang belum memiliki hak replacement.** Perpindahan data terverifikasi atau pemulihan izin yang sah harus menjadi bagian penerapan yang sama. Kalau tidak, operasi OAuth dapat ditolak saat save, meskipun penolakan itu menjaga snapshot lama.

## 4. Bukti pengujian

| Gate | Hasil |
|---|---|
| Tes tambahan sebelum implementasi | 10 tes: **8 kegagalan yang diharapkan**, 2 lulus |
| Gate kandidat setelah perbaikan awal | 69/69 lulus |
| Gate akhir, diulang setelah paket diperiksa | **71/71 lulus** |
| Build TypeScript kandidat | Lulus |
| Typecheck kandidat `--noEmit` | Lulus |
| Scoped diff check | Lulus; peringatan line ending Git bukan kegagalan tes |
| Patch dry-run terhadap source produksi | Lulus; tidak menjalankan `git apply` aktual |
| Verifikasi produksi setelah tindakan diblokir | Source dipantau tidak berubah; marker tidak ada; PID sama |

Skenario meliputi delapan penerbitan token serentak, dua konsumsi credential yang sama, kegagalan save sebelum penggantian, empat proses Node yang menerbitkan total 32 token, batas waktu lock, kematian proses pemegang lock, pemilihan runtime fail-closed, serta dua klien MCP legacy/modern dengan peer close, refresh, dan reconnect. Credential pengujian sintetis, bukan grant login produksi.

Tujuh file regresi: `oauth-concurrency-review`, `oauth-atomic-exchange-review`, `mcp-multiclient-review`, `persist-selection-repair`, `oauth-rename-repair`, `oauth-crossprocess-repair`, dan `oauth-lock-recovery-repair`, semuanya berakhiran `.test.ts` di folder `tests`.

Tes lintas proses mengimpor hasil build kandidat; build harus dijalankan sebelum tes tersebut. Seluruh suite repository, dua chat ChatGPT nyata, perpindahan data produksi, dan soak sesudah restart **belum** disertifikasi.

## 5. Kondisi produksi setelah percobaan penerapan diblokir

Pemeriksaan pada 6 September 2026 pukul 02:52:47 WIB memastikan server PID 10688 dan tunnel PID 7740 masih sama. Pengendali tetap `Agent Code Native.exe`, bukan tray baru. Database memori dan execution sehat, tetapi kesehatan keseluruhan masih `degraded` karena audit.

`runtime/persistence-20260906` sudah dibuat sebagai direktori privat milik pengguna aktif, tetapi **masih kosong**. Tidak ada data OAuth, key, atau audit yang dipindahkan ke sana. `runtime/persistence.json`, script cutover, dan laporan keberhasilan cutover tidak ada. Tidak ada reset OAuth, perubahan `.env`, penggantian resource identity, penghapusan log lama, atau restart produksi.

File yang diverifikasi tetap identik dengan baseline: `src/config.ts`, `src/index.ts`, `src/oauth/store.ts`, `src/oauth/service.ts`, dan `src/observability/audit-journal.ts`. Source kandidat dan laporan memang berubah; jangan menyamakan “source produksi tidak berubah” dengan “tidak ada pekerjaan yang dilakukan”.

## 6. Penerapan yang masih tertunda

Rencana yang disimpan adalah menghentikan hanya service yang dimiliki pengendali native melalui lifecycle resminya, menyalin data yang dapat dibaca ke area runtime privat baru, membuktikan hash credential dan kontinuitas audit sama, memverifikasi rotasi di lokasi baru, menerapkan hanya file yang relevan, kemudian mempublikasikan pointer pemilihan dan memverifikasi restart. Sumber lama dipertahankan; tidak ada pengambilalihan kepemilikan file, penonaktifan keamanan, atau reset grant.

Rencana tersebut **tidak dieksekusi** sesudah penolakan alat. Jangan menyimpulkan bahwa mengulang perintah, memecahnya, atau mengubah encoding akan mendapat izin. Penolakan harus ditangani melalui jalur eksekusi/izin yang sah.

Host developer MCP adalah masalah terpisah. Tool pengelolaan yang tersedia tidak menyediakan tindakan untuk mengaktifkan dukungan developer MCP pada percakapan ini atau memperbarui snapshot semua action host. Dokumentasi OpenAI menjelaskan pengujian app pada chat baru dan pengelolaan daftar action melalui antarmuka yang sesuai dengan plan/role. Itu bukan jaminan satu perubahan menu menyelesaikan error ini.

## 7. Artefak dan petunjuk untuk sesi berikutnya

Folder hasil: `E:\Projects\Agent-Core\reports\connection-repair-20260906`.

File utama: laporan ini, `implementation-plan.md`, `final-status.json`, `baseline-hashes.json`, `effective-file-access.json`, `audit-acl-confirmed.json`, `audit-chain-before.json`, `red-new-tests.json`, `green-final-tests.json`, `candidate-files.json`, `candidate-files/`, dan `agent-core-connection-repair-candidate.patch`.

Worktree kandidat berisi overlay pekerjaan lama yang bukan seluruhnya milik perbaikan ini. **Jangan commit/push seluruh worktree atau mengganti seluruh source/dist produksi.** Patch hanya memuat enam file source yang relevan dan tujuh file regresi. Tidak ada commit/push yang dilakukan pada sesi ini.

Checkpoint DMF belum diperbarui pada sesi ini karena pemanggilan Agent Core ditolak. File laporan/runbook adalah handoff yang berhasil disimpan. Jangan menyatakan memori Agent Core telah menerima status terbaru tanpa readback nyata.

## 8. Referensi

Bukti utama adalah source dan artefak tes lokal. Nomor, hash, dan status runtime tidak diambil dari sumber web.

Microsoft, File security and access rights, terutama perbedaan generic write, DELETE, WRITE_DAC, token proses, serta pewarisan ACL: https://learn.microsoft.com/en-us/windows/win32/fileio/file-security-and-access-rights

OpenAI, Developer mode and MCP apps in ChatGPT, terutama pengujian pada chat baru, pengelolaan action, frozen snapshot, dan kontrol keamanan tindakan: https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt-beta

**Status penutup: kandidat terverifikasi; deployment belum dilakukan; audit produksi dan koneksi developer MCP belum dapat dinyatakan stabil.**
