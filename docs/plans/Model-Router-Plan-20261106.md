# Rencana: Model Router Agent Core

Tanggal: 2026-11-06. Status: OPEN, aktif. Revisi: 2, sesudah kritik Fable yang diverifikasi supervisor ke source. Pemilik: sesi supervisor (Opus 5.5). Pekerja: Fable 5.1, Sonnet 5.5, Haiku 5.5.

Dokumen ini satu-satunya sumber urutan kerja router. Status implementasi aktual tetap di `docs/CODEBASE.md`. Roadmap penggantian Hermes ditunda.

## Tujuan

Agent Core menjadi satu-satunya router model di mesin ini, sehingga router lain tidak perlu berjalan. Pengguna memuat kunci dari `.env` secara otomatis, menguji kunci untuk melihat model yang tersedia, memilih model, lalu memantau pemakaian, cache, kuota, dan biaya.

## Definisi selesai

1. Kunci di `.env` dikenali otomatis dan tersimpan terenkripsi. Tidak ada kunci yang tampil di UI, log, atau hasil tool.
2. Tombol test pada satu provider menampilkan daftar model milik kunci itu.
3. Klien lokal memanggil router dengan API kompatibel OpenAI dan Anthropic, termasuk streaming sungguhan, dan permintaannya sampai ke provider tanpa diubah selain daftar transformasi yang tertulis di bawah.
4. Setiap permintaan tercatat dengan token dan cache dari laporan provider. Log bisa diekspor ke CSV dan JSON.
5. Grafik harian, mingguan, dan bulanan menampilkan token, persentase prompt caching, kuota, dan biaya. Peringatan muncul saat kuota mendekati batas.
6. Akses ke API router dan dashboard memerlukan autentikasi. OAuth 2.0 tersedia lewat owner yang ada.
7. Satu klien nyata terbukti berjalan penuh lewat router.

## Keputusan desain dan koreksi atas brief

### Mesin routing

- **Proxy transparan, bukan `complete()`.** `OpenAICompatibleProvider.complete()` milik Native: ia memaksa `thinking`, `anthropic-beta`, `tool_choice`, dan `max_tokens`, membuang gambar pada jalur OpenAI, membatasi jumlah tool call, serta menyusun ulang stream sebelum kembali. Router tidak memakainya. Body klien diteruskan utuh dan SSE dialirkan apa adanya.
- **Transformasi yang boleh, hanya ini:** kredensial ditukar; alias model diganti ke nama provider; `stream_options.include_usage` disisipkan pada jalur OpenAI bila klien tidak memintanya, dan frame usage tambahan itu tidak diteruskan ke klien; prompt caching disisipkan hanya bila kebijakan klien itu menyalakannya. Selain ini, body yang diterima provider harus identik dengan body klien, dan tes membuktikannya.
- **Reuse tetap:** `PersistentCredentialScheduler`, `classifyAgentProviderFailure`, `observeProviderResponse`, `fetchWithPolicy`, `buildOwnedChildEnv`, `src/auth/key-store.ts`, `src/oauth/`, dan redaksi rahasia. Tidak ada scheduler kedua.
- **Dialek per provider adalah data registri.** Endpoint OpenAI hanya menuju provider berdialek OpenAI, dan endpoint Anthropic hanya menuju provider berdialek Anthropic. Permintaan lintas dialek ditolak dengan pesan jelas. Penerjemah lintas dialek tidak dibangun dulu karena ia mengembalikan masalah yang sama dengan `complete()`; ditinjau sesudah fase 8 bila klien nyata membutuhkannya.
- **Header ditapis dengan daftar izin.** Kunci klien tidak pernah diteruskan ke provider. `anthropic-version` dan `anthropic-beta` milik klien diteruskan. Header respons yang boleh sampai ke klien juga ditapis. Tujuan permintaan hanya dari `baseUrl` registri, tidak pernah dari input klien.
- **Failover hanya sebelum byte pertama sampai ke klien.** Sesudah itu kegagalan diteruskan sebagai putus stream dan dicatat gagal.
- **Sukses berarti frame terminal.** `recordSuccess` pada jalur stream hanya dipanggil setelah `message_stop` atau `[DONE]` sampai ke klien. Jawaban kosong dideteksi secara struktural pada salinan stream, karena perbaikan `EMPTY_RESPONSE` hanya berlaku di jalur `complete()`.
- **Batas sendiri.** `MAX_PROVIDER_POOL_ATTEMPTS` dan `requestTimeoutMs` milik Native tidak dipakai. Router punya batas percobaan, ukuran body, dan waktu idle stream sendiri.
- **Tanpa rotasi diam-diam antar-model.** Failover antar-kunci mengikuti aturan yang ada. Fallback ke model lain hanya bila pengguna menyusun daftarnya sendiri, dan responsnya menyebut model yang menjawab.

### Proses dan jaringan

- **Proses anak sendiri, tetap TypeScript.** Router berjalan sebagai `dist/router/index.js` di port `AGENT_CORE_ROUTER_PORT`, dimulai launcher. Alasan utamanya pasti, bukan perkiraan: setiap rebuild atau restart Core akan memutus semua stream klien bila router menumpang proses Core. Alasan keduanya belum diukur: `DatabaseSync`, sharp, browser, dan LSP berbagi event loop dengan Core. `worker_thread` ditolak karena mati bersama Core.
- **Polyglot.** Router adalah peran orkestrator I/O dan semua owner yang dipakai ulang ada di TypeScript. Go atau Rust baru dipertimbangkan bila log nyata menunjukkan Node menjadi hambatan.
- **Tanpa jalur masuk publik, ditegakkan oleh listener.** Router selalu bind ke `127.0.0.1` dan tidak membaca `AGENT_CORE_HOST` atau `trustProxy`. Tunnel tidak mengarah ke port itu. Header `Host` selain loopback ditolak untuk menutup DNS rebinding, dan CORS tidak dibuka. Pemeriksaan alamat asal saja tidak cukup, karena lalu lintas tunnel juga datang dari loopback.
- **`Restart-Agent-Core.ps1` tidak menghentikan router secara default.** Launcher yang ditutup menghentikan keduanya. Promosi mengganti `dist` selagi router berjalan, jadi router memuat modulnya saat start dan melaporkan versinya; versi yang tertinggal terlihat di UI.

### Kredensial

- **Enkripsi, bukan hash, untuk kunci.** Kunci API harus bisa dipakai lagi, jadi hash tidak bisa menjadi penyimpanannya. Tiap kredensial memakai AES-256-GCM dengan salt dan nonce acak sendiri; kunci per-entri diturunkan dengan HKDF. Hash ber-salt (HMAC) hanya untuk sidik jari: mengenali kunci yang sama tanpa membukanya.
- **Satu pemilik kredensial sejak fase 2.** Vault dibuka di `loadConfig`, sebelum `process.loadEnvFile`, dan nilainya mengisi slot `<PROVIDER>_API_KEY_NN` yang dibaca `numberedCredentials`. Native dan router memakai jalur yang sama, jadi tidak ada masa dua sumber dan tidak ada cutover Native. Proses anak tetap tidak melihat nilainya, karena `buildOwnedChildEnv` membuang kunci sensitif.
- **Gagal yang jujur.** Vault rusak atau master key tidak terbuka: `.env` tetap dipakai seperti sekarang, status vault tampil merah di UI dan `/health`, dan tidak ada penulisan ulang vault. Sesudah pengguna menghapus nilainya dari `.env`, keadaan yang sama menjadi gagal tertutup dengan sendirinya.
- **Master key dilindungi DPAPI (lingkup user), lewat launcher.** `Agent Core.exe --dpapi-protect` dan `--dpapi-unprotect` membaca stdin dan menulis stdout; Core memanggilnya dengan `execFileSync`, siapa pun yang memulai Core. Ini menggantikan rencana PowerShell, yang berisiko diblokir Constrained Language Mode dan menambah waktu start. `ProtectedData` sudah ikut dalam build launcher. Bila exe tidak ada (kerja di Source), vault berstatus tidak tersedia dan `.env` dipakai.
- **Batas perlindungan yang jujur.** Vault mencegah terbacanya kunci saat file dibuka tidak sengaja, termasuk oleh AI, dan saat file disalin ke mesin lain. Vault tidak menghentikan proses berniat buruk yang berjalan sebagai user yang sama, karena proses itu bisa memanggil DPAPI juga.
- **`.env` hanya dibaca oleh kode, nilainya tidak pernah dikeluarkan.** Saat impor `.env` tidak diubah dan tidak dihapus. Sidik jari kunci yang dihapus pengguna dari vault disimpan, supaya impor berikutnya tidak menghidupkannya lagi. Menghapus nilainya dari `.env` adalah keputusan user sesudah vault terbukti.

### Klien dan akses

- **Kunci klien terpisah dari kunci MCP.** Router memakai `FileKeyStore` dengan folder data sendiri, jadi kunci router tidak berlaku di MCP dan sebaliknya. Pencabutan harus terlihat seketika oleh proses router.
- **"Manajemen pengguna" berarti klien router.** Agent Core dirancang untuk satu pemilik. Setiap aplikasi klien mendapat kunci atau token sendiri, dengan batas dan riwayatnya, dan bisa dicabut. Multi-akun manusia tidak dibangun.
- **OAuth 2.0 untuk akses ke router, bukan untuk masuk ke akun langganan provider.** Ini tafsir supervisor yang belum dikonfirmasi; 9router memakai OAuth untuk akun langganan, jadi user mungkin memaksudkan itu. Adapter OAuth, cookie, dan TLS-fingerprint gaya 9router tidak ditiru karena berisiko melanggar ketentuan provider. Fase 7 tidak dimulai sebelum tafsir ini dikonfirmasi. Fase ini mengubah `src/oauth/` dan `src/auth/key-store.ts` untuk menambah scope `router:*`, karena `MCP_SCOPE` sekarang tunggal.

### Data dan cache

- **Isi prompt tidak disimpan di log.** Log berisi metadata: waktu, klien, provider, model, status, durasi, token, cache. Menyimpan isi adalah opsi yang mati secara default.
- **Cache respons mati secara default.** Ini koreksi atas brief yang memintanya. Hanya untuk permintaan identik tanpa tool dan tanpa streaming, dipisah per klien dan per model, dengan TTL. Jawaban dari cache ditandai jelas. Cache yang salah terlihat seperti jawaban benar, jadi fitur ini harus diaktifkan sadar.
- **Prompt caching 1 jam adalah kebijakan per klien.** Untuk Anthropic memakai TTL 1 jam pada `cache_control`; sintaks dan harganya dicek ke dokumentasi saat implementasi. Tulis cache 1 jam lebih mahal daripada 5 menit, jadi laporan memisahkan cache-read dari cache-write. Provider lain memakai caching otomatisnya sendiri, atau ditampilkan "tidak didukung".
- **Akurasi token berasal dari laporan provider.** Bila provider tidak melapor, nilainya ditandai perkiraan atau tidak diketahui, bukan dianggap pasti.
- **Biaya.** Nilai dari provider dipakai bila dilaporkan. Selain itu dihitung dari tabel harga berupa data registri yang bertanggal dan bisa diedit, dan selalu ditandai estimasi. Model tanpa harga ditampilkan tidak diketahui.
- **Kuota.** `observeProviderResponse` hanya membaca `retry-after`, `x-ratelimit-*`, dan batas permintaan; header `anthropic-ratelimit-*` belum dibaca. Fase 6 menambah parser Anthropic dan sumber kuota per provider sebagai data registri. Provider tanpa sumber memakai batas yang diisi pengguna, dan ditandai demikian.
- **Notifikasi di halaman UI.** Launcher belum punya tray atau toast, jadi toast Windows adalah pekerjaan baru dan tidak masuk rencana ini kecuali user memintanya.

## Fase

Fase berikutnya dikirim setelah fase sebelumnya diverifikasi supervisor dari file dan tes. Kode non-trivial direview; jalur kredensial, auth, dan input juga melewati `ecc:security-reviewer`.

| # | Fase | Isi | Selesai bila | Pemegang | Status |
|---|---|---|---|---|---|
| 0 | Prasyarat | Tombol lepas kredensial, build launcher, ukur probe di Core berjalan | Tombol terbukti di launcher; `/health` terukur | Haiku, supervisor | Berjalan |
| 1 | Mesin routing | Proses `src/router/`, `/router/v1/chat/completions`, `/router/v1/messages`, `/router/v1/models`, proxy dan SSE, kunci klien, failover antar-kunci, registri provider sebagai data | Body di provider identik kecuali transformasi tertulis; klien menerima event pertama sebelum provider selesai; tanpa kunci klien ditolak; lintas dialek ditolak; `Host` asing ditolak; putus di tengah stream tidak tercatat sukses; restart Core tidak memutus stream | Fable, registri oleh Haiku | Belum |
| 2 | Vault | Vault AES-256-GCM, master key DPAPI lewat launcher, impor `.env`, pengisian slot di `loadConfig` | Native dan router jalan dari vault; file vault tidak memuat nilai kunci; vault rusak dilaporkan dan `.env` tetap jalan; kunci yang dihapus tidak terimpor lagi | Fable | Belum |
| 3 | Setup provider dan test | Tab Providers di halaman Router, tombol test per provider, daftar model penuh per kunci, pilih model | Test menampilkan model nyata, termasuk daftar Anthropic penuh yang kini hanya cek satu model; kegagalan menjelaskan penyebab tanpa membocorkan kunci | Sonnet | Belum |
| 4 | Riwayat permintaan | Penyimpanan metadata, token dan cache per permintaan dari salinan stream, retensi, ekspor CSV dan JSON, pemantauan langsung | Angka token sama dengan laporan provider; ekspor aman dari formula injection; tidak ada isi prompt atau kunci | Sonnet | Belum |
| 5 | Caching | Prompt caching 1 jam per klien, cache respons opsional | Tes menunjukkan token cache-read pada permintaan kedua; hit cache respons terbukti saat aktif, ditandai, dan terpisah per klien | Fable | Belum |
| 6 | Analitik, kuota, biaya | Grafik interaktif harian, mingguan, bulanan; persentase prompt caching; parser header Anthropic; tabel harga; notifikasi mendekati batas | Grafik memakai data riwayat nyata; sumber kuota dan biaya tertulis per provider; notifikasi muncul sekali per ambang; bisa dipakai keyboard | Sonnet | Belum |
| 7 | Admin dan OAuth | Kelola klien router, pencabutan, batas per klien, scope `router:*` di `src/oauth/` | Tafsir OAuth dikonfirmasi user; klien yang dicabut langsung ditolak; token berscope router tidak bisa memanggil tool MCP | Fable | Belum |
| 8 | Cutover klien | Klien nyata dialihkan, konfigurasi router lama dibersihkan | Definisi selesai terbukti; rollback tertulis | Supervisor | Belum |

Haiku memegang tugas sempit di tiap fase: registri provider (satu pemilik, Fable hanya memakainya), dokumen, dan pemeriksaan.

## Yang sengaja tidak dibangun

Multi-akun manusia, jalur masuk publik, OAuth langganan provider (menunggu konfirmasi di fase 7), penerjemah lintas dialek, toast Windows, fusion dan smart routing, serta adapter yang menyamar sebagai aplikasi lain. Combo fallback pilihan pengguna ditinjau sesudah fase 3.

## Langkah manual user

Tidak ada untuk fase 1 sampai 6 bila kunci sudah ada di `.env`. Konfirmasi tafsir OAuth sebelum fase 7. Menghapus kunci dari `.env` dan mengalihkan klien nyata diputuskan user di fase 8.

## Belum terbukti, diperiksa di fase pemiliknya

- Fase 1: apakah `PersistentCredentialScheduler` aman dipakai dua proses pada `provider-state.sqlite` tanpa status yang hanya ada di memori. Mode WAL dan `BEGIN IMMEDIATE` sudah ada, tetapi itu belum membuktikannya. Bila tidak aman, router memakai file state sendiri.
- Fase 1: apakah `FileKeyStore` melihat pencabutan lintas proses tanpa cache basi.
- Fase 2: apakah `Agent Core.exe` sebagai WinExe menulis ke stdout yang dialihkan tanpa memicu instance GUI kedua.
- Fase 3: bentuk `GET /v1/models` Anthropic. Fase 5: sintaks TTL 1 jam.

## Risiko

- `src/http/app.ts` tidak disentuh untuk jalur router karena router punya listener sendiri. `src/config.ts` dan launcher adalah titik sambung, jadi perubahannya dijaga sekecil mungkin.
- Dua proses berarti dua versi bisa berjalan bersamaan sesudah promosi; versi router harus terlihat di UI.
- DPAPI hanya Windows. Fase lintas platform di luar lingkup; vault berstatus tidak tersedia bila master key tidak terbuka.
- Biaya model bisa berjalan selama pengujian: tes otomatis memakai server tiruan, dan tes nyata dibatasi.
