# Strategi: Kerja Eksternal untuk Mengurangi Beban Lokal

Tanggal: 2026-11-06. Status: OPEN, usulan, belum dijalankan. Pemilik: sesi supervisor. Berlaku untuk pekerjaan Agent Core, mulai dari fase 2 Model Router (`docs/plans/Model-Router-Plan-20261106.md`).

## Tujuan

Mesin lokal hanya mengerjakan yang memang harus di sini: menjalankan Core, memegang kunci asli, dan menerima hasil akhir. Menulis kode, menguji, dan membangun pindah ke luar sejauh bisa dibuktikan aman.

## Fakta awal, diukur 2026-11-06

- Mesin: 4 CPU logis, RAM 16 GB, bebas sekitar 5,9 GB, beban CPU 62% saat diukur.
- Memori terbesar: `claude` 3,5 GB (15 proses), `msedgewebview2` 1,2 GB, `node` 1,0 GB, `grafel` 0,5 GB. Yang pertama mencakup app Desktop dan semua sesi, belum dipisah per sesi.
- CPU pada sampel 5 detik saat tiga pekerja berjalan: `cmd` 18,9%, `claude` 14,3%, `grafel` 9,1%, `node` 8%. Satu sampel ini bukan rata-rata. Penyebab `cmd` setinggi itu belum diketahui.
- Kesimpulan sementara: beban utama adalah sesi agen dan proses pendukungnya, bukan hanya tes. Memindahkan tes saja tidak akan cukup.
- Repo `Black-Project-Agent-Core/Agent-Core` bersifat publik dan belum punya `.github/workflows`.
- 38 dari 286 berkas di `tests` memuat kata kunci khusus Windows, dan `src/launcher.tests` berisi tes C#. Sisanya kandidat lintas platform, tetapi belum pernah dicoba di luar Windows.
- `CLAUDE.md` repo sudah mengatur kerja dari sesi cloud: edit dan push branch di cloud, penerimaan di PC pemilik.

## Pembagian kerja

| Pekerjaan | Tempat | Alasan |
|---|---|---|
| Menulis kode dan dokumen | Sesi cloud, satu branch per tugas | Beban terbesar pindah dari mesin, dan pekerja tidak lagi berbagi satu checkout |
| Tes TypeScript dan UI | GitHub Actions, Ubuntu, dibagi dengan `vitest --shard` | Berjalan paralel tanpa memakai mesin lokal |
| Tes khusus Windows, kompilasi dan tes launcher C#, helper DPAPI dengan kunci tiruan | GitHub Actions, Windows | Tetap lingkungan Windows tanpa memakai mesin lokal |
| Build `Agent Core.exe` dan `dist` | GitHub Actions, Windows, disimpan sebagai artifact | Tahap akhir, sesudah hasilnya terbukti setara dengan build lokal |
| Eksekusi cepat sekali pakai | Vercel Sandbox | Hanya bila perlu lingkungan terpisah. Sesi cloud sudah punya shell dan Actions sudah menjalankan tes, jadi ini bukan jalur utama |
| Review kode | Sesi cloud atau subagen pada diff branch | Hanya membaca |
| Menjalankan Core, promosi, restart, ukur `/health` | Lokal | Instalasi Platform ada di mesin ini |
| Uji dengan kunci asli, DPAPI user asli, launcher dan WebView nyata | Lokal | Kunci tidak boleh keluar, dan perilaku ini hanya terbukti di mesin nyata |
| Penerimaan akhir | Lokal | Aturan repo: hijau di cloud bukan penerimaan |

## Pembagian per fase router

| Fase | Kerja eksternal | Sisa lokal |
|---|---|---|
| 0, 1 | Tidak ada, sudah berjalan di lokal | Selesaikan, commit, push |
| 2 Test provider | Kode, tes dengan server tiruan | Satu test nyata per provider |
| 3 Riwayat | Kode, tes | Periksa angka token dari panggilan nyata |
| 4 Prompt caching | Kode, tes | Satu uji cache-read nyata, dibatasi |
| 5 Analitik | Kode, tes | Periksa grafik di launcher |
| 6 API lokal | Kode, tes dengan server tiruan | Satu klien nyata lewat router |
| 7 Admin dan OAuth | Kode, tes | Uji pencabutan klien di Core berjalan |
| 8 Cutover | Tidak ada | Seluruhnya |

## Langkah masuk

Tiap langkah punya bukti lulus. Langkah berikutnya menunggu langkah sebelumnya lulus.

1. **Bersihkan titik awal.** Selesaikan fase 0 dan 1, commit, push. Sesi cloud hanya melihat yang sudah di-push. Bukti: branch di GitHub memuat seluruh kerja yang diakui.
2. **Tambahkan CI.** Satu workflow: `tsc`, `path:check`, Vitest Ubuntu per shard, UI, kompilasi dan tes launcher di Windows. Tes yang memang merah di `HEAD` dicatat dengan penyebabnya, tidak disembunyikan. Bukti: satu run penuh selesai dan daftar kegagalannya bisa dijelaskan.
3. **Uji satu fase di cloud.** Fase 2 dikerjakan satu sesi cloud. Sonnet lokal ditutup selama uji. Bukti: PR hijau, dan angka pembanding di bawah tercatat.
4. **Pindahkan build.** Workflow Windows menghasilkan artifact. Bukti: artifact lolos promosi dry-run dan berjalan sama dengan build lokal.
5. **Jadikan bawaan.** Bila uji fase 2 lulus, fase berikutnya memakai jalur ini.

## Ukuran keberhasilan

Dicatat pada langkah 3 dan dibandingkan dengan cara lokal:

- RAM bebas dan beban CPU rata-rata selama kerja.
- Waktu dari tugas dikirim sampai diff siap direview.
- Waktu satu putaran perbaiki dan uji.
- Jumlah kegagalan CI yang tidak terjadi di lokal, atau sebaliknya.

Bila satu putaran perbaiki dan uji jauh lebih lambat sampai menghambat kerja, tes yang sedang digarap boleh dijalankan di dalam sesi cloud sendiri, dan CI tetap menjadi penjaga akhir.

## Batas keamanan

- **Repo publik berarti log Actions publik.** Tidak ada kunci asli di workflow, secret repo, sandbox, atau sesi cloud. Tes eksternal hanya memakai server tiruan dan kunci tiruan.
- `.env`, `secrets`, `runtime`, dan folder "DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT" tetap di lokal.
- Workflow memakai izin token minimum, action dipatok ke commit SHA, dan pull request dari fork tidak mendapat akses tulis.
- Artifact build hanya dipromosikan dari commit yang sudah direview, dan hash-nya diperiksa.
- Tanpa force-push. Rilis dan tag tetap mengikuti `docs/instructions/release-and-refresh.md`.

## Risiko dan akibatnya pada supervisi

- **Sesi cloud tidak mengirim laporan kembali.** Supervisor memantau lewat PR, status CI, dan transcript, bukan pesan.
- **Compact lewat konsol hanya berlaku untuk CLI lokal.** Di cloud, satu tugas memakai satu sesi baru, jadi aturan rekomendasi compact tidak diperlukan.
- **Sesi cloud tidak punya Memory dan alat lokal Agent Core.** Pengetahuan yang dibutuhkan harus ada di repo dan brief.
- **Beberapa tes mungkin bergantung pada Windows atau `runtime`.** Langkah 2 yang akan menunjukkan seberapa banyak. Hanya tes yang lolos yang dipakai sebagai penjaga.
- **Hijau di CI bisa menutupi masalah lokal.** Karena itu setiap fase tetap punya sisa uji lokal yang kecil.

## Belum terbukti

- Biaya dan batas Actions: runner standar untuk repo publik setahu saya gratis; periksa saat run pertama.
- Sesi cloud bisa dimulai untuk repo ini: daftar target melaporkan cloud tidak tersedia dari folder `F:\Agent Core` (`no_readable_git_checkout`), dan jalur dengan nama repository belum dicoba.
- Besar penghematan RAM per sesi pekerja: belum diukur terpisah.
- Penyebab `cmd` 18,9% CPU pada sampel. Bila berasal dari hook atau statusline yang berputar, memperbaikinya mungkin menghemat lebih cepat daripada memindahkan kerja.
