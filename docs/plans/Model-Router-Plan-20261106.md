# Rencana: Model Router Agent Core

Tanggal: 2026-11-06. Status: OPEN, aktif. Revisi: 1, belum ditantang Fable. Pemilik: sesi supervisor (Opus 5.5). Pekerja: Fable 5.1, Sonnet 5.5, Haiku 5.5.

Dokumen ini satu-satunya sumber urutan kerja router. Status implementasi aktual tetap di `docs/CODEBASE.md`. Roadmap penggantian Hermes ditunda.

## Tujuan

Agent Core menjadi satu-satunya router model di mesin ini, sehingga router lain tidak perlu berjalan. Pengguna memuat kunci dari `.env` secara otomatis, menguji kunci untuk melihat model yang tersedia, memilih model, lalu memantau pemakaian, cache, kuota, dan biaya.

## Definisi selesai

1. Kunci di `.env` dikenali otomatis dan tersimpan terenkripsi. Tidak ada kunci yang tampil di UI, log, atau hasil tool.
2. Tombol test pada satu provider menampilkan daftar model milik kunci itu.
3. Klien lokal memanggil router dengan API kompatibel OpenAI dan Anthropic, termasuk streaming, dan jawabannya sampai.
4. Setiap permintaan tercatat dengan token dan cache dari laporan provider. Log bisa diekspor ke CSV dan JSON.
5. Grafik harian, mingguan, dan bulanan menampilkan token, persentase prompt caching, dan kuota. Peringatan muncul saat kuota mendekati batas.
6. Akses ke API router dan dashboard memerlukan autentikasi. OAuth 2.0 tersedia lewat owner yang ada.
7. Satu klien nyata terbukti berjalan penuh lewat router.

## Keputusan desain dan koreksi atas brief

- **Enkripsi, bukan hash, untuk kunci.** Kunci API harus bisa dipakai lagi, jadi hash tidak bisa menjadi penyimpanannya. Tiap kredensial memakai AES-256-GCM dengan salt dan nonce acak sendiri; kunci per-entri diturunkan dengan HKDF. Hash ber-salt (HMAC) hanya untuk sidik jari: mengenali kunci yang sama tanpa membukanya.
- **Master key dilindungi DPAPI Windows (lingkup user), disimpan terpisah dari vault.** Tanpa dependensi native: dibuka sekali saat start lewat proses PowerShell, nilainya lewat stdin, bukan argumen.
- **Batas perlindungan yang jujur.** Vault mencegah terbacanya kunci saat file dibuka tidak sengaja, termasuk oleh AI, dan saat file disalin ke mesin lain. Vault tidak menghentikan proses berniat buruk yang berjalan sebagai user yang sama, karena proses itu bisa memanggil DPAPI juga.
- **`.env` hanya dibaca oleh kode, nilainya tidak pernah dikeluarkan.** Saat impor `.env` tidak diubah dan tidak dihapus. Menghapus nilainya dari `.env` adalah keputusan user sesudah vault terbukti.
- **Satu pemilik kredensial, bertahap.** Router memakai vault sejak awal. Native tetap memakai `.env` sampai fase cutover, supaya kegagalan router tidak mematikan Native. Kredensial memang punya dua sumber selama masa itu; ini sengaja dan berakhir di fase 8.
- **Reuse.** `fetchWithPolicy`, `classifyAgentProviderFailure`, `PersistentCredentialScheduler`, `provider_quota_state`, `src/auth/key-store.ts`, `src/oauth/`, dan redaksi rahasia yang sudah ada dipakai ulang. Tidak ada scheduler kedua.
- **Polyglot: TypeScript di proses Core.** Router adalah peran orkestrator I/O, dan semua owner yang dipakai ulang ada di TypeScript. Go atau Rust baru dipertimbangkan bila pengukuran dari log nyata menunjukkan Core menjadi hambatan. DPAPI lewat PowerShell karena hanya dipakai sekali saat start.
- **Tanpa jalur masuk publik.** API router hanya di loopback, sesuai host Core saat ini.
- **Tanpa rotasi diam-diam antar-model.** Failover antar-kunci mengikuti aturan yang ada. Fallback ke model lain hanya bila pengguna menyusun daftarnya sendiri, dan responsnya menyebut model yang menjawab.
- **"Manajemen pengguna" berarti klien router.** Agent Core dirancang untuk satu pemilik. Setiap aplikasi klien mendapat kunci atau token sendiri, dengan batas dan riwayatnya, dan bisa dicabut. Multi-akun manusia tidak dibangun.
- **OAuth 2.0 untuk akses ke router, bukan untuk masuk ke akun langganan provider.** Adapter OAuth, cookie, dan TLS-fingerprint gaya 9router tidak ditiru.
- **Isi prompt tidak disimpan di log.** Log berisi metadata: waktu, klien, provider, model, status, durasi, token, cache. Menyimpan isi adalah opsi yang mati secara default.
- **Cache respons mati secara default.** Hanya untuk permintaan identik tanpa tool dan tanpa streaming, dipisah per klien dan per model, dengan TTL. Jawaban dari cache ditandai jelas. Cache yang salah terlihat seperti jawaban benar, jadi fitur ini harus diaktifkan sadar.
- **Prompt caching 1 jam mengikuti kemampuan provider.** Untuk Anthropic memakai TTL 1 jam pada `cache_control` (sintaks dan harganya dicek ke dokumentasi saat implementasi). Provider lain memakai caching otomatisnya sendiri, atau ditampilkan "tidak didukung".
- **Akurasi token berasal dari laporan provider.** Bila provider tidak melapor, nilainya ditandai perkiraan atau tidak diketahui, bukan dianggap pasti. Biaya selalu ditandai estimasi.
- **Kuota.** Dari header provider bila ada (`provider_quota_state`). Bila tidak ada, dari batas yang diisi pengguna, dan ditandai demikian.

## Fase

Fase berikutnya dikirim setelah fase sebelumnya diverifikasi supervisor dari file dan tes. Kode non-trivial direview; jalur kredensial, auth, dan input juga melewati `ecc:security-reviewer`.

| # | Fase | Isi | Selesai bila | Pemegang | Status |
|---|---|---|---|---|---|
| 0 | Prasyarat | Tombol lepas kredensial, build launcher, ukur probe di Core berjalan | Tombol terbukti di launcher; `/health` terukur | Haiku, supervisor | Berjalan |
| 1 | Vault dan auto-setup | `src/router/`: vault AES-256-GCM, master key DPAPI, impor `.env`, registri provider sebagai data | Kunci dari `.env` terbaca tanpa keluar; vault rusak atau salah kunci gagal tertutup; file vault tidak memuat nilai kunci | Fable | Belum |
| 2 | Setup provider dan test | Tab Providers di halaman Router, tombol test per provider, daftar model per kunci, pilih model | Test memakai kunci vault dan menampilkan model nyata; kegagalan menjelaskan penyebab tanpa membocorkan kunci | Sonnet | Belum |
| 3 | Mesin routing | `/router/v1/chat/completions`, `/router/v1/messages`, `/router/v1/models`, streaming, kunci klien, failover antar-kunci | Klien lokal mendapat jawaban lewat router; tanpa kunci klien ditolak; putus di tengah stream tidak tercatat sukses | Fable | Belum |
| 4 | Riwayat permintaan | Penyimpanan metadata, token dan cache per permintaan, retensi, ekspor CSV dan JSON, pemantauan langsung | Angka token sama dengan laporan provider; ekspor aman dari formula injection; tidak ada isi prompt atau kunci | Sonnet | Belum |
| 5 | Caching | Prompt caching 1 jam, cache respons opsional | Tes menunjukkan token cache-read pada permintaan kedua; hit cache respons ditandai dan terpisah per klien | Fable | Belum |
| 6 | Analitik dan kuota | Grafik interaktif harian, mingguan, bulanan; persentase prompt caching; kuota; notifikasi mendekati batas | Grafik memakai data riwayat nyata; notifikasi muncul sekali per ambang; bisa dipakai keyboard | Sonnet | Belum |
| 7 | Admin dan OAuth | Kelola klien router, pencabutan, batas per klien, OAuth 2.0 lewat `src/oauth/` | Klien yang dicabut langsung ditolak; token berscope router tidak bisa memanggil tool MCP | Fable | Belum |
| 8 | Cutover | Klien nyata dialihkan, Native pindah ke vault, konfigurasi router lama dibersihkan | Definisi selesai terbukti; rollback tertulis | Supervisor | Belum |

Haiku memegang tugas sempit di tiap fase: registri provider, dokumen, dan pemeriksaan.

## Yang sengaja tidak dibangun

Multi-akun manusia, jalur masuk publik, OAuth langganan provider, fusion dan smart routing, serta adapter yang menyamar sebagai aplikasi lain. Combo fallback pilihan pengguna ditinjau sesudah fase 3.

## Langkah manual user

Tidak ada untuk fase 1 sampai 7 bila kunci sudah ada di `.env`. Menghapus kunci dari `.env` dan mengalihkan klien nyata diputuskan user di fase 8.

## Risiko

- `src/agent-provider.ts` dan `src/http/app.ts` besar dan dipakai banyak jalur: router masuk sebagai folder sendiri dengan titik sambung sekecil mungkin.
- DPAPI hanya Windows. Fase lintas platform di luar lingkup; vault gagal tertutup bila master key tidak terbuka.
- Biaya model bisa berjalan selama pengujian: tes otomatis memakai server tiruan, dan tes nyata dibatasi.
