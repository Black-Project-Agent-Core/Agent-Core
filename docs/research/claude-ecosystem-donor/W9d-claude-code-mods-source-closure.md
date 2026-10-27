# W9d — Penutupan sumber `claude-code/mods/*/hooks` dan kode hook keamanan (prefix GCD)

Tanggal: 2026-10-27. Pekerja: W9d (baca-saja). Sumber: `E:\Projects\Side-Project-Dont-Touch\claude-code` pada HEAD `a5b0f2e`. Putaran ini melanjutkan `W2-claude-code-mods.md`, `W3-claude-code-plugins-examples.md` dan `W9a-claude-code-gap-closure.md` (ketiganya dibaca seluruhnya sebelum bekerja). Temuan baru memakai prefix GCD; ID lama (MOD-, CCP-, GCA-) dikutip bila diperkuat atau dikoreksi.

Lisensi: seluruh `claude-code` berlisensi all-rights-reserved (Anthropic Commercial Terms). Semua temuan hanya mengambil ide, invarian, dan angka fungsional untuk reimplementasi mandiri. Tidak ada kode atau teks panjang yang disalin; nama identifier (mis. `isSha`, `wasDirtyAtStart`, `DIFF_LEADING_ARGS`) dikutip sebagai fakta kontrak. Tidak ada skrip, hook, atau biner sumber yang dijalankan. Satu-satunya eksekusi: uji string murni `noiseClass` dengan `node -e` (tanpa akses berkas) dan `git --version`. Tidak ada rahasia yang dicatat. Tidak ada yang ditulis di `E:\Projects\Agent-Core` atau di folder sumber.

## Ringkasan eksekutif

1. 11 temuan baru: ADAPT 8, REFERENSI 3, ADOPT 0. Tidak ada yang butuh skema tool MCP baru (satu butir, GCD-01, menyentuh validasi input yang sudah ada tanpa menambah skema) dan tidak ada yang menambah teks selalu-dimuat.
2. Lima temuan teratas: (a) GCD-01, argumen `base` pada `change-review.ts` masuk ke argv git tanpa pagar opsi, sehingga nilai berawalan `-` dibaca git sebagai opsi (terverifikasi dari kode; tidak dijalankan); (b) GCD-03, kunci temuan scanner dan semantik `resolved` diturunkan dari kode hook donor yang sengaja mengunci pada (file, kategori) dan hanya menandai "sudah ditinjau" bila peninjauan benar-benar jalan; (c) GCD-02, `workspace-fingerprint.mjs` memotong bukti jalur ke 256 secara senyap sehingga `compare` dapat melaporkan `resolved` palsu, dan tidak memakai `--no-optional-locks`; (d) GCD-04, enam cacat kecil parsing/argumen di `task-changes.ts` yang terlihat setelah membandingkannya dengan pengurai donor; (e) GCD-09, matriks kasus uji siap pakai untuk tiga modul + resolver.
3. Koreksi atas ledger lama: W2 mencatat `diff/hooks/classify` sebagai SUDAH-ADA (diadopsi di CC-P1). Setelah uji string, klasifikasi `noiseClass` Agent Core hanya SEBAGIAN (GCD-06). W9a GCA-04 (deteksi HEAD bergerak) berstatus "inferensi" untuk jalur push; kode hook donor kini mengonfirmasi mekanismenya (GCD-07). W9a GCA-01 butir "TASK_CHANGES_LIMITS diuji di tepi" tetap benar; ditambah daftar di GCD-09.
4. Hal yang ternyata SUDAH-ADA: penolakan respons basi pada panel (`TaskChangesPanel.tsx:116` membandingkan `requestId` dengan `pending.current?.id`), `--no-optional-locks` pada lima pemanggil git di `src/` (`change-review.ts`, `graph-observability.ts`, `provenance.ts`, `repository-identity.ts`, `task-changes.ts`), pemrosesan `status -z` dengan pasangan rename yang benar (`task-changes.ts:212-226`).
5. Hambatan jujur: dari 948 berkas `hooks`, saya membaca penuh ±264 (237 `diff` + 27 `sec-default`) dan memverifikasi dengan skrip bahwa 406 berkas `index.ts` murni barrel. `telemetry/hooks` (210) dan `agents-md/hooks` (57) tidak dibuka ulang putaran ini; cakupannya berasal dari W2/W9a (lihat ledger). Badan tes tidak dibuka; hanya judul via grep.

---

## Bagian A — Ledger cakupan (hanya unit yang ditutup putaran ini)

Metode jangkauan: `git ls-files` untuk hitungan; skrip node baca-saja (`inv.mjs`) mendata 948 berkas `hooks` beserta ukuran dan baris; skrip kedua (`barrel.mjs`) membuktikan bahwa semua 406 `index.ts` hanya berisi `export ... from`/`export default` (0 pengecualian); skrip ketiga (`dump.mjs`) menggabungkan berkas sumber non-barrel per kelompok dengan membuang baris `import` dan baris kosong (komentar JSDoc dipertahankan), lalu saya membaca hasil gabungannya dengan alat Read. Kelompok yang dibaca: `diff/hooks/git` (106 berkas non-barrel), `register.ts` (900 baris tersaring), modul kecil `diff` (80 berkas), `pane-state` (25 berkas), logika non-visual `views` (25 berkas), sebagian `sec-default/hooks` (27 berkas). `security_reminder_hook.py` dibaca penuh baris 895-1713 dengan Read. Baseline Agent Core dibaca dengan Read/grep (tiga berkas target dibaca penuh). Tidak ada perintah yang mengubah apa pun.

### A.1 `mods/diff/hooks` (595 berkas)

| Unit | Jumlah file | Dibaca | Disposisi | Alasan satu baris | Temuan |
| --- | ---: | --- | --- | --- | --- |
| `git/` (argv, parse, probes, tiers, types, cut-hunks, fetch-hunks, dst.) | 199 | penuh 106 berkas sumber; 93 `index.ts` = barrel (skrip) | ADAPT | Seluruh backend git: pagar argv, parser numstat/shortstat/diff, probe HEAD/merge-base/rebase/unborn, penanggalan pra-sesi | GCD-01, 04, 05, 07, 09 |
| `register.ts` | 1 | penuh (1.160 baris asli, 900 tersaring) | REFERENSI | Mesin refresh: satu-penerbangan + antrean-satu, debounce, stempel epoch/generation, `asked.isAnswered` | GCD-11 |
| `classify/` | 22 | penuh (dump) | ADAPT | Daftar direktori/nama/sufiks generated dan test | GCD-06 |
| `turns/` | 16 | penuh | REFERENSI | Pembacaan edit per giliran dari transkrip; pemotongan pratinjau per code point | GCD-08 |
| `tools/`, `todos/`, `ask/` | 5 + 4 + 7 | penuh | REFERENSI | `mayHaveWritten` (shell read-only tidak memicu baca), lampiran ask dengan catatan potong | GCD-11 |
| `backend/`, `host/`, `command-spec/`, `is-on-pane-surface/`, `open-outcome/`, `pane-toggle/`, `is-checkpointing/` | 12 + 2 + 2 + 2 + 3 + 4 + 2 | penuh | TOLAK | Abstraksi backend VCS lain, tipe host, pemilihan permukaan UI Claude Code; tidak ada padanan | C-19 |
| `record/` | 20 | penuh | TOLAK | Telemetri fitur pane (`tengu_*`), ditelan bila gagal | C-2 W2 |
| `names/`, `array-of/`, `count-of/`, `kept-of/`, `is-record/`, `message-of/`, `mtime-of/`, `entry-kinds-of/`, `drawn-files-of/`, `hooks.json` | 22 + 2×8 + 1 | penuh | TOLAK | Teks pane, utilitas kecil, pembungkus `stat`/`list` | C-19 |
| `index.ts` akar | 1 | barrel | TOLAK | Re-ekspor | — |
| `limits/` | 36 | konstanta dibaca penuh oleh W9a (29 non-barrel); tidak dibuka ulang; 7 barrel | ADAPT | Angka batas donor (lihat GCA-01) | GCD-09 |
| `pane-state/` | 46 | penuh 25; 21 barrel | REFERENSI | `afterFetch` mempertahankan data baik terakhir; `emptyStateOf`, `headerTotalsOf` (`notShown`) | GCD-11 |
| `views/` | 172 | penuh 25 (layout/sanitasi, `detail/*`, `placeholder-of`, `sub-hunks-of`, windowing); 78 barrel; 69 render/tata letak Ink tidak dibuka | ADAPT (25) / TOLAK (69) | Logika sanitasi dan pemotongan Unicode berguna; render terminal tidak | GCD-08, C-4 W2 |
| **Subtotal** | **595** | | | | |

Cek jumlah: 199 + 1 + 141 (classify 22, turns 16, tools/todos/ask 16, backend/host/dll 27, record 20, names/utilitas/hooks.json 40, index.ts 1; semua dihitung dari data inventaris) + 36 + 46 + 172 = 595. Dari 595: 237 dibaca penuh oleh saya, 29 (limits) oleh W9a, 260 barrel (git 93 + modul kecil 61 + limits 7 + pane-state 21 + views 78), 69 render tidak dibuka (237 + 29 + 260 + 69 = 595).

### A.2 `mods/sec-default/hooks` (86 berkas)

| Unit | Jumlah file | Dibaca | Disposisi | Alasan satu baris | Temuan |
| --- | ---: | --- | --- | --- | --- |
| `held-verdict/` | 19 | penuh 14; 5 barrel | REFERENSI | Peringkat deny<ask<allow, `rewrittenByUsers`, `holdsOver`, `UNCHECKED_DENY` | GCD-10, MOD-03 |
| `policy/` | 44 | penuh 5 saya (`folded-id`, `org-server-names`, `folded-name`, `names-org-tool`, `code-loading-variables`) + 6 oleh W2 (person-writable, deny-rules-hold, managed-mods-only, pinned-names, is-pinned-variable, memo); `create-policy-memo` hanya tanda tangan + komentar; 14 barrel; ±19 berkas sisa tidak dibuka | REFERENSI / TOLAK | Lipat nama gagal-tertutup bernilai; sisanya mesin tier organisasi | GCD-10, C-1 W2 |
| `past-users/`, `admission-failure/`, `managed-mods-only-refusal/`, `pinned-variable-refusal/`, `hooks.json` | 7 + 2 + 2 + 2 + 1 | penuh (non-barrel) | TOLAK | Memilih tier penyedia dan teks penolakan; mesin tier | C-1 W2 |
| `skill-row/`, `tool-register-refusal/`, `register.ts`, `index.ts` | 3 + 4 + 1 + 1 | tidak dibuka putaran ini (W2 membaca 140/220 baris `register.ts`) | TOLAK | Registrasi hook tier organisasi | C-1 W2 |
| **Subtotal** | **86** | | | | |

### A.3 `mods/telemetry/hooks` (210) dan `mods/agents-md/hooks` (57)

| Unit | Jumlah file | Dibaca | Disposisi | Alasan satu baris | Temuan |
| --- | ---: | --- | --- | --- | --- |
| `telemetry/hooks` semua (context 92, entries 55, batching 19, gate 11, deployment 8, is-analytics-off 6, dan 19 lain termasuk `register.ts`) | 210 | tidak dibuka putaran ini; cakupan sebelumnya: W9a penuh 16 validator `entries` + 6 tipe `context` + 2 `is-analytics-off`; W2 penuh `batching`, `gate`, sampel `context`/`entries`; 104 `index.ts` barrel (skrip) | TOLAK (C-2 W2) / REFERENSI (validator, GCA-08) | Transport analitik jarak jauh dan sidik jari mesin tetap ditolak; tidak ada alasan membaca ulang | — |
| `agents-md/hooks` semua | 57 | tidak dibuka ulang; W2 penuh ±47 berkas dan W9a 13 berkas tambahan (total cakupan ≈ seluruh berkas non-barrel); 15 barrel (skrip) | REFERENSI | Resolver instruksi proyek (MOD-01..03) | — |
| **Subtotal** | **267** | | | | |

Total irisan hooks: 595 + 86 + 267 = 948 (sesuai `git ls-files`).

### A.4 Tes dan fixture (tidak dibaca satu per satu)

| Unit | Jumlah file | Dibaca | Disposisi | Alasan | Temuan |
| --- | ---: | --- | --- | --- | --- |
| `diff/tests` | 30 berkas uji (234 `test()`), 201 fixture | sampel terarah: grep judul dengan kata kunci symlink, binary, unicode, newline, quote, race, timeout, cancel, abort, truncat, stale, sanitiz, `/clear`; 23 judul relevan didata; badan tes tidak dibuka (W9a membaca penuh 6 berkas uji) | REFERENSI | Katalog mode kegagalan; sudah dipetakan | GCD-09 |
| `sec-default/tests` | 5 berkas (162 judul), 103 fixture | sampel terarah via grep judul (fold, case, unreadable, memo, window, fail-closed); 13 judul didata | REFERENSI | Kasus lipat nama dan memo gagal-tertutup | GCD-10 |
| `telemetry/tests` | 2 berkas (34 judul), 60 fixture | tidak dibuka | TOLAK | Telemetri jarak jauh | C-2 W2 |
| `agents-md/tests` | 1 berkas (5 judul), 15 fixture | tidak dibuka | REFERENSI | Sudah dicatat W2/W9a | — |

### A.5 Unit lain yang ditutup

| Unit | Jumlah file | Dibaca | Disposisi | Alasan | Temuan |
| --- | ---: | --- | --- | --- | --- |
| `plugins/security-guidance/hooks/security_reminder_hook.py` | 1 | penuh baris 895-1713 (kode `handle_commit_review_posttooluse`, `handle_push_sweep_posttooluse`, awal `handle_stop_hook`); W3/W9a sebelumnya baris 1-850 dan komentar | ADAPT / TOLAK | Mekanik deteksi commit/push dan identitas temuan bernilai; lapisan LLM, laju per jam, dan metrik ditolak | GCD-03, GCD-07, C-1 W3 |
| `examples/gateway/aws/setup.sh` | 1 | tidak dibuka putaran ini (54 KB; hanya di-grep oleh W9a) | TOLAK | Infrastruktur AWS; sudah dipetakan ke GCA-11 | C-16 W9a |
| `plugins/plugin-dev` ±36 referensi | ±36 | tidak dibuka putaran ini | TOLAK | Mengajarkan komponen Claude Code yang tidak dijalankan Agent Core (C-14, C-15 W9a) | — |
| Baseline Agent Core: `src/rdc/checkpoints/task-changes.ts` (303 baris), `scripts/inspect/workspace-fingerprint.mjs` (153), `src/code-intelligence/changed-source-security.ts` (188), `src/code-intelligence/change-review.ts` baris 55-89 dan 154, `src/mcp/code-intelligence-schemas.ts:55-70`, `src/ui/src/TaskChangesPanel.tsx` (grep), `tests/task-changes.test.ts` (judul 11 uji) | — | penuh / grep | — | Dasar semua klaim "baseline" | semua |

---

## Bagian B — Temuan

### GCD-01 Argumen `base` pada `change-review.ts` masuk argv git tanpa pagar opsi
- Sumber: donor `mods/diff/hooks/git/probes/is-sha/is-sha.ts` (hanya 40 atau 64 heksa huruf kecil yang boleh mencapai argv `git diff`), `probes/branch-base-of/branch-base-of.ts` (nama cabang bawaan berawalan `-` dianggap `none`), `fetch-hunks/fetch-hunks.ts` (`--literal-pathspecs`, `--`, jalur diberikan setelah pemisah), `argv/hunks-args` (prefiks tetap).
- Observasi: Donor memperlakukan setiap nilai yang berasal dari repositori atau pihak lain sebagai tidak tepercaya sebelum menjadi argumen git: ref diselesaikan dulu ke nama objek penuh dan hanya bentuk itu yang lolos; nama berawalan `-` ditolak; jalur selalu sesudah `--` dengan pencocokan harfiah.
- Nilai untuk Agent Core: Mencegah injeksi opsi git lewat input yang terlihat "hanya nama ref".
- Baseline Agent Core → BELUM-ADA pagar, terverifikasi dengan Read. `src/mcp/code-intelligence-schemas.ts:61` mendeklarasikan `base: z.string().min(1).max(500).optional()` (dan `head`, `refA`, `refB`) tanpa pola. `src/code-intelligence/change-review.ts` fungsi `changeRange(base, head)` membentuk satu elemen argv `${base}...${head}` atau `${base}...HEAD`, yang kemudian dipakai di baris 154 (`git diff --name-status --find-renames -z <range> --`). Bila `base` berawalan `-` (mis. opsi `--output=...`), elemen itu diparse git sebagai opsi, bukan sebagai ref; opsi `--output` menulis hasil diff ke berkas. `git()` helper memakai `execFile` tanpa shell, sehingga ini bukan injeksi shell, tetapi tetap injeksi opsi. Jalur yang mencapainya: `src/mcp/code-intelligence-tools.ts:333,352,376` meneruskan `input.base`/`input.head`. Baris 302 meneruskan `files.slice(0, 24)` setelah `--` tanpa `--literal-pathspecs`, sehingga nama berkas dengan karakter glob/magic (`:(top)`, `*`) ditafsirkan sebagai pathspec. Tidak saya jalankan.
- Delta/celah: (a) sebelum membentuk range, selesaikan `base`/`head` dengan `git rev-parse --verify --end-of-options <ref>^{commit}` dan pakai nama objek penuh hasilnya (Git terpasang adalah 2.55.0, jadi `--end-of-options` tersedia); tolak input yang gagal dengan kode galat jelas; (b) alternatif minimal: tolak string berawalan `-`; (c) tambah `--literal-pathspecs` pada pemanggilan `git log`/`diff` yang menerima daftar berkas dari controller.
- Cara adaptasi: `src/code-intelligence/change-review.ts` (fungsi murni kecil `resolveRef`), tanpa mengubah skema MCP (batas panjang 500 tetap). Uji: input `--output=x`, `-p`, `a b`, ref sah, ref yang tidak ada, dan pastikan tidak ada berkas dibuat. Sama untuk `refA`/`refB` pada jalur `code_surface(diff)` bila diteruskan ke git (tidak ditelusuri).
- Lisensi/hak cipta: pola pertahanan umum; mandiri.
- Perkiraan skala: S · Risiko: rendah (menolak input yang sebelumnya salah bentuk) · Nilai: sedang-tinggi · Butuh skema tool baru: tidak (hanya validasi runtime) · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: terverifikasi bahwa argv dibentuk dari string tak tervalidasi (Read). Dugaan: eksploitasi nyata (tidak dijalankan); apakah `refA/refB` mencapai git (tidak ditelusuri); apakah pemanggil eksternal pernah mengirim nilai berawalan `-`.
- Disposisi: ADAPT.

### GCD-02 `workspace-fingerprint.mjs`: kunci indeks, batas 256 senyap, dan `resolved` palsu pada `compare`
- Sumber: donor `argv/no-optional-locks.ts` (komentar: pembacaan tidak boleh mengambil kunci indeks dari git yang sedang dijalankan orang), `argv/git-child-env`, `diff-leading-args.ts`, `headerTotalsOf` (berkas melewati batas tidak pernah diberi tanggal sehingga selalu dihitung dan ditampilkan `notShown`).
- Observasi: Setiap probe donor memakai `--no-optional-locks`; setiap batas yang memotong data menghasilkan penanda atau hitungan "tidak ditampilkan", tidak pernah hilang diam-diam.
- Nilai untuk Agent Core: Sidik jari adalah bukti kepada controller. Bukti yang terpotong senyap lebih berbahaya daripada bukti yang berkata "terpotong".
- Baseline Agent Core → SEBAGIAN, empat cacat terverifikasi dengan Read pada `scripts/inspect/workspace-fingerprint.mjs`:
  1. Baris 18 dan 76-77: `git status` dan `git diff` dijalankan tanpa `--no-optional-locks` dan tanpa `core.fsmonitor=false`. Kedua perintah itu dapat memperbarui indeks secara oportunistik dan mengambil `index.lock`; pada mesin pengguna yang menjalankan git lain (IDE, commit manual) hal ini dapat membuat `git commit` pengguna gagal sesaat. Lima pemanggil lain di `src/` sudah memakai flag itu (grep terverifikasi); skrip ini belum.
  2. Baris 58: `pathStates.slice(0, MAX_PATH_EVIDENCE)` (256) memotong bukti isi tanpa bendera `pathEvidenceTruncated`. Isi berkas ke-257 dan seterusnya tidak ikut `pathEvidenceDigest`; perubahan isi pada jalur di luar 256 hanya tertangkap lewat `statusDigest`/`trackedDiffDigest` (untracked yang berubah isi tidak tertangkap).
  3. Baris 46 dan 111: daftar diurutkan lalu dipotong; `compareWorkspaceFingerprints` menghitung `resolved` sebagai jalur yang ada di `before` tetapi tidak di `after`. Bila ada >256 jalur kotor dan satu berkas baru dengan nama lebih awal secara alfabet muncul, jalur peringkat 256 bergeser ke 257, hilang dari `after.pathEvidence`, dan dilaporkan `resolved` padahal masih kotor. Ini cacat kelas yang sama dengan CCP-03 pada scanner.
  4. Baris 41: `.slice(0, 1000)` memotong nama jalur panjang diam-diam, lalu `hash-object` dijalankan pada nama yang salah.
  Catatan tambahan (dugaan): baris 72 membandingkan `resolvedRoot !== requestedRoot` sebagai string tanpa `comparable`; root dengan huruf besar-kecil berbeda atau melalui junction dapat ditolak sebagai `REPO_ROOT_REQUIRED` (tidak diuji).
- Delta/celah: tambah `--no-optional-locks` dan `-c core.fsmonitor=false` pada helper `git()`; tambah `LC_ALL=C` (GCA-07); keluarkan `pathEvidenceTruncated: true` dan `pathCountTotal`; di `compare`, jangan hitung `resolved` untuk jalur yang tidak ada di `after` bila salah satu sisi terpotong (laporkan sebagai `unverifiable` atau naikkan batas ke 10.000 hanya untuk daftar tanpa hash); tolak (bukan potong) nama >1000 karakter dengan penanda; bandingkan root dengan `comparable`.
- Cara adaptasi: `scripts/inspect/workspace-fingerprint.mjs` (pemilik); perubahan `schemaVersion` bila bentuk keluaran berubah (tambahan bidang opsional cukup, tetap v1). Uji di repo sementara (`mkdtemp`, dibersihkan `afterEach`).
- Lisensi/hak cipta: mandiri.
- Perkiraan skala: S · Risiko: rendah (menambah bidang dan flag; `compare` menjadi lebih konservatif) · Nilai: tinggi untuk akurasi bukti · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: terverifikasi dari kode (butir 1-4). Dugaan: butir `resolvedRoot`; frekuensi >256 jalur kotor pada proyek pemilik; dampak kunci indeks pada IDE tidak diukur.
- Disposisi: ADAPT.

### GCD-03 Identitas temuan scanner dan semantik "sudah ditinjau/resolved" (menguatkan CCP-03/04)
- Sumber: `plugins/security-guidance/hooks/security_reminder_hook.py:1319-1356` (kunci dedup `(filePath, category)`; komentar menyatakan `vulnerableCode` bergeser antar pemicu karena baris konteks diff bergeser), `:1248-1265` (SHA diperluas ke 40 heksa penuh lewat `rev-parse --verify -q` agar keanggotaan himpunan eksak, dicatat setelah peninjauan jalan), `:1551-1561` (diff gagal: ekor TIDAK ditandai sudah ditinjau; kode lewati 45), `:1657-1681` (hanya temuan yang DILAPORKAN dicatat sebagai "sudah diberitahukan"; yang ditekan tidak dicatat agar tidak terkubur), `:1137-1142` (SHA tidak ada di repo → lewati, jangan jatuh ke HEAD), `:1147-1157` (dedup jalur, versi terbaru menang).
- Observasi: Donor memisahkan tiga ide yang di Agent Core tergabung: identitas temuan (kasar sengaja: file + kategori), "pengguna sudah diberi tahu" (hanya yang dilaporkan), dan "sudah ditinjau" (hanya bila peninjauan selesai). Kegagalan di tengah tidak menggeser status ke arah "aman".
- Nilai untuk Agent Core: Controller membaca `resolved` dan `lifecycle` sebagai bukti. Nilai yang salah menyebabkan temuan nyata dianggap selesai.
- Baseline Agent Core → SEBAGIAN, terverifikasi dengan Read pada `src/code-intelligence/changed-source-security.ts`:
  - Baris 101-103: kunci `${id}:${file}:${line}`. Menyisipkan satu baris di atas temuan mengubah kunci: temuan lama muncul di `resolved` dan temuan yang sama muncul `new`.
  - Baris 163-170: `scope` = root + daftar berkas terurut; menambah atau mengurangi satu berkas dalam panggilan berikutnya membuat scope baru sehingga semua temuan `new` dan `resolved` kosong (kontinuitas hilang tanpa tanda). `resolved` dihitung dari kunci panggilan sebelumnya yang tak ada sekarang, termasuk kunci milik berkas yang kali ini dilewati (`not-regular-file`, `size-limit`, baris 130-131) atau dipotong batas 128 (baris 117); hanya `ENOENT` (baris 158) yang layak disebut resolved.
  - Baris 139: `lines[lineIndex].slice(0, MAX_LINE_CHARS)` (20.000) membuang sisa baris panjang (berkas minified) tanpa penanda; kecocokan setelah karakter 20.000 tidak pernah terlihat dan tidak dilaporkan.
  - Baris 143: hanya satu kecocokan per aturan per baris (`exec` sekali), jadi `column` dan hitungan menyembunyikan kecocokan kedua pada baris yang sama (wajar untuk advisory, tetapi tidak didokumentasikan di keluaran).
  - Baris 180-181: `filesRequested` dihitung setelah pemotongan 128 (CCP-03).
- Delta/celah (desain; bagian kunci adalah INFERENSI saya, donor lebih kasar): (a) kunci = `ruleId` + `file` + `sha256(teks baris yang cocok setelah trim dan lipat spasi)` + indeks kemunculan identik dalam berkas; stabil terhadap pergeseran baris; (b) `scope` = hanya `root` (atau `root` + sidik berkas) sehingga kontinuitas bertahan lintas daftar berkas berbeda, dengan kunci per berkas; (c) `resolved` hanya untuk berkas yang dipindai sukses dan kuncinya hilang, atau berkas `missing`; kunci milik berkas yang dilewati/dipotong dibawa maju sebagai `carried: 'unverified'`; (d) laporkan `filesRequestedTotal`, `filesDropped`, `scanComplete`, `lineTruncatedFiles`; (e) bila batas 128 terlampaui, urutkan berkas lebih dulu berdasarkan risiko jalur (seperti `_prioritize_diff_files` donor) tetapi tetap laporkan yang jatuh.
- Cara adaptasi: `src/code-intelligence/changed-source-security.ts` (pemilik tunggal; `lifecycle` tetap di memori proses, jadi tidak ada rumah penyimpanan baru); tambah berkas tes kecil di `tests/` (matriks di GCD-09). Bentuk keluaran bertambah bidang; versi tetap 1 selama bidang lama tidak berubah arti, atau naikkan `schemaVersion` bila `resolved` berubah arti (disarankan, karena arti nilai berubah).
- Lisensi/hak cipta: ide dan pola; mandiri.
- Perkiraan skala: S-M · Risiko: sedang (mengubah arti `resolved` dan `lifecycle` yang mungkin dibaca controller; wajib uji regresi dan catatan di keluaran) · Nilai: tinggi · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: terverifikasi (donor dibaca penuh pada baris itu; kode Agent Core dibaca penuh). Dugaan: bahwa controller menafsirkan `resolved` sebagai bukti perbaikan; frekuensi >128 berkas atau baris >20.000 karakter.
- Disposisi: ADAPT.

### GCD-04 `task-changes.ts`: enam cacat kecil yang terlihat setelah membandingkan dengan pengurai donor (menguatkan MOD-13, GCA-01/02/07)
- Sumber: donor `git/parse/parse-numstat.ts` (rekaman rename tiga bagian; nama jalur disusun ulang dengan `join('\t')`; hitungan `Number(x) || 0`), `argv/diff-leading-args.ts` (`diff.relative=false`, `core.quotePath=false`, `--ignore-submodules=dirty`), `probes/overlay-unstaged.ts`, `probes/unstaged-numstat.ts`, `probes/is-unborn-head.ts` (hanya exit 1 yang berarti unborn), `probes/dirty-paths-of.ts` (`--no-renames`), `limits/` (timeout 5 detik per git).
- Observasi: Donor mem-pin semua konfigurasi yang mengubah bentuk keluaran dan mengurai nama dengan `-z` secara kokoh.
- Baseline Agent Core → SEBAGIAN; keenam butir terverifikasi dengan Read pada `src/rdc/checkpoints/task-changes.ts`:
  1. Baris 241: `numstat[index].split('\t')` memecah di setiap tab sehingga nama jalur yang mengandung tab terpotong pada bagian pertama; kunci `stats` tidak cocok dan hitungan baris menjadi `null` diam-diam. Donor menyatukan kembali sisa kolom.
  2. Baris 239 dan 244: hasil `diff --numstat -z HEAD --` diselesaikan terhadap `top` (akar repo). Bila `diff.relative=true` ada di konfigurasi pengguna dan `root` adalah subfolder repo, git mencetak jalur relatif terhadap cwd dan hanya subfolder itu; resolusi terhadap `top` salah (DUGAAN bergantung konfigurasi pengguna; pin `-c diff.relative=false` menutupnya).
  3. Baris 246: kegagalan `numstat` (termasuk HEAD yatim) ditelan tanpa tanda. Donor memakai rumus `staged + unstaged_added - unstaged_removed` (minimal 0) dari `diff --cached --numstat` plus `diff --numstat` untuk HEAD yatim; Agent Core cukup menandai `counts: 'unavailable'` dengan alasan `unborn-head` bila `rev-parse --verify HEAD` keluar tepat 1.
  4. Baris 232 dan 239: tidak ada `--ignore-submodules=dirty` sehingga submodule kotor memicu `git status` bersarang (biaya pada mesin lambat; keluaran tetap benar).
  5. Baris 20 dan 250-255: `totalMilliseconds: 20_000` hanya dipakai sebagai `deadline` untuk pembuatan diff (baris 200), tidak untuk `externalChanges`; tiga panggilan git berurutan masing-masing sampai 8 detik (24 detik) dapat melewati batas total.
  6. Baris 103-107 dan 114-118: tidak ada `LC_ALL=C` (GCA-07); `shapeDiff` mencocokkan `Binary files` yang berlokal.
  Terverifikasi benar (bukan cacat): pasangan rename `status -z` (`fields[++index]`) sesuai format v1 (baris 219); `field.length < 4` aman karena `XY␠` + minimal satu karakter nama.
- Delta/celah: pin `diff.relative=false`, `--ignore-submodules=dirty`, `LC_ALL=C`; gabung kolom nama numstat; label `counts` dan alasan unborn; deadline berlaku di `externalChanges`.
- Cara adaptasi: `src/rdc/checkpoints/task-changes.ts` dan `tests/task-changes.test.ts` (11 uji sekarang; judulnya terverifikasi tidak mencakup butir 1-6). Tanpa skema tool; `ExternalChange` bertambah satu bidang opsional.
- Lisensi/hak cipta: fakta Git; mandiri.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: terverifikasi dari kode; butir 2 bergantung konfigurasi pengguna (dugaan); frekuensi tab dalam nama jalur sangat rendah.
- Disposisi: ADAPT.

### GCD-05 Atribusi "pra-sesi": aturan donor agar pekerjaan nyata tidak tersembunyi
- Sumber: donor `probes/was-dirty-at-start/was-dirty-at-start.ts`, `probes/tag-pre-session.ts`, `probes/untracked-rows-of/untracked-rows-of.ts`, `probes/datings-of/datings-of.ts`, `probes/dirty-paths-of/dirty-paths-of.ts`, `pane-state/header-totals-of.ts`.
- Observasi: Berkas dianggap "pra-sesi" hanya bila DUA syarat terpenuhi: waktu ubah lebih tua dari awal sesi DAN jalur itu sudah kotor ketika baseline dibaca (satu kali, pada fetch pertama). Berkas tidak dapat diberi tanggal (terhapus, symlink, di luar anggaran daftar direktori) atau yang muncul sesudah baseline (hasil rename/pindah mempertahankan mtime lama) tetap dianggap pekerjaan sesi. Berkas di luar batas baris tidak pernah diberi tanggal dan selalu dihitung ("notShown"). Prinsipnya: ketidakpastian menggeser ke arah menampilkan.
- Nilai untuk Agent Core: `ExternalChange.modifiedAfterTaskStart` hanya berbasis mtime (`task-changes.ts:252`), disortir lebih dulu agar tidak terpotong, tetapi tidak membedakan "sudah kotor sebelum task" dari "diubah sesudahnya oleh sumber lain".
- Baseline Agent Core → SEBAGIAN. Hint mtime ada dan diberi label "hint only"; sidik jari CC-P1 menyimpan `pathEvidence` yang bisa menjadi baseline ("preExisting/introduced", `compareWorkspaceFingerprints`), tetapi `task-changes.ts` tidak memakainya (`grep fingerprint` pada berkas itu: 0; satu-satunya pengguna `workspace-fingerprint.mjs` adalah skripnya sendiri).
- Delta/celah: tambah `baselineDirty: 'yes' | 'no' | 'unknown'` pada `ExternalChange` bila sidik jari awal task tersedia; `unknown` bila tidak ada baseline (jangan dianggap pra-sesi). Prinsip wajib: ketidakpastian tidak boleh menyembunyikan entri.
- Cara adaptasi: REFERENSI bersyarat; butuh keputusan pemilik tentang kapan sidik jari awal diambil (mis. saat task Native dimulai). Tidak ada penyimpanan baru: pakai artefak sidik jari yang sudah ada.
- Lisensi/hak cipta: mandiri.
- Perkiraan skala: M · Risiko: sedang (kopling dua modul) · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: terverifikasi (kedua sisi); kebutuhan pemilik adalah dugaan.
- Disposisi: REFERENSI.

### GCD-06 Klasifikasi noise/generated: `noiseClass` hanya sebagian dari daftar donor (koreksi atas catatan "SUDAH-ADA" W2)
- Sumber: donor `classify/is-generated-file/*` (22 direktori, 15 pola nama, 12 nama berkas kunci, 9 sufiks), `is-test-file/*` (10 direktori, 5 pola nama), `rooted-path-of.ts` (menambahkan `/` di depan agar pola direktori cocok di akar).
- Observasi: Daftar donor mencakup direktori `dist`, `build`, `out`, `output`, `vendor`, `third_party`, `.next`, `.nuxt`, `coverage`, `__pycache__`, `venv`, `target/release`, `__snapshots__`; berkas kunci `package-lock.json`, `pnpm-lock.yaml`, `bun.lockb`, dst.; pola `.generated.`, `.gen.`, `.pb.go`, `.snap`, `_test`, `.d.ts`; direktori tes `fixtures`, `__mocks__`, `testdata`.
- Baseline Agent Core → SEBAGIAN, diuji dengan string (node, tanpa berkas): `noiseClass` (`workspace-fingerprint.mjs:49-55`) mengembalikan `source` untuk `package-lock.json`, `pnpm-lock.yaml`, `bun.lockb`, `src/types/api.d.ts`, `src/x.generated.ts`, `src/x.gen.ts`, `src/api.pb.go`, `fixtures/a.json`, `src/__snapshots__/a.snap`, `out/app.js`, `.next/a.js`, `x_test.go`, `a/__mocks__/b.ts`. Hanya `yarn.lock` (sufiks `.lock`) dan direktori `node_modules|vendor|dist|build|coverage` serta `tests/` terdeteksi.
- Delta/celah: ganti dengan tabel daftar yang dipakai bersama sidik jari dan (bila ada) panel perubahan; `package-lock.json` pada repo Agent Core sendiri sekarang berlabel `source`.
- Cara adaptasi: `scripts/inspect/workspace-fingerprint.mjs` (data klasifikasi, bukan gerbang); perubahan memengaruhi `pathEvidenceDigest` karena `noiseClass` ikut di digest: sidik jari lama dan baru tidak dapat dibandingkan lintas versi (naikkan `schemaVersion` atau keluarkan `noiseClass` dari digest).
- Lisensi/hak cipta: daftar pola nama umum (Linguist); disusun ulang sendiri.
- Perkiraan skala: S · Risiko: rendah-sedang (digest berubah) · Nilai: rendah-sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: terverifikasi (uji string 14 kasus). Dugaan: bahwa pembaca memakai `noiseClass` untuk memprioritaskan tinjauan.
- Disposisi: ADAPT.

### GCD-07 Mekanik deteksi gerakan HEAD dikonfirmasi oleh kode hook (menguatkan GCA-04)
- Sumber: `plugins/security-guidance/hooks/security_reminder_hook.py:951-989` (fallback reflog `HEAD@{0}`, jendela lima entri terakhir × 120 detik, himpunan SHA sudah-ditinjau), `:1025-1055` (ambil kecocokan TERAKHIR karena label hook pra-commit mendahului baris asli), `:1064-1105` (tiga pagar amend), `:1137-1142` (SHA tak ada di repo → lewati, jangan jatuh ke HEAD), `:1434-1519` (push: satu baris rentang, ujung rentang harus sama dengan HEAD, banyak ref → lewati, push `* [new branch]` memverifikasi ref lokal = HEAD, push senyap `-q` dibuktikan lewat `@{u}` dan `@{u}@{1}` berbeda dan `@{u}` = HEAD), `:1527-1544` (rentang `prev_upstream..HEAD`), `:1549-1561` (diff gagal → ekor tidak ditandai ditinjau).
- Observasi: Kode donor mengonfirmasi bahwa keadaan git (reflog, ref pelacak) lebih andal daripada teks perintah atau keluaran, dan bahwa keluaran yang terpotong (pipe, `-q`) tidak boleh dianggap gagal. W9a menyebut jalur push sebagai "inferensi": kini terdukung oleh kode donor (tetap belum dijalankan di mesin ini).
- Nilai untuk Agent Core: kontrol detektif atas aturan "commit/push hanya dengan persetujuan" tanpa mengurai teks perintah.
- Baseline Agent Core → BELUM-ADA (`grep reflog` kosong; W9a). Sidik jari menyimpan `head`.
- Delta/celah (menambah rincian GCA-04): perbedaan `head` hanya diperiksa terhadap lima entri reflog terakhir dan harus berhenti pada entri yang sama dengan `from`; SHA dari reflog dinormalkan ke 40 heksa dengan `rev-parse --verify -q` sebelum perbandingan; entri `checkout:` bukan commit; bila `from` tidak ditemukan dalam jendela, laporkan `unverifiable`, bukan "tidak ada commit"; untuk push, bandingkan `@{u}` antara dua sidik jari dan konfirmasi dengan `@{u}@{1}`; push yang ditolak tidak menggeser `@{u}`, sehingga tidak terhitung.
- Cara adaptasi: `scripts/inspect/workspace-fingerprint.mjs` (keluaran `compare`), argv tetap tanpa shell, pin dari GCD-02. Hanya melaporkan.
- Lisensi/hak cipta: nama keadaan reflog adalah fakta Git; mandiri.
- Perkiraan skala: S-M · Risiko: rendah · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: terverifikasi dari kode donor; belum dijalankan di mesin ini; `core.logAllRefUpdates=false` membuat hasil `unverifiable`.
- Disposisi: ADAPT.

### GCD-08 Sanitasi label dan pemotongan Unicode: himpunan karakter yang tepat (menguatkan MOD-07)
- Sumber: donor `views/layout/sanitize-line/sanitize-line.ts` (buang `\p{Cc}`, `\p{Cf}`, dan `\p{Default_Ignorable_Code_Point}`; tab menjadi spasi), `sanitize-name.ts`, `truncate-start.ts` (pemotongan dari awal agar nama berkas bertahan; biaya minimal satu sel per code point), `charged-width.ts`, `detail/sub-hunks-of/first-line-cut` (tidak memotong pasangan surrogat), `turns/turn-of/turn-of.ts` (pratinjau dipotong per code point `[...text]`), `detail/placeholder-of/safe-pathspec-pattern` (`/^[\p{L}\p{N}._/@+-]+$/u` untuk nama yang boleh ditempel ke perintah), `ask/fitted-ask-text-of.ts` (catatan potong ikut dihitung dalam anggaran).
- Observasi: W2 menyebut kategori `Cf` dan beberapa rentang. Kode donor menyatakan satu ekspresi tunggal yang lebih lengkap (`Default_Ignorable_Code_Point` ikut menangkap soft hyphen, variation selector, jamo filler, dst.) dan tiga invarian tambahan: potong per code point, jangan membelah pasangan surrogat, hitung biaya tampilan minimal 1 per code point agar penambahan tanda gabung tidak melewati ruang.
- Nilai untuk Agent Core: label dari luar (nama berkas pada panel, nama komponen plugin yang dipreview) bisa disamarkan.
- Baseline Agent Core: SEBAGIAN seperti dicatat W2 MOD-07 (hanya `\x00-\x1f\x7f`). Tambahan yang tidak saya verifikasi: apakah `slice` pada ringkasan (`agent-controller.ts:431-434, 945`) dapat membelah pasangan surrogat (dugaan; JSON.stringify modern meloloskan surrogat sepi sebagai `\udXXX`, jadi dampaknya hanya teks aneh, bukan galat).
- Delta/celah: satu fungsi `oneLineLabel` memakai ekspresi di atas dengan flag `u`, pemotongan per code point, dan penanda `[+N chars]` (rencana MOD-07 tetap); uji: RLO U+202E, ZWSP U+200B, soft hyphen U+00AD, variation selector U+FE0F, pasangan surrogat di titik potong, nama berkas dengan 300 tanda gabung U+0301.
- Cara adaptasi: `src/security/` (fungsi kecil), dipakai di `boundedSummary`, `src/skills/claude-plugin.ts` (`reportLabel`), dan `TaskChangesPanel`/`task-changes.ts` untuk jalur yang ditampilkan.
- Lisensi/hak cipta: properti Unicode standar; mandiri.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: terverifikasi (donor); dugaan: pembelahan surrogat di Agent Core.
- Disposisi: ADAPT.

### GCD-09 Matriks kasus uji untuk tiga modul dan resolver (permintaan utama putaran ini)
Setiap baris adalah satu uji kecil (repo git sementara via `mkdtemp`, dibersihkan `afterEach`; tidak meninggalkan proses atau berkas). Kolom "asal" menyebut berkas donor yang mengunci invarian itu.

**A. `src/rdc/checkpoints/task-changes.ts` (`tests/task-changes.test.ts`, ± 18 uji baru)**

| Kasus | Hasil yang diharapkan | Asal |
| --- | --- | --- |
| Nama berkas mengandung spasi, non-ASCII, tanda kutip, backslash | Muncul apa adanya di `external.items[].path` (mode `-z`) | `unusual-names.ts`, `git/parse` |
| Nama berkas mengandung tab | Hitungan baris tetap benar (setelah GCD-04 butir 1) | `parse-numstat.ts` |
| Nama berkas mengandung newline | Jalur utuh, tidak terpecah | `unusual-names.ts` |
| Rename staged (`R `) dan copy (`C `) | Satu entri dengan `oldPath`; rekaman kedua tidak menjadi entri sendiri | `parse-numstat.ts` (3 rekaman) |
| Konflik `UU`, `AA`, `DD` | `state: 'conflicted'` | `unmerged-status.ts` |
| HEAD yatim (repo tanpa commit) dengan satu berkas staged dan diedit lagi | `counts` tidak kosong diam-diam; rumus `staged + unstaged_added - unstaged_removed` (min 0) atau `counts: 'unavailable'` + alasan | `overlay-unstaged.ts`, `is-unborn-head.ts` |
| Berkas berubah menjadi symlink | Tidak diikuti; `not-a-regular-file` | W9a GCA-01 |
| Repo di tengah merge/rebase/cherry-pick/revert (buat `MERGE_HEAD` dsb. di `.git` sementara) | Label `repoState`; `REBASE_HEAD` tanpa folder `rebase-merge`/`rebase-apply` berisi `rebasing` BUKAN rebase | `is-transient.ts`, `rebase-marks.ts` |
| `diff.relative=true` + root subfolder | Jalur numstat tetap benar (setelah pin) | `diff-leading-args.ts` |
| Submodule kotor | Tidak memicu `git status` bersarang (setelah pin) | `diff-leading-args.ts` |
| Git tidak terpasang / bukan repo / timeout / buffer terlampaui | Lima alasan berbeda (GCA-02) | `register.ts` (`asked.isAnswered`) |
| Tepat di batas: 40 vs 41 diff, 200 vs 201 applied, 300 vs 301 external, 2.000 vs 2.001 scan, `diffOutputBytes` tepat vs +1 | `truncated` benar di kedua sisi batas | pola "tepat di batas" donor (`parse-file-diffs.test.ts:242`, W9a) |
| Lokal non-Inggris (`LANG=de_DE` pada env uji) | Klasifikasi biner tidak berubah | `git-child-env.ts` |
| `diff --no-index` melewati timeout | Alasan `git-timeout`, bukan `git-diff-failed` | GCA-02 |

**B. `scripts/inspect/workspace-fingerprint.mjs` (uji skrip, ± 10 kasus)**

| Kasus | Hasil yang diharapkan |
| --- | --- |
| 257 jalur kotor; tambah satu berkas berawalan "0-" | Tidak ada jalur lama di `resolved`; `pathEvidenceTruncated: true` |
| Isi berkas ke-257 berubah | Terdeteksi atau ditandai `unverifiable`, bukan "unchanged" |
| Nama jalur >1.000 karakter | Ditolak/ditandai, hash tidak dihitung pada nama terpotong |
| Berkas terhapus (`hash-object` gagal) | `contentHash: null`, status tetap |
| Symlink ke luar repo | Tidak ada hash dari isi tujuan |
| `requestedRoot` dengan huruf besar-kecil berbeda | Tidak ditolak keliru (setelah `comparable`) |
| `head` bergerak (commit, amend, checkout, reset) | `headMoved` dengan jenis dari reflog; `checkout` bukan commit; `unverifiable` bila `from` di luar jendela |
| `noiseClass` untuk 14 nama di GCD-06 | Sesuai tabel donor |

**C. `src/code-intelligence/changed-source-security.ts` (`tests/changed-source-security.test.ts`, belum ada sama sekali)**

| Baris masukan | Hasil yang diharapkan | Catatan |
| --- | --- | --- |
| `const m = RE.exec(line)` ; `HUNK_RE.exec(line)` ; `/x/.exec(s)` | Tidak ada temuan SHELL.EXEC | CCP-01 (113 pemanggilan `.exec(` di 41 berkas `src/` non-tes) |
| `exec(cmd)` ; `execSync(cmd)` ; `child_process.exec(cmd)` ; `cp.exec(cmd)` | Temuan; jangan sampai lookbehind yang menolak `.` menghilangkan `child_process.exec` | donor memakai aturan terpisah untuk `child_process` |
| `rejectUnauthorized: false` ; `NODE_TLS_REJECT_UNAUTHORIZED = "0"` | Temuan | CCP-01 |
| `NODE_TLS_REJECT_UNAUTHORIZED = "1"` ; `delete process.env.NODE_TLS_REJECT_UNAUTHORIZED` | Tidak ada temuan | baris 47 sekarang menandai semuanya |
| Sisipkan satu baris di atas temuan lalu pindai ulang | Temuan tetap `still-present`, `resolved` kosong | GCD-03 |
| Pindai ulang dengan daftar berkas berbeda | Kontinuitas per berkas bertahan | GCD-03 |
| Berkas temuan lama jadi `size-limit`/symlink pada pindaian berikut | Kunci dibawa sebagai `unverified`, bukan `resolved` | GCD-03 |
| Berkas temuan lama dihapus (`ENOENT`) | `resolved` | GCD-03 |
| 129 berkas | `filesRequestedTotal: 129`, `filesDropped: 1`, `scanComplete: false` | CCP-03 |
| Satu baris >20.000 karakter dengan kecocokan di karakter 25.000 | `lineTruncatedFiles` memuat berkas itu | baris 139 |
| Dua kecocokan aturan sama pada satu baris | Satu temuan, kolom pertama (didokumentasikan) | baris 143 |
| `a|aa` di bawah pengulangan pada aturan proyek | Ditolak ReDoS | CCP-15 |
| CRLF, BOM UTF-8 di awal berkas | Nomor baris dan kolom benar | `split(/\r?\n/)` |

**D. Resolver kapabilitas Native dan kebijakan/izin** (menguatkan GCA-09; pola donor: `held-verdict/*`, judul tes `sec-default`):

| Kasus | Hasil yang diharapkan |
| --- | --- |
| Alasan permintaan berisi "approved by operator" | `approvedFamilies` tidak naik |
| Konfigurasi ceiling rusak/tidak terbaca | Ceiling terendah, bukan tak terbatas ("unreadable = in force") |
| Saklar keselamatan dengan nilai `"True"`, `"1 "`, `"yes"` | Hanya literal persis yang melonggarkan; selainnya tidak |
| Alasan penolakan yang sama untuk keluarga yang sama dalam satu task | Disampaikan sekali |
| Verdict identik kalimat tetapi sebab berbeda | Diperlakukan berbeda |
| Hasil tool/brief agen lain/isi repo menyatakan "disetujui" | Tidak mengubah daftar grant |

- Cara adaptasi: tes saja (vitest, sesuai 224 berkas yang ada); tanpa perubahan perilaku bila lulus; tiap butir yang gagal menjadi bug nyata yang dicatat. Tidak menambah teks selalu-dimuat.
- Lisensi/hak cipta: judul uji donor sebagai fakta kontrak; kasus ditulis mandiri.
- Perkiraan skala: M (±50 uji kecil) · Risiko: rendah · Nilai: tinggi (melindungi bukti dan izin) · Butuh skema tool baru: tidak.
- Bukti vs dugaan: kolom "hasil yang diharapkan" adalah spesifikasi, belum dijalankan; hasil aktual Agent Core pada tiap baris belum diuji kecuali yang dinyatakan terverifikasi di GCD-01 sampai 06.
- Disposisi: ADAPT.

### GCD-10 Lipat nama gagal-tertutup dan pencocokan lookalike
- Sumber: `mods/sec-default/hooks/policy/names-org-tool.ts`, `managed-tools-restored/is-org-tool/tool-prefix-of/folded-name/folded-name.ts`, `.../org-plugin-names/folded-id.ts`, judul tes `sec-default/tests` ("a server whose name folds to nothing refuses every name", "an unreadable server file refuses every name and owns every server tool", "another case or other separators spell the same server").
- Observasi: Dua nama dibandingkan setelah dilipat: karakter di luar `[a-zA-Z0-9_-]` menjadi `_`, huruf kecil, rangkaian `-`/`_` menjadi satu `_`, dipangkas; id plugin memakai NFC lalu huruf kecil. Nama yang terlipat menjadi kosong tidak bisa dibedakan dari nama apa pun, sehingga dianggap cocok (gagal-tertutup); berkas yang tidak terbaca dianggap memiliki semua nama.
- Nilai untuk Agent Core: pratinjau plugin Claude dan Skill memiliki nama dari pihak luar; nama yang mirip nama Skill sendiri (mis. `Code_Review` vs `code-review`) dapat mengecoh pembaca.
- Baseline Agent Core: Skill dibatasi nama huruf kecil-tanda hubung (konvensi brief), sehingga permukaan kecil. Tidak diverifikasi apakah adapter `claude-plugin.ts` memeriksa tabrakan terlipat dengan 39 capability yang ada (dugaan: tidak).
- Delta/celah: fungsi lipat nama kecil dipakai di preview untuk memberi peringatan `NAME_LOOKALIKE` (hanya melapor); nama yang terlipat kosong dilaporkan sebagai tidak valid, bukan diterima.
- Cara adaptasi: `src/skills/claude-plugin.ts` (bersama CCP-11).
- Lisensi/hak cipta: aturan lipat nama; mandiri.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: terverifikasi (donor); dugaan: kebutuhan.
- Disposisi: REFERENSI.

### GCD-11 Kejujuran keadaan kosong, degradasi, dan aturan refresh panel
- Sumber: donor `pane-state/empty-state-of.ts`, `after-fetch/after-fetch.ts`, `header-totals-of.ts`, `register.ts:242-312` (refresh satu-penerbangan + antrean-satu, debounce), `:74-121` (`asked.isAnswered`: git yang dibatalkan/diabort tidak dihitung sebagai "bukan repositori"), `:184-202` (stempel `generation|baseRef` membuang hasil basi), `tools/may-have-written.ts` (perintah shell read-only tidak memicu baca).
- Observasi: (1) "tidak ada baris tracked saat daftar untracked ditahan" tidak berarti "tidak ada berkas baru": teksnya menyebut ketidakpastian; (2) data baik terakhir dipertahankan saat fetch tidak tersedia, dan keadaan kosong menyebut "akan dicoba lagi"; (3) satu pembacaan pada satu waktu dengan satu permintaan antre; (4) hasil lama dibuang lewat stempel.
- Baseline Agent Core → SUDAH-ADA sebagian: `TaskChangesPanel.tsx:106-123` memakai `requestId` dan membuang respons yang tidak cocok dengan `pending.current?.id`; panel hanya mengambil data saat dibuka; ada batas waktu klien (`setTimeout` → error "timed out"). Belum diverifikasi: apakah teks UI untuk `external.state === 'unavailable'` dan `truncated` membedakan alasan (GCD-04/GCA-02) dan apakah data baik terakhir dipertahankan saat Refresh gagal (kode menyetel `state='error'` tetapi tidak membersihkan `data` pada jalur yang saya lihat; perilaku tampilan tidak dilihat).
- Delta/celah: hanya dua periksaan kecil saat GCA-02 dikerjakan: teks keadaan kosong tidak boleh mengklaim "tidak ada perubahan" bila bagian `external` tidak tersedia; Refresh yang gagal mempertahankan data sebelumnya dengan penanda "basi".
- Cara adaptasi: `src/ui/src/TaskChangesPanel.tsx`. Mesin refresh hidup donor tidak diadopsi (tidak ada polling).
- Lisensi/hak cipta: pola UI; mandiri.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: terverifikasi (donor dan potongan UI via grep); tampilan visual tidak dilihat.
- Disposisi: REFERENSI.

---

## Bagian C — Ditolak / tidak relevan (alasan spesifik)

- C-19 Abstraksi backend VCS lain (`diff/hooks/backend`), tipe `Host`, `is-on-pane-surface`, `pane-toggle`, `open-outcome`, `command-spec`, `names/*` teks pane: semuanya menyangkut permukaan UI terminal Claude Code (pane, `/diff`, lebar 110 kolom, sistem slot `$.ui.open`). Agent Core memakai React/WebView sendiri dan tidak punya `$`; tidak ada pola yang dapat dipindahkan selain yang sudah dipetakan.
- `diff/hooks/record` dan seluruh `telemetry/hooks`: telemetri jarak jauh ditolak (C-2 W2). Pengecualian lama tetap: validator baris tertutup (GCA-08).
- `diff/hooks/views` render (69 berkas tsx/ts tata letak Ink): render terminal, tidak dibuka. Hanya logika sanitasi dan pemotongan yang diambil (GCD-08).
- `sec-default/hooks` mesin tier (`past-users`, `skill-row`, `tool-register-refusal`, `register.ts`, `admission-failure`, `pinned-variable-refusal`): outermost/`next.to`/tier penyedia tidak punya padanan di Agent Core (C-1 W2). Prinsipnya sudah diambil di MOD-03/17 dan GCA-09.
- Kode hook `security_reminder_hook.py` baris 895-1713 yang ditolak: peninjauan LLM per commit dan push-sweep (model/agen kedua tersembunyi, laju per jam, telemetri `emit_metrics`, kode lewati bilangan bulat untuk Statsig, `asyncRewake` exit 2). Penolakan lama diteguhkan; hanya mekanik git (GCD-03, GCD-07) yang diambil.
- `examples/gateway/aws/setup.sh` (54 KB) dan ±36 referensi `plugin-dev`: tidak dibuka putaran ini; alasan penolakan W9a (C-14, C-15, C-16) tidak bergantung pada isi barisnya dan tidak ada petunjuk baru dari judul atau ukuran.
- Pembanding yang diperiksa dan SUDAH-ADA: penolakan respons basi panel (`requestId`), `--no-optional-locks` pada lima pemanggil git, penanganan pasangan rename `status -z`, `maxBuffer` yang membuat listing terpotong tidak pernah diurai (W9a).
- Isu yang diperiksa dan tidak ditindaklanjuti: lipat huruf besar-kecil nama server MCP (tidak ada server MCP pihak ketiga yang diatur Agent Core); `tsconfig` donor (C-6 W2).

---

## Bagian D — Pola lintas-unit dan pertanyaan terbuka

Pola yang berulang dan layak jadi standar (semua tanpa teks selalu-dimuat):

1. Bukti tidak boleh bergeser ke arah "aman" saat pembacaan gagal atau terpotong. Donor: ekor commit tidak ditandai ditinjau bila diff gagal (hook baris 1551-1561); berkas tak bertanggal tetap dihitung pekerjaan sesi (`tag-pre-session.ts`); `notShown` menjaga berkas di luar batas tetap terlihat. Agent Core: GCD-02 dan GCD-03 melanggar pola ini (batas senyap dan `resolved` palsu).
2. Setiap nilai yang berasal dari pihak lain dinormalkan sebelum menyentuh argv: nama objek penuh (`isSha`), tolak berawalan `-`, `--literal-pathspecs`, `--`, `--no-ext-diff --no-textconv`, `LC_ALL=C`, `--no-optional-locks` (GCD-01, 02, 04).
3. Identitas dibuat sekasar yang diperlukan dan sekokoh terhadap pergeseran: temuan dikunci pada (file, kategori), bukan pada teks atau baris yang bergeser (GCD-03).
4. "Sudah diberitahukan" dan "sudah ditinjau" dicatat hanya setelah benar terjadi; yang ditekan tidak dicatat agar tidak terkubur (hook 1657-1681).
5. Keadaan git lebih tepercaya daripada teks perintah atau keluaran: reflog, ref pelacak, dan marker folder `.git` (GCD-07, MOD-13).
6. Pembaca mengambil jawaban dari sumber yang menjawab (`asked.isAnswered`): bedakan "tidak ada" dari "tidak dijawab" sebelum menyimpan jawaban stabil (GCA-02, GCD-11).
7. Sanitasi label memakai satu ekspresi properti Unicode, potong per code point, biaya minimal 1 per code point, nama panjang dipotong dari awal (GCD-08).
8. Semua batas bernama diuji tepat di batas (+1 dan -1), termasuk batas pathspec 12.000 karakter dan batas diff 1.000.000 byte (GCD-09).

Pertanyaan terbuka untuk Main/pemilik:

- Q1. Apakah GCD-01 boleh langsung diperbaiki sebagai perbaikan keamanan kecil, mengingat memengaruhi validasi input `base` untuk controller eksternal yang mungkin memakai nilai tak lazim?
- Q2. Apakah `resolved` pada scanner dibaca controller sebagai bukti perbaikan? Bila ya, arti nilai berubah pada GCD-03 dan perlu `schemaVersion: 2`.
- Q3. Apakah sidik jari awal task Native akan diambil otomatis (GCD-05)? Tanpa itu, atribusi "pra-sesi" tetap hanya hint mtime.
- Q4. Apakah pemilik ingin `package-lock.json` dan sejenisnya dianggap noise pada sidik jari (GCD-06), mengingat digest sidik jari lama menjadi tidak sebanding?
- Q5. Apakah ada konfigurasi `diff.relative`, `color.ui=always`, atau `diff.external` di `~/.gitconfig` pemilik yang mengubah keluaran git yang diurai? Tidak saya baca (konfigurasi pengguna bukan irisan ini).

Hal yang tidak sempat dibaca atau tidak dibaca penuh (jujur): 69 berkas render `diff/hooks/views`; 29 berkas `diff/hooks/limits` (hanya konstanta, oleh W9a); seluruh `telemetry/hooks` (210) dan `agents-md/hooks` (57) tidak dibuka ulang; `sec-default/hooks/policy` ±19 berkas, `register.ts`, `skill-row`, `tool-register-refusal`, badan `create-policy-memo`; badan semua berkas tes (hanya judul via grep); 379 fixture; `setup.sh` AWS dan ±36 referensi `plugin-dev`; baris 1713-akhir `security_reminder_hook.py` (stop hook dan `main`, sudah dibaca sebagian oleh W3). Tidak ada skrip atau hook sumber yang dijalankan; semua klaim perilaku Agent Core berasal dari Read/grep atau uji string.
