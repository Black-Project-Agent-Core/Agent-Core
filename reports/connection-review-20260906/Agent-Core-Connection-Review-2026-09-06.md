# Agent Core: Review Koneksi Lintas Sesi

Tanggal: 6 September 2026, Asia/Jakarta.
Status: **INVESTIGASI DAN REVIEW SELESAI; KANDIDAT PERBAIKAN TERVERIFIKASI; BELUM DITERAPKAN KE RUNTIME PRODUKSI.**

## 1. Kesimpulan utama

Agent Core berhasil diakses berkali-kali melalui konektor dalam sesi pemeriksaan ini. Tidak ditemukan perilaku deterministik bahwa pemanggilan pertama selalu mematikan koneksi berikutnya. Namun, ditemukan beberapa masalah nyata yang tidak boleh disamakan:

| Temuan | Tingkat bukti | Status penanganan |
|---|---|---|
| Runtime mengiklankan 69 alat, tetapi konektor sesi mengekspos 55 | Diamati langsung; pencarian `subagentcore` di konektor tidak menemukan alat tersebut | Perlu pemeriksaan definisi/izin alat pada sisi host; bukan alasan untuk merestart server |
| Penulisan OAuth bersamaan menghilangkan token/client yang sudah dinyatakan berhasil dibuat | Direproduksi pada source dan hasil build yang tersedia di instalasi aktif | Kandidat terisolasi diperbaiki dan lulus tes |
| Authorization code dan refresh token yang sama dapat dikonsumsi dua kali secara bersamaan | Direproduksi dengan data sintetis | Kandidat terisolasi diperbaiki dan lulus tes |
| Grant lama dibatalkan sebelum token penggantinya berhasil disimpan | Direproduksi melalui endpoint OAuth dengan kegagalan tulis yang disuntikkan | Kandidat memakai satu penyimpanan snapshot untuk konsumsi grant dan penerbitan pengganti |
| Audit journal macet dengan `EPERM` | Teramati langsung pada health metrics dan file audit | Belum diperbaiki; membatasi pembuktian insiden terbaru |
| `WORKSPACE_PROJECT_AMBIGUOUS` akibat konteks menyebut beberapa root | Terjadi langsung dalam pemeriksaan ini | Permintaan berhasil setelah konteks hanya menyebut proyek target; tidak mengubah batas keamanan |

**Tidak ada cukup bukti untuk menetapkan satu penyebab bagi seluruh kejadian “tidak terdeteksi setelah satu kali pemakaian” di sesi-sesi sebelumnya.** Bug OAuth dapat menyebabkan kehilangan akses pada kondisi yang sudah direproduksi. Ketidaksamaan daftar alat dapat menyebabkan alat tertentu tidak tersedia. Akan tetapi, hubungan keduanya dengan setiap insiden pengguna masih perlu korelasi pada kejadian nyata; pencatatan audit saat ini tidak lengkap.

## 2. Lingkungan dan batas pemeriksaan

Lokasi produksi: `E:\Projects\Agent-Core`.

Identitas runtime yang menjawab: Agent Core `0.7.0`, Node `v24.18.0`, autentikasi `oauth2`. Memori DMF dan execution database sehat, schema version 4. Endpoint `/health` menjawab `ok`, tetapi `/health/metrics` menunjukkan `overallHealth: degraded` karena jalur audit gagal. Jadi “database sehat” bukan berarti seluruh sistem sehat.

Git HEAD saat mulai: `6b674c1f95a677dea5cb57263bb5b8b863faff5b`, branch `main`. Working tree berisi banyak perubahan milik pekerjaan lain, termasuk OAuth service, launcher, MCP server, dan subproyek. HEAD saja tidak menggambarkan seluruh source yang sedang dipakai. Hash file sebelum pemeriksaan disimpan di `baseline-source-hashes.json`.

Kandidat dibuat di:

```text
E:\Projects\Agent-Core\.worktrees\connection-review-20260906
branch: fix/oauth-concurrency-review-20260906
```

Kandidat berbasis HEAD yang sama dengan overlay source/tests aktual untuk menjaga kesesuaian dengan instalasi yang diperiksa. Overlay ini bukan pekerjaan baru seluruhnya. **Jangan commit atau push seluruh isi worktree dengan `git add .` atau `git commit -am`.** Patch ekspor hanya memuat perubahan review pada dua file source dan tiga file tes baru.

Tidak dilakukan reset OAuth, penggantian API key, perubahan `.env`, restart produksi, penggantian source produksi, penggantian `dist` produksi, atau push GitHub. Tidak ada credential produksi yang dimasukkan dalam laporan. Pengujian token hanya memakai penyimpanan sementara dan credential sintetis yang dihapus setelah pengujian.

## 3. Temuan code review

### F1. P1: OAuth mengalami lost update pada read-modify-write bersamaan

Lokasi source sebelum patch: `src/oauth/store.ts:113-129`, `132-153`, `221-243`.

Setiap operasi membaca `oauth.json`, mengubah snapshot di memori, kemudian menyimpannya. Tidak ada antrean/lock yang melindungi seluruh rangkaian tersebut. Mengganti file dengan `rename` tidak menyelesaikan masalah dua permintaan yang membaca snapshot lama yang sama.

Contoh kausal:

```text
A membaca snapshot S                 B membaca snapshot S
A menambahkan token A                B menambahkan token B
A menyimpan S+A                      B menyimpan S+B
A sudah melaporkan sukses            Token A hilang dari snapshot terakhir
```

Probe terhadap `dist/oauth/store.js` pada instalasi aktif, dengan direktori sementara, diulang tiga kali. Pada setiap putaran, delapan penerbitan token selesai, tetapi hanya satu token masih dapat diverifikasi sesudahnya. Tes pada source menunjukkan pendaftaran client melalui dua instance store dengan file yang sama juga kehilangan tujuh dari delapan hasil pendaftaran.

Dampak yang terbukti: hasil penerbitan yang sukses tidak menjamin credential tetap dikenal sesudah penulisan bersamaan. Ini merupakan mekanisme yang masuk akal untuk akses yang kemudian ditolak. Belum terbukti bahwa semua insiden pengguna melewati kondisi paralel ini.

Perbaikan kandidat: antrean per resolved file path yang dibagi antar-instance dalam satu proses Node, mencakup pembacaan dan penulisan public API. Antrean tetap dapat dipakai setelah operasi gagal dan dibersihkan setelah tidak ada pekerjaan tertunda.

### F2. P1: pemeriksaan dan konsumsi credential sekali pakai tidak indivisibel

Lokasi: `src/oauth/store.ts:195-217` dan `258-276`.

Pemeriksaan `usedAt`/`revokedAt` serta penulisan status konsumsi berjalan tanpa eksklusi. Dua pemanggilan serentak sama-sama melihat credential belum dipakai. Tes menunjukkan authorization code yang sama diterima dua kali, dan refresh token yang sama juga diterima dua kali.

Kandidat menempatkan validasi, perubahan status, dan persistensi dalam antrean yang sama. Hasil setelah perbaikan: tepat satu konsumsi berhasil, yang lain ditolak. Perbaikan ini tidak menonaktifkan expiry, resource binding, client binding, PKCE, atau pemeriksaan penggunaan ulang. Memperpanjang token tanpa batas atau menerima kembali token revoked bukan solusi yang digunakan. Prinsip pembatasan resource dan perlindungan refresh token juga sejalan dengan pembahasan RFC 9700 [R1].

### F3. P1: celah antara membatalkan grant dan menyimpan penggantinya

Lokasi: `src/oauth/service.ts:287-295`, `308-328`.

Sebelum patch, service melakukan `consumeRefreshToken` atau `consumeCode`, yang menyimpan status pembatalan/konsumsi, lalu memanggil `issueTokens`, yang menyimpan token baru secara terpisah. Bila penulisan kedua gagal, grant lama sudah tidak dapat digunakan dan pengganti tidak berhasil diterbitkan.

Tes melalui endpoint HTTP OAuth menyuntikkan kegagalan tepat sebelum menyimpan snapshot yang mengandung token baru. Hasil sebelum patch: HTTP 500 dan grant lama sudah hilang kegunaannya. Hasil kandidat: HTTP 500, tetapi grant lama masih tersedia untuk percobaan ulang.

Kandidat menambahkan `exchangeRefreshToken` dan `exchangeAuthorizationCode`; service menggunakan operasi tersebut agar konsumsi grant dan token pengganti berada dalam satu snapshot penyimpanan. **Bukti ini adalah kegagalan sebelum penggantian file, bukan sertifikasi tahan listrik padam atau seluruh kemungkinan kerusakan filesystem.**

### F4. P1: audit journal tidak merekam aktivitas baru

Bukti snapshot pada 6 September 2026 pukul 01:56:22 WIB:

```text
written           0
writeErrors       290
lastWriteErrorCode EPERM
sequence          28608
currentFileBytes  16776968
rotatedFiles      0
```

Entri tersimpan terakhir: **6 September 2026 pukul 00:50:02.873 WIB**. File berukuran mendekati 16 MiB. Source `src/observability/audit-journal.ts:501` menjalankan rotasi ketika penambahan entri melebihi batas ukuran; `:527-531` melakukan `rename` pada file aktif. Kombinasi ini mengarahkan pemeriksaan berikutnya pada rotasi dan izin/locking filesystem. Penyebab spesifik `EPERM`, misalnya ACL efektif, handle yang mengunci file, atau perangkat lunak keamanan, belum dibedakan secara definitif.

Log tersimpan memuat 2.427 respons `/mcp` HTTP 200, 44 respons `/mcp` HTTP 401, dan 21 respons `/oauth/token` HTTP 200. Ini adalah hitungan respons pada cakupan log yang tersedia, **bukan** jumlah insiden autentikasi yang sudah dianalisis. HTTP 401 dapat pula terjadi dalam alur penemuan autentikasi. Log tidak mencatat alasan rinci token ditolak, dan gap audit mencakup aktivitas pemeriksaan ini.

Perbaikan lanjutan yang diperlukan: uji rotasi pada file sintetis dengan identitas proses yang sama, pastikan izin rename/delete yang dibutuhkan, periksa penguncian file, dan sertifikasi sequence/hash continuity setelah rotasi. Jangan menghapus audit, mengubahnya menjadi kosong, membuka izin untuk semua pengguna, atau mematikan kontrol keamanan sebagai jalan pintas.

### F5. P2: daftar alat runtime dan konektor tidak sama

`agent_core_capabilities` pada runtime mengiklankan 67 nama `tool.*`; dengan `agent_core_status` dan `agent_core_capabilities` jumlahnya 69. Definisi konektor yang tersedia dalam sesi berisi 55 alat. Empat belas alat yang tidak terdapat dalam definisi konektor itu adalah sembilan alat Langflow, tiga operator-directive, `memory_remember_more`, dan `subagentcore`.

Pemeriksaan khusus discovery `subagentcore` mengembalikan tidak ada hasil, sedangkan runtime mengiklankannya. **Discrepancy ini terkonfirmasi; cache/snapshot lama atau pemfilteran/izin host adalah penjelasan kandidat, belum diagnosis host yang pasti.**

Dokumentasi OpenAI menjelaskan bahwa pada aplikasi MCP workspace yang telah disetujui, daftar tool/input dapat memakai snapshot yang tidak berubah otomatis saat server diperbarui [R2]. Karena konfigurasi akun/aplikasi pengguna belum diaudit, jangan mengasumsikan mekanisme atau menu yang persis sama tanpa pemeriksaan.

Tindakan tepat adalah membandingkan definisi/izin alat dan melakukan scan/refresh/review metadata melalui fasilitas host yang tersedia. Jangan menganggap server mati hanya karena satu alat baru belum masuk daftar. Pada setiap sesi, lakukan discovery dan panggil status sebelum menyatakan konektor tidak terhubung.

### F6. P2: routing ambigu bukan kegagalan koneksi

Lokasi: `src/runtime/workspace.ts:67-105`.

Resolver menggabungkan explicit root, candidate paths, dan kemunculan root dalam teks. Permintaan pemeriksaan yang menyebut tiga root sekaligus ditolak dengan `WORKSPACE_PROJECT_AMBIGUOUS`, meskipun menyertakan `projectRoot`. Setelah konteks hanya menyebut `E:\Projects\Agent-Core`, routing berhasil.

Perbaikan operasional yang telah terbukti: nyatakan proyek target secara eksplisit dan jangan mencampurkan root lain sebagai bukti tujuan dalam permintaan yang sama. Batas keamanan resolver tidak diubah. Perubahan prioritas explicit root perlu dirancang dan diuji terpisah agar tidak melemahkan isolasi proyek.

## 4. Hal yang tidak boleh disalahdiagnosis

`src/mcp/handler.ts:50` menggunakan `sessionIdGenerator: undefined`; server/transport per request memang ditutup pada `:69-70` dan `:120-121`. Itu bukan bukti bahwa runtime global atau seluruh sesi pengguna ditutup. MCP mengizinkan session management opsional [R3]. Dalam pengujian kandidat, dua klien independen tetap dapat memanggil alat berkali-kali, satu klien ditutup tanpa mematikan yang lain, token diperbarui, lalu klien baru berhasil terhubung. Skenario ini diuji pada protokol legacy dan modern.

Ini adalah simulasi klien MCP independen, **bukan** pengujian otomatis dua percakapan ChatGPT yang benar-benar baru.

Masalah historis protected-resource identity juga tidak diasumsikan sebagai penyebab saat ini. Metadata live menunjukkan resource secure tunnel; token aktif yang belum kedaluwarsa cocok dengan resource tersebut. Tray memiliki resolver dan penerusan `AGENT_CORE_OAUTH_PROTECTED_RESOURCE_URL` pada `scripts/windows/agent-core-tray.ps1:474-498,542`. Temuan ini tidak menjamin semua konfigurasi launcher di mesin lain benar, tetapi menolak kesimpulan bahwa variabel tersebut pasti hilang pada runtime yang sedang menjawab.

Dokumen handoff Cross-Session Memory dan Memory Observatory digunakan sebagai konteks historis, bukan bukti implementasi atau kesehatan runtime terbaru. Program memori/Observatory tidak dilanjutkan atau diganti dalam review koneksi ini.

## 5. Hasil verifikasi

| Pemeriksaan | Hasil |
|---|---|
| Baseline OAuth, HTTP auth, MCP integration, dual-era | 33/33 PASS |
| Tes baru sebelum patch: concurrency dan kegagalan exchange | 7 FAIL yang diharapkan, 2 PASS |
| Kandidat: baseline + tes baru + dua skenario multiklien | 44/44 PASS |
| Probe build lama, 3 putaran | Masing-masing 1/8 token valid; konsumsi refresh yang sama 2 kali |
| Probe hasil build kandidat, 3 putaran | Masing-masing 8/8 token valid; konsumsi refresh yang sama tepat 1 kali |
| TypeScript `--noEmit` di kandidat | PASS |
| Build TypeScript di worktree kandidat | PASS |
| `git diff --check` terbatas pada dua file source kandidat | PASS |
| `git apply --check` patch terhadap working tree produksi, tanpa menerapkannya | PASS |
| Seluruh suite repository, beban jangka panjang, restart produksi, dua chat nyata | TIDAK diuji/disertifikasi |

Tidak ada klaim bahwa seluruh repository bebas kegagalan atau sistem sudah stabil sepenuhnya.

## 6. Batas kandidat dan gate sebelum produksi

Antrean baru hanya menyinkronkan satu proses Node dan instance dengan resolved path yang sama. Ia bukan lock lintas proses atau lintas alias/symlink. CLI/reset dari proses lain harus tetap mengikuti aturan kepemilikan runtime. Impor client dari store lain juga memerlukan pemeriksaan konsistensi jika diizinkan berjalan bersamaan.

`src/runtime/persistent-file.ts:11-18` masih memiliki fallback overwrite langsung setelah rename gagal dengan EPERM/EACCES/EBUSY. Kandidat tidak mensertifikasi crash-safety fallback ini. Kehilangan respons HTTP setelah commit yang sebenarnya sukses juga tidak otomatis membuat raw token pengganti dapat dikirim ulang. Hal-hal tersebut memerlukan kebijakan recovery tersendiri, tanpa membocorkan atau menyimpan raw token sembarangan.

Sebelum cutover: pulihkan audit yang andal; pastikan satu writer atau tambahkan koordinasi lintas proses yang diuji; review fallback persistensi; verifikasi hash baseline masih sesuai; terapkan hanya patch terbatas; jalankan ulang regresi dan build; lakukan restart terkontrol; kemudian uji dua chat nyata, penutupan salah satu chat, refresh, dan koneksi ulang sambil mengamati log baru. Jangan menganggap restart biasa otomatis mengaktifkan kandidat di worktree ini.

## 7. Artefak dan cara melanjutkan

Direktori laporan pada PC:

```text
E:\Projects\Agent-Core\reports\connection-review-20260906
```

Isi penting: laporan ini, `diagnostics.json`, `source-findings.txt`, `baseline-source-hashes.json`, `baseline-tests.json`, `red-concurrency-tests.json`, `red-atomic-exchange-tests.json`, `green-tests.json`, `compiled-live-red.json`, `compiled-candidate-green.json`, `oauth-concurrency-candidate.patch`, serta tiga file regression test dalam `tests`.

Probe aman berikut tidak menggunakan grant produksi; ia mengimpor implementasi yang dipilih dan membuat data sintetis di direktori sementara:

```powershell
Set-Location 'E:\Projects\Agent-Core'
node reports\connection-review-20260906\probe-oauth-concurrency.mjs dist\oauth\store.js
```

Pada build produksi yang diperiksa, exit code 1 memang diharapkan karena bug masih ada. Kandidat dapat diperiksa dengan mengganti argumen modul menjadi `.worktrees\connection-review-20260906\dist\oauth\store.js`.

Panduan sesi baru disimpan sebagai `docs\agent-core-connection-troubleshooting.md`. Urutan wajib diagnosis adalah **discovery → status nyata → kesehatan rinci → autentikasi → scope/routing → bukti log → kesimpulan**. Tidak ada klaim tidak terhubung tanpa upaya tool yang nyata.

## 8. Referensi

Bukti utama berasal dari source dan hasil pengujian lokal; path dan nomor baris merujuk snapshot sebelum patch. `diagnostics.json` adalah snapshot observasi tersanitasi, bukan ekspor credential atau seluruh riwayat log.

[R1] IETF, RFC 9700, terutama 2.2.2 dan 4.14: https://www.rfc-editor.org/info/rfc9700/

[R2] OpenAI, Developer mode and MCP apps in ChatGPT, bagian pembaruan tool dan frozen snapshot, diperiksa 6 September 2026: https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt-beta

[R3] Model Context Protocol, Streamable HTTP transport dan session management opsional: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports

Pencarian plugin bernama persis `Idea Generator` tidak menemukan kecocokan dalam katalog yang tersedia. Pengujian dan review ini dijalankan melalui Agent Core, bukan dengan mengklaim kolaborasi dari plugin yang tidak berhasil ditemukan.
