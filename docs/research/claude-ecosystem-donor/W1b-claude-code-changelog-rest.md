# W1b — Putaran kedua studi CHANGELOG Claude Code untuk Agent Core (prefix CHB)

Pekerja: W1b (baca-saja). Sumber tunggal: `E:\Projects\Side-Project-Dont-Touch\claude-code\CHANGELOG.md` (`git ls-files CHANGELOG.md` = 1 file). Tanggal: 2026-10-27. Melanjutkan `findings\W1-claude-code-changelog.md` (CHG-01..29). Semua temuan hanya mengambil ide dan mekanisme dan ditulis ulang dengan kata sendiri; `claude-code` berlisensi all-rights-reserved, jadi tidak ada teks atau kode yang disalin. Konvensi sitasi: "L6734" berarti baris 6734 CHANGELOG.md (nomor baris diambil langsung dari hasil penguraian skrip, bukan dari ingatan). Changelog hanya mencatat perilaku, jadi klaim tentang cara kerja internal Claude Code adalah inferensi dari teks butir. Semua klaim baseline Agent Core dibaca dengan grep/Read di `E:\Projects\Agent-Core\src` (tanpa menulis apa pun di sana).

---

## Bagian A — Ledger cakupan

### A.1 Unit

| Unit | File | Dibaca | Disposisi | Alasan | Temuan |
|---|---|---|---|---|---|
| `claude-code/CHANGELOG.md` | 1 | 4.193 butir dibaca penuh (lihat A.3); sisanya dihitung atau disampel | ADAPT / REFERENSI | Nilai ada pada mode kegagalan; baseline Agent Core ternyata lebih matang daripada dugaan W1 (banyak item SUDAH-ADA, lihat Bagian C) | CHB-01..14 |

Total file terlacak di irisan: 1. Baris ledger menjumlah ke 1.

### A.2 Metode jangkauan
1. Skrip Node baca-saja (`parse.mjs`, `extract.mjs`, folder kerja `scratchpad\w1b-work`, bukan folder findings) mengurai semua 8.192 butir (versi, nomor baris, teks). Tidak ada eksekusi kode sumber Claude Code.
2. Tiap butir diberi satu tema utama dengan prioritas yang sama seperti W1: security, windows, permissions, hooks, context (tema yang SUDAH dibaca penuh W1; di sini 1.971 butir, tidak dibaca ulang), lalu sessions_rewind, subagents_teams, mcp, skills_plugins, background_tasks, worktrees, headless_sdk, cost_usage, otel, thinking_model, settings_policy, dan "lainnya". Regex saya sendiri, jadi angka tidak identik dengan W1 (selisih tema ±10%).
3. Derau UI dibuang sebelum dibaca (screen reader, tmux, IME, vim, keybinding, fullscreen, spinner, picker/dialog/menu, Remote Control, gateway, Bedrock/Vertex/Foundry) kecuali butir itu juga memuat kata kunci kegagalan (checkpoint, corrupt, lost, race, hang, crash, leak, timeout, permission, secret, inject, encoding, path, delete, dll.). Butir yang terbuang disimpan ke berkas `noise_*.txt` dan DISAMPEL (±75 butir dari 6 daftar); ±90% memang murni UI. Kebocoran yang saya temukan (mis. L828 penghentian panggilan MCP oleh pengguna tidak diberitahukan ke model, L5973 SIGINT eksternal tidak menjalankan shutdown anggun, L4749 resume berdasarkan nama lambat) sudah tercakup temuan lain.
4. Butir berawalan `[VSCode]`, `[Cloud sessions]`, `[Claude Tag]`, `[Code Review]`, `[Desktop]`, `[Slack]`, `[Chrome]` (756) dipindai dengan 30 kata kunci; 203 cocok dan dibaca penuh. Butir bukan-"Fixed" di tema "lainnya" (903) dipindai dengan kata kunci/kegagalan; 277 cocok dan dibaca penuh.
5. Semua pembacaan lewat Read terhadap berkas hasil ekstraksi yang urut nomor baris, potongan 200–270 baris.

### A.3 Ledger per tema (butir = tema utama setelah dedup, di luar tema milik W1 dan di luar prefiks produk)

| Tema | Butir | Dibaca penuh | Derau UI (disampel) | Status |
|---|---|---|---|---|
| sessions_rewind | 582 | 461 | 121 | 100% dari yang tersaring dibaca |
| background_tasks | 454 | 386 | 68 | idem |
| mcp | 433 | 399 | 34 | idem |
| skills_plugins | 626 | 554 | 72 | idem |
| subagents_teams | 248 | 205 | 43 | idem |
| cost_usage | 112 | 84 | 28 | idem |
| worktrees | 67 | 61 | 6 | idem |
| headless_sdk | 143 | 131 | 12 | idem |
| settings_policy | 306 | 253 | 53 | idem |
| thinking_model | 484 | 348 | 136 | idem |
| otel | 76 | 59 | 17 | idem |
| lainnya "Fixed ..." | 1.134 | 772 | 362 | idem |
| lainnya bukan-Fixed | 903 | 277 (kata kunci) | 626 hanya dihitung | dipindai |
| prefiks produk (VSCode, Cloud, Tag, Code Review, dst.) | 756 | 203 (kata kunci) | 553 hanya dihitung | dipindai |
| tema milik W1 (security, windows, permissions, hooks, context) | 1.971 | 0 (sudah dibaca W1) | — | tidak diulang |

Jumlah dibaca penuh: 2.941 (11 tema inti) + 772 + 277 + 203 = **4.193 butir (±51% dari 8.192)**. Dari butir tema inti yang bukan prefiks (3.531), 83% dibaca penuh dan 17% adalah derau UI yang disampel; target "100% tema inti" tercapai hanya setelah penyaringan derau, bukan sebelumnya. Butir "Fixed" di tema lainnya: 68% dibaca penuh, 32% derau UI disampel.

---

## Bagian B — Temuan

Kunci baseline: SUDAH-ADA / SEBAGIAN / BELUM-ADA. "Butuh skema tool baru" = tidak untuk semua temuan (anggaran manifest 130.965/131.072 byte dihormati; CHB-03 dan CHB-10 hanya menambah field pada payload yang sudah ada bila perlu).

### CHB-01 kill_process tanpa penjaga diri sendiri dan tanpa validasi PID
- Sumber: L4395 (2.1.214: `pkill -f` yang cocok dengan proses CLI sendiri mematikan sesi); L4343 (2.1.216: `daemon stop --any` bisa mematikan proses tak terkait lewat lockfile lama); L4767 (2.1.200: PID di `daemon.lock` dipakai ulang OS); L4405 (2.1.214: daemon pengganti menghapus soket penerusnya, klien lalu mematikan daemon sehat); L4787 (2.1.199: catatan worker rusak membuat daemon membunuh dirinya setiap 50 detik); L492 pada daftar prefiks (VSCode, Windows: PID lama dipakai program lain setelah restart).
- Observasi: Claude Code berulang kali memperbaiki satu kelas bug: tindakan "matikan proses" tidak memeriksa apakah targetnya dirinya sendiri, induknya, penggantinya, atau proses lain yang memakai ulang PID.
- Nilai untuk Agent Core: `list_processes` menampilkan banyak `node.exe`; model yang memilih PID salah dapat mematikan server MCP Agent Core sendiri atau launcher-nya, memutus semua sesi (termasuk Native). Ini kehilangan layanan, bukan kehilangan data, tetapi mudah terjadi.
- Baseline: `src/rdc/tools/process.ts:75-90` memanggil `process.kill(parsed.data.pid)` langsung; `src/rdc/tools/schemas.ts:51-53` mendefinisikan `pid: z.number()` (tanpa integer/positif). `forceTerminate` (`src/rdc/tools/improved-process-tools.ts:707-735`) aman karena hanya bekerja pada sesi `terminalManager`. Identitas proses (CreationDate) sudah diverifikasi di `src/rdc/process-ledger.ts:49-70`, tetapi hanya untuk proses yang dimiliki ledger. → BELUM-ADA untuk `kill_process`.
- Delta: di dalam handler (bukan skema, agar manifest tidak berubah) tolak PID non-integer, ≤ 4, PID sendiri, rantai induk (launcher/UI), dan pohon proses Agent Core (`src/process/owned-process-tree.ts` sudah dapat mengambil pohon turunan); bila PID berasal dari `list_processes`, bandingkan CreationDate sebelum membunuh. Pesan penolakan terstruktur yang menyebut alasan.
- Cara adaptasi: perubahan kecil di `src/rdc/tools/process.ts` + satu uji; pemakai tetap dapat mematikan proses lain. Ini penolakan-saja pada target yang merusak Agent Core sendiri, bukan kenaikan otoritas atau gerbang baru.
- Lisensi: ide saja.
- Skala: S · Risiko: rendah (ada kasus sah mematikan proses Agent Core lama: sediakan jalur lewat `restart_agent_core`) · Nilai: tinggi · Skema tool baru: tidak · Teks selalu-dimuat: tidak
- Bukti vs dugaan: butir changelog terverifikasi; baris baseline dibaca langsung; bahwa model memang pernah memilih PID server sendiri tidak diketahui.
- Disposisi: ADAPT

### CHB-02 Pipa UTF-8 untuk keluaran proses di Windows (decoder per-chunk, encoding konsol, Python)
- Sumber: L6734 (2.1.94: teks CJK/multibyte rusak menjadi U+FFFD ketika batas chunk membelah urutan UTF-8); L7340 (2.1.72: crash saat Read mengembalikan U+2028/U+2029); L743 dan L744 (2.1.296: pemangkasan transkrip dan `purge` membuang pesan yang memuat U+2028/U+2029); L6816 (2.1.89: entri riwayat CJK/emoji hilang di batas 4 KB); dilengkapi L4402/L4404 yang sudah dipakai W1 (CHG-20).
- Observasi: tiga lapis bug penyandian berulang: (a) decoder per-chunk, (b) encoding konsol/pipe bawaan, (c) pembaca baris yang memecah di pemisah baris Unicode.
- Nilai: nama file, pesan `git`, atau keluaran alat berbahasa non-Latin yang bocor sebagai karakter pengganti membuat model salah membaca path; masalah ini diam-diam (tidak ada galat).
- Baseline: `src/rdc/terminal-manager.ts:424` dan `:471` serta `src/rdc/tools/improved-process-tools.ts:44` dan `:48` memakai `data.toString()` pada setiap chunk tanpa `StringDecoder`; PowerShell dijalankan dengan `args: ['-Command', command]` (`terminal-manager.ts:131`) tanpa pengaturan `[Console]::OutputEncoding`; `src/security/environment.ts` tidak menyetel `PYTHONUTF8`/`PYTHONIOENCODING` (grep `OutputEncoding|PYTHON` di `src` kosong). `StringDecoder` dipakai hanya di `src/rdc/utils/files/text.ts`. → BELUM-ADA.
- Delta: (1) satu `StringDecoder('utf8')` per aliran stdout/stderr per proses, flush saat tutup; (2) sebelum perintah PowerShell sisipkan penetapan encoding keluaran UTF-8 (atau ekspor via `-Command` pembungkus), serta `PYTHONUTF8=1` dan `PYTHONIOENCODING=utf-8` di env shell mesin; (3) pembaca JSONL/log yang ada tidak boleh memecah pada U+2028/U+2029 (BoundedJsonlEventLog sudah membaca seluruh berkas dan memecah di `\n`; tinggal diuji dengan fixture).
- Adaptasi: `terminal-manager.ts` (owner proses), `improved-process-tools.ts`, `security/environment.ts`; uji dengan sumber yang mencetak emoji/aksara non-Latin lewat tiga pipa. Tanpa tool baru.
- Lisensi: ide saja.
- Skala: S-M · Risiko: sedang (preambel encoding dapat mengubah keluaran alat lama yang mengharapkan code page OEM; uji di Windows PowerShell 5.1 dan pwsh) · Nilai: sedang-tinggi · Skema tool baru: tidak · Teks selalu-dimuat: tidak
- Bukti vs dugaan: baris diverifikasi; dampak nyata pada pengguna (nama berkas non-ASCII) adalah dugaan; tidak diuji.
- Disposisi: ADAPT

### CHB-03 `finish_reason` hanya direkam, tidak dibaca (jawaban terpotong tampil sebagai jawaban final)
- Sumber: L630 (2.1.299: balasan terpotong di batas token keluaran mengakhiri giliran diam-diam setelah fallback non-streaming); L2044 (2.1.281: giliran bisa mengulang tanpa batas saat panggilan tool tak terparse bergantian dengan pemotongan batas keluaran); L1104 (2.1.290) dan L1655 (2.1.285: filter keluaran API menghentikan balasan; kini satu retry lalu galat jelas); L5013 (2.1.183: giliran hanya berisi blok berpikir tampak selesai tanpa keluaran; kini dipicu ulang sekali); L6094 (2.1.126: hang setelah rangkaian giliran kosong); L3438 (2.1.251); L8276 (2.1.0: lanjut otomatis bila terpotong).
- Observasi: Claude Code memperlakukan "berhenti karena batas panjang", "berhenti karena filter", dan "kosong" sebagai keadaan yang berbeda dari "selesai"; pelaporan jujur mencegah pengguna menganggap potongan sebagai hasil.
- Nilai: Native Agent memakai pembatas `completionCap`; jawaban atau argumen tool yang terpotong di `length` bisa dicatat sebagai jawaban final atau, lebih buruk, dieksekusi sebagian.
- Baseline: `src/agent-provider.ts:332` membuat permintaan `stream: false` (jadi kelas anomali aliran SSE tidak berlaku); `agent-provider.ts:389-391` menyimpan `finishReason` (maksimal 100 karakter); pembacaan lain tidak ada: grep `finishReason` hanya menampilkan definisi (`agent-provider.ts:94`) dan satu penetapan literal `'tool_calls'` di `src/agent-controller.ts:1060`. Penanganan respons kosong tanpa tool call tidak diverifikasi. → BELUM-ADA.
- Delta: kode hasil giliran terstruktur untuk `length` (jawaban dipotong di batas keluaran), `content_filter` (dihentikan filter penyedia), dan respons kosong; panggilan tool dengan argumen terpotong tidak dieksekusi; UI/riwayat menandai giliran "terpotong". Tanpa retry otomatis (doktrin); ajakan ke pengguna: naikkan batas keluaran atau pecah tugas. Kode galat dipetakan oleh `agent-provider-errors.ts` agar kebijakan cooldown tidak salah.
- Adaptasi: `agent-provider.ts` (sudah ekstrak), `agent-controller.ts` (titik penerimaan jawaban), `agent-chat-store.ts` (kolom status/kode galat yang sudah ada: `error_code`). Uji dengan penyedia tiruan yang mengembalikan `length`/`content_filter`.
- Lisensi: ide saja.
- Skala: S-M · Risiko: rendah-sedang · Nilai: tinggi (kebenaran jawaban Native) · Skema tool baru: tidak · Teks selalu-dimuat: tidak
- Bukti vs dugaan: grep menunjukkan tidak ada pembaca `finishReason`; bahwa jalur lain (mis. pembatas di `agent-runtime.ts`) tidak menutupi kasus ini tidak diperiksa penuh.
- Disposisi: ADAPT

### CHB-04 Adapter Skill plugin: BOM UTF-8 dan encoding non-UTF-8 menghasilkan galat menyesatkan
- Sumber: L3755 (2.1.239: berkas agen/skill/perintah `.md` yang diawali BOM UTF-8 diabaikan diam-diam); L3614 (2.1.246: instalasi plugin gagal bila `plugin.json` disimpan dengan BOM); L7486 (2.1.69: deskripsi berisi titik dua gagal dimuat); L7709, L7729, L7618 (nama/deskripsi/argument-hint berupa angka atau larik YAML membuat crash); L373 (2.1.301: daftar argumen sangat banyak/panjang membuat macet; dibatasi 64 nama × 64 karakter); L1066 (nama >256 karakter diabaikan); L4992 (frontmatter rusak memuat badan dengan metadata kosong).
- Observasi: loader skill yang menerima berkas dari editor Windows (PowerShell 5.1 `Set-Content -Encoding UTF8` menulis BOM) harus menangani BOM, CRLF, tipe skalar tak terduga, dan batas ukuran dengan galat yang menyebut penyebab.
- Nilai: adapter Skill dari plugin Claude baru diadopsi; sumber plugin berasal dari mesin Windows pengguna.
- Baseline: `src/skills/claude-plugin.ts:212-214` membaca `skill.content.toString('utf8')` lalu mencocokkan `^---` (CRLF sudah ditangani `\r?\n`); BOM tidak dihapus (grep `FEFF|BOM` di `src/skills` kosong) sehingga SKILL.md ber-BOM dilaporkan `SKILL_FRONTMATTER_MISSING` (menyesatkan). `claude-plugin.ts:329` memakai `JSON.parse(await readFile(file,'utf8'))`: `plugin.json` ber-BOM menjadi `INVALID_JSON`. Parser skalar buatan sendiri (`claude-plugin.ts:125-170`) menolak tipe aneh dengan `SKILL_PLUGIN_FRONTMATTER_UNPARSEABLE`, sesuai aturan frontmatter ketat. Apakah loader capability pack (`StrictSkillParser`) menangani BOM tidak diverifikasi. → SEBAGIAN.
- Delta: hapus U+FEFF di awal sebelum parse (SKILL.md dan JSON), deteksi UTF-16 (BOM FF FE / FE FF) dan tolak dengan `SKILL_ENCODING_UNSUPPORTED` yang menyebut hal itu; batasi jumlah/panjang kunci frontmatter; fixture uji: BOM, CRLF, titik dua dalam deskripsi, angka telanjang, larik, nama 300 karakter.
- Adaptasi: `src/skills/claude-plugin.ts` dan uji. Tidak menambah fitur plugin.
- Lisensi: ide saja.
- Skala: S · Risiko: rendah · Nilai: sedang · Skema tool baru: tidak · Teks selalu-dimuat: tidak
- Bukti vs dugaan: baris terverifikasi dengan grep dan Read; loader capability pack tidak dibaca.
- Disposisi: ADAPT

### CHB-05 Laporan byte per-tool pada manifest MCP dan pola "pindahkan teks acuan ke Skill"
- Sumber: L3545 (2.1.248: deskripsi tool Workflow dikecilkan dari ±5,7k ke ±1k token dengan memindahkan acuan penulisan skrip ke skill bawaan `workflow-authoring` yang dimuat sesuai kebutuhan); L3938 (2.1.234: skill `claude-api` dari ±200k menjadi ±25k token dengan acuan yang dimuat sesuai kebutuhan); L6934 (2.1.84), L759 (2.1.296), L2216 (2.1.280) (batas 2.048/4.096 karakter pada deskripsi tool dan instruksi server); L1006 (2.1.292: tool bernama >128 karakter membuat setiap permintaan gagal); L2058 (2.1.281: nama tool >200 karakter meracuni percakapan).
- Observasi: Claude Code menghadapi masalah yang sama dengan Agent Core (permukaan skema membengkak) dan memilih menurunkan anggaran dengan memindahkan teks resep ke konten sesuai-kebutuhan, bukan dengan menghapus kemampuan.
- Nilai: manifest Agent Core 130.965/131.072 byte; tidak ada cara terukur untuk memilih deskripsi yang layak dipangkas.
- Baseline: `grep 131072` hanya menemukan `scripts/verify/rea-harness-registration.mjs` (batas total) dan satu pemakaian tak terkait di `src/memory/identifier-tokenizer.ts`; `scripts/verify` tidak berisi laporan per-tool. Konsep baca-fragmen 8 KB dan Skill `agent-core-capability-index` sudah ada sebagai tujuan pemindahan. → SEBAGIAN (batas total ada, rincian per-tool belum).
- Delta: skrip baca-saja `scripts/verify/mcp-manifest-report.mjs` yang memuat daftar tool dari `dist` dan melaporkan byte per tool (nama + deskripsi + skema + anotasi), 15 teratas, bagian deskripsi yang berbentuk resep/contoh (>400 karakter) sebagai kandidat dipindah ke Skill, plus pemeriksaan nama ≤ 64 karakter dan pola `[A-Za-z0-9_-]` agar aman untuk klien kompatibel-OpenAI. Keluaran masuk ke proposal pemangkasan; tidak mengubah apa pun otomatis.
- Adaptasi: skrip di `scripts/verify` (owner verifikasi). Menurunkan teks selalu-dimuat. Memperkuat CHG-01 dan CHG-02 dari W1.
- Lisensi: ide saja.
- Skala: S · Risiko: rendah · Nilai: tinggi (anggaran hampir habis) · Skema tool baru: tidak · Teks selalu-dimuat: tidak (hanya mengurangi)
- Bukti vs dugaan: angka token Claude Code berasal dari changelog; kandidat konkret di Agent Core belum diukur.
- Disposisi: ADAPT

### CHB-06 Daftar target "persistensi eksekusi" sebagai catatan penasihat pada hasil tulis dan pemindai CC-P2
- Sumber: L5342 dan L5343 (2.1.160: tanya sebelum menulis ke berkas startup shell (`.zshenv`, `.zlogin`, `.bash_login`), `~/.config/git/`, dan berkas konfigurasi alat build yang memberi eksekusi kode: `.npmrc`, `.yarnrc*`, `bunfig.toml`, `.bazelrc`, `.pre-commit-config.yaml`, `.devcontainer/`); L1483 (2.1.286: tulisan shell lewat symlink yang di-commit ke berkas sensitif atau keluar pohon kerja menyebut tempat mendarat dan menunggu orang); L7466 (2.1.69: menulis berkas baru lewat induk symlink keluar dari direktori kerja); L3495 (variabel `env` proyek tidak boleh menetapkan `CLAUDE_CONFIG_DIR`/`TMPDIR`).
- Observasi: ada kelas berkas yang bila diubah memberi eksekusi kode di masa depan tanpa sepengetahuan pengguna; Claude Code menandainya terpisah dari penjagaan path biasa.
- Nilai: AGENTS.md memberi akses penuh tanpa izin, jadi gerbang tidak cocok; yang berguna adalah transparansi: pengguna melihat di panel perubahan bahwa agen menyentuh titik eksekusi otomatis (profil PowerShell, folder Startup, `.git/hooks`, kunci Run registry, `.npmrc`).
- Baseline: `src/code-intelligence/changed-source-security.ts:45-51` hanya berisi tujuh aturan regex isi (`AC.SECURITY.CODE.EVAL`, `SHELL.EXEC`, `TLS.DISABLED`, `DESERIALIZE.PICKLE`, `HTML.RAW`, `FILE.PERMISSIVE`, `SECRET.LITERAL`); tidak ada aturan berdasar path, dan CC-P1 hanya mencatat path dalam workspace (profil PowerShell di `Documents\PowerShell` berada di luar workspace). → BELUM-ADA.
- Delta: daftar path Windows/proyek (`$PROFILE` semua varian, `Startup`, `.git\hooks\*`, `.gitconfig`, `.npmrc`, `.yarnrc*`, `bunfig.toml`, `.pre-commit-config.yaml`, `.husky\*`, `.vscode\tasks.json`, `.devcontainer\*`, `package.json` skrip siklus hidup) dan pola perintah (`schtasks /create`, `reg add ...\Run`) yang menghasilkan catatan "menyentuh titik eksekusi otomatis" pada hasil tulis/edit dan pada panel task-changes; tidak memblokir.
- Adaptasi: tabel path di `src/security` dipakai pemindai CC-P2 sebagai jenis aturan `path` baru dan oleh `src/rdc/tools` untuk menambah satu baris catatan hasil. Perlu keputusan pengguna karena menyentuh postur AGENTS.md "tanpa izin" (hanya penasihat).
- Lisensi: ide saja.
- Skala: M · Risiko: sedang (false positive pada `package.json`) · Nilai: sedang · Skema tool baru: tidak · Teks selalu-dimuat: tidak
- Bukti vs dugaan: butir dan aturan CC-P2 terverifikasi; cakupan tabel path adalah usulan saya.
- Disposisi: ADAPT

### CHB-07 Satu helper pemotongan teks yang aman terhadap pasangan pengganti Unicode
- Sumber: L5296 (2.1.162: galat API 400 "no low surrogate in string" dari deskripsi server MCP berisi emoji di dekat batas pemotongan); L5921 (2.1.136: hitungan negatif pada penanda pemotongan untuk string pasangan pengganti); L4280 dan L4442 (2.1.218 dan 2.1.212: mojibake saat seleksi IDE atau alasan penolakan terpotong di tengah emoji); L1196 (2.1.290: stall pada deretan karakter penggabung yang panjang); L7980 (JSON rusak karena Unicode khusus).
- Observasi: `slice` berbasis indeks UTF-16 memotong pasangan pengganti; penyedia menolak payload dengan setengah pasangan.
- Baseline: pemotongan aman hanya di `src/memory/retrieval.ts:358`, `src/rdc/tools/pdf/lib/evidence.ts:88`, `src/rdc/browser-control/owned-conversation-reader.ts:459-462`; banyak `.slice(0, n)` lain pada teks yang masuk ke payload penyedia atau JSON (mis. `src/agent-provider.ts:367-368` id/nama panggilan tool, `cleanText` di `src/agent-chat-store.ts`, `src/learning/*`, `src/tracker/*`). → SEBAGIAN.
- Delta: satu fungsi `truncateText(teks, maks)` (mundur satu unit bila batas jatuh di antara pasangan pengganti; opsional jangan memotong urutan penggabung) di lokasi util teks yang ada, lalu ganti pada jalur yang menuju penyedia/UI/penyimpanan; uji dengan emoji tepat di batas.
- Adaptasi: helper kecil di owner util yang sah (cek `docs/PROJECT-STRUCTURE.md` agar tidak membuat rumah paralel) dan penggantian bertahap.
- Lisensi: ide saja.
- Skala: S · Risiko: rendah · Nilai: sedang · Skema tool baru: tidak · Teks selalu-dimuat: tidak
- Bukti vs dugaan: grep terverifikasi; penyedia mana yang benar-benar menolak setengah pasangan pada JSON yang sudah ter-escape tidak diuji (JSON.stringify modern meng-escape setengah pasangan, tetapi tidak semua gateway menerimanya).
- Disposisi: ADAPT

### CHB-08 Penetralan karakter tak terlihat butuh daftar kecuali, dan label asal bisa membuat tugas dilewati (tambahan untuk CHG-12)
- Sumber: L2393 (2.1.277: karakter format Unicode tak terlihat dan karakter "tag" dibuang dari prompt dan prompt bersih ditampilkan untuk ditinjau sebelum dikirim); L2227 (2.1.280: pembersihan karakter tak terlihat menghapus ZWNJ yang dipakai aksara Persia/Arab untuk menempelkan akhiran ke kata Latin; diperbaiki); L659 (2.1.299: skill dengan nama file berisi karakter tersembunyi, pengubah arah, mirip-spasi, `<` atau `>` tidak ditawarkan); L371 (2.1.301: agen workflow melewati langkahnya dan run tetap melapor sukses setelah membaca catatan harness bahwa teks tugas tidak membawa otoritas pengguna); L1990 (2.1.282: folder bernama mirip "password" membuat galat menyebut penyebab yang salah); L2444 (2.1.275: tag penutup internal `</ccmemory>` bocor ke jawaban).
- Observasi: penetralan yang terlalu luas merusak teks sah; label asal yang terlalu keras membuat agen penerima menolak mengerjakan tugas; markup internal bocor bila tidak dibingkai.
- Baseline: W1 menyatakan penetralan teknis BELUM-ADA (CHG-12); tidak ada perubahan setelah verifikasi saya (grep `zero-width|bidi|invisible` kosong).
- Delta untuk desain CHG-12: (1) buang atau tandai blok Tag (U+E0000–U+E007F), kendali bidi (U+202A–U+202E, U+2066–U+2069), BOM di tengah teks, dan selektor variasi di luar urutan emoji; (2) pertahankan ZWJ/ZWNJ di antara huruf (Persia, Arab, Indik) dan dalam urutan emoji; (3) untuk prompt ketikan pengguna tampilkan hasil bersih sebelum kirim, untuk teks mesin cukup tandai asal; (4) uji bahwa label asal pada pesan partner/anak-tugas tidak membuat penerima melewati tugas; (5) jangan mengklasifikasi galat dari potongan teks yang bisa memuat isi pengguna (lihat CHB-09).
- Adaptasi: bagian dari helper `neutralizeUntrustedText` di CHG-12 plus uji dua arah (positif palsu dan negatif palsu).
- Lisensi: ide saja.
- Skala: S-M (tambahan atas CHG-12) · Risiko: sedang · Nilai: tinggi untuk pertahanan injeksi · Skema tool baru: tidak · Teks selalu-dimuat: tidak
- Bukti vs dugaan: butir terverifikasi; daftar rentang Unicode adalah pengetahuan umum saya, bukan dari changelog.
- Disposisi: ADAPT

### CHB-09 Klasifikasi galat penyedia: dahulukan kolom terstruktur, uji bahwa isi pengguna tidak memicu cooldown
- Sumber: L1990 (2.1.282: galat salah menamai penyebab karena kata pada nama folder); L6827 (2.1.89: galat hak akses tampil sebagai "Rate limit reached"); L1636 (2.1.285: pemeriksaan keamanan domain yang kena batas laju dilaporkan sebagai blokir jaringan); L2101 dan L6016 (halaman galat HTML dari proxy tampil sebagai markup mentah atau tanpa status); L3936 (galat menyebut tipe konten, jenis badan, ukuran, dan request ID); L3785 (mode retry berhenti segera pada batas belanja organisasi).
- Observasi: klasifikasi dari teks bebas rentan salah arah; diagnosis yang baik membawa status, tipe konten, dan ID permintaan.
- Baseline: `src/agent-provider-errors.ts` sangat matang (kelas kuota vs laju, Retry-After, `x-ratelimit-*`, cooldown, correlation ID). Namun `classifyAgentProviderFailure` (`agent-provider-errors.ts:206-232`) memakai `containsAny(text, ...)` pada `errorMessage(error)` ditambah `safeCode/safeType`; apakah `errorMessage` dapat memuat isi permintaan yang dipantulkan penyedia (mis. 400 yang mengutip prompt) dan apakah cabang `quotaText`/`authText` dibatasi oleh status (429/402/401/403) tidak terlihat pada potongan yang saya baca. → SEBAGIAN (tidak terverifikasi).
- Delta: uji tabel: badan galat 400 yang mengutip "usage limit"/"revoked"/"quota exceeded" dari pesan pengguna tidak boleh menaruh kunci dalam cooldown; badan HTML ditaruh sebagai ringkasan (status, tipe konten, ukuran, ID) bukan markup.
- Adaptasi: uji unit di sebelah `agent-provider-errors.ts`; perbaikan hanya bila uji gagal (gerbang status sebelum pencocokan teks).
- Lisensi: ide saja.
- Skala: S · Risiko: rendah · Nilai: sedang · Skema tool baru: tidak · Teks selalu-dimuat: tidak
- Bukti vs dugaan: butir terverifikasi; kerentanan Agent Core murni dugaan sampai uji dijalankan.
- Disposisi: ADAPT

### CHB-10 Penjelasan kode keluar NTSTATUS Windows pada hasil proses dan pada Skill host Windows
- Sumber: L2679 (VSCode, 2.1.273: banner merah "process exited with code 4294967295" setelah giliran selesai di Windows); dilengkapi L4403, L4856, L2255 (kode keluar tidak-nol yang sah, sudah di CHG-20).
- Observasi: di Windows kode keluar bisa berupa angka 32-bit tak bertanda (4294967295 = -1; 3221225786 = 0xC000013A Ctrl+C; 3221225477 = 0xC0000005 pelanggaran akses; 3221225781 = 0xC0000135 DLL tidak ditemukan). Model tidak mengenalinya.
- Baseline: grep `0xC000|3221225|4294967295|NTSTATUS|STATUS_DLL` di `src` tidak menemukan pemetaan. → BELUM-ADA.
- Delta: fungsi murni `describeExitCode(kode)` yang menambah satu klausa penjelas pada hasil proses selesai, plus daftar yang sama di Skill `windows-powershell-host` (CHG-20). Ide turunan: changelog hanya mengonfirmasi kasus 4294967295; pemetaan lain adalah pengetahuan umum saya.
- Adaptasi: helper kecil di `src/rdc/terminal-manager.ts` (hasil sesi selesai) + satu tabel di Skill.
- Lisensi: fakta teknis umum.
- Skala: S · Risiko: rendah · Nilai: sedang · Skema tool baru: tidak · Teks selalu-dimuat: tidak
- Bukti vs dugaan: sebagian besar inferensi.
- Disposisi: ADAPT

### CHB-11 Lint tumpang-tindih `## Triggers` antar capability pack
- Sumber: L2007, L2297, L2008, L3962, L60, L5079 (tabrakan nama dan namespace tercadangkan: skill pengguna membayangi alias bawaan, skill di folder tambahan tak terjangkau, nama diperlakukan `<folder>:<nama>`); L2813 dan L600 (2.1.269/2.1.299: `plugin eval` memberi skor yang dapat direproduksi, run yang berakhir galat API bernilai 0); L4376 (2.1.215: skill berat tidak lagi dipicu sendiri oleh model).
- Observasi: dengan banyak skill, masalah muncul pada tumpang-tindih pemicu, bukan hanya nama.
- Baseline: `src/skills/service.ts:923-937` mendeteksi tabrakan nama (jenis `mapping` dan `catalog`) saat pratinjau adapter; `scripts` tidak berisi lint pemicu (`grep Non-triggers scripts` kosong); 39 capability pack aktif. → SEBAGIAN.
- Delta: skrip baca-saja `scripts/verify/skill-trigger-lint.mjs`: pasangan skill dengan butir `## Triggers` hampir identik, butir `## Non-triggers` suatu skill yang justru ada di `## Triggers` skill lain, deskripsi di atas batas, badan > 8.192 byte.
- Adaptasi: skrip tanpa efek samping; hasil ke proposal bila ada temuan.
- Lisensi: ide saja.
- Skala: S · Risiko: rendah · Nilai: rendah-sedang · Skema tool baru: tidak · Teks selalu-dimuat: tidak
- Bukti vs dugaan: tingkat tumpang-tindih aktual tidak diukur.
- Disposisi: ADAPT

### CHB-12 Koreksi desain penjaga teks-shell untuk CHG-04/05 (false positive dan jalur berlapis)
- Sumber: L3367 (2.1.257: penjaga isolasi menolak loop, `$VAR`, `"$(…)"`, heredoc yang tidak menyentuh git dengan alasan "terlalu kompleks"); L41, L42, L614, L2573 (2.1.309/2.1.299/2.1.274: penjaga isolasi lolos pada perintah berawalan locale, aritmetika zsh, program awk, ekspansi bersarang); L4174, L4340, L4523, L4707, L5447 (git destruktif ke checkout utama lewat `git -C`, `--git-dir`, `GIT_DIR`/`GIT_WORK_TREE`); L1422 (2.1.287: pengaman `rm` hilang ketika perintah yang sama juga mengalihkan keluaran ke `~`); L535 (2.1.299: prompt `rm` pada skrip `-c` yang tidak menjalankan `rm`); L5440 (2.1.154: `rm -rf $HOME` tak diblokir bila `HOME` berakhiran garis miring); L2143 (2.1.281).
- Observasi: penjaga berbasis string menghasilkan dua kegagalan sekaligus: lolos pada varian dan menolak pekerjaan sah. Pembatalan eksplisit dan perbaikan balik berkali-kali menandakan desain yang tak pernah tuntas.
- Dampak pada W1: CHG-05 (penjaga penghapusan katastropik) sebaiknya (a) hanya aktif bila perintah memuat kata kerja penghapus yang dikenal, (b) tidak pernah menolak dengan alasan "terlalu kompleks" bila tidak ada kata kerja penghapus, (c) menormalkan target (garis miring akhir, `~`, `%USERPROFILE%`, nama pendek 8.3) sebelum membandingkan, (d) tidak berjanji menjaga "batas workspace" untuk perintah shell karena itu tak tercapai pada tingkat string. Korpus uji CHG-04 perlu memuat kasus pengalihan keluaran dan komposit.
- Baseline: `src/rdc/command-manager.ts` (blocklist nama perintah; W1).
- Adaptasi: catatan desain di proposal CHG-04/05; tanpa kode baru.
- Lisensi: ide saja.
- Skala: S (dokumen) · Risiko: rendah · Nilai: sedang · Skema tool baru: tidak · Teks selalu-dimuat: tidak
- Bukti vs dugaan: butir terverifikasi.
- Disposisi: REFERENSI

### CHB-13 Tambahan bukti untuk kontrak child-task Native (CHG-26)
- Sumber: L2401 (2.1.277: hasil subagen tiba di bawah header penanda dan menjorok sehingga teks di dalamnya tak dapat menyamar sebagai instruksi sesi); L4786, L4785, L4770, L2652 (galat API atau batas pemakaian dilaporkan sebagai hasil sukses, kerja parsial hilang, hasil kosong, anak dianggap gagal karena balasan akhir tanpa penggunaan token); L3564 (galat anak membawa tipe, status, request ID, dan model); L4126, L3871, L3894, L1343, L3158 ("pesan terkirim" padahal tulis ke inbox gagal atau ditahan; kini galat, penolakan di muka untuk pesan terlalu besar/burst, pemberitahuan bahwa terkirim-ditunda); L3076, L4339, L4487, L6290, L4951 (anak yang dilanjutkan harus memulihkan prompt, pembatasan tool, model, cwd, dan kedalaman asli); L5017, L3375, L7279 (tugas latar dan monitor milik anak ikut mati atau bocor saat anak selesai); L4329 (batas biaya menghentikan anak latar); L4727 (anak mendelegasikan seluruh tugasnya lagi); batas spawn/kedalaman berubah-ubah (L5154, L5041, L4328, L4267, L4433, L4140, L4327).
- Baseline: tidak ada konsep child-task di `src/agent-*.ts` (CHG-26); `native_chat_bridge` dan partner Raka tidak dibaca di sini. → BELUM-ADA (belum diadopsi).
- Delta: bila keputusan BERSYARAT disetujui, masukkan ke kontrak: status akhir tiga nilai (sukses/parsial/gagal) dengan galat penyedia tidak pernah sukses; header penanda hasil anak; penyimpanan durable sebelum induk membaca; pemulihan batasan anak pada resume; pelaporan pengiriman yang jujur.
- Adaptasi: dokumen di `docs/proposals`.
- Lisensi: ide saja.
- Skala: S (dokumen) · Risiko: rendah · Nilai: rendah-sedang · Skema tool baru: tidak · Teks selalu-dimuat: tidak
- Bukti vs dugaan: butir terverifikasi.
- Disposisi: REFERENSI

### CHB-14 Kolom korelasi untuk Activity Tracker lokal (diturunkan dari kolom telemetri)
- Sumber: L4390 (2.1.214: `message.uuid`, `client_request_id`, `tool_source` untuk korelasi dan asal tool); L6218 (2.1.119: `tool_use_id`, `tool_input_size_bytes`); L6153 (2.1.121: `stop_reason`, `gen_ai.response.finish_reasons`); L2530 (2.1.274: `effort`); L4738 (2.1.202: `workflow.run_id`); L2584 (2.1.274: `index.jsonl` menghubungkan respons ke berkas permintaan); L6564 (2.1.101: atribut sensitif tidak dipancarkan kecuali diaktifkan); L2004 (2.1.282: pengaturan proyek tidak boleh menyalakan ekspor telemetri atau penangkapan konten).
- Observasi: yang berguna secara lokal hanya nama kolom; ekspor jarak jauh ditolak doktrin.
- Baseline: `src/tracker/tool-invocation.ts` mendefinisikan `ToolInvocationEvidence` (id, processSessionId, finish/fail); apakah ada kolom ukuran masukan, `finish_reason`, atau asal (Native vs eksternal) tidak diverifikasi. → SEBAGIAN (tidak terverifikasi).
- Delta: cek kolom `inputBytes`, `finishReason`, `controller` (native/eksternal) dan `parentTaskId` pada rekam lokal; tambahkan hanya bila belum ada, bersama CHB-03.
- Adaptasi: `src/tracker/*` (owner Tracker).
- Lisensi: ide saja.
- Skala: S · Risiko: rendah · Nilai: rendah · Skema tool baru: tidak · Teks selalu-dimuat: tidak
- Bukti vs dugaan: sebagian besar dugaan.
- Disposisi: REFERENSI

---

## Bagian C — Ditolak, tidak berlaku, atau SUDAH-ADA (dengan bukti)

| Item dari changelog | Alasan spesifik |
|---|---|
| Eksekusi ganda panggilan tool MCP saat koneksi putus (L126, L609, L1354, L1455) dan hasil "tanpa keluaran" untuk panggilan terinterupsi (L3603) | SUDAH-ADA: `src/mcp/mutation-safety.ts` (jurnal terima/terminal, kunci `io.agentcore/invocation-id`, `MCP_MUTATION_INVOCATION_UNCERTAIN` pada baris 325, retensi 7 hari). Yang perlu dicek hanya akurasi anotasi `idempotentHint` di `src/mcp/server.ts:144`. |
| Kelas korupsi transkrip JSONL, siklus `parentUuid`, jangkar cabang buntu, rantai pemulihan, potongan 4 KB/5 MB/50 MB (±40 butir: L6816, L743, L7908, L6568, L6569, L7123, L6346) | Tidak berlaku: chat Native memakai SQLite (`src/agent-chat-store.ts:151,178`: WAL, `busy_timeout`) dan model giliran `resumable` dengan `pendingTool.mutating && phase==='dispatching'` ditolak (`src/agent-controller.ts:599-600`, `src/agent-chat-service.ts:328` `AGENT_CHAT_RESUME_SIDE_EFFECT_RESULT_UNAVAILABLE`), plus `settleOrphanedTasks` (`agent-chat-service.ts:803`) dan validasi pos pemeriksaan (`src/agent-turn-checkpoint.ts:117-203`). CHG-10 dari W1 turun prioritas; deltanya hanya CHB-03/07. |
| Sapuan retensi yang menghapus riwayat karena konfigurasi (L6573, L5040, L7, L6845, L7001) | Tidak berlaku: tidak ada sapuan hapus berbasis konfigurasi pada chat; konstanta dikunci (`retrieval-ledger.ts:521` clamp 1–365 hari, `mutation-safety.ts:15`). Pelajaran tetap berguna: sapuan memakai registri milik sendiri (L2233, L3609, L7164). Belum diverifikasi apakah sapuan `output-spill.ts`/checkpoint hanya menghapus berkas berawalan milik sendiri. |
| Penulisan atomik, cadangan, pembacaan balik (L1875, L1904, L4800, L7999) | SUDAH-ADA: `src/persistence/atomic-file.ts` (tmp + fsync + rename dengan retry EPERM/EBUSY, tolak symlink), `src/persistence/state-file.ts` (`.last-good`, `STATE_DEGRADED_WRITE_REFUSED`, `STATE_READBACK_MISMATCH`), `rdc/config-manager.ts:219-239` (baca terbatas 2 MiB, tolak non-reguler, tulis atomik). |
| Presisi inode 64-bit (L8153) | SUDAH-ADA: `src/security/file-identity.ts:1-8` menerima `bigint`; `rdc/utils/files/safe-regular-file.ts:119-141` dan `rdc/tools/image-inspect.ts:95-142` memakai `{ bigint: true }`. |
| Klasifikasi kuota vs laju, Retry-After, batas timer 2^31-1 (L3340, L6613, L6719, L3785) | SUDAH-ADA: `src/agent-provider-errors.ts` (cooldown, kelas kuota), `src/net/outbound-request.ts:56` (`MAX_TIMER_DELAY_MS`), percobaan ≤ 5, batas total jeda. Delta kecil: `boundedDelay` (`outbound-request.ts:111-116`) menerima `Retry-After: 0` apa adanya; cukup lantai jitter (L2056). Nilai rendah, bukan temuan. |
| Anomali aliran SSE, event ganda, bingkai penggunaan terakhir (L2051, L2052, L2053, L2054, L1754) | Tidak berlaku: permintaan `stream: false` (`src/agent-provider.ts:332`). |
| Tabrakan nama Skill / pratinjau adapter (L1630, L1871) | SUDAH-ADA sebagian: `src/skills/service.ts:923-937` dan normalisasi `claude-plugin.ts:109`; lihat CHB-04 dan CHB-11. |
| Tool paralel yang saling membatalkan (L6059, L7348, L5320) | Tidak berlaku: kontroler Native tidak memakai `Promise.all` untuk tool (grep). |
| Klien MCP (OAuth, reconnect, tool search, elicitation, paginasi, daftar `list_changed`, `alwaysLoad`, ±230 butir) | Tidak berlaku sekarang: Native hanya menyambung ke server Agent Core sendiri (`src/agent-tool-session.ts:67,82`) dan Grafel stdio (`src/code-intelligence/grafel-client.ts`). Menjadi relevan bila Native kelak memakai server MCP eksternal. |
| Worktree (±67 butir; cleanup tidak jatuh ke `rm -rf`, kunci yatim, simlink `.claude/worktrees`) | Agent Core tidak memiliki fitur worktree; dicatat sebagai REFERENSI untuk "pembersihan tidak boleh jatuh ke penghapusan paksa" dan "kunci harus dilepas oleh penyapu bila pemiliknya mati". |
| Pesan antar-sesi, Remote Control, routine, cloud, Claude Tag, self-hosted runner, gateway, MDM/managed settings, OIDC, WIF | Layanan jarak jauh/enterprise; bertentangan dengan local-first. |
| Penjadwal/loop/goal/cron, DST (L607, L3651, L3780), pembuat jadwal | Agent Core tidak memiliki penjadwal cron; intensi prospektif berbasis tanggal. Pelajaran DST/monotonic dicatat di Bagian D. |
| Model, effort, fast mode, advisor, alias model, cache prompt, 1M context, default berubah-ubah (±90 butir) | Spesifik API Anthropic; multi-penyedia Agent Core memakai `agent-provider-*`. Dicatat di D.2 sebagai sinyal rapuh. |
| Hook sebagai otoritas, `PermissionRequest`, `onFailure` | Ditolak doktrin; pelajaran fail-closed sudah di CHG-19. |
| UI terminal, vim, keybinding, screen reader, IME, tmux, kitty, voice, tema (±1.200 butir tersaring + ±1.740 W1) | UI Agent Core adalah WebView2 + React. |
| Marketplace plugin (solver dependensi, pin SHA, pembaruan otomatis, `strictKnownMarketplaces`, git-subdir, LFS) | Enterprise/terkelola; adapter Agent Core hanya membaca folder lokal (komponen non-skill hanya dilaporkan). |
| OpenTelemetry ekspor, trace, Prometheus, mTLS exporter | Telemetri jarak jauh ditolak; hanya nama kolom lokal (CHB-14). |
| `claude-api` skill, Managed Agents, `ant` CLI, `plugin eval` berbayar | Platform Anthropic, bukan model-agnostik. |
| Cgroup memori untuk Bash (L3956), sandbox Seatbelt/bubblewrap | Linux/macOS saja; analog Windows (Job Object) memerlukan modul native, ditolak untuk sekarang. |
| Penutupan aliran ganda, penurunan versi model, `bashOutputMaxChars` yang dapat diatur (L3131) | `result-budget.ts` dan `output-spill.ts` (256 MB/32 berkas/7 hari) sudah memberi pola yang sama. |

---

## Bagian D — Pola lintas-unit dan pertanyaan terbuka

### D.1 Pola yang layak menjadi standar
1. **Satu titik penegakan kebijakan.** Kebocoran kebijakan muncul setiap kali ada lebih dari satu jalur masuk ke efek yang sama (L4883 persetujuan plugin di semua loader, L585 server MCP tersambung sebelum pemeriksaan kebijakan, L1136 dan L5196 aturan tidak diterapkan pada sebagian entri). Untuk Agent Core: aktivasi Skill (adapter, staging, promote, rollback, katalog Native) harus lewat satu pintu di `SkillService`.
2. **Penyapu hanya menghapus yang terdaftar sebagai miliknya**, tidak pernah "berkas yang ditemukan" dan tidak pernah dengan default destruktif bila konfigurasi tak terbaca (L2233, L3609, L7164, L6573, L5040, L7). Cek ulang sapuan spill dan checkpoint terhadap prinsip ini.
3. **Laporan sesudah verifikasi dan jujur soal pengiriman** (L4126, L3871, L3894; W1 L3223): "terkirim/dipulihkan" hanya bila terbukti; kegagalan tidak pernah menjadi "sukses" atau "kosong" (L4786, L4770, L2925, L3603, L4463).
4. **Konfigurasi numerik dan durasi diparse ketat dan dibatasi** (L4509, L4572, L1195, L3340, L6450): notasi ilmiah, akhiran satuan, nilai > 2^31-1, mantissa diam-diam.
5. **Penanganan teks aman di batas**: batas chunk (L6734), pasangan pengganti (L5296), pemisah baris Unicode (L743, L7340), ZWNJ (L2227), BOM (L3755, L3614). Satu helper per masalah, satu fixture per kelas.
6. **Teks acuan dipindahkan ke konten sesuai-kebutuhan** (L3545, L3938) mendukung langsung strategi anggaran manifest dan AGENTS.md Agent Core.
7. **Penjaga berbasis string**: perluas permukaan serangan sambil menolak pekerjaan sah (L3367); lebih baik penjaga sempit yang dalam (resolusi target) daripada penjaga lebar yang dangkal.

### D.2 Sinyal desain rapuh tambahan (selain D.2 W1)
- Default model/effort berganti berulang (L6307, L6714, L7525, L2291, L2292, L5641, L6296, L3485, L3488): jangan menaruh default model di teks selalu-dimuat.
- Batas subagen: kedalaman 1 → 5 → tak bersarang → 3 dan batas spawn/konkurensi (L5154, L5041, L4328, L4267, L4433, L4140, L4327).
- Skill yang dipicu model lalu dikembalikan menjadi manual (L4376, L4299, L5084), pembatasan nama tercadangkan (L1922, L2007, L2008).
- Tool: TaskOutput dihapus (L2404), `/fork` diganti nama/semantik (L4430, L7187), `Agent resume` dihapus (L7185), tool tugas dibatasi per model (L2972).
- Eksekusi ulang giliran saat resume (L1659, L2852, L4212, L605, L633): kontrol `RESUME_INTERRUPTED_TURN` bertambah banyak catatan batas usia dan jenis giliran; desain "lanjut otomatis" rawan.
- Pembatasan waktu perintah latar: batas 1 jam subagen dicabut (L3258), batas hanya untuk mode tak terawasi (L1388).

### D.3 Pertanyaan terbuka (butuh keputusan atau pembacaan lanjut)
1. Boleh `kill_process` menolak pohon proses Agent Core sendiri (CHB-01) mengingat direktif "tanpa izin" di AGENTS.md? Rekomendasi: ya, sebagai penolakan-saja.
2. PowerShell dijalankan tanpa `-NoProfile` (`terminal-manager.ts:131`, args `['-Command', command]`; bandingkan `-NoProfile` di `process-ledger.ts:59`): disengaja? Profil menambah latensi di mesin lambat dan dapat mencetak keluaran ke hasil. Tidak diubah di temuan.
3. `agent-provider-errors.ts:206-232`: apakah cabang teks dibatasi status HTTP? (CHB-09)
4. Apakah `readFile`/`read_file` memberlakukan batas ukuran pada byte yang benar-benar terbaca saat berkas tumbuh (L6249) dan batas panjang satu baris (L4591)? Tidak diperiksa.
5. Apakah `StrictSkillParser` capability pack menghapus BOM (CHB-04)?
6. Apakah respons kosong tanpa tool call ditangani di `agent-controller.ts` (CHB-03)?
7. Apakah sapuan `output-spill.ts` dan checkpoint hanya menyentuh berkas berawalan milik sendiri?
8. Bagian-bagian W1 yang perlu dikoreksi: CHG-10 turun prioritas (Bagian C); CHG-05 dipersempit (CHB-12); CHG-12 ditambah daftar kecuali (CHB-08); CHG-16 dilengkapi CHB-02.

### D.4 Ringkasan disposisi
- ADAPT: 11 (CHB-01 s.d. CHB-11).
- REFERENSI: 3 (CHB-12, CHB-13, CHB-14).
- ADOPT: 0.
- Nilai tinggi: CHB-01, CHB-03, CHB-05 (dan CHB-08 sebagai tambahan CHG-12). Tidak ada yang butuh skema tool MCP baru; tidak ada yang menambah teks selalu-dimuat (CHB-05 menguranginya).
- Hambatan: tidak ada. Tidak dibaca penuh: 553 butir prefiks produk dan 626 butir non-Fixed di "lainnya" yang tidak cocok kata kunci; 952 butir derau UI hanya disampel; 1.971 butir tema W1 tidak diulang.
