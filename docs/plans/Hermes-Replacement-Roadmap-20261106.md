# Roadmap: Agent Core menggantikan Hermes

Tanggal: 2026-11-06. Status: OPEN, aktif. Pemilik: sesi supervisor (Opus 5.5), pekerja sesi Sonnet 5.5 dan Haiku 5.5.

Dokumen ini adalah satu-satunya sumber urutan kerja untuk tujuan ini. Status implementasi aktual tetap di `docs/CODEBASE.md`.

## Tujuan dan definisi selesai

Keputusan user 2026-11-06: pengguna dapat memakai Agent Core sebagai pengganti penuh Hermes.

"Menggantikan" dianggap selesai bila semua ini terbukti di mesin nyata:

1. User memberi perintah dari ponsel lewat minimal satu platform pesan dan menerima hasilnya, dengan Agent Core sebagai satu-satunya agen yang berjalan.
2. Tugas terjadwal berjalan tanpa pengawasan dan hasilnya sampai ke platform pesan.
3. Aksi berisiko dari jalur jarak jauh meminta persetujuan, dan penolakan benar-benar menghentikan aksinya.
4. Ada CLI untuk manusia, dengan perintah chat, status, dan doctor.
5. Provider bisa diganti tanpa mengubah kode, termasuk model lokal.
6. Native bisa mendelegasikan pekerjaan ke subagen dan memakai server MCP pihak ketiga.
7. Tidak ada kemampuan Hermes berlabel Inti yang tersisa tanpa padanan atau tanpa alasan tertulis.

## Bukti dasar

- Agent Core: `docs/research/hermes-parity/agent-core-inventory.md` (Sonnet, sampel diverifikasi supervisor terhadap source).
- Hermes: `docs/research/hermes-parity/hermes-inventory.md` (Haiku). Supervisor memeriksa token path buktinya dengan skrip: 512 dari 541 ada apa adanya; sampel dari 29 sisanya ternyata nama file tanpa folder atau `cli-config.yaml` yang di repo bernama `.example`. Keberadaan path sudah diperiksa. Isi area A dan B kemudian dibaca Haiku baris per baris terhadap source (9 baris dikoreksi); isi area C sampai M belum dibaca ulang. Label Inti/Tambahan adalah penilaian Haiku. Rincian provider, manifest MCP, dan pola deteksi approval masih "belum diperiksa".
- Pemakaian Hermes nyata di mesin ini: folder `HERMES_HOME` hanya berisi `bootstrap-cache`, `logs`, `tools`, `uv-cache`, dan satu log installer; `runtime/home` di checkout Hermes hanya berisi `cache` dan `installs`. Tidak ada konfigurasi, memory, atau jejak gateway dan cron yang ditemukan di kedua tempat itu. Karena itu urutan platform memakai default, bukan data pemakaian, dan migrasi data diperkirakan ringan.

Koreksi atas inventaris: `AGENT_CORE_AI_ENABLED=false` hanya default kode. Native di mesin ini hidup (`/health`: `agentRuntime.status=available`, 4 provider terkonfigurasi).

## Batasan yang mengikat desain

- **Tanpa jalur masuk publik.** Tunnel Cloudflare sudah dihapus atas izin user dan tidak dipasang kembali. Semua transport hanya boleh membuka koneksi keluar: Telegram long polling, Discord gateway WebSocket, Slack Socket Mode, email IMAP polling. Platform berbasis webhook (WhatsApp Cloud API dan sejenisnya) ditunda sampai user menyetujui jalur masuk baru.
- **Token bot adalah kredensial.** Agen tidak mengisi atau membacanya. Langkah manual user: menaruh token di `.env`; kode membacanya lewat `src/config.ts` seperti kunci provider.
- **Asal pesan ketiga.** `runTurn` mengenal `local-operator` dan `external-controller`. Pesan gateway butuh asal sendiri. Pengenal pemilik yang masuk allowlist dipetakan secara eksplisit; pengirim lain ditolak sebelum turn dibuat. Perubahan ini wajib melewati `ecc:security-reviewer`.
- **Satu pemilik penjadwalan.** Cron berjalan di dalam Core dengan pola `IntervalLoop` (`src/memory/rem-consolidation.ts`) dan state di `runtime`. Windows Task Scheduler tidak dipakai.
- **Reuse owner.** Turn tetap lewat `AgentChatService.runTurn`, Memory dan Learning tetap satu store, jaringan keluar lewat `fetchWithPolicy`.
- **Tidak ada jalur tes dalam fungsi, tidak ada literal path drive di source, satu Node di runtime proyek.**

## Keputusan polyglot

Dipilih TypeScript di proses Core untuk gateway, cron, approval, dan CLI. Alasan: ini peran orkestrator I/O, seluruh owner yang dipakai ulang sudah TypeScript, dan biaya IPC tidak memberi manfaat.

Ditunda dengan syarat: sandbox eksekusi dalam Rust dievaluasi di gelombang 10, karena isolasi OS memang kelas keunggulan Rust dan saat ini Agent Core hanya punya daftar direktori dan penjaga perintah. Python tidak diperlukan selama tidak ada inferensi lokal di dalam proses.

## Gelombang kerja

Aturan urutan: gelombang berikutnya baru dikirim setelah hasil sebelumnya diverifikasi supervisor dari file dan tes.

| # | Gelombang | Isi | Selesai bila | Status |
|---|---|---|---|---|
| 0 | Fondasi | Akar masalah Memory dan Learning `HEALTH_PROBE_TIMEOUT`; `runningSessionCount` 88 dari 160 | Probe stabil di Core yang berjalan, `memory_search` menjawab, sesi mati tidak dihitung running | Berjalan (Sonnet) |
| 1 | Gateway inti + Telegram | `src/gateway/`: kontrak adapter, router chat ke percakapan, allowlist pemilik, ledger pengiriman, perintah chat dasar (`/new`, `/stop`, `/retry`), perilaku saat agen sibuk; adapter Telegram long polling tanpa dependensi baru | Pesan dari Telegram menjalankan turn dan balasan terkirim; pengirim asing ditolak tanpa membuat turn; kill dan restart tidak menggandakan balasan | Belum |
| 2 | Persetujuan interaktif | Gerbang aksi berisiko di host, bukan perilaku model: tertunda, setujui, tolak, kedaluwarsa; muncul di UI dan gateway | Aksi berisiko dari gateway berhenti sampai dijawab; penolakan terbukti tidak mengeksekusi | Belum |
| 3 | Cron dengan pengiriman | Job store, jadwal, pencegahan tumpang tindih, riwayat, pengiriman ke gateway; tool dan perintah kelola | Job berjalan tanpa UI terbuka, hasil sampai ke Telegram, job terlewat saat Core mati ditangani sesuai kebijakan yang ditulis | Belum |
| 4 | CLI dan TUI manusia | `agentcore chat` (interaktif, sekali jalan, lanjut sesi, keluaran JSONL), kelola sesi, `status`, `doctor`, lalu TUI, semuanya di atas API HTTP yang ada | Percakapan berjalan dan bisa disela dari terminal; sesi yang sama terlihat di UI dan gateway; `doctor` melaporkan kondisi nyata | Belum |
| 5 | Provider | Rute bernama OpenAI, Gemini, model lokal; ganti model dari chat | Satu turn nyata per rute yang punya kunci; model lokal teruji lewat loopback | Belum |
| 6 | Delegasi Native | Spawn subagen berbatas, paralel, grant diturunkan dari induk | Induk menerima hasil dua subagen; subagen tidak bisa melebihi grant induk | Belum |
| 7 | Klien MCP dan pencarian sesi | Native memakai server MCP dari konfigurasi; tool cari percakapan lama | Tool MCP pihak ketiga terpanggil di bawah kebijakan grant; recall lintas percakapan terbukti | Belum |
| 8 | Platform tambahan | Discord, Slack, email memakai kontrak adapter gelombang 1 | Tiap adapter lulus tes kontrak yang sama | Belum |
| 9 | Backend terminal | Pemilihan backend lewat konfigurasi; Docker dan SSH, termasuk transfer berkas dan proses latar; WSL | Satu tugas yang sama lulus di lokal, Docker, dan SSH, dengan penjaga perintah tetap aktif | Belum |
| 10 | Pelengkap dan cutover | Setup terpandu, backup dan restore, update, importer Hermes, toolset per platform, API kompatibel OpenAI, evaluasi sandbox Rust, suara; pensiun `HERMES_HOME` dan folder lama | Definisi selesai di atas terbukti seluruhnya | Belum |

Persetujuan (2) sebelum cron (3): job tanpa pengawasan dan perintah jarak jauh butuh gerbang yang sama. Sampai gelombang 2 selesai, turn dari gateway berjalan dengan grant minimal tanpa aksi mutasi.

## Yang dipertahankan sebagai keunggulan

Memory dan Learning berversi, skill berversi dengan proposal, code intelligence dan LSP, kontrol browser, ponsel dan mode game, serta redaksi rahasia dan kebijakan jaringan keluar. Fitur baru tidak boleh melemahkan ini.

## Protokol kerja

1. Satu atau dua tugas per pesan ke pekerja, pendek.
2. Pekerja tidak commit, tidak promosi, tidak restart. Supervisor meninjau diff, menjalankan tes tersempit, lalu commit dengan pathspec eksplisit.
3. Dua pekerja tidak menyentuh file yang sama. Keduanya berbagi satu checkout, dan working tree berisi penghapusan `SubProject` milik user yang tidak boleh disentuh.
4. Instruksi user 2026-11-06: sesi pekerja dilarang memakai subagen dan mengerjakan semuanya langsung sendiri. Review `ecc:code-reviewer` dan `ecc:typescript-reviewer` (jalur auth, input, atau jaringan juga `ecc:security-reviewer`) dijalankan oleh supervisor.
5. Native tidak dipakai kecuali user memintanya secara eksplisit.
6. Build di Source, promosi dengan `scripts/windows/Promote-Source-To-Platform.ps1` (dry-run lalu `-Apply`), restart sekali saat tidak ada turn Native atau tool bermutasi berjalan.

## Langkah manual user

- Gelombang 1: membuat bot lewat BotFather, menaruh token dan ID Telegram pemilik di `.env`. Nama variabel ditetapkan saat implementasi.
- Gelombang 5 dan 8: kunci provider dan token platform yang ingin dipakai, di `.env`.
