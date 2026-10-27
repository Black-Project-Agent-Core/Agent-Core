# W1 — Studi CHANGELOG Claude Code untuk Agent Core (prefix CHG)

Pekerja: W1 (baca-saja). Sumber tunggal: `E:\Projects\Side-Project-Dont-Touch\claude-code\CHANGELOG.md`. Tanggal studi: 2026-10-27.
Catatan lisensi umum: `claude-code` berlisensi all-rights-reserved (Anthropic Commercial Terms). Seluruh temuan di bawah hanya mengambil ide dan mekanisme, ditulis ulang dengan kata-kata sendiri; tidak ada teks atau kode disalin. Setiap temuan, bila diadopsi, harus direimplementasi mandiri di owner Agent Core yang sudah ada.
Konvensi sitasi: "L548 (2.1.299)" berarti baris 548 file CHANGELOG.md, butir di bawah heading versi 2.1.299. Changelog hanya mencatat hasil perilaku, bukan kode; semua klaim tentang cara kerja internal Claude Code adalah inferensi dari teks butir.

---

## Bagian A — Ledger cakupan

### A.1 Unit dan jumlah file

| Unit | Jumlah file | Dibaca | Disposisi | Alasan | Temuan terkait |
|---|---|---|---|---|---|
| `claude-code/CHANGELOG.md` (satu-satunya file di irisan; `git ls-files CHANGELOG.md` = 1) | 1 | Penuh untuk 5 tema inti, skim berbasis kata kunci untuk tema lain, hitung-saja untuk UI/IDE/cloud | ADAPT (ide), REFERENSI (pola) | Changelog berisi 8.192 butir; nilai terbesar ada pada mode kegagalan dan hardening, bukan pada fitur UI | CHG-01 s.d. CHG-29 |

Total file terlacak di irisan: 1. Jumlah baris ledger menjumlah ke 1.

### A.2 Rentang versi dan struktur
- Heading versi: 430 (2.1.x: 252; 2.0.x: 59; 1.0.x: 82; 0.2.x: 37). Teratas 2.1.310 (baris 3), terbawah 0.2.21 (baris 9481). File 9.483 baris, 1.085.784 byte, 8.192 butir berawalan `- `; satu-satunya baris non-butir non-heading adalah judul `# Changelog`.
- Butir terpadat: 2.1.299 dan 2.1.290 (masing-masing 190 butir), 2.1.281 (177), 2.1.295 (143).

### A.3 Metode jangkauan
1. Skrip Node baca-saja (`classify.mjs`, di scratchpad kerja) mengurai semua 8.192 butir menjadi (versi, nomor baris, teks) dan menandai tiap butir dengan 20 tema berbasis ekspresi reguler (multi-label). Tidak ada eksekusi kode sumber Claude Code.
2. Butir diduplikasi ke satu "tema utama" per butir (prioritas: security, windows, permissions, hooks, context, sessions, subagents, mcp, skills, background, worktrees, headless, cost, otel, thinking, settings). Butir berawalan `[VSCode]`, `[Cloud sessions]`, `[Claude Tag]`, `[Code Review]`, `[Desktop]`, `[Slack]`, `[Chrome]` dikeluarkan (756 butir) karena di luar jangkauan produk lokal.
3. Tema inti dibaca lewat Read/awk dengan penyaring derau UI (screen reader, tombol, render, tmux, Remote Control, gateway) dan pemotongan baris 125-250 karakter. Tema yang dibaca penuh memakai file `P_*.txt`/`f_*.txt`; tema yang di-skim memakai grep kata kunci mode kegagalan.

### A.4 Ledger per tema (jumlah butir multi-label dari klasifikasi; kolom dibaca = butir yang benar-benar tampil di layar saya)

| Tema | Butir (multi-label) | Tema-utama setelah dedup | Status baca | Catatan |
|---|---|---|---|---|
| security_injection | 385 | 363 | PENUH (363) | semua dibaca |
| windows | 386 | 323 | PENUH (323) | semua dibaca |
| permissions_sandbox | 852 | 671 | PENUH (±660; 11 butir UI/Cowork/gateway tersaring) | termasuk era 0.2 s.d. 2.1.310 |
| hooks | 401 | 313 | PENUH (291 setelah saring derau) | dipakai untuk pelajaran fail-closed, bukan untuk adopsi hook |
| context_memory | 639 | 534 | PENUH (422 setelah saring UI) | kompaksi, CLAUDE.md, auto-memory, cache |
| sessions_rewind | 759 | 516 | SKIM kata kunci (±170 butir) | rewind, resume, transkrip, history |
| background_tasks | 928 | 462 | SKIM kata kunci (±150) | Monitor, timeout, loop, daemon |
| mcp | 567 | 403 | SKIM kata kunci (±120) | reconnect, timeout, deferral, nama server |
| skills_plugins | 1020 | 615 | SKIM kata kunci (±135) | validate, dependensi, update, uninstall |
| subagents_teams | 486 | 275 | SKIM kata kunci (±70) | kedalaman, hasil, isolasi |
| cost_usage | 520 | 206 | SKIM kata kunci (±50) | /usage, /cost, /context |
| worktrees | 213 | 86 | SKIM (18) | penghapusan, kunci, isolasi |
| headless_sdk | 343 | 122 | SKIM (28) | max-turns, stream-json, SIGTERM |
| settings_policy | 840 | 221 | SKIM (26) | managed settings, fail-closed |
| otel | 166 | 70 | SKIM (12) | hanya sebagai rujukan nama kejadian lokal |
| thinking_model | 727 | 337 | SKIM (28) | fallback, blok thinking |
| lainnya (tanpa tema inti) | — | 1.906 | scan mode kegagalan (30) | sisanya tidak dibaca |
| ui_terminal | 1.742 | — | HITUNG-SAJA | rendering terminal; UI Agent Core adalah WebView2 |
| ide + cloud_web + prefix produk | 671 + 881 + 756 | — | HITUNG-SAJA | VS Code, JetBrains, cloud, Tag, Desktop |
| bugfix_failure ("Fixed ...") | 4.789 | — | dibaca lewat tema di atas | sinyal mode kegagalan nyata |

Estimasi cakupan: ±2.070 butir dibaca penuh (±25% dari 8.192) dan ±840 butir di-skim (±10%); sekitar 65% butir (UI, IDE, cloud, Tag, dan sisa non-inti) hanya dihitung atau di-scan. Angka estimasi, bukan pencacahan tepat per baris.

---

## Bagian B — Temuan

Kunci status baseline: SUDAH-ADA / SEBAGIAN / BELUM-ADA. Semua grep dilakukan pada `E:\Projects\Agent-Core\src` (tanpa `node_modules`, `dist`) dan `scripts`. "Butuh skema tool baru" dijawab "tidak" kecuali dinyatakan.

### CHG-01 Audit anggaran teks selalu-dimuat (prompt-audit untuk AGENTS.md)
- Sumber: CHANGELOG.md L1852 (2.1.283: `/doctor prompt-audit` memeriksa CLAUDE.md, skill, agen, command untuk pola yang ditulis untuk model lama); L1903 (2.1.283: deteksi path usang, perintah usang, instruksi saling bertentangan); L4638 (2.1.206: cek `/doctor` yang mengusulkan memangkas CLAUDE.md yang kontennya dapat diturunkan dari kode); L5217 (2.1.169: ambang peringatan "terlalu panjang" ikut ukuran jendela konteks); L2152 (2.1.281: peringatan CLAUDE.md besar menghitung semua file instruksi bersama, termasuk @-import); L45 (2.1.309: CLAUDE.md bersarang melebihi batas hanya dimuat awalnya); L3133 (2.1.261: `/skill-doctor` menampilkan skill tak terpakai dan biaya konteksnya); L7878 (2.1.32: anggaran karakter daftar skill = 2% konteks); L6882 (2.1.86: deskripsi skill di daftar dibatasi 250 karakter); L4990 (2.1.186: pengingat memadatkan indeks MEMORY.md mendekati batas).
- Observasi: Claude Code menangani masalah persis yang dialami Agent Core (instruksi selalu-dimuat membengkak) dengan alat diagnostik terpisah, bukan dengan menambah teks: ukuran dihitung gabungan, ambang diskalakan ke konteks model, ada pemotongan terkontrol, ada deteksi path/perintah usang dan kontradiksi, dan laporan biaya konteks per skill.
- Nilai untuk Agent Core: AGENTS.md ±84 KB dan kapsul bootstrap terpotong adalah masalah nyata yang sudah dicatat; belum ada alat yang mengukur per bagian, menemukan duplikasi, path mati, atau kontradiksi secara deterministik.
- Baseline Agent Core: `ls scripts | grep -Ei 'agents|audit|lint|budget|capsule'` tidak menemukan skrip audit AGENTS.md; hanya ada pemeriksa anggaran manifest (`scripts/release/release-compat.mjs`, `scripts/verify/rea-harness-registration.mjs` memuat angka 131072). → BELUM-ADA.
- Delta/celah: skrip baca-saja yang melaporkan (a) byte per heading AGENTS.md dan urutan terbesar, (b) kalimat/butir duplikat antar bagian atau antar file Skill, (c) path/nama tool/nama file yang disebut tetapi tidak ada di repo (stale), (d) pasangan instruksi yang berpotensi bertentangan (kata kunci MUST/NEVER pada subjek sama), (e) biaya konteks tiap capability pack aktif.
- Cara adaptasi: `scripts/verify/agents-md-audit.mjs` (baca-saja, keluaran JSON + ringkasan), dipanggil manual atau dari dashboard "health"; hasilnya mengalir ke proposal pemangkasan (`docs/proposals`) tanpa mengubah file otomatis. Tidak menyentuh owner Memory/Skill.
- Lisensi/hak cipta: ide saja; implementasi mandiri.
- Perkiraan skala: S · Risiko: rendah (baca-saja) · Nilai: tinggi · Skema tool baru: tidak · Menambah teks selalu-dimuat: tidak (justru mengurangi)
- Bukti vs dugaan: terverifikasi bahwa butir-butir tersebut ada; dugaan bahwa heuristik kontradiksi akan banyak false positive (perlu ambang konservatif).
- Disposisi: ADAPT

### CHG-02 Kapsul instruksi MCP harus muat batas karakter klien
- Sumber: CHANGELOG.md L2216 (2.1.280: variabel lingkungan untuk batas 2.048 karakter pada deskripsi tool dan instruksi server MCP); L759 (2.1.296: batas default dinaikkan dari 2.048 ke 4.096); L892 (2.1.295: deskripsi tool yang dimuat lewat tool search dipotong di 16.384); L1488 (2.1.287: `alwaysLoad:false` menunda semua tool server di balik pencarian); L6136 (2.1.121: opsi `alwaysLoad`); L8106 (2.1.7: tool search otomatis saat deskripsi MCP melebihi 10% konteks).
- Observasi: klien Claude Code memotong instruksi server MCP dan deskripsi tool pada batas karakter tetap (2.048 lalu 4.096) dan menunda pemuatan tool ber-deskripsi besar. Konten setelah batas hilang tanpa peringatan bagi server.
- Nilai untuk Agent Core: `src/mcp/server.ts:304` menyusun instruksi dari `instructions` + `CAPABILITY_USE_CONTRACT` + `CONTRACT_INSTRUCTIONS`. Pada sesi studi ini, instruksi server `agent-core` yang diterima klien terlihat terpotong di tengah kalimat (penanda "[truncated]"), sejalan dengan batas klien tersebut (ukuran tepat tidak diukur).
- Baseline Agent Core: handshake wajib dan "lihat Memory dulu" ada di instruksi; urutan prioritas terhadap batas karakter tidak terdokumentasi di grep (`grep -n instructions src/mcp/server.ts` hanya menunjukkan perakitan). → SEBAGIAN.
- Delta/celah: aturan satu-kalimat paling kritis (panggil `controller_contract(read)` lebih dulu) harus berada dalam 2.048 karakter pertama, sisanya diperlakukan sebagai bonus; tambahkan uji yang mengukur panjang karakter instruksi akhir dan gagal bila bagian kritis jatuh di luar batas.
- Cara adaptasi: perubahan urutan/penyusunan teks di `src/mcp/server.ts` + uji ukuran di `scripts/verify`. Tidak menambah teks; hanya menata ulang.
- Lisensi/hak cipta: ide saja.
- Perkiraan skala: S · Risiko: rendah (tata ulang) · Nilai: tinggi · Skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: batas 2.048/4.096 terverifikasi dari changelog; bahwa klien yang dipakai pengguna memakai batas itu adalah dugaan (klien lain bisa berbeda); pemotongan pada sesi ini teramati tetapi tidak diukur.
- Disposisi: ADAPT

### CHG-03 Taksonomi hasil tool: ditolak-kebijakan, tanpa-jawaban, dibatalkan, gagal; plus catatan keputusan lokal
- Sumber: CHANGELOG.md L4529 (2.1.210: timeout callback hook dilaporkan ke model sebagai penolakan pengguna sehingga sesi tanpa pengawas berhenti menunggu); L379 (2.1.301: panggilan tool terpotong pesan tengah-giliran dilaporkan sebagai ditolak pengguna); L2317 (2.1.280: prompt yang kedaluwarsa dicatat sebagai penolakan sehingga retry ditolak); L1345 (2.1.288: permintaan izin tak terjawab tidak menghasilkan kejadian); L16 (2.1.310: timeout tool MCP saat elisitasi tak terjawab kini memberi tahu model bahwa tidak ada jawaban dan jangan ulangi); L2963 (2.1.268: pesan penolakan menyebut aturan yang memblokir dan meminta cara lebih aman); L2219 (2.1.280: tindakan yang tidak ditinjau ditolak sekali dengan catatan bahwa mengulang tak membantu); L2220 (2.1.280: penolakan beruntun di-backoff dan giliran berhenti setelah sepuluh kali); L1571 (2.1.286: galat WebFetch yang kena batas laju memberi tahu model jangan mengulang dalam loop); L8789 (1.0.124: tidak lagi menyebut daftar tool yang diizinkan saat ditolak); L4361 (2.1.216: kegagalan permintaan prompt izin tak dihitung sebagai penolakan).
- Observasi: selama bertahun-tahun, Claude Code berulang kali memperbaiki satu kelas bug: hasil "tidak ada jawaban/timeout/dibatalkan" tercampur dengan "ditolak orang", sehingga model berhenti atau mengulang salah. Solusinya taksonomi hasil yang eksplisit dengan kalimat balik yang berbeda ke model.
- Nilai untuk Agent Core: Native Agent dan kontroler eksternal sama-sama membaca teks hasil tool; hasil ambigu memicu loop retry atau berhenti prematur. Catatan keputusan lokal (siapa/apa yang memutuskan) juga memberi bukti untuk Activity Tracker tanpa telemetri jarak jauh.
- Baseline Agent Core: `src/rdc/process-ledger.ts:9` punya status proses `pending|running|cancelling|completed|failed|cancelled`; `src/agent-tool-session.ts:173` melempar `AGENT_RUNTIME_TURN_STOPPED` pada Stop; `src/mcp/failure-loop-advisor.ts` memberi saran saat kegagalan berulang (repeat/no-progress); CC-P3 (envelope outcome lokal) dinyatakan diadopsi. Tidak ditemukan kelas "ditolak-kebijakan" vs "tanpa-jawaban" vs "timeout" dengan kalimat balik berbeda (grep `'timed_out'|'unanswered'` kosong). → SEBAGIAN.
- Delta/celah: memastikan envelope CC-P3 membedakan empat kelas (ditolak kebijakan, tidak terjawab/timeout, dibatalkan oleh Stop, gagal teknis) dengan frasa model-facing yang berbeda: "jangan ulangi tindakan yang sama" untuk ditolak/timeout, "boleh coba ulang" hanya untuk gagal sementara; satu catatan lokal per keputusan di Activity Tracker dengan sumber keputusan.
- Cara adaptasi: perluasan enum/frasa pada envelope outcome yang ada (owner: modul envelope CC-P3 + Activity Tracker), plus uji pemetaan. Tanpa tool baru.
- Lisensi/hak cipta: ide saja.
- Perkiraan skala: M · Risiko: sedang (menyentuh format hasil yang dikonsumsi klien) · Nilai: tinggi · Skema tool baru: tidak (jika field masuk ke payload yang ada; periksa anggaran bila menambah skema) · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: butir changelog terverifikasi; kelengkapan envelope CC-P3 saat ini tidak saya audit (dugaan SEBAGIAN).
- Disposisi: ADAPT

### CHG-04 Korpus uji bypass untuk pemeriksa perintah (command-manager) di PowerShell/cmd/Git Bash
- Sumber: lebih dari 60 butir "Fixed Bash/PowerShell permission bypass", antara lain L3989 (2.1.232: variabel bertulis parameter menimpa `$PSDefaultParameterValues`); L5550 (2.1.149: fungsi `cd..`, `cd\`, `cd~`, `X:` mengganti direktori tak terdeteksi); L6793 (2.1.90: `&` di akhir, `-ErrorAction Break`, TOCTOU ekstraksi arsip, degradasi aturan deny saat parse gagal); L4381 (2.1.214: bypass pada Windows PowerShell 5.1); L4354 (2.1.216: karakter Unicode tak terlihat); L4156 (2.1.223: tab/Unicode tak terlihat menyembunyikan bagian perintah dari dialog); L4383 (2.1.214: perintah lebih dari 10.000 karakter selalu minta persetujuan); L3635 (2.1.246: `&&`/`||` menggantung selalu minta persetujuan); L6371 (2.1.113: aturan deny cocok pada perintah terbungkus env/sudo/watch/ionice/setsid); L6372 (2.1.113: `find -exec/-delete`); L8118 (2.1.6: lanjutan baris dengan backslash); L8097 (2.1.7: wildcard cocok pada perintah majemuk); L1651 (2.1.285: parser PowerShell gagal start sehingga aturan deny/ask dilewati dan kegagalan di-cache); L3990 (2.1.232: symlink gaya Cygwin di Git Bash); L1894 (2.1.283: `cmd /c rd/del/erase` menghapus akar drive).
- Observasi: pemeriksa perintah berbasis string selalu bocor; kelas kebocoran berulang dan terdaftar jelas: pembungkus (env/sudo), substitusi, variabel, alias/fungsi pengubah direktori, pengalihan, Unicode tak terlihat, panjang ekstrem, kegagalan parser yang membuat pemeriksaan dilewati.
- Nilai untuk Agent Core: host Windows 10 + PowerShell. `src/rdc/command-manager.ts` memeriksa `blockedCommands` dengan ekstraksi nama perintah dasar dan menangani `$()` di dalam kutipan (baris 58, 231-251). Tanpa korpus uji berbasis kelas bypass di atas, kelas lain bisa lolos tanpa disadari.
- Baseline Agent Core: ekstraksi perintah + blocklist ada (SEBAGIAN); korpus uji khusus PowerShell/cmd tidak ditemukan (`grep 'cd\.\.|PSDefaultParameterValues'` tidak dijalankan khusus; dugaan BELUM-ADA). → SEBAGIAN.
- Delta/celah: daftar kasus uji (bukan logika baru) untuk `command-manager`: pembungkus, alias PowerShell (`rm`, `del`, `ri`), `cmd /c`, `&`, `;`, subshell `$( )`, backtick, here-string, karakter nol-lebar, perintah >10.000 karakter, parser gagal ⇒ perilaku aman. Hasil uji menentukan perbaikan; ini memperketat, tidak menambah otoritas.
- Cara adaptasi: tambahkan berkas uji (ekstensi test yang dipakai repo) di sebelah `command-manager`; sumber kasus dari daftar kelas di atas (ditulis ulang). Tanpa tool/skema baru.
- Lisensi/hak cipta: ide saja; kasus uji ditulis sendiri.
- Perkiraan skala: M · Risiko: rendah · Nilai: tinggi · Skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: kelas bypass terverifikasi dari changelog; kecocokan dengan implementasi saya hanya diperiksa pada baris yang disebut di atas.
- Disposisi: ADAPT

### CHG-05 Penjaga penghapusan katastropik deterministik untuk Windows
- Sumber: CHANGELOG.md L6953 (2.1.84: deteksi penghapusan akar drive `C:\`, `C:\Windows`); L1002 (2.1.292: `rm -rf` pada nama pendek 8.3 atau ejaan alternatif folder home/drive); L1894 (2.1.283: `cmd /c rd/rmdir/del/erase` menghapus akar drive dan home); L2143 (2.1.281: variabel diikuti nama direktori puncak, variabel turunan dari direktori kerja, target hanya backslash); L2067 (2.1.281: `rm -rf "$(pwd)"`); L4602 (2.1.208: penghapusan katastropik di dalam `$(...)`, backtick, `<(...)` tetap minta konfirmasi walau mode bypass); L4682 (2.1.205: tanya dulu bila variabel tak bisa di-resolve); L1367 (2.1.288: `rm` berbahaya di dalam `bash -c`); L4670 (2.1.205: penghapusan worktree Windows menghapus file di luar worktree karena junction NTFS); L5597 (2.1.147: pembersihan worktree tidak mengikuti junction); L5715 (2.1.143: pembersihan tidak lagi jatuh ke `rm -rf` jika `git worktree remove` gagal, mencegah hilangnya berkas yang di-gitignore); L221 (2.1.304: `rm -r` pada drive terpasang/`/mnt/c`); L2170 (2.1.281: bila tak dijawab 2 menit, tolak dengan petunjuk penulisan ulang agar sesi tanpa pengawas tetap jalan).
- Observasi: Claude Code mempertahankan satu "jaring pengaman" yang tetap aktif bahkan pada mode tanpa izin: penghapusan yang target akhirnya (setelah resolusi variabel, nama pendek, junction) adalah akar drive, home, atau direktori sistem selalu ditolak/dikonfirmasi.
- Nilai untuk Agent Core: data-loss protection pada host Windows milik pengguna. AGENTS.md mewajibkan konfirmasi destruktif, tetapi sifatnya instruksi perilaku bagi model, bukan penjaga kode.
- Baseline Agent Core: `grep -rEi 'Remove-Item|rm -rf|Format-Volume|dangerous|destructive|drive root' src/rdc src/mcp` hanya menemukan anotasi `destructiveHint`; `command-manager.ts` hanya blocklist nama perintah. Tidak ada resolusi target penghapusan. → BELUM-ADA (penjaga target deterministik).
- Delta/celah: fungsi murni `assessDeletionTarget(command)` yang mengurai `Remove-Item/del/rd/rmdir/rm` (PowerShell, cmd, Git Bash), me-resolve `~`, `%USERPROFILE%`, `$HOME`, nama pendek 8.3 (`fs.realpathSync.native`), junction, dan menolak target = akar drive, folder profil pengguna, `C:\Windows`, `C:\Program Files*`, `E:\Projects` akar; selain itu lolos. Respons: error terstruktur dengan petunjuk penulisan ulang, bukan prompt (MCP tidak punya prompt).
- Cara adaptasi: modul di `src/rdc` yang dipanggil dari `command-manager` sebelum eksekusi; plus uji dari daftar butir di atas. Tidak menaikkan grant; hanya menolak. Perlu persetujuan pengguna karena AGENTS.md bagian "tanpa minta izin" bisa dianggap bertentangan: usulkan sebagai refusal-only, dengan pengecualian eksplisit via parameter bila pengguna meminta.
- Lisensi/hak cipta: ide saja.
- Perkiraan skala: M · Risiko: sedang (false positive menghalangi pekerjaan sah) · Nilai: tinggi · Skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: butir terverifikasi; bahwa tidak ada penjaga lain di luar `src/rdc`/`src/mcp` adalah inferensi dari grep.
- Disposisi: ADAPT

### CHG-06 Edit/Write: tolak file non-UTF-8, jaga BOM/CRLF, hindari "file modified" palsu
- Sumber: CHANGELOG.md L730 (2.1.296: Edit/NotebookEdit mengganti semua karakter non-ASCII pada file bukan UTF-8 seperti Windows-1252, Shift-JIS, GBK; kini ditolak); L631 (2.1.299: Read merusak UTF-16LE ber-BOM; Write menghilangkan BOM atau diam-diam mengonversi Windows-1252/Shift-JIS/GBK/UTF-16BE ke UTF-8; kini ditolak); L8098 (2.1.7: "file modified" palsu di Windows karena sinkronisasi cloud, antivirus, Git mengubah mtime tanpa mengubah isi); L868 (2.1.295: Edit menganggap file sudah dibaca penuh padahal isi berubah tanpa mtime berubah); L7153 (2.1.77: Write mengubah akhir baris saat menimpa file CRLF); L6811 (2.1.89: Edit/Write menggandakan CRLF di Windows dan menghapus hard line break Markdown); L7748 (2.1.47: Edit merusak tanda kutip melengkung Unicode); L2349 (2.1.277: urutan `\\uXXXX` diperlakukan sebagai escape Unicode); L2351 (2.1.277: path berisi `\u0000` memotong giliran); L4273 (2.1.218: path Windows berawalan `\u` seperti `C:\Users\unicorn` rusak menjadi karakter CJK); L4404 (2.1.214: `>` di Windows PowerShell 5.1 menulis UTF-16LE yang tak terbaca alat lain); L4402 (2.1.214: skrip Python di tool PowerShell crash `UnicodeEncodeError`); L3629 (2.1.246: Write membeku setelah menimpa file sangat besar); L4595 (2.1.208: cache baca Edit dibatasi 16 MB).
- Observasi: butir-butir ini adalah satu keluarga kegagalan integritas data pada Windows: penyandian, akhir baris, mtime tak andal, escape pada path.
- Nilai untuk Agent Core: `src/rdc/utils/files/text.ts` hanya mendeteksi BOM UTF-16LE (0xFF 0xFE) dan memperlakukan sisanya sebagai UTF-8 (baris 55-63, 108-112, 156-158); `lineEndingHandler.ts` menangani akhir baris. Sebuah file Windows-1252 yang dibuka sebagai UTF-8 lalu ditulis ulang akan kehilangan byte (U+FFFD). PowerShell 5.1 dan alat Windows lama menghasilkan UTF-16LE atau 1252 secara rutin.
- Baseline Agent Core: BOM UTF-16LE dan akhir baris: SUDAH-ADA. Penolakan UTF-8 tidak valid, UTF-16BE, BOM UTF-8 yang dipertahankan, perbandingan isi (bukan mtime) untuk "berubah sejak dibaca": `grep -nEi 'mtime|stale|changed since|hash' src/rdc/tools/edit.ts` kosong. → SEBAGIAN.
- Delta/celah: (a) saat membaca untuk edit, validasi UTF-8 ketat (`TextDecoder` dengan `fatal:true`) dan tolak dengan pesan jelas bila gagal, tawarkan jalur "edit biner/byte"; (b) deteksi UTF-16BE dan BOM UTF-8 agar dipertahankan saat menulis; (c) gunakan hash isi, bukan mtime, untuk deteksi perubahan eksternal; (d) uji path dengan `\u` literal dan byte nol.
- Cara adaptasi: perubahan di `src/rdc/utils/files/text.ts` dan `src/rdc/tools/edit.ts` (owner: mesin kontrol lokal) + uji. Tanpa skema tool baru.
- Lisensi/hak cipta: ide saja.
- Perkiraan skala: M · Risiko: sedang (mengubah perilaku tulis; perlu uji fixture 1252/UTF-16BE) · Nilai: tinggi · Skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: butir terverifikasi; ketiadaan validasi di edit.ts adalah inferensi dari grep nama-simbol, bukan pembacaan penuh file.
- Disposisi: ADAPT

### CHG-07 Rewind/checkpoint: verifikasi sebelum lapor sukses, batas disk, hard link, reset pelacakan baca
- Sumber: CHANGELOG.md L3223 (2.1.260: `/rewind` dan `--rewind-files` melapor sukses padahal file cadangan hilang dan tidak ada yang dipulihkan); L3224 (2.1.260: rewind meninggalkan pelacakan baca lama sehingga muncul "file tidak berubah sejak dibaca" dan injeksi ulang penuh); L4368 (2.1.216: rewind tidak lagi memulihkan/menghapus lewat symlink atau hard link dan melaporkan jumlah yang dilewati); L2453 (2.1.275: rewind pada sesi fork/latar memulihkan file berisi nol atau terpotong); L4596 (2.1.208: ukuran transkrip dikurangi sampai 79x dan penggunaan disk checkpoint dibatasi dengan memangkas versi yang digantikan); L7642 (2.1.50: snapshot riwayat file dibatasi); L56 (2.1.309: daftar rewind menampilkan "tidak ada perubahan" untuk giliran yang mengubah file via `/code-review --fix`); L1108 (2.1.290: rewind tidak mendaftar prompt yang dikirim saat Claude masih bekerja); L5759 (2.1.141: menu rewind "Summarize up to here" meringkas konteks awal sambil menjaga giliran terbaru); L4912 (2.1.191: rewind ke sebelum `/clear`); L870 (2.1.295: tugas terjadwal yang dihentikan muncul kembali setelah rewind).
- Observasi: rewind menjadi sumber bug berulang karena menyentuh tiga hal sekaligus: file di disk, pelacakan baca, dan riwayat percakapan; laporan sukses harus berdasarkan verifikasi nyata.
- Nilai untuk Agent Core: `src/rdc/checkpoints/service.ts` sudah menolak symlink (`CHECKPOINT_SYMLINK_REFUSED`, baris 211), membandingkan identitas file sebelum/sesudah (baris 206-231), memakai blob berhash (baris 185-199), serta membatasi 32 file × 64 MB dan kuota (baris 15-16, 303-310). Turn checkpoint ada di `src/agent-turn-checkpoint.ts`.
- Baseline Agent Core: symlink dan kuota: SUDAH-ADA. Hard link: `grep nlink src` kosong → BELUM-ADA. Verifikasi bahwa blob cadangan benar-benar ada dan hash cocok sebelum menyatakan restore sukses, pelaporan jumlah yang dilewati, reset pelacakan baca setelah restore: tidak terverifikasi → SEBAGIAN.
- Delta/celah: tolak target dengan `nlink > 1` (atau laporkan dilewati); sebelum restore, periksa seluruh blob dan hash, bila ada yang hilang kembalikan galat, bukan sukses; setelah restore, invalidasi cache "sudah dibaca"; ringkasan hasil restore menyebut jumlah dipulihkan/dilewati/gagal.
- Cara adaptasi: perubahan kecil di `service.ts` + uji dengan blob dihapus dan hard link; panel task-changes membaca hasil yang sama.
- Lisensi/hak cipta: ide saja.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang-tinggi · Skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: baris baseline dibaca dari grep; urutan verifikasi pada kode tidak dibaca penuh.
- Disposisi: ADAPT

### CHG-08 Jalur Windows berbahaya: namespace NT, UNC/NTLM, junction, panjang jalur, drive-letter case
- Sumber: CHANGELOG.md L3905 (2.1.234: pembacaan file jarak jauh, pemulihan sesi, include CLAUDE.md, skrip workflow, upload menolak path namespace NT `\??\`, vektor kebocoran kredensial NTLM); L3964 (2.1.233: path berprefiks `\??\` melewati validasi UNC); L4041 (2.1.229: crash pada path extended-length `\\?\` atau UNC); L2680 (2.1.273: pemeriksaan path jaringan UNC dengan drive terpetakan); L3404 (2.1.257: `--add-dir` menolak path jaringan, gunakan huruf drive); L4352 (2.1.216: perintah baca-saja di Windows mengakses path jaringan tanpa prompt); L2805 (2.1.271: PowerShell gagal bila path output sementara mencapai 260 karakter); L2379 (2.1.277: pembacaan PDF gagal pada path kerja ±120 karakter); L320 (2.1.302: semua penulisan ditolak pada exFAT/FAT32); L5054 (2.1.181) dan L5270 (2.1.163): `EEXIST` pada direktori di OneDrive/atribut read-only; L7734 (2.1.47), L861 (2.1.295), L6436 (2.1.111): perbedaan huruf kapital drive menggandakan CLAUDE.md, rekaman instalasi, atau salah mengenali path yang sama; L5294 (2.1.162): aturan izin Windows tak pernah cocok jika ditulis dengan backslash atau huruf kapital berbeda; L4125 (2.1.224): path proyek >200 karakter bertabrakan pada nama direktori sesi yang disanitasi.
- Observasi: pola path Windows yang spesifik muncul berulang: awalan `\\?\`/`\??\`, UNC, huruf drive tidak sensitif huruf besar-kecil, MAX_PATH 260, nama pendek 8.3, junction, filesystem non-NTFS, sinkronisasi cloud.
- Nilai untuk Agent Core: satu fungsi kanonikalisasi path dengan uji kelas-kelas ini melindungi file tools, checkpoint, memory, Skill, dan penyimpanan chat. `src/security/file-identity.ts` dan `sensitive-file.ts` ada (TOCTOU-safe), `src/http/process-identity.ts` untuk server.
- Baseline Agent Core: `grep -rEi 'NTLM|UNC path|isUnc|\\\\\\?\\\\' src` kosong; hanya `src/net/public-address.ts` (rentang IP). Jaminan huruf drive/junction: tidak ditemukan satu fungsi kanonikalisasi bersama (grep realpath tersebar di checkpoints, code-intelligence, learning). → SEBAGIAN.
- Delta/celah: modul tunggal `canonicalizeWindowsPath` + uji korpus (awalan NT, UNC, 8.3, huruf drive berbeda, trailing dot/spasi, nama perangkat `CON`, `NUL`, ADS `file:stream`) dan penolakan akses jaringan tanpa konfirmasi yang jelas.
- Cara adaptasi: helper di `src/security` (owner path policy) yang dipakai ulang oleh rdc, checkpoints, skill resource-path. Perubahan harus memeriksa `docs/PROJECT-STRUCTURE.md` agar tidak membuat rumah paralel.
- Lisensi/hak cipta: ide saja.
- Perkiraan skala: M · Risiko: sedang (menyentuh banyak pemanggil) · Nilai: sedang-tinggi · Skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: butir terverifikasi; ketiadaan kanonikalisasi bersama adalah inferensi dari grep.
- Disposisi: ADAPT

### CHG-09 Invarian kompaksi: mode kegagalan yang harus diuji
- Sumber: CHANGELOG.md L8 (2.1.310: kompaksi pasca "Prompt is too long" menyisakan terlalu banyak teks padat seperti base64/SVG sehingga permintaan berikutnya gagal lagi); L1756 (2.1.284: jika hasil kompaksi masih terlalu panjang, kompak sekali lagi); L7209 (2.1.76: kompaksi otomatis mencoba tanpa henti setelah gagal beruntun; kini pemutus sirkuit setelah 3 percobaan); L7686 (2.1.47: kompaksi gagal bila banyak dokumen PDF; blok dokumen dibuang bersama gambar); L4052 (2.1.229: pesan melebihi batas permintaan 32 MB tidak diulang bila tak ada gambar/dokumen untuk dibuang); L935 (2.1.293: Claude menganggap aksi terakhir sebelum kompaksi sudah selesai lalu menarik atau mengulangi pekerjaan); L5842 (2.1.139: prompt kompaksi diminta mempertahankan instruksi sensitif pengguna); L1955 (2.1.282: kompaksi gagal bila permintaan peringkasan ditolak; kini coba model cadangan); L2740 (2.1.271: salinan kedua perintah latar dijalankan setelah kompaksi karena yang pertama "terlupa"); L6989 (2.1.83: subagen latar tak terlihat setelah kompaksi sehingga agen duplikat dibuat); L7721 (2.1.47: plan mode hilang setelah kompaksi); L2542 (2.1.274: `/goal` aktif hilang saat resume sesi yang sudah dikompaksi); L870 (2.1.295: tugas terjadwal hilang setelah kompaksi); L2827 (2.1.269: status git yang diberitahukan pasca-kompaksi harus yang terkini); L3777 (2.1.239: pengingat pasca-kompaksi tidak boleh menjalankan ulang argumen skill sebagai permintaan baru); L2936 (2.1.268: ringkasan merusak teks berisi `$`); L270 (2.1.304: setelah kompaksi daftar skill dikirim ulang); L1028 (2.1.292: ringkasan yang mengulang `/nama` membuat Claude memanggil skill yang dicadangkan untuk pengguna).
- Observasi: kegagalan kompaksi jatuh ke tiga kelompok: (1) overflow berulang dan tak berhenti, (2) kehilangan status in-flight (rencana, goal, tugas latar, daftar tool/skill), (3) ringkasan yang mengubah makna (aksi dianggap selesai, perintah dianggap permintaan baru).
- Nilai untuk Agent Core: kompaksi konteks durable baru diadopsi hari ini.
- Baseline Agent Core: `src/agent-context-compaction.ts` (207 baris) memakai digest ekstraktif tanpa panggilan model (komentar baris 102 menyebut shortcut), penanda `NATIVE CONTEXT SUMMARY`/`NATIVE CONVERSATION SUMMARY`, dan mempertahankan `PRESENTED_TOOLS` (baris 63-64, 131) → tool yang pernah disajikan tetap diumumkan (SUDAH-ADA). Desain ekstraktif menghindari kelas "ringkasan model gagal/ditolak". `src/agent-context-accounting.ts:64` `contextRefusal` menolak bila tetap melebihi. Tidak ada logika retry/overflow di berkas kompaksi (grep `retry|attempt|overflow|base64` kosong). → SEBAGIAN.
- Delta/celah: uji invarian pasca-kompaksi: (a) tidak ada "aksi dianggap selesai" tanpa bukti (sertakan penanda status "dimulai/selesai/belum" per tool call dalam digest), (b) tugas aktif/prospective-intention/episode tetap terlihat, (c) blob besar (data URL, base64, SVG) tidak masuk digest tetapi diganti rujukan, (d) bila konteks tetap terlalu panjang setelah satu kali kompaksi, hasil jelas (galat dengan alasan) bukan loop, (e) argumen skill/perintah yang dikutip dalam digest diberi label "kutipan, bukan permintaan".
- Cara adaptasi: perluasan uji dan sedikit penambahan field pada digest di `src/agent-context-compaction.ts`; tidak ada model tersembunyi.
- Lisensi/hak cipta: ide saja.
- Perkiraan skala: M · Risiko: sedang · Nilai: tinggi · Skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: butir terverifikasi; kondisi nyata digest Agent Core terhadap tiap invarian belum diuji, hanya dibaca dari grep dan komentar.
- Disposisi: ADAPT

### CHG-10 Integritas riwayat chat saat dimuat ulang (self-heal, bukan crash)
- Sumber: CHANGELOG.md L2536 (2.1.274: sesi macet mencoba ulang galat 400 "unexpected tool_use_id"; transkrip korup kini pulih sendiri); L2451 (2.1.275: sesi gagal start/resume karena blok konten malformed); L2356 (2.1.277: crash resume bila pesan asisten tersimpan sebagai string biasa); L4294 (2.1.218) dan L4165 (2.1.223): sesi gagal setiap giliran karena lampiran/delta malformed; L3631 (2.1.246: 400 pada resume karena blok tool yang tak dikenal API); L1954 (2.1.282: galat "Invalid data in redacted_thinking block"; blok thinking dibuang lalu coba sekali); L5538 (2.1.152: blok thinking dengan tanda tangan basi setelah ganti model/login dibuang); L5900 (2.1.136: 400 pada blok thinking tersunting setelah tool); L1518 (2.1.286: `--resume` kehilangan giliran setelah batch tool paralel); L8232 (2.1.0: hasil tool yatim saat eksekusi paralel); L6161 (2.1.121: baris transkrip korup akibat shutdown tak bersih dilewati); L7908 (2.1.30: hang karena siklus `parentUuid`); L1325 (2.1.288: resume memuat transkrip terpotong saat sesi yang sama menulis ulang file); L4311 (2.1.217: peringatan saat penulisan transkrip gagal/disk penuh); L6501 (2.1.108: kegagalan menulis transkrip sebelumnya dibuang diam-diam); L4290 (2.1.218: riwayat prompt terjatuh atau ganda saat penulisan berlomba); L5040 (2.1.181: sesi diam kehilangan riwayat saat proses lain menjalankan pembersihan 30 hari); L6845 (2.1.89: `cleanupPeriodDays: 0` ditolak karena sebelumnya diam-diam menonaktifkan penyimpanan).
- Observasi: resume adalah komponen paling rapuh Claude Code (puluhan butir): satu catatan korup membuat sesi mati permanen tiap giliran. Solusi yang konsisten: validasi saat muat, lewati/sembuhkan bagian rusak, tulis atomik dengan peringatan kegagalan, dan bersihkan dengan hati-hati.
- Nilai untuk Agent Core: Native Agent menyimpan chat di `src/agent-chat-store.ts` dan memulihkan tugas yatim lewat `settleOrphanedTasks` (`src/agent-chat-service.ts:166, 802-853`); `agent-turn-checkpoint.ts` membersihkan `tool_call_id` (baris 152).
- Baseline Agent Core: penyelesaian tugas yatim: SUDAH-ADA; validasi pasangan tool_call/tool_result saat memuat, pembuangan blok khusus-penyedia saat ganti penyedia, tanda peringatan bila tulis gagal: tidak ditemukan (grep `orphan|tool_call_id|repair|sanitiz|malformed|corrupt|unpaired` hanya baris di atas). → SEBAGIAN.
- Delta/celah: fungsi `sanitizeHistoryForProvider(history, provider)` yang (a) menambal tool_call tanpa hasil dengan hasil sintetis "tidak dieksekusi", (b) membuang hasil tanpa panggilan, (c) membuang blok thinking/reasoning khusus penyedia saat provider berganti, (d) melewati dan menghitung rekaman korup serta menampilkan jumlahnya. Penolakan aman (dengan alasan) lebih baik daripada loop 400.
- Cara adaptasi: fungsi internal di sekitar `agent-chat-store.ts`/`agent-provider.ts` (owner chat store); uji dengan fixture rusak. Tanpa tool baru.
- Lisensi/hak cipta: ide saja.
- Perkiraan skala: M · Risiko: sedang · Nilai: tinggi (multi-provider meningkatkan peluang blok khusus-penyedia basi) · Skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: butir terverifikasi; kerentanan Agent Core spesifik adalah dugaan karena store tidak dibaca penuh.
- Disposisi: ADAPT

### CHG-11 Batas loop, retry, idle, dan penolakan beruntun
- Sumber: CHANGELOG.md L2044 (2.1.281: giliran bisa retry tak berhingga mengabaikan `--max-turns` saat model berganti-ganti panggilan tool tak terparse); L4669 (2.1.205: pesan yang dikirim saat giliran berakhir di batas max-turns hilang); L223 (2.1.304: plugin menjaga run headless melewati `--max-turns`, Stop, atau input berakhir dengan menelurkan subagen); L1568 (2.1.286: satu batas retry mencakup seluruh panggilan model); L1673 (2.1.285: permintaan gagal dicoba ulang sampai 21 kali saat streaming terus gagal); L6926 (2.1.84: variabel watchdog idle stream, default 90 detik); L7108 (2.1.79: fallback non-streaming dengan timeout 2 menit per percobaan); L5859 (2.1.139: galat "stream idle timeout" palsu karena timer tak dibersihkan); L6093 (2.1.126: pembatalan palsu saat model berpikir lama); L2220 (2.1.280: tolak berulang dengan backoff, berhenti setelah sepuluh); L5699 (2.1.143: hook Stop yang memblokir berulang kini diakhiri setelah 8 kali); L7124 (2.1.78: loop tak berujung bila galat API memicu hook stop yang memasukkan galat kembali ke model); L3352 (2.1.257: sesi Proactive berputar mengirim pesan pengisi alih-alih diam); L3651 (2.1.246) dan L3780 (2.1.239): check-in /goal dibatasi tiga kali dan di-backoff 30 menit, 1 jam, 2 jam; L3662 (2.1.243: rincian "Loops" di `/usage` untuk mendeteksi loop liar); L4433 (2.1.212) dan L4140 (2.1.224): batas jumlah subagen per sesi ditambah lalu dicabut, lalu batas konkurensi (L4327, 2.1.217).
- Observasi: tiga pola utama: anggaran tunggal per langkah (bukan per lapisan), pemutus sirkuit jumlah beruntun, dan watchdog idle yang bisa dikonfigurasi. Konfigurasi batas jumlah subagen berubah-ubah menunjukkan desain batas yang belum mantap.
- Nilai untuk Agent Core: Native Agent mempunyai `maxToolIterations: 24` dan `requestTimeoutMs: 60_000` (`src/agent-runtime.ts:467`), Reflexion untuk kegagalan berulang (`failure-loop-advisor.ts`), dan penjadwal provider.
- Baseline Agent Core: batas iterasi dan timeout: SUDAH-ADA. Retry tool-call tak terparse yang dihitung terhadap iterasi, pemutus sirkuit jumlah penolakan/gagal beruntun, watchdog stream idle terpisah dari timeout permintaan: tidak diverifikasi. Doktrin Agent Core menolak retry otomatis buta; usulan ini hanya memastikan semua jalur tetap berbatas, bukan menambah retry. → SEBAGIAN.
- Delta/celah: audit jalur retry di `agent-provider*.ts`/`agent-runtime.ts` terhadap daftar kasus: apakah retry mengabaikan batas iterasi, apakah satu anggaran mencakup percobaan ulang provider + fallback, apakah ada penghentian setelah N kegagalan beruntun yang sama; tambahkan uji.
- Cara adaptasi: uji dan perbaikan kecil di owner Native Agent.
- Lisensi/hak cipta: ide saja.
- Perkiraan skala: S-M · Risiko: rendah · Nilai: sedang · Skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: butir terverifikasi; perilaku aktual jalur retry Agent Core tidak dibaca.
- Disposisi: ADAPT

### CHG-12 Higiene injeksi prompt dan provenansi pesan
- Sumber: CHANGELOG.md L1053 (2.1.292: tag `<system-reminder>` dalam keluaran hook di-escape sebelum sampai ke model); L1802 (2.1.284: karakter tak terlihat dan tag peniru markup Claude Code di `MEMORY.md` dan catatan memori yang dipanggil dinetralkan); L4545 (2.1.210: Agent tool diperkeras terhadap injeksi prompt tak langsung dari konten yang dibaca subagen); L3114 (2.1.265: ringkasan artefak buatan orang lain diperlakukan sebagai konten tak tepercaya dan menandai instruksi tersemat); L5235 (2.1.166: pesan relai `SendMessage` dari sesi lain tidak membawa otoritas pengguna; penerima menolak persetujuan izin yang direlai); L4840 (2.1.198: pesan dari agen yang meluncurkan subagen adalah arahan tugas, tetapi pesan agen tidak pernah dianggap persetujuan pengguna); L4684 (2.1.205: notifikasi tugas latar menyatakan eksplisit bahwa tidak ada input manusia, mencegah persetujuan fiktif di transkrip); L5018 (2.1.183: pengiriman tugas terjadwal/webhook diperlakukan sebagai input keyboard dan bisa menyetujui izin tertunda; kini diklasifikasikan sebagai notifikasi tugas); L4399 (2.1.214: prompt terjadwal yang dikonfigurasi sendiri ditolak sebagai tak tepercaya; kini disampaikan sebagai tugas yang ditugaskan); L4079 (2.1.228: skill sinkron dari claude.ai: tidak menimpa perintah lokal, deskripsi disanitasi dan diberi label, isi tidak menjalankan `!` dan tidak memperluas `@`); L3948 (2.1.234: notifikasi tugas latar dikirim di dalam tag system-reminder); L2830 (2.1.269: escape terminal dan jeda baris dari catatan tugas latar tidak masuk daftar tugas); L1623 (2.1.285) dan L3479 (2.1.251): nama server MCP disanitasi (jeda baris, escape terminal); L3582 (2.1.247: nama marketplace dengan karakter kontrol/tak terlihat ditolak); L4482 (2.1.211: pratinjau izin yang direlai ke kanal chat menetralkan karakter bidi, lebar-nol, tanda kutip serupa).
- Observasi: Claude Code memperlakukan setiap string yang berasal dari luar (hook, memori, nama server, hasil subagen, pesan sesi lain, notifikasi sistem) sebagai kemungkinan penyusup: menetralkan markup tiruan dan karakter tak terlihat, melabeli asal, dan tidak pernah membiarkan pesan mesin menyamar sebagai persetujuan manusia.
- Nilai untuk Agent Core: Memory, Skill, partner Raka, Cortex, dan hasil tool semua masuk ke konteks Native Agent dan kontroler eksternal. Aturan "memori yang dipanggil adalah data, bukan perintah" ada di kontrak; penegakan teknis pada teks yang disuntikkan belum terlihat.
- Baseline Agent Core: `grep -rEi 'system-reminder|zero-width|bidi|homoglyph|invisible|imitat' src` (tanpa node_modules) tidak menemukan apa pun di kode produksi. `src/memory/capsule-integrity.ts` ada tetapi tidak dibaca (tidak diketahui apakah memeriksa karakter tak terlihat). → BELUM-ADA (netralisasi teknis), kontrak perilaku SUDAH-ADA.
- Delta/celah: fungsi `neutralizeUntrustedText(text)` (hapus/escape karakter kontrol, bidi, lebar-nol, tag mirip markup harness, pemisah yang menyerupai batas pesan) dipanggil pada: kapsul/rekaman memori yang dipanggil, deskripsi/nama Skill dari plugin Claude, keluaran tool yang disalin ke riwayat, dan nama kapabilitas. Pesan mesin (hasil tool, notifikasi, pesan partner) selalu berlabel asal dan tidak pernah membawa otoritas persetujuan.
- Cara adaptasi: helper di `src/security` dipakai di titik penyuntikan Memory (`src/memory`), adapter Skill (`src/skills/claude-plugin.ts`), dan pembentukan pesan Native (`src/agent-*.ts`). Tanpa tool baru.
- Lisensi/hak cipta: ide saja.
- Perkiraan skala: M · Risiko: sedang (salah menetralkan dapat merusak konten sah; perlu uji) · Nilai: tinggi · Skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: butir terverifikasi; kondisi `capsule-integrity.ts` tidak dibaca (celah verifikasi).
- Disposisi: ADAPT

### CHG-13 Redaksi rahasia: perluas pola dan jaga performa/validitas
- Sumber: CHANGELOG.md L714 (2.1.296: redaksi melewatkan nilai setelah kunci tanpa nilai, termasuk JSON di dalam string shell); L1533 (2.1.286: kunci dengan karakter tak terlihat di dalamnya); L1531 dan L1532: nilai setelah "Bearer"/"Basic" dan token terenkode persen; L1619 (2.1.285: password URL berisi `@` atau `%40`); L1534: URL dengan tanda baca; L3982 (2.1.232): familia token GitLab (`glrt-`, `gloas-`, dst.) dan `glpat-`/`gldt-`; L1193 (2.1.290) dan L1205: pembekuan beberapa detik saat pemindaian rahasia atau penyamaran bertemu teks panjang tanpa spasi; L1535 (2.1.286) dan L5794 (2.1.141): redaksi menghasilkan JSON tidak valid pada transkrip/bundel; L3927 (2.1.234): penyamaran kredensial pada pratinjau izin tak boleh menyembunyikan perintah/path dari pemberi persetujuan; blok kunci privat besar disunting penuh.
- Observasi: redaksi berbasis regex butuh pemeliharaan: awalan token penyedia, struktur URL, karakter tak terlihat, JSON dalam string, dan performa pada input patologis.
- Nilai untuk Agent Core: `redactSensitiveString` dipakai di `result-budget.ts`, `failure-loop-advisor.ts`, `learning/*`, `change-review.ts`.
- Baseline Agent Core: `src/security/redaction.ts` (42 baris) mencakup kunci sensitif, `Bearer ...`, nilai kunci Agent Core (`agent_core_*`), pasangan `kunci=nilai`/`--flag nilai`. Tidak ada awalan token penyedia umum (`ghp_`, `glpat-`, `sk-`, `AKIA`), password dalam URL (`user:pass@host`), blok kunci privat PEM, kunci berkarakter tak terlihat, atau uji performa input panjang. → SEBAGIAN.
- Delta/celah: tambah pola awalan token, `://user:pass@`, blok PEM, normalisasi karakter tak terlihat sebelum pencocokan kunci, batasi regex agar linear (tanpa backtracking katastrofik), dan uji pada teks 1 MB tanpa spasi. Redaksi pada pratinjau harus tidak menyembunyikan target perintah.
- Cara adaptasi: perluas `src/security/redaction.ts` + uji; owner tunggal sudah ada.
- Lisensi/hak cipta: ide saja.
- Perkiraan skala: S · Risiko: rendah-sedang (false positive memotong teks sah) · Nilai: sedang-tinggi · Skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: terverifikasi dari grep atas redaction.ts (pola yang tampil pada baris 8-12); pola tambahan di bawah baris 12 tidak dibaca.
- Disposisi: ADAPT

### CHG-14 Nama bertabrakan dengan properti prototipe (`constructor`, `__proto__`, `toString`)
- Sumber: lebih dari sepuluh butir: L548 (2.1.299: tool server MCP bernama `constructor`/`toString` selalu minta izin); L547 (2.1.299: server bernama `constructor`/`prototype` tak pernah tersambung); L726 (2.1.296: rahasia plugin bernama `constructor` terhapus saat simpan); L842 (2.1.295: opsi plugin bernama `constructor` selalu terbaca default); L1429 (2.1.287: plafon izin organisasi hilang untuk tool `__proto__`); L2754 (2.1.271: menu `/hooks` crash untuk matcher bernama `__proto__`); L4207 (2.1.221: crash saat menyiapkan permintaan untuk tool SDK bernama `constructor`); L6624 (2.1.98) dan L6667 (2.1.97): aturan izin bernama seperti properti JavaScript membuat `settings.json` diabaikan diam-diam; L580 (2.1.299): kunci `__proto__` dihapus diam-diam dari nilai yang diteruskan hook.
- Observasi: sejarah tunggal paling berulang di basis Node/TypeScript: objek biasa sebagai peta berkunci nama dari luar.
- Nilai untuk Agent Core: Agent Core adalah Node/TypeScript dengan registri berkunci nama Skill, kapabilitas, tool, dan proyek.
- Baseline Agent Core: `Object.create(null)` dipakai di `src/learning/service.ts:544,568`, `src/capability-awareness.ts:168,219`; `src/learning/outcome-safe-engineering.ts:20` menolak `__proto__|constructor|prototype`. Registri `src/skills`, `agent-capability-catalog.ts`, `agent-capability-resolver.ts` tidak diperiksa. → SEBAGIAN.
- Delta/celah: satu uji parametrik yang memberi nama `constructor`, `__proto__`, `prototype`, `toString`, `hasOwnProperty` ke Skill, kapabilitas, kunci memory, dan nama tool, memastikan tidak ada perilaku khusus (hilang/crash/diabaikan).
- Cara adaptasi: berkas uji kecil di `scripts/verify` atau uji unit; perbaikan hanya bila ada kegagalan (ganti `{}` menjadi `Map`/`Object.create(null)`).
- Lisensi/hak cipta: ide saja.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang · Skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: butir terverifikasi; kerentanan aktual Agent Core belum diuji.
- Disposisi: ADAPT

### CHG-15 Pemindai berkas kredensial: nama varian (swap, cadangan, titik dua)
- Sumber: CHANGELOG.md L3535 (2.1.248: unggahan menyertakan `prod.env`, `*.tfvars`, salinan swap/temp/cadangan seperti `key.pem.tmp`, `id_rsa.swo`); L1649 (2.1.285: nama berkas kredensial dengan titik dua sebelum ekstensi seperti `server:8443.key`); L1652: nama berkas dengan banyak tanda cadangan/editor; L1153 (2.1.290: perubahan tak berkomitmen pada berkas di bawah driver filter git).
- Observasi: pemeriksaan nama berkas kredensial harus mencakup varian editor/cadangan dan nama berisi karakter khusus.
- Nilai untuk Agent Core: pengguna meminta secret scan sebelum commit; `changed-source-security.ts` (CC-P2) memindai berkas berubah.
- Baseline Agent Core: `src/security/sensitive-file.ts` hanya memeriksa symlink/non-reguler/izin dan identitas berkas, bukan nama; cakupan nama berkas pada pemindai rahasia pra-commit tidak diverifikasi (tidak ada skrip `scripts` yang cocok `secret`). → SEBAGIAN (tidak terverifikasi).
- Delta/celah: tambahkan ke daftar pola nama: `*.env`, `*.tfvars`, `*.pem|*.key|id_*` dengan akhiran `.tmp|.bak|.swp|.swo|~|.orig`, nama dengan titik dua; uji korpusnya.
- Cara adaptasi: perluasan daftar pola di pemindai yang sudah ada (CC-P2 dan skrip secret scan); tanpa tool baru.
- Lisensi/hak cipta: ide saja.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang · Skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: butir terverifikasi; lokasi pasti pemindai pra-commit tidak ditemukan oleh grep (celah).
- Disposisi: ADAPT

### CHG-16 Keluaran proses yang bersih: ANSI/warna dan variabel lingkungan yang diwarisi
- Sumber: CHANGELOG.md L821 (2.1.295: perintah dan hook di sesi latar mewarisi `FORCE_COLOR=3`, kode warna masuk keluaran yang dibaca Claude); L6971 (2.1.83: opsi mencabut kredensial Anthropic dan penyedia cloud dari lingkungan subproses Bash, hook, MCP stdio); L6041 (2.1.128: subproses tak lagi mewarisi variabel `OTEL_*`); L5853 (2.1.139: hook berjalan tanpa akses terminal); L1119 (2.1.290: log daemon melewatkan karakter kontrol terminal; kini ditampilkan sebagai escape `\uXXXX`); L2830 (2.1.269: escape terminal dari catatan tugas latar); L6105 (2.1.126: penulisan clipboard tak lagi menampilkan isi di argumen baris perintah yang terlihat EDR/SIEM).
- Observasi: keluaran yang dibaca model harus bebas dari kode kontrol, dan lingkungan subproses perlu dikontrol.
- Nilai untuk Agent Core: keluaran proses yang dibaca model memakan token; `terminal-manager.ts` menetapkan `TERM: 'xterm-256color'` (baris 241, 259) sehingga banyak CLI memancarkan warna.
- Baseline Agent Core: `buildMachineShellEnv` (`src/security/environment.ts:30`) hanya menghapus kunci milik Agent Core; tidak ada penghapusan ANSI pada keluaran yang ditangkap (`grep stripAnsi|ansi` pada `src/rdc`, `src/mcp`, `src/security` tidak menemukan pembersih). → BELUM-ADA (pembersihan ANSI), SEBAGIAN (env).
- Delta/celah: bersihkan ANSI/OSC dari keluaran yang dikembalikan ke model (simpan mentah di spill), setel `NO_COLOR=1` dan hapus `FORCE_COLOR` pada env shell, dan evaluasi opsi menghapus kredensial penyedia host dari env anak (opt-in, mengingat pengguna memberi akses penuh).
- Cara adaptasi: fungsi kecil di `src/rdc/terminal-manager.ts`/`output-spill.ts`; perubahan env di `src/security/environment.ts`.
- Lisensi/hak cipta: ide saja.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang (hemat token, keluaran rapi) · Skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: terverifikasi dari grep; penghapusan env kredensial host bersifat opsional dan perlu keputusan pengguna.
- Disposisi: ADAPT

### CHG-17 Kredensial hanya dikirim ke hostnya sendiri (router penyedia)
- Sumber: CHANGELOG.md L3637 (2.1.246: telemetri membawa kunci API yang dikonfigurasi untuk gateway pihak ketiga; kini kredensial hanya dikirim ke hostnya); L5476 (2.1.153: gateway API kustom dapat menerima kredensial OAuth pengguna alih-alih token gateway); L3331 (2.1.257: header `Authorization` kustom ganda menimpa kredensial yang dikonfigurasi); L657 (2.1.299: permintaan ke proxy konektor tidak lagi mengikuti pengalihan HTTP); L3494 (2.1.251: header kustom pembawa kredensial dari pengaturan proyek memerlukan persetujuan).
- Observasi: kebocoran kredensial lintas host terjadi lewat pengalihan, header ganda, dan telemetri.
- Nilai untuk Agent Core: router multi-kunci/penyedia (`src/agent-provider-scheduler.ts`, `agent-provider.ts`) dan web research mengirim permintaan keluar.
- Baseline Agent Core: `src/net/public-address.ts` membatasi tujuan fetch ke alamat publik (termasuk 169.254.0.0/16, baris 29). Pengikatan kunci penyedia ke host dasar dan penolakan redirect saat membawa kredensial: tidak diverifikasi. → SEBAGIAN.
- Delta/celah: uji bahwa setiap kunci hanya dilekatkan ke `baseUrl` yang terdaftar, redirect lintas-host tidak membawa header otorisasi, dan header kustom pengguna tidak menimpa kredensial terkelola.
- Cara adaptasi: uji dan perbaikan kecil di `agent-provider*.ts` (owner routing).
- Lisensi/hak cipta: ide saja.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang · Skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: butir terverifikasi; perilaku Agent Core dugaan.
- Disposisi: ADAPT

### CHG-18 Siklus hidup proses latar: tenggat, kebuntuan interaktif, pohon proses, batas keluaran
- Sumber: CHANGELOG.md L2775 (2.1.271: watch Monitor selalu punya tenggat, maksimum 30 menit, 10 menit pada run sekali jalan, dan model diberi tahu); L1690 (2.1.285: perintah latar Bash/PowerShell berhenti setelah batas waktu, default 30 menit, maksimum 2 jam, model dikabari); L6936 (2.1.84: tugas latar yang tampak menunggu prompt interaktif memunculkan notifikasi setelah ±45 detik); L7181 (2.1.77: tugas latar dibunuh jika keluaran melebihi 5 GB); L4439 (2.1.212: SIGTERM saat tool Bash berjalan meninggalkan pohon proses yatim); L3373 (2.1.257: perintah yang melepaskan diri dari shell, mis. `timeout` atau `setsid`, bertahan setelah tugas dihentikan); L968 (2.1.293, Windows: menghentikan hook atau status line kadang membunuh proses tak terkait yang memakai ulang PID); L638 (2.1.299, Windows: pemeriksaan liveness meninggalkan proses PowerShell yatim hingga memori habis); L746 (2.1.296, Windows: server MCP stdio dibunuh paksa saat shutdown; kini stdin ditutup dulu lalu pohon dibunuh setelah 300 ms); L4400 (2.1.214, Windows: PowerShell menggantung sampai timeout karena proses anak menunggu stdin); L2255 (2.1.280: keluaran non-nol yang wajar seperti `grep` tanpa kecocokan dilaporkan gagal); L2575 (2.1.274: perintah latar dihentikan setelah 30 menit idle pada tekanan memori ringan); L4899 (2.1.193: reaping otomatis perintah latar idle saat tekanan memori); L455 (2.1.300: Claude melakukan polling file keluaran atau tidur menunggu perintah latar); L2404 dan L7023: alat TaskOutput dideprekasi lalu dihapus, pembacaan lewat Read; L4684: notifikasi menyebut tidak ada input manusia (lihat CHG-12).
- Observasi: tugas latar menimbulkan kelas kegagalan yang konsisten: tak berbatas waktu, tak terdeteksi macet di prompt, anak yatim, PID dipakai ulang, keluaran tanpa batas.
- Nilai untuk Agent Core: `src/rdc/process-ledger.ts` mencatat status dan memverifikasi identitas proses lewat `Win32_Process.CreationDate` (baris 49-70) sehingga PID reuse sudah ditangani (SUDAH-ADA); `src/process/owned-process-tree.ts` mengambil snapshot pohon turunan; `src/rdc/output-spill.ts` membatasi 256 MB/32 berkas/7 hari.
- Baseline Agent Core: identitas PID dan batas spill: SUDAH-ADA. Tenggat wajib untuk tugas latar yang lama, deteksi menunggu input interaktif, penutupan stdin sebelum kill, notifikasi saat dihentikan oleh batas waktu: tidak ditemukan. → SEBAGIAN.
- Delta/celah: kebijakan tenggat default untuk proses latar (dengan nilai yang dapat di-override), heuristik "tidak ada keluaran selama N detik dan ujung keluaran menyerupai prompt (`?`, `[y/n]`, `Password:`)" yang menandai proses sebagai "menunggu input", urutan stop: tutup stdin lalu tunggu 300 ms lalu bunuh pohon, serta pesan hasil yang menyebut bahwa proses dihentikan oleh batas waktu (bukan gagal).
- Cara adaptasi: perluasan `process-ledger.ts` dan `terminal-manager.ts` (owner proses); tanpa tool baru, hanya field status.
- Lisensi/hak cipta: ide saja.
- Perkiraan skala: M · Risiko: sedang · Nilai: sedang-tinggi · Skema tool baru: tidak (field pada respons yang ada) · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: butir terverifikasi; ledger Agent Core dibaca sebagian lewat grep.
- Disposisi: ADAPT

### CHG-19 Penjaga internal harus fail-closed
- Sumber: CHANGELOG.md L11 (2.1.310) dan L65 (2.1.309), L639 (2.1.299, Windows): hook PreToolUse/PermissionRequest meloloskan panggilan ketika Git Bash tidak ada atau program hook keluar dengan kode 2 di PowerShell; L781 (2.1.295: opsi `onFailure: "block"` agar hook yang gagal start, habis waktu, atau keluar dengan kode tak terduga memblokir tindakan); L1370 (2.1.288: hook dilewati bila pencocokan gagal atau input tak dapat diserialisasi; kini diblokir); L1651 (2.1.285: parser PowerShell gagal start sehingga aturan deny/ask dilewati dan kegagalan di-cache); L4419 (2.1.214: hook dengan exit code 2 tidak memblokir bila JSON stdout gagal skema); L656 (2.1.299: aksi yang dapat diblokir plugin hook ditolak, bukan diloloskan, bila hook tidak dapat menerima atau menjawab); L819 (2.1.295: input tool bersarang dalam terpotong tanpa galat sehingga penjaga meloloskan konten yang tak pernah dilihatnya); L1887 dan L1965 (2.1.282-283: nilai bersarang tidak valid pada pengaturan terkelola kini gagal-tutup sementara sisanya tetap berlaku); L4175 (2.1.222: hook auto-allow melewati pembatasan tool pada tugas latar); L7152 (2.1.77) dan L6572 (2.1.101): hook "allow"/"ask" tidak boleh melemahkan aturan deny.
- Observasi: ini kelas desain paling mahal: penjaga yang gagal lalu membiarkan lewat. Claude Code menempuhnya berulang kali dan akhirnya menetapkan prinsip "gagal berarti blokir, dan urutan deny > hook > allow tidak pernah terbalik".
- Nilai untuk Agent Core: Agent Core menolak hook sebagai otoritas, tetapi punya penjaga internal (command-manager, path policy, akses sensitif, grant dinamis, ekstraksi perintah dengan `$()` dll.).
- Baseline Agent Core: `command-manager.ts` mengembalikan false untuk perintah terblokir (baris 241-251), `sensitive-file.ts` melempar saat ragu; perilaku saat parse/ekstraksi melempar galat tidak diverifikasi. → SEBAGIAN.
- Delta/celah: tinjau setiap penjaga untuk jalur galat (try/catch yang menelan dan meloloskan) dan tambahkan uji "penjaga melempar ⇒ ditolak"; dokumentasikan urutan prioritas keputusan (tolak kebijakan > izin task-scoped > default).
- Cara adaptasi: tinjauan kode dan uji; tidak ada fitur baru.
- Lisensi/hak cipta: ide saja.
- Perkiraan skala: S-M · Risiko: rendah · Nilai: tinggi · Skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: butir terverifikasi; status jalur galat penjaga Agent Core tidak diaudit.
- Disposisi: ADAPT

### CHG-20 Skill konten: bahaya host Windows/PowerShell (daftar periksa on-demand)
- Sumber: CHANGELOG.md (Bagian Windows, 323 butir dibaca penuh), antara lain L4404 (2.1.214: `>` di PowerShell 5.1 menulis UTF-16LE); L4402 (2.1.214: Python crash `UnicodeEncodeError`/`UnicodeDecodeError` pada keluaran/masukan non-UTF-8); L6837 (2.1.89: stderr berisi kemajuan `git push` dilaporkan sebagai kegagalan pada PowerShell 5.1); L4403 (2.1.214: `where.exe`, `fc.exe`, `diff.exe` mengembalikan negatif sah dilaporkan sebagai galat); L4856 (2.1.196: `git diff`/`git grep`/`egrep` keluar 1 dilaporkan gagal); L4400 (2.1.214: PowerShell menggantung saat anak menunggu stdin); L745 (2.1.296: perintah >1 KB selalu minta izin, kini 32 KB); L5694 (2.1.143: `-ExecutionPolicy Bypass` secara default); L4224 (2.1.221: alat keamanan endpoint memberi prompt jika `powershell.exe` dijalankan untuk waktu pembuatan proses; diganti panggilan kernel32); L5827 (2.1.140: stall event-loop berulang karena `where.exe` dijalankan sinkron untuk executable yang tidak ada) dan L6306 (2.1.117: cache pencarian `where.exe`); L5270 (2.1.163) dan L5054 (2.1.181): `EEXIST` pada OneDrive/atribut read-only; L305 (2.1.302): PowerShell tidak menemukan perintah di `bin/` plugin dan melaporkan galat pada pencarian kosong yang dipipa ke `Select-Object`; L4440 (2.1.212: kebijakan grup memblokir PowerShell 5.1 sehingga daemon harus memilih PowerShell 7); L5593 (2.1.147: pwsh dari winget/Microsoft Store gagal dengan exit code 1); L6105 (2.1.126: konten clipboard terlihat di argumen baris perintah); L4273 (2.1.218: path berawalan `\u` rusak).
- Observasi: ~40 butir menunjukkan hazard spesifik host Windows/PowerShell yang akan dialami Agent Core juga (encoding, kode keluar, stdin, EDR, OneDrive, PATHEXT, cache lookup).
- Nilai untuk Agent Core: sebagian besar sudah dipelajari sendiri secara kasus per kasus (mis. PATHEXT di `terminal-manager.ts:36`, `COMSPEC` di `improved-process-tools.ts:161`), tetapi tidak ada daftar periksa terpusat yang dibaca model saat menulis perintah PowerShell.
- Baseline Agent Core: tidak ada capability pack Windows/PowerShell (39 capability: Replica, Addy, indeks, mind-control, performance-oriented-software-engineering, reverse-engineer-anything). → BELUM-ADA.
- Delta/celah: satu Skill konten `windows-powershell-host` (di `runtime/skills/capability-packs/`), dengan `## Triggers` dan `## Non-triggers`, memuat daftar periksa: kode keluar non-nol sah, UTF-8 vs UTF-16LE, stdin tertutup untuk anak, lookup executable (cache negatif), path panjang/OneDrive/read-only, aturan kutip, `Select-Object` pada pencarian kosong, hindari PowerShell 5.1-only syntax, EDR. Badan ≤ 8.192 byte; referensi di berkas terpisah.
- Cara adaptasi: Skill baru (konten on-demand), disusun lewat jalur proposal Skill yang ada; tidak menambah teks selalu-dimuat dan tidak menyentuh manifest MCP.
- Lisensi/hak cipta: fakta teknis umum; isi ditulis sendiri, tanpa menyalin butir.
- Perkiraan skala: S · Risiko: rendah · Nilai: tinggi untuk host ini · Skema tool baru: tidak · Menambah teks selalu-dimuat: tidak (hanya satu deskripsi Skill di katalog)
- Bukti vs dugaan: butir terverifikasi; seluruh nomor baris pada Bagian B telah diverifikasi otomatis terhadap heading versi dan butir di CHANGELOG.md.
- Disposisi: ADAPT

### CHG-21 Validasi konfigurasi: gagal-tutup parsial, satu entri buruk tidak membuang file, penulis bersamaan
- Sumber: CHANGELOG.md L1887 (2.1.283) dan L1965 (2.1.282): nilai bersarang tidak valid pada blok terkelola kini gagal-tutup tetapi sisa blok tetap berlaku; L6131 (2.1.122) dan L6560 (2.1.101): satu entri hook salah atau nama kejadian tak dikenal tidak lagi membatalkan seluruh `settings.json`; L3251 (2.1.260: aturan izin dengan teks setelah kurung tutup dilaporkan sebagai tidak valid); L8151 (2.1.3: deteksi aturan izin tak terjangkau di `/doctor`); L2464 (2.1.275: `Write(path)` tidak pernah cocok pada pemeriksaan file; harus `Edit(path)`); L4522 (2.1.210: peringatan startup); L3273 (2.1.259: sesi bersamaan saling mengembalikan perubahan `~/.claude.json`); L7568 (2.1.61: tulis bersamaan merusak berkas konfigurasi di Windows); L5898 (2.1.136) dan L6090 (2.1.126): balapan tulis kredensial; L5958 (2.1.133: `ECOMPROMISED` saat kunci berkas kehilangan validitas); L3950 (2.1.234: startup menunggu lama saat `~/.claude.json` read-only); L5292 (2.1.162: startup hang bila direktori konfigurasi tak dapat ditulis; mulai dengan konfigurasi di memori dan tampilkan galat); L4396 (2.1.214: berkas pengaturan >2 MiB gagal saat startup dengan galat jelas); L3667 (2.1.243: baris `Skipped sources` di status).
- Observasi: konfigurasi adalah permukaan kegagalan senyap; prinsip: validasi menyebut kunci dan berkas, bagian valid tetap berlaku, bagian yang mengunci keamanan gagal-tutup, penulisan atomik dengan gabung ulang.
- Nilai untuk Agent Core: `src/rdc/config-manager.ts` dan pengaturan lain, serta proses ganda (kontroler eksternal + Native + UI).
- Baseline Agent Core: `src/memory/lock.ts` dan `src/semantic-ide/transaction.ts` melakukan penulisan atomik/kunci; validasi `config-manager` tidak diaudit. → SEBAGIAN.
- Delta/celah: periksa apakah satu nilai config buruk membatalkan seluruh konfigurasi, apakah galat menyebut kunci/berkas, apakah penulisan bersamaan dari dua proses bergabung atau saling menimpa.
- Cara adaptasi: tinjauan dan uji pada `config-manager.ts`; tidak ada fitur baru.
- Lisensi/hak cipta: ide saja.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang · Skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: butir terverifikasi; kondisi `config-manager.ts` tidak dibaca.
- Disposisi: ADAPT

### CHG-22 Rincian konteks/biaya per sumber dan laporan Skill tak terpakai
- Sumber: CHANGELOG.md L3133 (2.1.261: `/skill-doctor`); L7253 (2.1.74: `/context` memberi saran, mengidentifikasi tool berat konteks dan memori membengkak); L522 (2.1.299: peringatan `/usage` untuk effort maksimum, workflow, konteks selalu-aktif, hasil tool besar); L5546 (2.1.149: rincian `/usage` per kategori: skill, subagen, plugin); L6743 (2.1.92: rincian per model dan cache-hit pada `/cost`); L3170 (2.1.261: hitungan token `/context` memakai estimasi lokal bila API penghitungan tak tersedia); L2653 (2.1.273: meter konteks menghitung giliran tool advisor dua kali sehingga kompaksi terlalu dini); L7241 (2.1.75) dan L6321: estimasi token terlalu besar untuk blok thinking/tool_use menyebabkan kompaksi prematur; L4605 (2.1.208: tampilkan batang penggunaan terakhir yang diketahui dengan catatan "per" waktu bila endpoint kena batas laju); L5844 (2.1.139: estimasi token per skill memperhitungkan tokenizer model); L6021 (2.1.129: keluaran `/context` tidak boleh membuang grid ASCII ke percakapan, memboroskan ±1,6k token); L6484 (2.1.108: peringatan sebelum ganti model karena respons berikutnya membaca ulang seluruh riwayat tanpa cache); L2277 (2.1.280: penyebab cache-miss `/cost` menyebut perubahan mode thinking).
- Observasi: ukuran konteks ditampilkan per sumber dengan saran tindakan; angka stale diberi label; estimasi lokal sebagai fallback; alat sendiri tidak boleh boros token.
- Nilai untuk Agent Core: akuntansi konteks tunggal sudah diadopsi; masalah teks selalu-dimuat butuh rincian per sumber agar jelas apa yang layak dipangkas.
- Baseline Agent Core: `src/agent-context-accounting.ts` (`ContextAccounting`, `accountContext`, `contextRefusal`, `completionCap`, `OUTPUT_RESERVE_TOKENS`) → SUDAH-ADA untuk total. Rincian per kategori (selalu-dimuat, Skill dimuat, hasil tool, riwayat) dan laporan Skill tak terpakai (data dari Activity Tracker): tidak diverifikasi. → SEBAGIAN.
- Delta/celah: tambahkan rincian kategori ke objek akuntansi yang sama dan tampilkan di UI; laporan "Skill yang tak pernah dipakai 30 hari beserta biaya deskripsi" dari data lokal.
- Cara adaptasi: field tambahan pada `ContextAccounting` + panel UI; laporan Skill sebagai skrip di `scripts` membaca Activity Tracker. Tidak ada telemetri jarak jauh.
- Lisensi/hak cipta: ide saja.
- Perkiraan skala: M · Risiko: rendah · Nilai: sedang · Skema tool baru: tidak (UI/internal) · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: butir terverifikasi; ketersediaan data pemakaian Skill di Activity Tracker adalah dugaan.
- Disposisi: ADAPT

### CHG-23 Siklus hidup Skill/plugin: validasi, tabrakan ID, path, uninstall, rekaman
- Sumber: CHANGELOG.md L3272 (2.1.259: `claude plugin validate --json` laporan mesin); L7180 (2.1.77: validate memeriksa frontmatter skill/agen/command dan `hooks.json`); L1867 (2.1.283: validate menerima nama yang tak dapat dipasang); L4200 (2.1.221: peringatan jika nama ditolak Claude Desktop); L2948 (2.1.268): nama direktori diawali dua titik; L1630 (2.1.285: instal menaruh plugin ke cache plugin lain karena id berbeda hanya `.`, `-`, `@` atau huruf besar; kini ditolak); L1871 (2.1.283: uninstall menghapus plugin lain yang id-nya berbeda hanya huruf besar); L1982 (2.1.282: uninstall menghapus opsi dan rahasia plugin saat daftar terpasang tak terbaca; kini disimpan); L1875 (2.1.283: `installed_plugins.json` ditulis ulang dan kehilangan rekaman yang tak dikenal); L3358 (2.1.257: plugin membaca berkas di luar direktorinya lewat komponen symlink; kini ditolak); L3082 (2.1.265) dan L3020 (2.1.267): path ber-backslash melewati pemeriksaan penampungan; L2233 (2.1.280: skill di `~/.claude/skills/` dipindahkan ke `.trash` akibat `manifest.json` di folder itu); L4992 (2.1.186: frontmatter YAML rusak memuat badan skill dengan metadata kosong); L5691 (2.1.143: `disable` ditolak bila plugin lain bergantung); L6137 (2.1.121: `plugin prune`); L1780 (2.1.284: instal pertama yang gagal meninggalkan plugin enabled dan tercatat); L2813 (2.1.269: `plugin eval` skor reprodusibel; run yang berakhir galat API diskor 0); L2854 (2.1.269: arsip plugin diekstrak dengan izin dunia-dapat-tulis); L4076 (2.1.228) dan L3576: pembersihan cache menghapus versi aktif; L4751 (2.1.202: pemanggilan ulang skill yang sudah dimuat menambah salinan instruksi); L4191 (2.1.222: penolakan skill `disable-model-invocation` memberi tahu model agar meminta pengguna).
- Observasi: lifecycle plugin/skill menghasilkan banyak bug identitas (id tidak dinormalisasi), atomisitas (instal/uninstall setengah jalan), dan penampungan path.
- Nilai untuk Agent Core: SkillService punya katalog, staging, revisi, promote, rollback, preview `validate` adapter plugin Claude; Windows bersifat tidak peka huruf besar-kecil sehingga tabrakan id lebih mungkin.
- Baseline Agent Core: `src/skills/claude-plugin.ts:109` menormalkan nama (NFKD, huruf kecil); `resource-path.ts` ada. Penolakan tabrakan id yang hanya beda huruf/pemisah, penolakan symlink/junction pada sumber, keluaran validasi JSON, instal atomik dengan rollback: tidak diverifikasi. → SEBAGIAN.
- Delta/celah: uji korpus pada adapter: dua nama yang beda hanya huruf/titik/strip, sumber berisi junction/symlink keluar dari akar, path ber-backslash, frontmatter rusak (tetap tolak karena aturan frontmatter ketat Agent Core), instal gagal di tengah ⇒ tidak ada sisa terpromosi.
- Cara adaptasi: uji dan perbaikan kecil di `src/skills`; tidak ada fitur plugin baru (komponen non-skill tetap hanya dilaporkan).
- Lisensi/hak cipta: ide saja.
- Perkiraan skala: S-M · Risiko: rendah · Nilai: sedang · Skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: butir terverifikasi; status uji Agent Core tidak diaudit.
- Disposisi: ADAPT

### CHG-24 Profil terbatas dan mode aman untuk pemulihan
- Sumber: CHANGELOG.md L5192 (2.1.169: `--safe-mode`/`CLAUDE_CODE_SAFE_MODE` memulai dengan semua kustomisasi dimatikan: CLAUDE.md, plugin, skill, hook, MCP, untuk pemecahan masalah); L3506 (2.1.248: `--restricted` menghapus tool yang menjalankan perintah/kode dan WebFetch, menjaga tool file di dalam direktori kerja, menolak bypass, dan mengabaikan berkas pengaturan); L7046 (2.1.81: `--bare` untuk panggilan skrip tanpa hook, LSP, sinkronisasi plugin, penelusuran skill); L7633 (2.1.50: `CLAUDE_CODE_SIMPLE` menonaktifkan MCP, lampiran, hook, CLAUDE.md); L3270 (2.1.259: `--permission-prompts none`, semua yang akan meminta izin ditolak otomatis).
- Observasi: tiga profil kecil yang menyelesaikan masalah berbeda: pulih dari kustomisasi rusak, kerja sangat terbatas, dan headless tanpa interaksi.
- Nilai untuk Agent Core: bila capability pack atau AGENTS.md bermasalah memblokir bootstrap, tidak ada jalan masuk aman yang terdokumentasi; Native memiliki resolver kapabilitas dan grant dinamis per task.
- Baseline Agent Core: `grep 'safe.?mode|restricted mode|--restricted' src` kosong. Grant dinamis per task (`agent-capability-resolver.ts`) menyerupai profil terbatas (SEBAGIAN). → BELUM-ADA untuk mode aman.
- Delta/celah: tombol/flag "safe mode" untuk Native/launcher yang memulai tanpa capability pack, Skill hasil staging, dan penambahan AGENTS.md bertingkat; profil "read-only task" untuk Native sebagai preset grant. Tidak menaikkan grant.
- Cara adaptasi: flag pada launcher/Native runtime + dokumentasi di `docs`; mode aman memakai resolver yang ada dengan set kosong.
- Lisensi/hak cipta: ide saja.
- Perkiraan skala: M · Risiko: sedang · Nilai: sedang · Skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: butir terverifikasi; kebutuhan nyata pada Agent Core adalah dugaan.
- Disposisi: ADAPT

### CHG-25 Kriteria penerimaan untuk instruksi workspace bertingkat (item BERSYARAT)
- Sumber: CHANGELOG.md L2336 (2.1.277: AGENTS.md dibaca bila tidak ada CLAUDE.md); L45 (2.1.309: CLAUDE.md bersarang melebihi batas hanya dimuat awalnya, mencegah kompaksi berulang); L3402 (2.1.257: `defaultMode: bypassPermissions` dalam pengaturan proyek diabaikan; hanya pengaturan pengguna/terkelola); L4629 (2.1.207: `autoMode` tidak lagi dibaca dari `settings.local.json` yang berada di repo); L1709 (2.1.285: pengaturan proyek tak dapat memperlebar sandbox yang diwajibkan admin); L3832 (2.1.238) dan L4292 (2.1.218): perintah/hook dari berkas repo butuh dialog kepercayaan folder; L3991 (2.1.232: repo git bersarang meminta kepercayaan sendiri, tidak mewarisi); L4298 (2.1.218: dialog kepercayaan menyebut akar repo yang dicakup); L7734 (2.1.47) dan L2075 (2.1.281) dan L7454 (2.1.69): CLAUDE.md dimuat dua kali karena huruf kapital drive berbeda, `--add-dir` di dalam direktori kerja, atau worktree bersarang; L1027 (2.1.292: baris "instruction file not loaded" dan catatan transkrip bila file bersarang tidak dimuat); L1113 (2.1.290) dan L1961 (2.1.282): CLAUDE.md/rules yang symlink keluar direktori kerja diblokir saat pembacaan di luar kerja diblokir; L2651 (2.1.273: direktori memori yang dipilih pengaturan repo tidak dimuat); L1191 (2.1.290: AGENTS.md subdirektori tidak terlampir saat file dibawahnya di-@-mention); L7315 (2.1.72: komentar HTML di CLAUDE.md disembunyikan dari model).
- Observasi: jika ada instruksi tingkat folder, aturan keselamatan yang berlaku: file instruksi tidak boleh menaikkan izin; dimuat sekali; terbatas ukuran; symlink/junction keluar akar ditolak; transparansi mengenai file yang dimuat dan yang tidak.
- Nilai untuk Agent Core: item BERSYARAT "instruksi workspace bertingkat (agents-md) untuk Native" butuh kriteria penerimaan yang konkret; changelog memberi daftar kegagalan nyata.
- Baseline Agent Core: tidak ada pemuatan AGENTS.md bertingkat di Native (`grep 'workspace trust|workspaceTrust'` kosong). Fingerprint workspace (CC-P1) ada. → BELUM-ADA (karena belum diadopsi).
- Delta/celah: bila item BERSYARAT disetujui, kriteria: (1) isi instruksi tidak pernah mengubah grant, (2) deduplikasi berdasarkan path kanonik (huruf drive, symlink), (3) batas ukuran per file dengan pemotongan yang dilaporkan, (4) tolak symlink/junction keluar akar, (5) baris transparansi "dimuat/tidak dimuat", (6) nonaktifkan komentar HTML bagi model, (7) uji duplikasi worktree/`add-dir`.
- Cara adaptasi: dokumen kriteria di `docs/proposals`, bukan kode. Menunggu keputusan pengguna.
- Lisensi/hak cipta: ide saja.
- Perkiraan skala: S (dokumen) · Risiko: rendah · Nilai: sedang · Skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: butir terverifikasi (nomor baris dan versi dicek otomatis).
- Disposisi: REFERENSI

### CHG-26 Kontrak child-task Native dan pelajaran subagen (item BERSYARAT)
- Sumber: CHANGELOG.md L3647 (2.1.246: subagen yang berhenti di batas `maxTurns` mengembalikan keluaran bertanda parsial); L4786 (2.1.199) dan L4785: galat API/batas laju dilaporkan sebagai galat, bukan hasil sukses; L2401 (2.1.277: hasil subagen tiba di bawah header yang menandai sebagai keluaran subagen); L4545 (2.1.210: injeksi tak langsung via konten yang dibaca subagen); L4840 (2.1.198): pesan agen bukan persetujuan pengguna; L1625 (2.1.285: fork mempertahankan plan mode/`dontAsk` induk dan tidak bisa keluar dari plan mode); L4329 (2.1.217: batas biaya menghentikan subagen latar); L4471 (2.1.212: parameter `mode` Task dihapus; subagen mewarisi mode izin induk); L4174 dan L4523: subagen terisolasi worktree menjalankan perintah git destruktif ke checkout utama; L5081 (2.1.178: spawn subagen dievaluasi sebelum diluncurkan); L2253 (2.1.280: laporan subagen hilang bila percakapan induk dikompaksi sebelum dibaca); L6989 (2.1.83: subagen latar tak terlihat pasca-kompaksi sehingga duplikat dibuat); L5154 (2.1.172), L5041 (2.1.181), L4328 (2.1.217), L4267 (2.1.219): kedalaman subagen 1 → 5 → default tak bersarang → 3; L4433 (2.1.212), L4140 (2.1.224), L4327 (2.1.217): batas spawn per sesi ditambah lalu dicabut dan diganti batas konkurensi.
- Observasi: kontrak anak-tugas yang stabil mencakup: mewarisi (bukan menaikkan) izin, hasil berlabel dan tak tepercaya, status akhir jujur (sukses/parsial/gagal), batas biaya/giliran, laporan tidak hilang saat kompaksi. Perubahan berulang pada batas kedalaman/jumlah menandakan desain batas yang belum mantap.
- Nilai untuk Agent Core: input untuk item BERSYARAT "child-task Native"; orkestrasi multi-agent sebagai runtime tetap DITOLAK.
- Baseline Agent Core: `src/agent-*.ts` tidak memuat konsep child-task. → BELUM-ADA (belum diadopsi).
- Delta/celah: bila disetujui, kontrak minimal: satu anak, kedalaman 1, izin = irisan izin induk, hasil berlabel `ANAK-TUGAS` dengan status sukses/parsial/gagal, batas giliran dan token, laporan disimpan di store durable sebelum induk membacanya.
- Cara adaptasi: dokumen kriteria; tidak ada kode sekarang.
- Lisensi/hak cipta: ide saja.
- Perkiraan skala: S (dokumen) · Risiko: rendah · Nilai: rendah-sedang · Skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: butir terverifikasi.
- Disposisi: REFERENSI

### CHG-27 Heartbeat progres untuk tool panjang dan batas waktu klien
- Sumber: CHANGELOG.md L4388 (2.1.214: heartbeat progres periodik untuk panggilan tool panjang yang tadinya senyap); L4521 (2.1.210: penghitung waktu berjalan di baris ringkas tool); L2765 (2.1.271: `claude mcp serve` mengirim pembaruan progres tiap 30 detik); L2538 (2.1.274: panggilan tool MCP Streamable HTTP habis waktu ±5 menit walau timeout per server lebih panjang); L4944 (2.1.187: panggilan tool MCP jarak jauh yang menggantung 5 menit kini dibatalkan dengan galat); L1858 (2.1.283: notifikasi progres MCP dibuang saat panggilan panjang pindah ke latar); L5732 (2.1.142) dan L5297 (2.1.162): `MCP_TOOL_TIMEOUT` dan timeout per server di bawah 1000 ms dibulatkan ke 1 detik; L1195 (2.1.290: `5m` terbaca 5 ms); L4509 (2.1.211: variabel lingkungan bilangan bulat menerima notasi ilmiah); L4572 (2.1.208: mantissa notasi ilmiah dipakai diam-diam).
- Observasi: klien memutus panggilan tool yang tidak memberi tanda hidup dalam batas waktu; server yang punya tool panjang harus mengirim progres atau mengembalikan pegangan pekerjaan.
- Nilai untuk Agent Core: tool seperti build, code graph, reconstruction harness, atau web research bisa berjalan lama; klien eksternal berbeda-beda batasnya.
- Baseline Agent Core: `grep -rEi 'notifications/progress|sendNotification|progressToken' src/mcp` kosong → BELUM-ADA untuk heartbeat; `server.ts:162` mengomentari `notifications/cancelled` (pembatalan SUDAH-ADA). Transport hanya HTTP streamable (tidak ada `StdioServerTransport`).
- Delta/celah: pada tool yang diketahui lama, kirim notifikasi progres setiap ~30 detik jika klien menyertakan `progressToken`; alternatifnya kembalikan pegangan pekerjaan (process ledger) agar klien tidak menunggu satu panggilan panjang.
- Cara adaptasi: lapisan pembungkus handler di `src/mcp/server.ts` (internal); tanpa mengubah skema tool.
- Lisensi/hak cipta: ide saja.
- Perkiraan skala: M · Risiko: sedang · Nilai: sedang · Skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: batas 5 menit klien terverifikasi dari changelog; apakah tool Agent Core pernah melampaui batas itu pada praktik tidak diketahui.
- Disposisi: ADAPT

### CHG-28 Tidak ada pemotongan atau "tanpa hasil" diam-diam
- Sumber: CHANGELOG.md L1106 (2.1.290: WebFetch menjatuhkan teks halaman setelah 100.000 karakter tanpa pemberitahuan; kini menyebut jumlah yang tak terbaca); L1014 (2.1.292: berkas teks >256 KB yang di-@-mention tidak lagi dibuang diam-diam; Claude diberi tahu ukuran dan cara membacanya); L2347 (2.1.277: Grep/Glob melapor "tidak ada kecocokan" ketika pencarian tak dapat dimulai karena kehabisan proses/memori/handle; kini mengembalikan galat); L2452 (2.1.275: pencarian melebihi batas keluaran 20 MB menggantung/kehabisan memori dan ripgrep sistem melapor "tidak ada kecocokan"); L1430 (2.1.287: Claude disuruh memberi halaman pada hasil MCP JSON besar dengan offset/limit padahal tidak bisa membelah satu baris panjang); L6844 (2.1.89: keluaran hook >10.000 karakter disimpan ke disk dengan pratinjau 2.000 karakter); L7615 (2.1.51: hasil tool >50K karakter disimpan ke disk); L3131 (2.1.261: `bashOutputMaxChars` dan `taskOutputMaxChars` dapat diatur); L721 (2.1.296: skrip workflow memotong hasil bersarang dalam secara diam-diam); L819 (2.1.295).
- Observasi: prinsip yang konsisten: pemotongan selalu disertai pernyataan seberapa banyak yang hilang dan cara mengambil sisanya; "tidak ada hasil" tidak boleh menutupi "gagal mencari".
- Nilai untuk Agent Core: sudah ada pola spill dan anggaran hasil; tinggal memastikan semua tool memenuhi prinsip yang sama, termasuk pencarian.
- Baseline Agent Core: `src/rdc/output-spill.ts` (256 MB/32 berkas/7 hari), `src/mcp/result-budget.ts`; `src/rdc/search-manager.ts:887-897` membedakan kode keluar ripgrep 0/1/2 dan melempar "Failed to start ripgrep process" (baris 95) → penanganan galat pencarian SUDAH-ADA. Keseragaman pesan pemotongan di semua tool: tidak diverifikasi. → SEBAGIAN.
- Delta/celah: audit singkat setiap tool yang memotong (web research, file read, hasil MCP) agar menyertakan "dipotong X dari Y, ambil sisanya dengan ...".
- Cara adaptasi: pemeriksaan dan uji kecil; tanpa fitur baru.
- Lisensi/hak cipta: ide saja.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang · Skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: butir terverifikasi; seragam atau tidaknya pesan pemotongan Agent Core tidak diaudit.
- Disposisi: ADAPT

### CHG-29 Bukti bahwa beberapa desain Agent Core sudah selaras dengan pengalaman Claude Code
- Sumber: CHANGELOG.md L2542 (2.1.274: `/goal` aktif hilang saat resume sesi yang dikompaksi) dan L870 (2.1.295: tugas terjadwal hilang setelah kompaksi/rewind) → tujuan/intensi sebaiknya disimpan di store durable, bukan transkrip; L4075 (2.1.228: pembersihan sesi menghapus isi folder memori proyek) dan L5040 (2.1.181: pembersihan 30 hari menghapus riwayat sesi idle) → penyimpanan memori harus terpisah dari retensi sesi; L4389 (2.1.214) dan L7234 (2.1.75): stempel `modified` pada berkas memori membantu menilai kesegaran; L1694 (2.1.285: auto-memory tidak dapat diaktifkan dari sesi latar atau sesi yang dimulai oleh tool Claude Code); L2651 (2.1.273: direktori memori pilihan repo tidak dimuat/dipanggil/diindeks).
- Observasi: lima desain Agent Core (intention prospektif/episode task yang durable, memory file-native dengan revisi, Activity Tracker, penyimpanan terpisah dari chat store, ledger proses) dibenarkan oleh bug nyata yang dialami Claude Code ketika menaruh status di transkrip atau menyatukan retensi.
- Nilai untuk Agent Core: dasar argumentasi saat proposal berikutnya mempertahankan pemisahan owner (Memory/Learning/Skills/Tracker satu owner).
- Baseline Agent Core: SUDAH-ADA (prospective-intentions, episode task, revisi memory, claim-review).
- Delta/celah: tidak ada.
- Cara adaptasi: kutip sebagai bukti dalam dokumen proposal bila ada keberatan terhadap penyimpanan terpisah.
- Lisensi/hak cipta: ide saja.
- Perkiraan skala: S · Risiko: tidak ada · Nilai: rendah (dukungan argumen) · Skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: butir terverifikasi (nomor baris dan versi dicek otomatis).
- Disposisi: REFERENSI

---

## Bagian C — Ditolak atau tidak relevan

| Item | Alasan spesifik |
|---|---|
| Hook sebagai otoritas (±400 butir hook: PreToolUse/PermissionRequest/`updatedInput`/`onFailure`/`MessageDisplay`/`ConfigChange`) | Doktrin Agent Core menolak interceptor/hook berjenjang sebagai otoritas. Yang diambil hanya pelajaran fail-closed (CHG-19). Hook lifecycle tambahan tetap item BERSYARAT; tidak ada bukti baru yang membalik penolakan. |
| Mode otomatis dengan klasifier model (server atau lokal, `autoMode.hard_deny`, `classifyAllShell`) | Review keamanan oleh model tersembunyi ditolak. Aturan deterministik yang mengitari klasifier (penghapusan katastropik, tamper transkrip, tarik kredensial metadata, bulk exfil) dipakai sebagai ide pada CHG-05 dan CHG-12, bukan klasifier. |
| Sandbox Seatbelt/bubblewrap/seccomp, `sandbox.credentials` dengan masking via proxy TLS | Tidak tersedia di Windows 10 asli; masking kredensial memerlukan proxy yang menghentikan TLS, memperluas permukaan serangan dan bertentangan dengan local-first. Dicatat sebagai pengamatan, bukan usulan. |
| Remote Control, sesi cloud, routines, Claude Tag, Code Review cloud, Desktop/mobile bridging | Bergantung pada layanan jarak jauh; Agent Core local-first tanpa telemetri jarak jauh. |
| OpenTelemetry (ekspor ke kolektor, `tool_decision`, `safety_event`, trace) dan gateway/MDM/managed settings/Windows Registry | Telemetri jarak jauh dan gateway/MDM ditolak. Gagasan "satu catatan lokal per keputusan" dimasukkan ke CHG-03 sebagai log lokal. |
| Agent teams, panel tmux/iTerm, mailbox teammate, `TeamCreate` | Orkestrasi multi-agent sebagai runtime ditolak; butir mailbox menunjukkan loop crash (desain rapuh). |
| Loop/`/loop`/`/goal` check-in, cron | Agent Core sudah punya intention prospektif durable; tidak ada scheduler cron di Native (`grep cron` kosong). Hanya pelajaran provenansi pesan terjadwal masuk CHG-12. |
| UI terminal (render, keybinding, vim, screen reader, fullscreen, IME, tmux, kitty protokol) | Antarmuka Agent Core adalah WebView2 + React; 1.742 butir UI terminal tidak berlaku. |
| IDE (VS Code, JetBrains), Chrome extension, voice | Di luar produk; dihitung saja. |
| Pemasangan/pembaruan otomatis dan rollback executable di Windows (L4313 2.1.217; L5499 2.1.153; L6773 2.1.91) | Sudah dimiliki: `scripts/release/apply-release.mjs`, `candidate-cutover.mjs`, `release-lib.mjs` memuat rollback/last-known-good. |
| Manajemen model: prompt cache TTL, idle compaction, fast mode, `opusplan`, advisor, effort/ultracode | Spesifik API Anthropic. Agent Core multi-penyedia dengan kompaksi ekstraktif; keuntungan cache tidak dapat diukur tanpa benchmark (pengguna melarang benchmark). Dicatat sebagai REFERENSI bila suatu penyedia mendukung cache. |
| Marketplace plugin (strictKnownMarketplaces, blockedMarketplaces, auto-update, pin versi, dependency solver) | Enterprise/managed; Agent Core hanya mengadaptasi skill (komponen lain dilaporkan, tidak diaktifkan). Hanya pelajaran identitas/penampungan masuk CHG-23. |
| `/claude-api`, Managed Agents, `plugin eval` berbasis API | Spesifik platform Anthropic dan model-berbayar; Agent Core adalah model-agnostik. |
| Mod (`$.ui`, `tool.check`, `turn.step`) | Sistem ekstensi UI Claude Code; tidak ada padanan di Agent Core dan menambah otoritas baru. |

---

## Bagian D — Pola lintas-unit dan pertanyaan terbuka

### D.1 Pola yang layak menjadi standar di Agent Core
1. Penjaga yang gagal harus menolak (fail-closed) dan urutan keputusan tetap: tolak kebijakan lebih kuat daripada izin task; tidak ada jalur yang menurunkan "tolak" menjadi "tanya" (CHG-19, dasar: ≥12 butir hook).
2. Taksonomi hasil tool yang eksplisit: ditolak-kebijakan, tanpa-jawaban/timeout, dibatalkan-Stop, gagal teknis, dengan frasa model-facing berbeda (CHG-03).
3. Tidak ada pemotongan diam-diam: setiap pemotongan menyebut jumlah dan cara mengambil sisanya; "tidak ada hasil" tidak menutupi "gagal mencari" (CHG-28).
4. Memuat ulang riwayat harus menyembuhkan, bukan crash: validasi saat muat, lewati bagian rusak, hitung dan tampilkan jumlah yang dilewati (CHG-10).
5. Setiap string dari luar (memori, nama, hasil tool, pesan partner) diperlakukan sebagai tak tepercaya dengan label asal; pesan mesin tidak pernah menjadi persetujuan (CHG-12).
6. Bahaya host Windows dikodifikasi sekali sebagai uji/korpus dan satu Skill, bukan ditemukan satu per satu (CHG-04, 05, 06, 08, 20).
7. Setiap kali Agent Core menambah teks selalu-dimuat, sertakan ukuran terukur; alat audit anggaran (CHG-01) menjadi gerbang.

### D.2 Sinyal desain rapuh dari kronologi (fitur diubah, dicabut, atau diperbaiki berulang)
- Pemeriksa izin shell: ±60 butir "bypass" terus berlanjut dari 1.0.120 sampai 2.1.310; pemeriksa berbasis string tidak pernah selesai. Pelajaran: kurangi permukaan (refusal-only, target resolve) dan simpan korpus uji.
- Pembalikan (revert) eksplisit: perubahan izin Bash untuk symlink Cygwin dan redirect `<` (L3973, 2.1.233 membatalkan 2.1.232); penerapan deny `Read()` pada argumen Bash (L3239, 2.1.260 membatalkan 2.1.259); pemeriksaan deny pada baris yang tak dapat dianalisis (L2661, 2.1.273 membatalkan 2.1.268); pesan penolakan mode otomatis (L969, 2.1.293 membatalkan 2.1.281); reservasi nama `claude-ai` (L1922, 2.1.283 membatalkan 2.1.282); `ctrl+l` membersihkan transkrip (L3250 2.1.260, L3830 2.1.238, L2274 2.1.280).
- Batas subagen berubah arah: kedalaman 1 → 5 → default tak bersarang → 3; batas spawn per sesi ditambah (2.1.212) lalu dicabut (2.1.224), batas konkurensi ditambah (2.1.217) — lihat CHG-26.
- TaskOutput dideprekasi (L7023) lalu dihapus (L2404); tool tugas hanya untuk model tertentu (L2972); output style dideprekasi (L7297, L8619) — tool yang menambah permukaan skema cenderung dibatalkan; relevan bagi anggaran manifest Agent Core.
- Resume/transkrip: puluhan perbaikan (L1518, L2536, L3631, L4165, L4294, L6161, L7908…) — komponen penyimpanan percakapan adalah titik paling rawan.
- Nama sebagai kunci objek: ≥10 butir (CHG-14).
- Idempotensi saat resume: hook SessionStart berjalan dua kali pada resume (L7283), konteks hook async ditambahkan ulang tiap resume (L850), hook skill dua kali (L7318), CLAUDE.md folder terlampir dua kali setelah resume/kompaksi (L1424) — setiap penyuntikan konteks harus idempoten.

### D.3 Pertanyaan terbuka
1. Seberapa besar instruksi server `agent-core` yang benar-benar diterima klien pengguna (Claude Code/Desktop/ChatGPT)? Perlu mengukur panjang karakter final di `src/mcp/server.ts:304` terhadap batas 2.048/4.096 (CHG-02).
2. Apakah `src/memory/capsule-integrity.ts` sudah menetralkan karakter tak terlihat/markup tiruan? (CHG-12; tidak saya baca.)
3. Apakah envelope outcome CC-P3 sudah membedakan "ditolak kebijakan" vs "tanpa jawaban"? (CHG-03.)
4. Adakah skrip secret scan pra-commit di luar `src/` (mis. di `scripts/` subfolder) yang sudah memuat varian nama berkas? (CHG-15; grep nama berkas tidak menemukannya.)
5. Apakah `console.log` di `src/rdc/terminal-manager.ts`, `fuzzySearchLogger.ts`, `usageTracker.ts` pernah menulis ke stdout sedangkan transport yang dipakai hanya HTTP (tidak ada `StdioServerTransport`)? Risiko pencemaran stdout tidak berlaku bagi transport HTTP, tetapi berlaku bila stdio ditambahkan kelak.
6. Apakah pengguna ingin penjaga penghapusan katastropik (CHG-05) berperilaku refusal-only mengingat direktif "tidak perlu minta izin" di AGENTS.md? Perlu keputusan eksplisit.
7. Cakupan: ±65% butir tidak dibaca (UI, IDE, cloud, sisanya). Bila diperlukan, tema `sessions_rewind`, `background_tasks`, `mcp`, `skills_plugins` dapat dibaca penuh pada putaran berikutnya (±1.600 butir lagi).

### D.4 Ringkasan disposisi temuan
- ADAPT: 26 (CHG-01 s.d. CHG-24, CHG-27, CHG-28).
- REFERENSI: 3 (CHG-25, CHG-26, CHG-29).
- ADOPT: 0 (tidak ada yang bisa diambil tanpa penyesuaian ke Windows/PowerShell, MCP HTTP, dan doktrin local-first).
- Nilai tinggi: CHG-01, 02, 03, 04, 05, 06, 09, 10, 12, 19, 20. Tidak ada temuan yang butuh skema tool MCP baru; CHG-03 dan CHG-18 menambah field hanya bila payload yang ada dapat memuatnya (periksa anggaran manifest 130.965/131.072 byte sebelum menambah apa pun).
