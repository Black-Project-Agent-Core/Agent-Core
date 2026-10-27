# W4 — claude-plugins-official, bagian A (prefix temuan `OFA`)

Tanggal: 2026-10-27. Pembaca: Main (penulis proposal upgrade). Status: baca-saja; satu-satunya file yang ditulis adalah file ini.

Irisan: `E:\Projects\Side-Project-Dont-Touch\claude-plugins-official\plugins\` untuk sepuluh plugin: `code-modernization`, `claude-security`, `security-guidance`, `hookify`, `code-review`, `code-simplifier`, `pr-review-toolkit`, `feature-dev`, `commit-commands`, `ralph-loop`. Total file terlacak (`git ls-files`, per plugin): 107 + 46 + 57 + 25 + 4 + 3 + 10 + 7 + 6 + 9 = **274**.

Metode jangkauan: daftar file dan ukuran dari `git -c safe.directory=* ls-files`; teks dibaca dengan Read (penuh) atau `head -c`/`sed -n`/`grep -n` (skim, tercatat di kolom "dibaca"). Tidak ada skrip, hook, atau binary dari sumber yang dijalankan. Satu-satunya eksekusi kode: `node -e` inline yang mengevaluasi tujuh regex yang disalin dari `changed-source-security.ts` terhadap kalimat uji pendek (untuk OFA-01); tidak menulis file. Verifikasi baseline Agent Core memakai Read/grep pada `E:\Projects\Agent-Core` tanpa menulis apa pun.

## Fakta lisensi (penting untuk seluruh irisan)

| Plugin | LICENSE | Catatan |
| --- | --- | --- |
| code-modernization, security-guidance, hookify, code-review, code-simplifier, pr-review-toolkit, feature-dev, commit-commands, ralph-loop | Apache-2.0 (sha1 awal `47b573e3824c`, identik dengan LICENSE root, 11.560 byte) | Boleh diadaptasi dengan atribusi bila salinan; rekomendasi tetap reimplementasi mandiri dan parafrase. |
| **claude-security** | **Proprietary, all rights reserved** (1.500 byte, sha1 awal `d8fb2d8f1df6`) | Lisensi mengizinkan pemakaian hanya bersama produk Anthropic dan **melarang** memakai plugin atau bagiannya untuk mengembangkan produk non-Anthropic. Agent Core adalah produk non-Anthropic. Hanya ide umum dan teknik yang boleh dipelajari; **jangan salin teks prompt, spec, skrip, atau skema**. Semua usulan OFA yang bersumber di sini ditulis ulang dari nol sebagai ide. |
| claude-security `NOTICE.md` | Data CWE 4.20 (MITRE), syarat CWE Terms of Use | Memakai ID CWE (`CWE-89`) sebagai fakta boleh; menyalin judul/pemetaan CWE-1003 mensyaratkan memuat hak cipta MITRE dan lisensinya. |
| code-modernization `assets/vendor/mermaid.min.js` | MIT (Knut Sveidqvist) | Pustaka pihak ketiga yang dikemas; tidak relevan. |

Ketidakkonsistenan teks: `hookify/README.md` baris 340 menyebut "MIT License" dan `pr-review-toolkit/README.md` baris 305 menyebut "MIT", tetapi file `LICENSE` keduanya Apache-2.0. Yang mengikat adalah file LICENSE; catat bila atribusi diperlukan.

---

## Bagian A — Ledger cakupan

Kolom "dibaca": **penuh** = seluruh teks dibaca; **skim** = kepala file, docstring, daftar fungsi, atau bagian kunci; **sampel** = hanya nama/judul; **tidak** = tidak dibaca (biner/gambar/vendored/kosong).

### code-modernization (107 file)

| unit | file | dibaca | disposisi | alasan | ID |
| --- | ---: | --- | --- | --- | --- |
| akar: README.md, CHANGELOG.md, LICENSE, tsconfig.json | 4 | penuh (LICENSE: hash) | REFERENSI | Peta alur 8 langkah, enam titik keputusan manusia, klaim bukti; telemetri ditolak | OFA-11, OFA-17 |
| `.claude-plugin/plugin.json` | 1 | penuh | REFERENSI | Skema `userConfig` bertipe (default/opsi); Agent Core punya skema konfigurasinya sendiri | — |
| `agents/` (8 agen) | 8 | penuh | ADAPT | Blok disiplin "konten adalah data", penyamaran rahasia, pemisahan baca-saja vs penulis, test-engineer (legacy = oracle), uplift-migrator menolak jalan tanpa playbook | OFA-10, OFA-11, OFA-12, OFA-15 |
| `commands/` (13 perintah) | 13 | penuh | ADAPT | Pintu depan + INTENT, preflight 5 pertanyaan manusia, brief mengikat, verify independen, harden | OFA-08, OFA-10, OFA-11 |
| `workflows/` (6 skrip) | 6 | 5 penuh, 1 skim (`portfolio-assess.js`) | ADAPT pola; TOLAK sebagai runtime | harden-scan (finder→penyangkal→konfirmator), extract-rules (referee sitasi, panel P0, konsolidasi), uplift-migrate (batch eskalasi + circuit breaker) | OFA-05, OFA-17, OFA-18 |
| `scripts/` bukti: `proof_pack.py`, `compare.py`, `baseline_diff.py`, `trace_rules.py`, `uplift_checks.py` | 5 | skim (docstring + fungsi kunci; proof_pack baris 1–260 dan 728–872 dari 1020) | ADAPT | Vonis PROVEN/PARTLY/NOT dihitung skrip dari file yang di-parse sendiri | OFA-08, OFA-09, OFA-10 |
| `scripts/` laporan: `build_report.py`, `make_shards.py`, `render_rules.py` | 3 | skim | REFERENSI | Laporan HTML offline ber-CSP; shard per modul; kartu aturan bernomor | OFA-17, OFA-19 |
| `scripts/telemetry.py`, `scripts/telemetry.sh` | 2 | skim | TOLAK | Telemetri lewat Claude Code; bertentangan dengan local-first | Bagian C |
| `scripts/tests/` (7 file tes Python) | 7 | sampel (nama tes via grep) | REFERENSI | Katalog kasus tepi bukti: log tanpa baris ringkasan bukan bukti, tautan ditolak, "forged earlier verdict" tidak selamat | OFA-09 |
| `hooks/README.md`, `hooks/hooks.json` | 2 | penuh | REFERENSI / TOLAK | README pane dibaca penuh; hooks.json hanya telemetri | OFA-19 |
| `hooks/` modul akar: host, paths, register, sign, state, tests-run, text (`.ts`) | 7 | skim (±1,3–3,6 KB awal tiap file) | ADAPT (tests-run, text) / REFERENSI | Parser ringkasan runner tes; `plain()` pembersih karakter tak terlihat | OFA-09, OFA-15 |
| `hooks/fleet`, `map`, `reader`, `review`, `views`, `xray` (21 `.ts/.tsx`) | 21 | skim (±1,3–3,6 KB awal tiap file) | REFERENSI | Pane TUI memakai "function hooks" early access Claude Code; yang berguna: chip vonis, deck tinjauan, lipatan kegagalan bersama | OFA-19 |
| `tests/` (6 `.test.ts`: nama tes dibaca; `hostile.test.ts` kepala dibaca) + `tests/fixtures/` (4: tidak dibaca) | 10 | 6 sampel, 4 tidak | REFERENSI | Uji "baris 100.000 karakter tidak boleh memakan >1 detik" untuk semua parser; uji pembaca vonis menolak vonis palsu | OFA-15, OFA-19 |
| `assets/media/` (10 PNG/GIF pane + 3 JPG laporan) | 13 | tidak (gambar; keterangan README dipakai) | REFERENSI | Tangkapan layar | — |
| `assets/`: `report-template.html` (skim), `topology-viewer.html`, `topology-viewer-screenshot.jpg` | 3 | 1 skim, 2 tidak | REFERENSI | CSP + tema gelap/terang; viewer 82 KB tidak dinilai | OFA-19 |
| `assets/vendor/`: `LICENSE-mermaid.txt` (penuh), `mermaid.min.js` (tidak) | 2 | campuran | TOLAK | Pustaka pihak ketiga 3,5 MB | Bagian C |
| **Jumlah** | **107** | | | | |

### claude-security (46 file)

| unit | file | dibaca | disposisi | alasan | ID |
| --- | ---: | --- | --- | --- | --- |
| akar: README, SECURITY.md, NOTICE.md, LICENSE, .gitattributes | 5 | penuh | REFERENSI | **LICENSE proprietary**; `.gitattributes` memaksa LF agar skrip bash tidak rusak di Windows | OFA-04 |
| `.claude-plugin/plugin.json` | 1 | penuh | REFERENSI | v0.12.0 | — |
| `agents/` (9) | 9 | penuh | ADAPT (ide saja) | Peneliti, verifier tiga lensa, patch-generator/verifier, inventory, redactor | OFA-05, OFA-06, OFA-07 |
| `skills/claude-security/`: SKILL.md, role.md, `specs/report-spec.md`, `specs/patch-spec.md`, `jobs/scan-changes.md` | 5 | penuh | ADAPT (ide saja) | Bentuk laporan jujur-cakupan, kontrak patch, aturan perubahan vs pra-ada | OFA-04, OFA-05, OFA-07 |
| `jobs/scan-codebase.md`, `jobs/suggest-patches.md` | 2 | skim (judul + grep) | REFERENSI | Tingkat upaya; deteksi laporan basi lewat isi, bukan nomor baris | OFA-07 |
| `workflows/scan.js` | 1 | skim (minified 155 baris; header + grep) | REFERENSI | Pipeline Inventory→Threat model→Research→Sweep→Panel; tally dihitung kode | OFA-05, OFA-18 |
| `scripts/`: write_scan_meta, save_result, render_report, patch_artifacts | 4 | skim (docstring + kelas) | ADAPT (ide saja) | Stempel revisi, status verifikasi dari kode, produk patch + `git apply --check` | OFA-04, OFA-07 |
| `scripts/keep-waiting.sh` | 1 | penuh | TOLAK | `sleep` berulang menahan giliran; mesin lambat | Bagian C |
| `scripts/lib/` (15): penuh 9 (`__init__`, chain, console, cwe, git, link, plugin, revision, secret); skim 6 (absolute, finding, sarif, source, strictjson, cwe-categories.json) | 15 | campuran | ADAPT (ide saja) | Sidik jari temuan, penahanan nilai kredensial, JSON ketat | OFA-03, OFA-04 |
| `hooks/` (hooks.json, hooks.sh penuh; hooks.py skim) | 3 | campuran | TOLAK | Telemetri, banner, "tip" setelah push, penutupan pertanyaan 60 detik | Bagian C |
| **Jumlah** | **46** | | | | |

### security-guidance (57 file)

| unit | file | dibaca | disposisi | alasan | ID |
| --- | ---: | --- | --- | --- | --- |
| `README.md` (penuh), `LICENSE` (hash) | 2 | penuh | REFERENSI | Tiga lapis; privasi data yang dikirim; sakelar env | OFA-02 |
| `.claude-plugin/plugin.json` | 1 | penuh | REFERENSI | v2.0.16 | — |
| `hooks/patterns.py` | 1 | penuh (361 baris) | ADAPT | 25 aturan regex dengan gating path/ekstensi, lookbehind, pengecualian aman | OFA-01, OFA-02 |
| `hooks/review_api.py` | 1 | penuh (baris 1–400) | ADAPT | Fase investigasi, fase penyangkalan, tag `in_diff/off_diff`, batas byte diff | OFA-05, OFA-06 |
| `hooks/llm.py` | 1 | skim (rubrik 1326–1453; format 1214–1292; outline) | ADAPT rubrik; TOLAK pemanggil model | Rubrik kategori dan daftar "jangan laporkan" berguna sebagai konten Skill | OFA-06 |
| `hooks/security_reminder_hook.py` | 1 | skim (outline, `check_patterns`, handler Stop) | REFERENSI | Batas 3 pengaktifan ulang, peringatan sekali per sesi, alasan skip bernomor | OFA-04, OFA-20 |
| `hooks/extensibility.py` | 1 | skim | SUDAH-ADA | Aturan tambahan-saja, anti-ReDoS, batas 50 aturan/1 KB; Agent Core punya `AdditiveSecurityRule` dengan batas lebih ketat | — |
| `hooks/diffstate.py`, `session_state.py`, `gitutil.py`, `reporesolve.py` | 4 | skim | SUDAH-ADA | Baseline diff per giliran, kunci sesi, indeks git sementara; ditutup oleh CC-P1 dan primitif atomic Windows-aware | — |
| `hooks/_base.py`, `ensure_agent_sdk.py`, `sg-python.sh` | 3 | skim | TOLAK | Bootstrap SDK ke venv, pemilih interpreter python | Bagian C |
| `hooks/hooks.json` | 1 | penuh | TOLAK | `asyncRewake` yang memanggil model | Bagian C |
| `tests/` (40 `test_*.py` + `conftest.py`) | 41 | sampel (jumlah tes tiap file; nama tes dari ±15 file) | REFERENSI | Daftar kasus tepi: review gagal ≠ bersih, nama berkas rahasia tidak dikirim, konfigurasi repo tidak boleh menjalankan program, indeks sementara dibersihkan | OFA-04, OFA-22 |
| **Jumlah** | **57** | | | | |

### hookify (25 file)

| unit | file | dibaca | disposisi | alasan | ID |
| --- | ---: | --- | --- | --- | --- |
| akar: README, LICENSE, .gitignore | 3 | penuh | SUDAH-ADA | Aturan dari koreksi sudah dimiliki Learning (`user-correction` memicu tinjauan segera) | OFA-21 |
| `.claude-plugin/plugin.json` | 1 | penuh | SUDAH-ADA | — | — |
| `agents/conversation-analyzer.md` | 1 | penuh | REFERENSI | Daftar sinyal koreksi + kasus tepi (hipotetis, pengajaran, sekali-lewat, preferensi) | OFA-21 |
| `commands/` (hookify.md penuh; configure, list, help skim) | 4 | campuran | SUDAH-ADA | Alur interaktif membuat aturan | OFA-21 |
| `core/` (rule_engine.py penuh; config_loader.py skim; `__init__` kosong) | 3 | campuran | TOLAK | Mesin aturan hook = otoritas hook; gagal-terbuka | Bagian C |
| `hooks/` (hooks.json penuh; pretooluse/posttooluse/stop skim; userpromptsubmit tidak dibaca; `__init__` kosong) | 6 | campuran | TOLAK | Empat hook generik yang mengevaluasi aturan | Bagian C |
| `examples/` (4 aturan) | 4 | penuh | REFERENSI | Contoh peringatan `rm -rf`, `console.log`, berkas sensitif, "tes belum dijalankan" | OFA-21 |
| `skills/writing-rules/SKILL.md` | 1 | penuh | REFERENSI | Sintaks aturan; tidak mengubah apa pun | — |
| `matchers/__init__.py`, `utils/__init__.py` | 2 | penuh (0 byte) | TOLAK | Kosong | — |
| **Jumlah** | **25** | | | | |

### Plugin kecil (39 file)

| unit | file | dibaca | disposisi | alasan | ID |
| --- | ---: | --- | --- | --- | --- |
| code-review (README, command, plugin.json, LICENSE) | 4 | penuh | ADAPT | Skor kepercayaan 0–100 + ambang 80 + katalog false-positive | OFA-13 |
| code-simplifier (plugin.json, LICENSE, agent) | 3 | penuh | SUDAH-ADA | Skill `code-simplification` Agent Core lebih lengkap | Bagian C |
| pr-review-toolkit (6 agen: 5 penuh + type-design skim; command; README skim; plugin.json; LICENSE) | 10 | campuran | ADAPT | Lensa silent-failure, comment-rot, kualitas tes, invarian tipe | OFA-14 |
| feature-dev (3 agen, command, README skim, plugin.json, LICENSE) | 7 | campuran | SUDAH-ADA / REFERENSI | Tujuh fase + pertanyaan klarifikasi wajib sudah dicakup Skill spec/planning/interview | Bagian C |
| commit-commands (3 command, README skim, plugin.json, LICENSE) | 6 | campuran | ADAPT (`clean_gone`) / TOLAK (`commit-push-pr`) | Pembersihan cabang [gone] bisa dibuat aman; commit+push+PR dalam satu giliran melanggar kebijakan persetujuan | OFA-16 |
| ralph-loop (3 command, hooks.json, stop-hook.sh, setup script skim, README skim, plugin.json, LICENSE) | 9 | campuran | TOLAK | Loop otomatis ditolak doktrin; hanya pola penghentian yang dicatat | OFA-20 |
| **Jumlah** | **39** | | | | |

### Total dan cakupan baca

| | file |
| --- | ---: |
| Jumlah ledger: 107 + 46 + 57 + 25 + 39 | **274** (cocok dengan `git ls-files`) |
| Dibaca penuh | 121 (44,2%): termasuk 4 `__init__.py` kosong (0 byte) milik hookify dan LICENSE yang dicek lewat hash |
| Skim | 78 (28,5%) |
| Sampel (nama/judul/jumlah tes saja) | 54 (19,7%): 41 tes security-guidance (jumlah per file; nama dari ±15 file), 7 tes Python dan 6 tes TS code-modernization (nama tes) |
| Tidak dibaca | 21 (7,7%): 13 gambar pane/laporan, 2 aset viewer (`topology-viewer.html`, screenshot), `mermaid.min.js`, 4 fixture TS, `userpromptsubmit.py` (hookify; pola sama dengan hook tetangga) |

Rincian per plugin (penuh / skim / sampel / tidak): code-modernization 33 / 41 / 13 / 20 = 107; claude-security 32 / 14 / 0 / 0 = 46; security-guidance 6 / 10 / 41 / 0 = 57; hookify 17 / 7 / 0 / 1 = 25; plugin kecil 33 / 6 / 0 / 0 = 39. Jumlah: 121 / 78 / 54 / 21 = 274.

Catatan jujur: "penuh" pada file Python besar tidak ada; `proof_pack.py` (1020 baris), `baseline_diff.py` (809), `compare.py` (487), `trace_rules.py` (520) dan `uplift_checks.py` (356) dibaca sebagai skim (docstring + fungsi kunci). Isi tes security-guidance dan code-modernization tidak dibaca baris demi baris.

---

## Bagian B — Temuan

Urutan menurut nilai. Semua usulan **tidak menambah teks selalu-dimuat** kecuali dinyatakan lain; Skill hanya bertambah lewat `references/` (dimuat selektif) dan satu baris penunjuk. Semua perubahan Skill adalah adapter-revision lewat `SkillService` (stage → promote) dengan persetujuan pengguna, bukan penyuntingan langsung katalog; ini mengubah `skillSha256` upstream di `UPSTREAM.json` hanya bila `SKILL.md` berubah, jadi sedapat mungkin hanya tambah `references/*.md` dan satu baris tautan.

### OFA-01 Tiga cacat nyata pada scanner CC-P2 yang dapat ditutup dengan teknik donor
- Sumber: `security-guidance/hooks/patterns.py:71-94` (child_process.exec JS-saja; lookbehind `(?<![a-zA-Z0-9_\.])exec\(`), `:104-110` (eval dengan lookbehind dan lewati berkas dokumen), `:204-208` (TLS: `NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0`), `security_reminder_hook.py:598-647` (`check_patterns`, `path_filter` sebagai gerbang), `tests/test_secret_shaped_paths.py` dan `tests/test_untracked_cap.py` (nama tes: berkas melewati batas jumlah dilaporkan, bukan hilang).
- Observasi: Donor menulis regex dengan tiga kebiasaan yang dilewatkan CC-P2: (1) lookbehind yang menolak `.exec(`/`.eval(` (metode objek), (2) nilai eksplisit untuk variabel lingkungan TLS, (3) berkas yang dipotong oleh batas jumlah dilaporkan. Saya mengevaluasi tujuh regex Agent Core terhadap kalimat uji (`node -e`, hanya regex, tanpa menjalankan kode proyek): `pattern.exec(line)` → `SHELL.EXEC`; `db.exec(sql)` → `SHELL.EXEC`; `model.eval()` dan `redis.eval(script)` → `CODE.EVAL`; `process.env.NODE_TLS_REJECT_UNAUTHORIZED = "1"` dan `delete process.env.NODE_TLS_REJECT_UNAUTHORIZED` → `TLS.DISABLED`. Di `E:\Projects\Agent-Core\src` ada 77 pemakaian `.exec(` (grep `\.exec\(` di `.ts`, kecuali `node_modules`); sebagian besar `RegExp.exec`, sehingga severity `high` akan menembak puluhan kali pada kode TypeScript biasa.
- Nilai untuk Agent Core: Advisori yang berisik cepat diabaikan; dan hasil `clean`/`findings` dipercaya Controller. Menutup tiga cacat ini menaikkan presisi tanpa model dan tanpa skema baru.
- Baseline Agent Core: `src/code-intelligence/changed-source-security.ts:45` (`eval`/`new Function`, tanpa lookbehind), `:46` (`exec|execSync|os.system` tanpa lookbehind), `:47` (`NODE_TLS_REJECT_UNAUTHORIZED` tanpa nilai), `:117` (`.slice(0, MAX_FILES)` dijalankan sebelum `filesRequested: files.length` di `:180`, sehingga berkas ke-129 dan seterusnya hilang tanpa jejak di `skipped`), `:137-139` dan `:131` (baris >20.000 karakter dipotong dan berkas melebihi batas ukuran masuk `skipped`, tetapi baris terpotong tidak dilaporkan), `src/mcp/code-intelligence-tools.ts:432-439` (Tracker mencatat `outcome: 'clean'` bila `findings.length === 0`, meskipun ada berkas dilewati atau dipotong). Pencarian `grep -rl "changed_source|scanChangedSourceSecurity|AC.SECURITY" tests` tidak menemukan satu pun tes → **status: SEBAGIAN** (aturan ada, presisi dan jujur-cakupan belum; tes tidak ditemukan lewat grep).
- Delta/celah: (a) lookbehind pada `exec`/`eval`; (b) `NODE_TLS_REJECT_UNAUTHORIZED` hanya bila nilainya `0`/`'0'`/`"0"`; (c) hasil mencantumkan `filesDropped` (jumlah dan beberapa nama) dan `lineTruncations`, dan `outcome` Tracker bukan `clean` bila ada yang dilewati; (d) satu berkas tes untuk scanner (kalimat positif dan negatif per aturan).
- Cara adaptasi: Ubah `BUILTIN_RULES` dan penghitungan `files` di `src/code-intelligence/changed-source-security.ts` (owner existing); ganti `filesRequested` menjadi jumlah masukan sebelum `slice` dan tambah `truncated: { filesDropped, firstDropped: [...] }`; di `code-intelligence-tools.ts` ubah label hasil jadi `partial` bila `skipped.length || truncated.filesDropped`. Tes baru `tests/changed-source-security.test.ts`. Aturan `exec` tetap `severity: high` hanya bila argumen berupa interpolasi/konkatenasi (opsional, lihat OFA-02).
- Lisensi/hak cipta: Apache-2.0 (`patterns.py`). Regex sederhana adalah ekspresi fungsional; tulis sendiri. Bila menyalin ekspresi persis, tambahkan atribusi di `THIRD_PARTY_NOTICES.md`.
- Perkiraan skala: S · Risiko: rendah (perubahan internal; regex baru bisa menurunkan recall pada `exec(` global di JS bukan-modul, hal yang diinginkan) · Nilai: tinggi · Butuh skema tool baru: tidak (hasil berupa teks JSON dari `textResult`; tidak ada `outputSchema` di `code-intelligence-tools.ts`) · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: isi regex, perilaku regex terhadap kalimat uji, urutan `slice` dan `filesRequested`, pengiriman `'clean'`, hitungan 77, tidak adanya tes (lewat grep). Dugaan: berapa dari 77 itu `RegExp.exec` (tidak diklasifikasi satu per satu); apakah ada tes di luar pola grep.
- Disposisi: **ADOPT** (perbaikan internal berbasis teknik donor)

### OFA-02 Tabel aturan bawaan terkurasi: gerbang ekstensi/path, pengecualian aman, CWE, dan confidence
- Sumber: `security-guidance/hooks/patterns.py:30-276` (25 aturan, `RuleId` beku `:279-312`, perakitan wajib sinkron `:345-349`), `README.md:88-109` (aturan proyek tambah-saja, batas 8 KB / 50 aturan / 1 KB pengingat), `hooks/extensibility.py` (validasi ReDoS saat muat), `claude-security/NOTICE.md` + `scripts/lib/cwe.py` (peta CWE ke kategori CWE-1003).
- Observasi: Donor menggabungkan tiga lapis pada tiap aturan: `path_filter` (hanya ekstensi relevan: JS/TS untuk DOM-sink, Python untuk pickle/os.system), `regex` dengan pengecualian aman (`yaml.load` tanpa `Safe*` dalam 80 karakter; `torch.load` tanpa `weights_only=True`; `numpy.load` hanya bila `allow_pickle=True` eksplisit; `<script src=//…>` tanpa `integrity`), dan pesan perbaikan konkret (contoh AMAN/TIDAK AMAN). Aturan tambahan: kerentanan alur kerja GitHub Actions lewat `path_check` pada `.github/workflows/*.yml`, AES-ECB, `createCipher`, parser XML stdlib (XXE), Go `exec.Command("sh","-c")`, `marshal/shelve/cloudpickle/dill/joblib/read_pickle`, `insertAdjacentHTML/outerHTML/document.write`.
- Nilai untuk Agent Core: Tujuh aturan CC-P2 tidak membedakan bahasa (OFA-01) dan melewatkan kelas umum (XSS sink DOM, deserialisasi varian, TLS variasi lain, rahasia di CI). Karena host adalah Windows dengan PowerShell dan skrip `.ps1`, ada celah yang tidak terisi donor mana pun.
- Baseline Agent Core: `changed-source-security.ts:44-52` (tujuh aturan, tanpa `include` bawaan, tanpa CWE, tanpa remedi); aturan proyek aditif sudah aman (`:71-93` menolak pola ReDoS, batas `MAX_RULES = 32`, panjang pola 256) → aturan tambahan: **SUDAH-ADA**; tabel bawaan: **SEBAGIAN**.
- Delta/celah: (1) Tambahkan kolom `include` pada aturan bawaan (reuse mekanisme `include` yang sudah ada untuk aturan proyek); (2) tambahkan sekitar 12 aturan terkurasi: `child_process.exec` JS/TS, `innerHTML/outerHTML/insertAdjacentHTML/document.write` JS/TS, `pickle/marshal/shelve/cloudpickle/dill/joblib` Python, `yaml.load` tanpa SafeLoader, `torch.load` tanpa `weights_only`, AES-ECB, `createCipher`, XML parser stdlib Python, `spawn(..., {shell: true})` dan `exec(` dengan templat, GitHub Actions `${{ github.event.* }}` di `run:`, `<script src>` eksternal tanpa `integrity`; (3) **inferensi, bukan dari donor**: tambahkan aturan PowerShell (`Invoke-Expression`/`iex` pada nilai non-literal, `-EncodedCommand`, `-ExecutionPolicy Bypass`, `DownloadString|iex`) karena inilah host Agent Core; (4) tiap aturan membawa `cwe` (mis. `CWE-78`, `CWE-79`, `CWE-502`, `CWE-295`, `CWE-327`, `CWE-611`) dan `confidence: 'low' | 'medium'` (regex adalah petunjuk, bukan temuan; severity bukan kepercayaan); (5) `message` menyertakan satu kalimat perbaikan.
- Cara adaptasi: `BUILTIN_RULES` di `changed-source-security.ts` + tes di berkas tes OFA-01; tidak ada berkas baru. Jangan membawa `cwe-categories.json` (30 KB; lihat Bagian C), cukup ID CWE per aturan.
- Lisensi/hak cipta: Daftar aturan dari Apache-2.0 → tulis ulang sendiri. Dari claude-security hanya fakta pemetaan CWE yang dipakai (ID, bukan judul/pemetaan CWE-1003); bila kelak menyertakan judul CWE, ikuti `NOTICE.md` MITRE.
- Perkiraan skala: M · Risiko: sedang (setiap regex baru bisa menambah false positive; gating dan tes positif/negatif per aturan wajib) · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: isi 25 aturan donor, tujuh aturan Agent Core. Dugaan: relevansi aturan Go/Python untuk proyek pengguna; apakah ada `.github/workflows` yang perlu dipindai di proyek Agent Core.
- Disposisi: **ADAPT**

### OFA-03 Sidik jari temuan stabil terhadap pergeseran baris
- Sumber: `claude-security/scripts/lib/sarif.py:30` (`ID_VERSION = "v3"`), `:261-270` (`fingerprint`: sha256 atas `[rule_id, path_repo, ±3 baris konteks ternormalisasi]`), `:273-276` (`code_at`), `scripts/lib/source.py` (`normalized_lines`, `placing_row`: temukan baris lewat kutipan, bukan nomor), `README.md` (id "dirancang tetap sama dari scan ke scan").
- Observasi: Id temuan memakai isi sekitar baris, bukan nomor baris; bila isi tidak terbaca, jatuh ke nomor baris. Donor juga menempatkan ulang temuan ke baris tempat kutipan berada dan menolak id yang akan men-hash baris kredensial.
- Nilai untuk Agent Core: Status `new`/`still-present` dan daftar `resolved` bergantung pada kesamaan kunci antar-scan. Bila satu baris disisipkan di atas, semua temuan di bawahnya terbaca "baru" lalu "resolved" bersamaan: ledakan palsu.
- Baseline Agent Core: `changed-source-security.ts:101-103` (`findingKey` = `${id}:${file}:${line}`), `:163-171` (lifecycle di `Map` proses, batas 64 lingkup, hilang saat server mulai ulang) → **SEBAGIAN**.
- Delta/celah: Kunci = `id` aturan + `file` + hash sha256 pendek dari ±3 baris ternormalisasi (spasi dilipat) dengan nomor baris sebagai cadangan; hasil memuat `fingerprint` per temuan. Penyimpanan durabel antar-restart **tidak diusulkan** (akan menjadi rumah penyimpanan paralel; butuh pemilik, lihat Bagian D).
- Cara adaptasi: `findingKey` dan penghitungan di `scanChangedSourceSecurity` (satu fungsi, satu berkas); tidak ada tool baru.
- Lisensi/hak cipta: claude-security proprietary → teknik umum "hash aturan+jalur+konteks" ditulis ulang tanpa menyalin kode atau konstanta.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: kedua kunci. Dugaan: dampak praktisnya pada sesi nyata.
- Disposisi: **ADAPT**

### OFA-04 Laporan temuan yang jujur-cakupan, bertanda revisi, dan tidak pernah mengklaim yang tidak dijalankan
- Sumber: `claude-security/skills/claude-security/specs/report-spec.md` (bagian Coverage; aturan "Never claim something ran that did not"; "No control characters"; urut severity lalu confidence; paragraf pembuka), `scripts/lib/revision.py` (commit, branch, `dirty`, sparse), `render_report.py` docstring (stempel `verification.status` dihitung dari catatan suara, bukan dari model), `scripts/lib/secret.py:1-30` (snippet dan tautan kredensial ditahan dari produk), `agents/scan-redactor.md` (penyamaran sebagai usaha terbaik), `security-guidance/tests/test_review_outcomes.py` (nama tes: "failed review is not clean", "told once per session for each kind of failure"), `security_reminder_hook.py:1306` (`_review_failure_reason`), `code-modernization/commands/modernize-harden.md` (bagian "Coverage gaps": kelas yang tak dipindai ditulis "not scanned", temuan tak dinilai "not judged"), `agents/security-auditor.md` (kebijakan penyamaran 2–4 karakter + `file:line`).
- Observasi: Laporan wajib berisi: (a) apa yang diperiksa dan **apa yang sengaja/tidak sengaja tidak** beserta alasan; (b) revisi yang dipindai (commit, `dirty`); (c) hasil gagal/terpotong/tidak kembali **tidak pernah** ditulis sebagai bersih; (d) nilai rahasia tidak masuk laporan (hanya `file:line` dan petunjuk 2–4 karakter), dan karantina rahasia berada di berkas yang diabaikan git sebelum temuan ditulis; (e) tidak ada karakter kontrol selain `\n`/`\t`; (f) tidak ada klaim "diuji/dieksploitasi" bila hanya dibaca.
- Nilai untuk Agent Core: Hasil `code_analysis` dan laporan review berbahasa sendiri Controller menjadi dasar keputusan pengguna; "bersih" yang sebenarnya "sebagian" adalah kegagalan kejujuran.
- Baseline Agent Core: scanner mengembalikan `skipped`, `filesScanned`, `sourceMutated: false` (`changed-source-security.ts:176-187`) dan tidak menyimpan nilai cocok (`SECRET.LITERAL`, `:51`) → sebagian sudah; Skill `code-review-and-quality` punya "Honesty in Review" (`SKILL.md:293-301`) tanpa templat laporan; CC-P1 sidik jari workspace ada → **SEBAGIAN**. Tidak ditemukan templat "Coverage".
- Delta/celah: (1) Tambah ke hasil scanner `coverage: { requested, scanned, skipped[], truncated }` (digabung OFA-01) dan `revision: { head, dirty }` memakai kemampuan CC-P1 yang ada; (2) satu referensi Skill `security-and-hardening/references/finding-report.md` berisi templat: paragraf pembuka, Coverage, Temuan (Dampak, Lokasi, Skenario, Prasyarat, Perbaikan), "Apa yang tidak dibuktikan", aturan tidak-klaim-dijalankan, aturan penyamaran, dan aturan "tinjauan gagal ≠ bersih".
- Cara adaptasi: Skill reference (satu berkas ≤ 6 KB) + field hasil scanner; tanpa tool baru. Bagian "karantina rahasia gitignored" cukup satu paragraf; Agent Core tidak membuat laporan keamanan sebagai berkas secara default.
- Lisensi/hak cipta: claude-security proprietary → tidak ada kalimat disalin; bagian yang diadaptasi hanyalah prinsip (kejujuran cakupan), yang juga muncul di code-modernization (Apache-2.0: `modernize-harden.md`, `proof_pack.py` bagian `not_proven`).
- Perkiraan skala: S · Risiko: rendah · Nilai: tinggi · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: isi spec donor, bentuk hasil scanner. Dugaan: sejauh mana Controller saat ini menyusun laporan serupa secara ad hoc.
- Disposisi: **ADAPT**

### OFA-05 Protokol validasi temuan keamanan: tiga lensa, bawaan FALSE_POSITIVE, penyerang dan keuntungan, mitigasi harus dibaca
- Sumber: `claude-security/agents/scan-verifier.md` (lensa REACHABILITY/IMPACT/DEFENSES; "Default to FALSE_POSITIVE"; "Name the attacker and the gain"; larangan menciptakan pertahanan; `PREDATES_CHANGE`), `agents/scan-researcher.md` (severity dari eksploitabilitas dan dampak; "between two tiers take the lower"; kepercayaan terpisah dari severity), `agents/patch-verifier.md` (cek 4: apakah temuan nyata di kode pra-perubahan), `skills/.../specs/report-spec.md` (severity final dapat turun, tidak naik; confidence `high` hanya bila panel bulat), `workflows/scan.js` (tally dihitung kode; `PANEL_VOTER_COUNT = 3`, `PANEL_KEEP_QUORUM = 2` di `scripts/lib/finding.py:79-80`), `code-modernization/workflows/harden-scan.js:187-265` (penyangkal per temuan; konfirmator kedua untuk Critical/High; vonis terbelah → turun ke Medium dengan catatan), `security-guidance/hooks/review_api.py:183-285` (prompt penyangkalan, tag `in_diff/off_diff`, penyangkal menolak `off_diff` bila tak bisa menyebut baris diff yang memungkinkannya), `code-review/commands/code-review.md:20-26` (skor 0–100).
- Observasi: Pola konsisten di empat plugin: **pencari dioptimalkan untuk recall, penyangkal untuk presisi**. Penyangkal harus (1) menamai siapa menulis masukan dan keuntungan di luar posisinya; (2) merujuk `file:line` untuk tiga klaim: sumber terkendali penyerang, operasi berbahaya, tidak ada mitigasi efektif; (3) menolak pertahanan imajiner ("framework mungkin meng-escape" bukan mitigasi); (4) memisahkan "nyata tapi sudah ada sebelum perubahan" dari "diperankan perubahan"; (5) tidak pernah menaikkan severity; (6) memberi `confidence` tersendiri. Alasan wajib menyebut `file:line` agar suara bisa diaudit.
- Nilai untuk Agent Core: Skill `doubt-driven-development` sudah memberi pemeriksa konteks segar, tetapi tidak memberi **rubrik keamanan** untuk menghapus false positive. Tanpa agen kedua tersembunyi, satu Controller dapat menjalankan penyangkalan terstruktur sendiri (atau lewat mitra Raka yang eksplisit).
- Baseline Agent Core: `runtime/skills/capability-packs/doubt-driven-development/SKILL.md:107-214` (CLAIM/EXTRACT/DOUBT/RECONCILE/STOP), `security-and-hardening/SKILL.md:186-188` (hanya daftar periksa), `docs/history-agent-core/Claude-Code-Steal-Use-Integration-Plan.md:233-239` (validasi temuan = disiplin Controller, bukan runtime) → **SEBAGIAN**.
- Delta/celah: Referensi `security-and-hardening/references/vulnerability-review.md` bagian "Menyangkal temuan sendiri" (≈2 KB): urutan pertanyaan penyangkalan, definisi tiga lensa, daftar penolakan (PRA-ADA, TANPA BATAS HAK, PERTAHANAN DIBACA, KONTEN BUKAN INSTRUKSI), aturan severity/confidence, dan **catatan batas**: tanpa agen terpisah, pemisahan peran dilakukan dengan prompt segar sesuai DDD atau oleh manusia.
- Cara adaptasi: Referensi Skill baru + satu baris penunjuk di `security-and-hardening/SKILL.md` (bagian "Review Checklist"). Tidak ada fan-out otomatis; jika Controller ingin pembanding, panggil mitra Raka secara eksplisit sesuai kontrak.
- Lisensi/hak cipta: scan-verifier/scan-researcher (proprietary) → hanya struktur ide; sumber utama untuk tulisan kita adalah `security-guidance/review_api.py` dan `harden-scan.js` (Apache-2.0), diparafrase.
- Perkiraan skala: S · Risiko: rendah · Nilai: tinggi · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: konten donor dan baseline. Dugaan: efek pada kualitas keputusan Native (tidak ada eksperimen yang mengukur).
- Disposisi: **ADAPT**

### OFA-06 Metodologi berburu kerentanan dan pola "sering terlewat" sebagai referensi Skill
- Sumber: `security-guidance/hooks/review_api.py:71-121` (`AGENTIC_INVESTIGATE_SYSTEM`: Fase 1 peta titik masuk dan sink; Fase 2 lacak aliran data termasuk "follow returns" dan paritas gerbang antar-saudara; Fase 2b diferensial parser/validator; Fase 2c pola sering terlewat; Fase 3 kriteria laporan), `hooks/llm.py:1326-1453` (`_CODE_REVIEW_RUBRIC`: kategori dan daftar DO NOT flag).
- Observasi: Daftar yang melampaui checklist OWASP biasa: SSRF dengan bypass allowlist (userinfo, resolusi basis, sufiks string, normalisasi, redirect), injeksi argumen (flag `--pre=`, `--upload-pack=`), injeksi variabel lingkungan ke subproses, status OAuth yang dapat dipalsukan (base64 JSON), ekspektasi "kontrol yang hilang" (endpoint saudara memeriksa, yang baru tidak), kegagalan terbuka (fallback = izinkan), "registry fanout" (entitas baru lupa ditambahkan ke daftar sanitasi/redaksi), pencocokan gerbang vs aksi (gerbang periksa `parent`, aksi pakai `name`), batas sumber daya pada akumulator yang salah, cacat atribut kutip pada escaper, izin berkas kredensial, kontrol dihapus dengan penggantian satu kondisi. Daftar **jangan laporkan**: konfigurasi bukan rahasia, fallback pengembangan, DoS volumetrik, kerentanan lama tak terkait, konten starter.
- Nilai untuk Agent Core: Skill keamanan saat ini bersifat pencegahan saat membangun; belum memberi metode meninjau kode yang sudah ada atau perubahan orang lain. `code_analysis` hanya menandai regex.
- Baseline Agent Core: `security-and-hardening/SKILL.md:43-62` (model ancaman STRIDE), `:101-184` (kontrol pencegahan, SSRF, tujuan hancur, LLM), `references/hardening-patterns.md` (13 KB) → tidak ada bagian "meninjau" → **SEBAGIAN** (SSRF/LLM/rahasia ada; metodologi tinjauan dan pola sering terlewat belum ada).
- Delta/celah: Referensi `vulnerability-review.md` (≤ 8 KB): metode lima fase, pola sering terlewat (dipilih ±12 yang relevan: gerbang vs aksi, kegagalan terbuka, kontrol yang hilang, diferensial parser, registry fanout, bypass allowlist, injeksi argumen, injeksi env, kredensial di log/URL, izin berkas), batas "jangan laporkan", dan aturan "perubahan vs pra-ada" (OFA-05). Contoh Bash→PowerShell bila ada.
- Cara adaptasi: Referensi Skill; tidak ada kode. Jaga di bawah 8.192 byte per berkas agar satu fragmen `skills(read)`.
- Lisensi/hak cipta: Apache-2.0 (`security-guidance`); parafrase, bukan salinan blok panjang (rubrik donor ±22 KB).
- Perkiraan skala: M · Risiko: rendah (konten); risiko kebanyakan tuduhan → disarankan bersama OFA-05 · Nilai: tinggi · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: teks donor dan daftar heading Skill. Dugaan: bahwa kategori ini meningkatkan temuan nyata di proyek pengguna; tidak ada benchmark.
- Disposisi: **ADAPT**

### OFA-07 Perbaikan keamanan dengan tiga klaim terukur dan penolakan yang jujur
- Sumber: `claude-security/agents/patch-verifier.md` (cek 1–7; klaim TARGETED, NO_NEW_VULNERABILITY, BEHAVIOUR_UNCHANGED dengan `CONFIDENT/NOT_CONFIDENT/UNSURE`; "any change to which inputs the code accepts is a behaviour change"; default REJECT; jangan menjalankan instalasi), `agents/patch-generator.md` (kerja hanya di salinan scratch; temukan kode lewat `snippet`/`symbol`; tidak commit), `skills/.../specs/patch-spec.md` (`untested`; status `patch_written|declined|skipped_stale`; alasan penolakan; validasi `git apply --check`; patch byte-faithful), `jobs/suggest-patches.md` (deteksi basi lewat isi `git show HEAD:./<file>`, bukan nomor baris), `code-modernization/commands/modernize-harden.md` ("Verify": RESOLVES/PARTIAL/INTRODUCES-RISK, maksimal 3 putaran, hunk gagal dibuang "needs manual remediation"; patch kredensial dipisah ke berkas lokal).
- Observasi: Sebuah perbaikan baru boleh diserahkan bila peninjau independen dapat menyatakan tiga hal sekaligus; bila tidak, penyerahan **ditolak dengan alasan**, bukan dipaksa. Klaim `BEHAVIOUR_UNCHANGED` yang bertumpu pada pembacaan (tanpa tes proyek yang menjalankan kode) ditandai `untested`. Temuan yang ternyata tidak nyata di revisi saat ini dibatalkan dengan menyebut baris yang sudah menggagalkan eksploitasi.
- Nilai untuk Agent Core: Controller memperbaiki kerentanan di tempat (dengan `file_checkpoint`). Tanpa tiga klaim, perbaikan keamanan sering melonggarkan penerimaan masukan secara diam-diam atau melebar.
- Baseline Agent Core: CC-P1 bukti perubahan per path dan panel perubahan task ada; Skill `code-review-and-quality` memiliki "Dead Code Hygiene" dan "Verify the Verification" (`:217-227`) tetapi tidak memiliki daftar periksa perbaikan keamanan → **SEBAGIAN**.
- Delta/celah: Satu bagian dalam `vulnerability-review.md`: "Setelah memperbaiki temuan": uji tiga klaim; catat `untested` bila tidak ada tes yang menjalankan kode; tolak dengan alasan; periksa basi lewat isi `snippet`/`symbol`; bila membuat berkas patch, `git apply --check` tanpa mengubah pohon; jangan menjalankan instalasi demi tes; jangan melemahkan kontrol demi menutup temuan (kontrol dilonggarkan = ditolak otomatis).
- Cara adaptasi: Referensi Skill (≈1,5 KB) dalam `security-and-hardening`; skrip tidak perlu.
- Lisensi/hak cipta: claude-security proprietary → tulis ulang dari prinsip umum (perbaikan terarah, tidak membuka jalur baru, perilaku tidak berubah); ide ini juga mapan di luar plugin.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: spec dan agen donor. Dugaan: frekuensi perbaikan keamanan yang dilakukan Controller.
- Disposisi: **ADAPT**

### OFA-08 Vonis bukti dihitung skrip: PROVEN / PARTLY PROVEN / NOT PROVEN dan "apa yang tidak dibuktikan"
- Sumber: `code-modernization/scripts/proof_pack.py:1-90` (enam pemeriksaan + tiga tambahan uplift, teks aturan), `:216-253` (`suite_evidence`: bukti terbaik dahulu: file hasil → log runner → angka ketikan; angka ketikan tidak pernah cukup), `:728-750` (`check_canary`), `:763-785` (`not_proven`: daftar apa yang vonis tidak cakup), `:788-832` (`evaluate`: `NOT PROVEN` bila ada `fail`, `PARTLY PROVEN` bila ada `gap`, selain itu `PROVEN`), `commands/modernize-verify.md` (bagian 3–5; "kamu tidak pernah menaikkan vonis"), `README.md:51-64`, `scripts/tests/test_proof_tools.py` (nama tes: `test_counts_typed_into_test_runs_json_can_never_prove_anything`, `test_results_older_than_the_code_are_stale`, `test_zero_executed_a_failure_and_skips`, `test_a_forged_earlier_verdict_never_survives_a_new_run`).
- Observasi: Verifikasi ditulis sebagai fungsi murni atas bukti yang di-parse skrip: (1) tes berjalan: ≥1 dieksekusi, 0 gagal, tidak ada skip tanpa alasan, dan setiap file hasil lebih baru daripada kode; (2) aturan P0 punya tes yang berjalan dan lulus; (3) kasus kesetaraan dibandingkan ulang; (4) ≥10 masukan segar; (5) canary; (6) sumber legacy tidak berubah; verifikasi tidak pernah membawa vonis lama; "tidak dijalankan" ≠ lulus; semua batas ditulis sebagai teks luaran.
- Nilai untuk Agent Core: Pengguna menilai kualitas lewat "fungsi berjalan normal tanpa bug". Controller saat ini melaporkan hasil tes dari ringkasan teks sendiri; tanpa aturan "0 dieksekusi bukan lulus" atau "hasil lebih tua dari kode bukan bukti" kesalahan pelaporan masih mungkin.
- Baseline Agent Core: Skill: `code-review-and-quality` "Verify the Verification" (`:217-227`), `constraint-driven-development` (skor mutasi), `shipping-and-launch` (kanari). Kode: `src/verification/evidence-links.ts`, `evidence-snapshot.ts`, `workbook-assertions.ts` (verifikasi lembar kerja/PDF), `learning/verified-value-registry.ts`. Pencarian `junit|surefire|pytest|executed.*tests` di `src/` hanya mengenai `semantic-ide/workspace-policy.ts` → tidak ada vonis tes umum → **SEBAGIAN**.
- Delta/celah: (1) Aturan tertulis di satu referensi: `code-review-and-quality/references/verification-verdict.md` (≈4 KB): tiga vonis, definisi `fail` vs `gap`, "angka diketik bukan bukti", "0 dieksekusi", "semua dilewati", "hasil lebih tua dari kode", "perbandingan yang tidak bisa jalan adalah kegagalan, bukan skip", dan format "Apa yang tidak dibuktikan"; (2) pembaca bukti tes OFA-09 sebagai alat bantu.
- Cara adaptasi: Skill reference + penunjuk satu baris di langkah 5 "Verify the Verification"; `deprecation-and-migration` merujuknya.
- Lisensi/hak cipta: Apache-2.0 → parafrase aturan; reimplementasi mandiri bila kelak ada skrip.
- Perkiraan skala: S · Risiko: rendah · Nilai: tinggi · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: aturan dan fungsi donor; baseline lewat grep. Dugaan: tingkat kesalahan laporan tes Controller saat ini (tidak diukur).
- Disposisi: **ADAPT**

### OFA-09 Pembaca bukti hasil tes (skrip lokal) yang menolak "0 dieksekusi", "semua dilewati", dan angka ketikan
- Sumber: `code-modernization/hooks/tests-run.ts:1-95` (`isTestCommand` mengenali runner di posisi perintah; `readTestRun` untuk Maven, pytest, Jest/Vitest, dotnet, go/cargo), `scripts/baseline_diff.py:1-60` dan `:40-47` (`STATUS` pemetaan PASS/FAIL/ERROR/SKIP; batas file, kedalaman, kasus; DTD/entitas XML ditolak; tautan tidak diikuti), `scripts/proof_pack.py:216-253`, `scripts/tests/test_proof_tools.py` (nama: `test_a_log_with_no_summary_line_is_no_evidence`, `test_hostile_xml_is_refused_reported_and_skipped`, `test_links_are_never_followed`, `test_a_test_name_with_a_newline_does_not_break_the_table`).
- Observasi: Parser membaca hasil per-tes dari XML JUnit/TRX atau baris ringkasan runner yang dikenal; log tanpa baris ringkasan tidak dihitung; berkas lebih tua dari kode dianggap basi; semua nilai dijepit; tautan dan entitas tidak diikuti.
- Nilai untuk Agent Core: Dasar objektif untuk "tes lulus" tanpa mengandalkan potongan terminal; relevan karena `vitest run` (`package.json`: `"test": "vitest run"`, vitest 4.1.11) dan proyek .NET.
- Baseline Agent Core: Tidak ada parser hasil tes (lihat OFA-08); `scripts/verify/` berisi skrip evaluasi lain (`compact-output.mjs`, `skill-routing-eval.mjs`, `verify-workbook.mjs`) tetapi tidak satu pun membaca JUnit/ringkasan runner → **BELUM-ADA**.
- Delta/celah: Skrip Node tanpa dependensi `scripts/verify/test-run-evidence.mjs` yang menerima path hasil (JSON reporter vitest atau JUnit XML) atau log, mencetak: dieksekusi/gagal/dilewati/waktu tulis, peringatan "0 dieksekusi", "semua dilewati", "hasil lebih tua dari `<path kode>`", dan keluar bukan-nol bila tidak ada bukti. Dugaan umum (belum diverifikasi di repo): vitest menyediakan reporter `json` dan `junit`.
- Cara adaptasi: Skrip di `scripts/verify/` (owner existing untuk skrip verifikasi), memakai `node:fs` saja; jangan menjadi tool MCP. Perintah di Skill ditulis PowerShell. Tidak ada proses latar belakang atau file sisa (baca-saja).
- Lisensi/hak cipta: Apache-2.0 → reimplementasi mandiri di Node; jangan membawa Python (host pengguna lambat dan belum tentu punya Python).
- Perkiraan skala: M · Risiko: rendah-sedang (cakupan format runner) · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: tidak ada parser serupa di `src/` dan `scripts/verify/` (listing). Dugaan: bahwa reporter vitest tersedia dengan nama itu dan stabil.
- Disposisi: **ADAPT**

### OFA-10 Pengujian karakterisasi dan kesetaraan: legacy sebagai oracle, perbandingan yang tak bisa jalan = gagal, canary, masukan segar
- Sumber: `code-modernization/agents/test-engineer.md` (prinsip: oracle, konkret, nama aturan tiap tes, "A comparison that cannot run is a failure, never a skip", "Prove the tests can fail"), `commands/modernize-transform.md` (Langkah 1 dan 3: hitung kasus yang dieksekusi, canary, `compare.py`), `commands/modernize-verify.md` (Langkah 3–4: ≥10 masukan segar, malformed hanya bila niat "persis termasuk keanehan"), `scripts/compare.py:1-60` (penutup byte, regex mask, toleransi dengan alasan wajib dan batas relatif 1% / absolut 1e-6, perbedaan yang disetujui manusia tetap dicantumkan; exit 0 hanya bila ≥1 kasus dieksekusi dan tidak ada yang beda), `README.md` bagian "How it proves the result".
- Observasi: Aturan ringkas yang bekerja: (1) tes menetapkan perilaku **yang dilakukan kode lama** (19,27 walau spec 19,28) dan menandai selisih terpisah; (2) masukan dan keluaran harfiah; (3) setiap tes menyebut ID aturan yang dipinnya; (4) tes yang tidak bisa menjalankan oracle **gagal**; (5) laporkan `executed: N`; (6) patahkan satu baris kode baru dan lihat tes merah (canary); (7) bandingkan byte dengan maska yang hanya menutup bagian yang memang bervariasi; (8) selisih diterima hanya oleh manusia dengan alasan.
- Nilai untuk Agent Core: Tidak ada prosedur untuk memigrasikan/menyederhanakan kode tanpa tes tertulis; `code-simplification` mengandalkan tes yang ada; `deprecation-and-migration` membahas strategi (strangler, expand/contract) tetapi tidak memverifikasi perilaku kode.
- Baseline Agent Core: grep `characterization|golden|fresh input` di `runtime/skills/capability-packs` → 0 hasil; `code-review-and-quality/SKILL.md:186` memuat eksperimen mutasi tunggal (setara canary) → canary: **SEBAGIAN**, karakterisasi/kesetaraan: **BELUM-ADA**.
- Delta/celah: Referensi `deprecation-and-migration/references/characterization-and-equivalence.md` (≤ 7 KB) dengan padanan PowerShell: `Compare-Object`/`fc.exe /b`/`Get-FileHash` untuk bandingkan byte; maska regex; toleransi bertanda alasan; kasus segar; canary; aturan "tidak bisa jalan = gagal"; plus pointer dari `code-simplification` ("bila tidak ada tes yang mengunci perilaku, tulis tes karakterisasi dahulu") dan `test-driven-development`.
- Cara adaptasi: Referensi Skill + 1 baris penunjuk pada dua Skill; skrip pembanding tidak perlu (PowerShell cukup).
- Lisensi/hak cipta: Apache-2.0 → parafrase.
- Perkiraan skala: S-M · Risiko: rendah · Nilai: tinggi · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: konten donor dan grep Skill. Dugaan: seberapa sering pengguna meminta migrasi besar.
- Disposisi: **ADAPT**

### OFA-11 Alur migrasi/uplift terverifikasi: INTENT, preflight manusia, scope boundary, pilot→playbook, batch, gerbang manusia
- Sumber: `code-modernization/commands/modernize.md` (INTENT.md ditulis sekali, dibaca semua perintah), `modernize-preflight.md` (Check 0 lima pertanyaan manusia; Check 3 bukti toolchain pada kode ini; Check 6 batas lingkup: ke luar dan ke dalam/blast radius; Check 7 pembacaan-saja untuk aturan deny), `modernize-brief.md` (kriteria masuk/keluar "kondisi bukan keadaan", perintah build tidak boleh mengubah kata kriteria, "brief adalah hipotesis"), `modernize-uplift.md` (Langkah 0 pin versi, 5a pilot wajib lalu berhenti, `PLAYBOOK.md`, 5b batch dengan `deps`, circuit breaker 2/3), `agents/uplift-migrator.md` ("tanpa PLAYBOOK, berhenti"), `README.md:49` (enam titik manusia), `CHANGELOG.md`.
- Observasi: Poin-poin yang tidak ada di Skill migrasi biasa: (a) tanyakan lima hal yang hanya orang tahu (lingkup, build lokal, infrastruktur khusus, upaya sebelumnya, terlarang); (b) cek **blast radius** (siapa di luar bergantung pada node di dalam) sebelum mengubah di tempat; (c) tes harness adalah prasyarat, bukan daun; (d) satu unit pilot (bukan yang termudah) → tulis playbook → baru kerahkan; (e) setiap kejutan menjadi entri delta/playbook; (f) batch eskalasi (4, lalu 8, lalu 16) dan berhenti bila <⅔ berhasil; (g) unit yang bergantung pada unit gagal tidak dicoba; (h) salinan kerja dengan riwayat git lokal sendiri, bukan di sumber.
- Nilai untuk Agent Core: Agent Core sendiri (Node/TS + .NET WinForms + React) dan proyek pengguna memerlukan peningkatan versi besar dari waktu ke waktu; urutan "pilot dahulu, playbook, baru batch" dan "ketahui blast radius" mencegah rewrite berantai.
- Baseline Agent Core: `deprecation-and-migration/SKILL.md:89-215` (proses 4 langkah, strangler, adapter, feature flag, expand/contract), `planning-and-task-breakdown`, `spec-driven-development`, dokumen proposal dengan keputusan APPROVE/REVISE/HOLD/REJECT → keputusan manusia dan rencana **SUDAH-ADA**; pilot/playbook, blast radius, batch berhenti-bila-gagal, dan harness-sebagai-prasyarat **BELUM-ADA** (grep `pilot` hanya muncul di Skill lain tak terkait) → keseluruhan **SEBAGIAN**.
- Delta/celah: Referensi `deprecation-and-migration/references/verified-code-migration.md` (≤ 8 KB): urutan langkah, lima pertanyaan manusia, daftar periksa blast radius, aturan pilot dan playbook, batch manual (dilakukan Controller bergantian, bukan paralel), kriteria berhenti (<⅔ unit berhasil atau lingkungan tak bisa menjalankan build sama sekali = berhenti, perbaiki playbook), padanan Windows (`robocopy /E /XD .git` pengganti rsync, `mklink /J` pengganti `ln -s`, `git worktree add --detach`).
- Cara adaptasi: Referensi Skill; pointer satu baris. Tidak ada runtime orkestrasi (workflow multi-agent ditolak).
- Lisensi/hak cipta: Apache-2.0 → parafrase dan ringkas; jangan salin 20 KB `modernize-uplift.md`.
- Perkiraan skala: M · Risiko: rendah · Nilai: sedang-tinggi · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: semua perintah dibaca penuh; baseline lewat grep/headings. Dugaan: frekuensi migrasi mayor di pekerjaan pengguna.
- Disposisi: **ADAPT**

### OFA-12 Katalog delta versi: empat kategori, "senyap-perilaku", dan sinyal uplift-vs-rewrite
- Sumber: `code-modernization/agents/version-delta-analyst.md` (kategori API-removed, Behavioral-silent, Project-system, Dependency; kartu delta dengan Test note), `workflows/uplift-deltas.js:93-114` (catatan untuk globalisasi/locale/encoding: ICU vs NLS, CLDR, UTF-8 default, Hibernate, Spring, str/bytes), `:198-232` (sinyal rewrite: total situs tersentuh vs ukuran kode), `commands/modernize-uplift.md` Langkah 0.5 ("present / runnable here / actually ran" untuk alat migrasi), `uplift_checks.py` (delta senyap harus punya tes yang menamai situsnya).
- Observasi: Katalog hanya berisi irisan **perubahan versi yang diketahui ∩ apa yang kode ini pakai**, dengan situs `file:line` dan hitungan; delta senyap-perilaku wajib punya tes karakterisasi **sebelum** disentuh; kegagalan runtime (refleksi, enkapsulasi) ditandai; alat migrasi hanya dihitung bila benar-benar berjalan.
- Nilai untuk Agent Core: Kerangka yang bisa dipakai pada tumpukan Agent Core (Node, TypeScript, React, vitest, .NET), bukan daftar fakta donor (Java/.NET/Python/Angular).
- Baseline Agent Core: `deprecation-and-migration` tidak membahas perubahan versi; `source-driven-development` mengarahkan ke dokumentasi resmi → **SEBAGIAN**.
- Delta/celah: Bagian dalam referensi OFA-11 (≈1,5 KB) berisi template kartu delta, empat kategori, daftar dingin "senyap-perilaku" generik (locale, encoding default, urutan koleksi, zona waktu, TLS, serialisasi, async) dan aturan "alat hadir ≠ alat berjalan". **Jangan menyalin fakta versi donor** (misalnya detail ICU atau Hibernate) tanpa verifikasi; isi katalog per proyek dari sumber resmi.
- Cara adaptasi: Bagian referensi; tidak ada kode.
- Lisensi/hak cipta: Apache-2.0 → parafrase.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: teks donor. Dugaan: kecocokan kategori dengan tumpukan Node/React (kategori generik, dugaan wajar).
- Disposisi: **ADAPT**

### OFA-13 Kalibrasi review: skor kepercayaan, katalog false-positive, ambang, dan kepatuhan pada berkas instruksi
- Sumber: `code-review/commands/code-review.md:20-47` (rubrik 0/25/50/75/100; ambang 80; daftar false positive: sudah ada sebelumnya, tampak bug tapi bukan, nitpick, ditangkap linter/type checker, kualitas umum kecuali diwajibkan, dibungkam komentar lint, perubahan fungsional yang disengaja, baris yang tidak diubah PR), `feature-dev/agents/code-reviewer.md` dan `pr-review-toolkit/agents/code-reviewer.md` (rubrik sama; hanya laporkan ≥80), langkah 1 dan 7 (cek kelayakan di awal dan sebelum menulis), `README.md` code-review (agen CLAUDE.md: periksa kepatuhan pada berkas instruksi di direktori yang diubah).
- Observasi: Alih-alih menimbun komentar, filter keras (ambang + katalog) dan setiap temuan harus dikaitkan ke kutipan instruksi proyek atau bukti bug. Perilaku "jangan lapor bila PR tertutup/draf/sudah ditinjau" mencegah pengulangan.
- Nilai untuk Agent Core: `code-review-and-quality` memberi label tingkat (Critical/Nit/…) tetapi tidak membedakan kepastian; temuan spekulatif bisa menumpuk. `AGENTS.md` adalah kontrak proyek; memeriksa perubahan terhadap kontrak adalah tinjauan kepatuhan yang bernilai.
- Baseline Agent Core: `code-review-and-quality/SKILL.md:201-215` (label severity; "Lead with what matters"), `:419-420` ("Presumptive blockers"); tidak ada skor kepastian atau katalog false-positive (grep `false positive|confidence` di Skill tersebut: tidak ada) → **SEBAGIAN**.
- Delta/celah: Referensi `code-review-and-quality/references/review-calibration.md` (≈3 KB): skor kepastian 0–100 beserta artinya, ambang laporan, katalog false-positive, "baris tak diubah = bukan milik tinjauan ini kecuali perubahan memungkinkannya", "kutip instruksi proyek bila mengklaim pelanggaran", dan format ringkas dengan tautan `file:line` pada SHA lengkap.
- Cara adaptasi: Referensi Skill + satu baris penunjuk di Step 4 "Categorize Findings". Penerbitan komentar ke PR tetap membutuhkan persetujuan pengguna (kebijakan publikasi).
- Lisensi/hak cipta: Apache-2.0 → parafrase.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: donor dan Skill. Dugaan: ambang 80 cocok untuk satu Controller (dirancang untuk beberapa agen paralel; kalibrasi perlu diuji).
- Disposisi: **ADAPT**

### OFA-14 Lensa review spesialis: silent-failure, comment-rot, kualitas tes, invarian tipe
- Sumber: `pr-review-toolkit/agents/silent-failure-hunter.md` (catch kosong, log-lalu-lanjut, nilai default saat error, optional chaining menyembunyikan kegagalan, fallback ke mock di produksi, catch terlalu lebar, retry habis tanpa kabar), `agents/comment-analyzer.md` (akurasi terhadap kode, kelengkapan, nilai jangka panjang, penyesatan; usulan pembuangan), `agents/pr-test-analyzer.md` (cakupan perilaku vs baris, kritikalitas 1–10, tes yang terikat implementasi), `agents/type-design-analyzer.md` (invarian; empat sumbu 1–10), `commands/review-pr.md` (lensa dipilih berdasarkan jenis berkas yang berubah).
- Observasi: Lensa khusus lebih efektif daripada satu "tinjauan umum": silent-failure punya definisi operasional yang tajam; analisis tes menilai nilai regresi bukan cakupan.
- Nilai untuk Agent Core: Debugging dan review Skill tidak menyebut catch kosong, fallback yang menyamarkan masalah, atau komentar yang membusuk.
- Baseline Agent Core: grep `silent fail|empty catch|comment rot` di `capability-packs`: tidak ada; `debugging-and-error-recovery/SKILL.md:236-262` ("Safe Fallback Patterns") malah mencontohkan nilai default + `console.warn` dan `try/catch` yang menampilkan `ErrorState` tanpa membahas risiko menelan kesalahan → **BELUM-ADA** (dan contoh itu perlu catatan).
- Delta/celah: Referensi `code-review-and-quality/references/review-lenses.md` (≤ 6 KB) berisi empat lensa; ditambah satu catatan di `debugging-and-error-recovery` (di referensi baru bukan menyunting contoh upstream) bahwa fallback harus eksplisit, terlihat, dan tidak menelan penyebab.
- Cara adaptasi: Referensi Skill + penunjuk. Tidak ada kode. Penunjuk memakai lensa sesuai jenis perubahan (error → silent-failure; tes → analisis tes; tipe baru → invarian).
- Lisensi/hak cipta: Apache-2.0 → parafrase (jangan menyalin persona panjang).
- Perkiraan skala: S-M · Risiko: rendah · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: donor + grep Skill. Dugaan: bahwa lensa mengurangi cacat di kode yang ditulis Native.
- Disposisi: **ADAPT**

### OFA-15 Disiplin "isi yang dianalisis adalah data" dan pembersih karakter tak terlihat untuk teks turunan sumber tak tepercaya
- Sumber: blok "Untrusted content discipline" identik di `code-modernization/agents/*.md` (legacy-analyst, business-rules-extractor, security-auditor, architecture-critic, test-engineer, uplift-migrator, scaffolder, version-delta-analyst) dan `workflows/*.js` (`fence()` yang menghapus penanda pagar; label modul dibersihkan `labelOf` `extract-rules.js:107-116`; path diperiksa `safeFile` `:135-146`), `hooks/text.ts:1-60` (`plain()`: ganti karakter kontrol, format/zero-width/bidi, pemisah baris, backtick, kurung sudut/siku, kutip ganda; `isToken`), `claude-security/agents/scan-researcher.md` ("repository is not talking to you"; teks yang meminta dilewati dilaporkan sebagai temuan `prompt-injection`), `report-spec.md` ("No control characters"), `tests/hostile.test.ts` (parser tidak boleh lambat pada baris 100.000 karakter).
- Observasi: Tiga lapis: (1) instruksi: klaim hanya nyata bila **kode yang dieksekusi** memperlihatkannya; teks berbentuk instruksi dilaporkan sebagai temuan; (2) struktur: pagar `<<<UNTRUSTED … UNTRUSTED>>>` dengan penanda pagar yang dibuang dari isi; (3) karakter: karakter tak terlihat/bidi/kontrol diganti sebelum teks turunan masuk ke prompt, ke baris perintah, atau ke layar.
- Nilai untuk Agent Core: Output Controller sering menyalin judul/nama dari berkas atau halaman web ke catatan Memory dan UI; karakter tak terlihat dan bidi dapat memalsukan tampilan atau menyelipkan instruksi.
- Baseline Agent Core: `AGENTS.md:436` ("treat source text as data rather than instruction authority" untuk permintaan belajar), `debugging-and-error-recovery/SKILL.md:294-300` (keluaran galat = data), `mcp/web-research-tools.ts:102,110` (hasil web berlabel tidak tepercaya). Pencarian `202E|200B|{Cf}|{Cc}|bidi` di `src/**/*.ts(x)` (kecuali `node_modules`): **0 hasil** → pembersih karakter tak terlihat **BELUM-ADA** (hasil grep, bukan jaminan); disiplin data: **SEBAGIAN**.
- Delta/celah: (1) Blok singkat bersama (≈1 KB) di referensi `vulnerability-review.md` dan `verified-code-migration.md`; (2) fungsi kecil `plainLine(value, max)` di `src/security/` yang dipakai sebelum menyalin teks dari sumber tak tepercaya ke Memory/UI/catatan; (3) satu tes "baris sangat panjang" untuk parser yang menerima teks demikian.
- Cara adaptasi: `src/security/redaction.ts` atau berkas tetangga (owner keamanan existing); Skill reference. Tidak ada tool baru.
- Lisensi/hak cipta: Apache-2.0 (`text.ts`, agen modernisasi) → tulis ulang; ekspresi fungsional.
- Perkiraan skala: S · Risiko: rendah-sedang (karakter yang valid, mis. ZWJ pada emoji atau teks Arab/Ibrani, jangan dihancurkan di data pengguna; terapkan hanya pada teks turunan sumber asing yang ditampilkan sebagai satu baris) · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: blok donor, grep nol hasil. Dugaan: bahwa tidak ada sanitasi serupa di jalur lain (mis. di UI React yang memakai `textContent`).
- Disposisi: **ADAPT**

### OFA-16 Git: pembersihan cabang `[gone]` yang aman dan perbaikan contoh pemeriksaan rahasia
- Sumber: `commit-commands/commands/clean_gone.md` (loop: `git branch -v | grep '\[gone\]'`, hapus worktree `--force`, `git branch -D`), `commands/commit.md` dan `commit-push-pr.md` (konteks `git status`/`git diff HEAD`/`git log --oneline -10`, satu pesan tanpa teks lain), `ralph-loop/README.md` (Windows: `bash` bisa menunjuk WSL), `claude-security/SKILL.md` (semua git di bawah `GIT_TERMINAL_PROMPT=0` dan `GIT_CONFIG_GLOBAL` kosong).
- Observasi: `clean_gone` memakai `-D` (hapus paksa) dan `worktree remove --force` tanpa memeriksa komit lokal yang belum digabung (setelah squash-merge cabang remote hilang, tetapi lokal memuat komit unik); `commit-push-pr` melakukan commit, push, dan membuka PR dalam satu giliran.
- Nilai untuk Agent Core: Skill `git-workflow-and-versioning` tidak memuat pembersihan cabang basi. Pengguna mensyaratkan persetujuan eksplisit untuk commit/push/merge dan tidak ingin sisa; versi aman jelas bernilai.
- Baseline Agent Core: `git-workflow-and-versioning/SKILL.md:143-168` (cabang fitur, penamaan, worktree) dan `:233-262` (higiene pra-commit): contoh `git diff --staged | grep -i "password\|secret\|api_key\|token"` **mencetak baris yang berisi nilai rahasia ke terminal/transkrip** → perlu `grep -l`/hitung saja (kontradiksi dengan "Never log sensitive data" di `security-and-hardening/SKILL.md:90`) → **SEBAGIAN**.
- Delta/celah: Satu bagian di referensi `git-workflow-and-versioning/references/branch-cleanup.md` (≈2 KB): daftar `[gone]` hanya baca; `git cherry -v <upstream> <branch>` untuk komit unik; minta konfirmasi per cabang; `git branch -d` dahulu, `-D` hanya dengan persetujuan; worktree dihapus tanpa `--force` kecuali pengguna setuju; padanan PowerShell; catatan "dengan `git -c safe.directory=*` hanya bila perlu". Ditambah penggantian contoh pra-commit dengan `git diff --staged --name-only` dan `git diff --staged -G"(password|secret|api[_-]?key|token)" --name-only` (nama berkas saja).
- Cara adaptasi: Referensi Skill + penunjuk satu baris. `commit-push-pr` ditolak sebagai satu-giliran.
- Lisensi/hak cipta: Apache-2.0 → tulis ulang.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah-sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: teks donor dan baris Skill. Dugaan: bahwa cabang `[gone]` memang menumpuk di repo pengguna.
- Disposisi: **ADAPT**

### OFA-17 Ekstraksi aturan bisnis dari kode: kartu Given/When/Then, referee sitasi, panel P0, konsolidasi, buku tinjauan manusia
- Sumber: `code-modernization/commands/modernize-extract-rules.md` (format kartu `### RULE-NNN`; P0/P1/P2 definisi; kepercayaan dan pertanyaan SME), `workflows/extract-rules.js:356-358` (`GRANULARITY`: satu aturan per keputusan bisnis, bukan per cabang; "jika lebih dari satu dari empat P0, nilai ulang"), `:429-502` (referee: `confirmed|refuted|wrong-citation`; aturan hanya di komentar = ditolak), `:620-706` (konsolidasi aturan sama di beberapa berkas), `:708-786` (panel P0: lensa kepatuhan dan lensa kesetiaan), `scripts/render_rules.py` (satu sitasi per aturan; nilai satu baris), `commands/modernize-review.md` + `hooks/review/ledger.ts` (`RULE_REVIEWS.json`: verdict `confirmed|wrong|discuss`; aturan salah tidak menjadi oracle; P0 yang masih didiskusikan menghentikan build).
- Observasi: Ini bentuk "spesifikasi perilaku yang dapat diuji" dengan verifikasi sitasi bertingkat dan keputusan manusia pada yang meragukan.
- Nilai untuk Agent Core: `reverse-engineer-anything` (REA) dan `spec-driven-development` menyiratkan rekonstruksi perilaku; belum ada bentuk kartu aturan yang baku atau gerbang tinjauan.
- Baseline Agent Core: `reverse-engineer-anything/references/*`, Memory `claim-review`, `harness/reconstruction/obligations.ts` (kewajiban rekonstruksi) → **SEBAGIAN**; kartu aturan dan ledger tinjauan manusia: **BELUM-ADA**.
- Delta/celah: Hanya templat kartu + aturan granularitas + definisi P0 + status verdict manusia sebagai referensi (≈3 KB) di `reverse-engineer-anything` atau `spec-driven-development`. Tanpa pipeline 50–200 agen.
- Cara adaptasi: Referensi Skill; verifikasi sitasi dilakukan Controller dengan membuka berkas yang dikutip sendiri.
- Lisensi/hak cipta: Apache-2.0 → parafrase.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang-rendah (jarang diperlukan) · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: sumber dibaca penuh. Dugaan: kebutuhan nyata pengguna.
- Disposisi: **ADAPT** (prioritas rendah)

### OFA-18 Pola fan-out terbatas: kapasitas, circuit breaker, daftar celah yang dapat diteruskan, resume bukan restart
- Sumber: `code-modernization/workflows/extract-rules.js:369-407` (`AGENT_CAP = 1000`; kapasitas diperiksa sebelum tiap fan-out; pekerjaan yang tidak muat dilewati dan dilaporkan), `:810-865` (`skippedModules`, `failedModules`, `unverifiedRules`, `rerunModules` siap-lempar), `workflows/uplift-migrate.js:260-359` (batch eskalasi; breaker 2/3 per batch; unit tak berbuild menghalangi dependen), `:361-424` (`remainingUnits`, `failedUnits`, `blockedUnits`), `harden-scan.js:161-168` (`deadFinders` tidak boleh terbaca sebagai kelas yang bersih).
- Observasi: Setiap tahap yang bisa kehabisan anggaran mencatat apa yang tidak selesai dan mengembalikan daftar yang bisa dimasukkan langsung ke pemanggilan berikutnya; hasil sebagian lebih baik daripada gagal total; resume = ulang dengan argumen identik, bukan mulai dari awal.
- Nilai untuk Agent Core: Child-task Native berstatus BERSYARAT; bila kelak dibuka, anggaran/penghentian/daftar celah ini adalah batas desain yang konkret. Orkestrasi multi-agent sebagai runtime tetap ditolak.
- Baseline Agent Core: Kompaksi konteks durable, akuntansi konteks, Stop merambat; tidak ada child-task → tidak ada padanan → **REFERENSI**.
- Delta/celah: Tidak ada yang diterapkan sekarang; catat sebagai "kriteria penerimaan" bila child-task dipertimbangkan: (1) batas jumlah dan token sebelum fan-out; (2) daftar celah eksplisit; (3) breaker; (4) unit yang gagal tidak dicoba ulang secara buta; (5) hasil tak pernah ditulis sebagai lengkap bila ada celah.
- Cara adaptasi: Dokumen proposal child-task (bila dibuka); tidak ada perubahan kode sekarang.
- Lisensi/hak cipta: Apache-2.0.
- Perkiraan skala: — (referensi) · Risiko: — · Nilai: rendah (sekarang) · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: kode donor. Dugaan: kapan child-task dibuka.
- Disposisi: **REFERENSI**

### OFA-19 Ide UI/dashboard: chip vonis, "berubah sejak diverifikasi", deck tinjauan, tombol "taruh di prompt"
- Sumber: `code-modernization/hooks/README.md` (satu chip vonis per modul; `not verified yet`; `changed since verified` bila catatan atau laporan tes lebih baru dari vonis; tombol "put in prompt" tidak pernah menjalankan; deck tinjauan satu kartu per layar; dialog tanda tangan; lipatan kegagalan bersama dengan ambang 5% armada, `fleet.ts:60-80`), `hooks/reader/verification.ts` (parser vonis hanya menerima tiga kata persis; teks dipotong), `assets/report-template.html` (CSP, tema, tanpa sumber luar), `scripts/build_report.py` docstring (JSON di `<script type="application/json">`, DOM dibangun dengan `textContent`, berkas `*.local.*`/`SECRETS*` dan tautan tidak dibaca).
- Observasi: UI hanya menampilkan apa yang ditulis skrip; fakta yang tidak ada di disk ditampilkan sebagai hilang; "basi" diturunkan dari waktu berkas.
- Nilai untuk Agent Core: Dasbor "Proposals to review" ada; indikator "basi" untuk bukti dan vonis belum jelas.
- Baseline Agent Core: Panel perubahan task dan Activity Tracker; lipatan kegagalan: `src/failure-evidence.ts:68-105` (`normalizeVolatileFailureText`, `normalizeFailureFamily`) → **SUDAH-ADA** untuk lipatan; chip vonis/basi: **BELUM-ADA** (tidak dicari mendalam di UI).
- Delta/celah: Ide kecil: tampilkan umur bukti terhadap perubahan terakhir pada panel perubahan task ("tes dijalankan sebelum edit terakhir").
- Cara adaptasi: UI React yang sudah ada; hanya bila ada pemicu nyata. Prioritas rendah.
- Lisensi/hak cipta: Apache-2.0 → ide; tanpa salinan.
- Perkiraan skala: M · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: README pane dan kode parser. Dugaan: kondisi UI Agent Core (tidak diperiksa).
- Disposisi: **REFERENSI**

### OFA-20 ralph-loop dan pola penghentian: tidak ada bukti baru untuk membuka kembali
- Sumber: `ralph-loop/hooks/stop-hook.sh:1-190` (state `.claude/ralph-loop.local.md`; isolasi sesi lewat `session_id`; validasi angka lalu **hapus state dan berhenti** bila rusak; `max_iterations`; promise cocok persis; ambil blok teks terakhir transkrip), `commands/ralph-loop.md` (aturan "jangan berbohong demi keluar"), `README.md` (default tanpa batas; "mekanisme pelarian"; catatan Windows: bash WSL), `security-guidance/hooks/security_reminder_hook.py:197,2426` (`MAX_STOP_HOOK_FIRINGS = 3`) dan `diffstate.py:32` (`STOP_LOOP_STATE_TTL_SEC = 120`).
- Observasi: Loop menuntut model "menyatakan selesai" dengan string; bukti bahwa tes lulus tidak diperiksa. Pola yang masuk akal di luar loop: gagal-menuju-berhenti pada state rusak; isolasi sesi untuk berkas state tingkat proyek; batas pengaktifan-ulang bertanggal kedaluwarsa.
- Nilai untuk Agent Core: Doktrin menolak retry otomatis buta; tidak ada bukti baru.
- Baseline Agent Core: Reflexion, budget, Stop, verifikasi independen (`Peluang-Upgrade...md:83`: "Ralph loop ditolak") → **SUDAH-ADA** (penolakan tetap).
- Delta/celah: Tidak ada.
- Cara adaptasi: Tidak ada.
- Lisensi/hak cipta: Apache-2.0.
- Perkiraan skala: — · Risiko: — · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: kode dibaca. 
- Disposisi: **REFERENSI** (penolakan dipertahankan)

### OFA-21 hookify: aturan dari koreksi sudah dimiliki Learning; hanya heuristik analisis percakapan yang layak diingat
- Sumber: `hookify/agents/conversation-analyzer.md:27-60,155-179` (sinyal: "jangan X", "kenapa kamu X", pengembalian perubahan, isu berulang; kasus tepi: hipotetis, momen pengajaran, kecelakaan satu kali, preferensi subjektif), `core/rule_engine.py` (semua kondisi harus cocok; `block` menang atas `warn`; regex di-cache 128 pola; semua kegagalan → izinkan), `core/config_loader.py:87-196` (parser frontmatter buatan sendiri), `hooks/stop.py` dan `examples/require-tests-stop.local.md` (aturan "blokir berhenti bila transkrip tak menyebut perintah tes").
- Observasi: Mesin aturan adalah otoritas hook yang gagal-terbuka dan tanpa pemeriksaan ReDoS; "blokir berhenti" tanpa batas dapat berulang.
- Nilai untuk Agent Core: Sudah ditolak sebagai runtime (lihat `Claude-Code-Steal-Use-Integration-Plan.md:204-223`).
- Baseline Agent Core: `src/learning/triggers.ts:9-13` (`user-correction` sebagai pemicu tinjauan segera), `learning/evaluation.ts` (referensi bukti `user-correction:`), `learning/decision-evidence.ts` (koreksi dideklarasikan) → **SUDAH-ADA**.
- Delta/celah: Daftar sinyal koreksi dan kasus tepi dapat membantu Controller menyaring "bukan koreksi" saat memicu checkpoint; belum ada dokumen internal yang memuatnya (tidak diperiksa mendalam).
- Cara adaptasi: Opsional: satu paragraf di dokumentasi Learning; tidak ada kode.
- Lisensi/hak cipta: Apache-2.0 (README MIT berkonflik; LICENSE mengikat).
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: Learning memiliki pemicu `user-correction`. Dugaan: kualitas penyaringan saat ini.
- Disposisi: **REFERENSI**

### OFA-22 Satu pembantu git baca-saja yang diperkeras, menggantikan tujuh pemanggilan dengan argumen berbeda-beda
- Sumber: `security-guidance/hooks/gitutil.py:30-44` (`GIT_CMD`: `-c core.fsmonitor=false`, `-c core.hooksPath=/dev/null`, `-c core.quotePath=false`), `hooks/diffstate.py` dan `tests/test_repo_resolution.py:582-603` (`test_repository_config_cannot_run_programs`: konfigurasi repo yang menunjuk `core.fsmonitor` ke skrip tidak boleh menjalankannya), `claude-security/hooks/hooks.py` (konstanta `GIT = ("git","-c","core.hooksPath=/dev/null","-c","core.fsmonitor=")` dan `DIFF = ("diff","--no-ext-diff","--no-textconv","--no-renames","--name-only","-z")`), `skills/claude-security/SKILL.md` + `role.md` (semua git di bawah `GIT_CONFIG_GLOBAL=/dev/null GIT_TERMINAL_PROMPT=0`, tidak ada prompt kredensial).
- Observasi: Dua plugin keamanan donor memperlakukan perintah git baca-saja sebagai permukaan serangan: konfigurasi lokal repo (`core.fsmonitor`, driver `diff.external`/`textconv`) dapat menjalankan program saat `git status`/`git diff`. Mereka menonaktifkannya per panggilan dan menguji perilaku itu dengan penanda berkas.
- Nilai untuk Agent Core: Beberapa modul memaksa `-c safe.directory=<root>`, yang menonaktifkan perlindungan "dubious ownership" git; bersama konfigurasi repo yang tidak tepercaya, itu membuka eksekusi program lewat `fsmonitor` atau `textconv` pada repo yang dimiliki pengguna lain atau salinan arsip.
- Baseline Agent Core: Tujuh lokasi memanggil git dengan argumen sendiri: `code-intelligence/change-review.ts:64-80` (`safe.directory` + `--no-optional-locks`; `diff` baris 154 tanpa `--no-ext-diff`/`--no-textconv`; baris 158-159 hanya `--no-ext-diff`), `code-intelligence/workspace-resolver.ts:163`, `code-intelligence/graph-observability.ts:294`, `memory/provenance.ts:99,192` (punya `--no-ext-diff --no-textconv` pada satu `diff`), `memory/repository-identity.ts:14`, `semantic-ide/workspace-policy.ts:76`, dan `rdc/checkpoints/task-changes.ts:102-116` (satu-satunya yang menambah `core.fsmonitor=false` dan `GIT_TERMINAL_PROMPT=0`, dan `--no-textconv`). Tidak ada pembantu bersama (grep `execFile('git'` di `src/`: tujuh berkas) → **SEBAGIAN** (sudah diperkeras di satu tempat, tidak seragam).
- Delta/celah: Pembantu tunggal `runReadOnlyGit(root, args, opts)` yang selalu menambahkan `-c core.fsmonitor=false -c core.quotePath=false --no-optional-locks`, `GIT_TERMINAL_PROMPT=0`, dan untuk subperintah yang membuat diff `--no-ext-diff --no-textconv`; semua tujuh lokasi memakainya. Ancaman nyata bergantung pada repo yang tidak tepercaya dan konfigurasi lokal berbahaya; **tingkat eksploitasi tidak diverifikasi** (tidak dijalankan).
- Cara adaptasi: Satu modul kecil di `src/process/` atau `src/security/` (owner proses/keamanan existing, tidak berkas jaringan), penggantian lokasi panggil; tes yang menaruh `core.fsmonitor` berpenanda di repo sementara dan memastikan penanda tidak tercipta (pola tes donor, di folder temp yang dihapus setelah tes).
- Lisensi/hak cipta: Apache-2.0 (`security-guidance`); claude-security hanya untuk fakta bahwa tanda-tanda itu umum.
- Perkiraan skala: S-M · Risiko: sedang-rendah (subperintah yang mengandalkan textconv akan berubah hasilnya; baca-saja sehingga aman) · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: argumen git di tujuh lokasi dan pembantu donor. Dugaan: bahwa repo tidak tepercaya benar-benar dibuka Agent Core; bahwa `safe.directory` memperbesar risiko dalam praktik.
- Disposisi: **ADAPT**

### Ringkasan delta per Skill Agent Core

Semua usulan ini bersifat **tambah `references/*.md` + satu baris penunjuk**, kecuali dinyatakan lain; tidak ada yang memperbesar `AGENTS.md`. Body `SKILL.md` tiga Skill (review 22,9 KB; security 19,5 KB; git 16 KB) sudah melebihi satu fragmen 8.192 byte; jangan menambah isi di body.

| Skill | Delta konkret | Temuan | Skala |
| --- | --- | --- | --- |
| `code-review-and-quality` | Referensi `review-calibration.md` (skor 0–100, ambang, katalog false-positive); `review-lenses.md` (silent-failure, comment-rot, kualitas tes, invarian tipe); `verification-verdict.md` (vonis PROVEN/PARTLY/NOT, "0 dieksekusi", "hasil lebih tua dari kode"); penunjuk di Step 4 dan Step 5 | OFA-08, 13, 14 | M |
| `security-and-hardening` | Referensi `vulnerability-review.md` (metodologi berburu + penyangkalan temuan + tiga klaim perbaikan + disiplin data tak tepercaya); `finding-report.md` (templat laporan jujur-cakupan); penunjuk di "Review Checklist" | OFA-04, 05, 06, 07, 15 | M |
| `code-simplification` | Satu baris di Step 1: bila tidak ada tes yang mengunci perilaku, tulis tes karakterisasi dahulu (lihat OFA-10); tidak ada konten baru | OFA-10 | S |
| `deprecation-and-migration` | Referensi `characterization-and-equivalence.md` dan `verified-code-migration.md` (pilot→playbook, blast radius, batch + berhenti, katalog delta); penunjuk di "The Migration Process" | OFA-10, 11, 12 | M |
| `git-workflow-and-versioning` | Referensi `branch-cleanup.md` (pembersihan `[gone]` aman, konfirmasi); ganti contoh grep rahasia agar tidak mencetak nilai | OFA-16 | S |
| `debugging-and-error-recovery` | Catatan di referensi lensa review: fallback harus tampak dan tidak menelan penyebab (jangan menyunting contoh upstream); tidak ada tambahan lain | OFA-14 | S |

Kendala operasional: tiap perubahan melalui `SkillService.stage_revision` → promosi dengan persetujuan pengguna dan tes `capability-pack-indexing`/`external-skill-guidance`; mengubah `SKILL.md` mengubah digest upstream sehingga `UPSTREAM.json` harus mencerminkan adapter-revision berikutnya.

---

## Bagian C — Ditolak / tidak relevan (dengan alasan)

- **Telemetri** (`code-modernization/scripts/telemetry.py`, `telemetry.sh`, `hooks/hooks.json`; `claude-security/hooks/hooks.py` metrik; README keduanya): hitungan penggunaan lewat telemetri Claude Code. Bertentangan dengan doktrin local-first. Satu-satunya yang dipelajari: struktur "hanya bilangan bulat, dibulatkan" (tidak dipakai).
- **Pemanggil model tersembunyi** (`security-guidance/hooks/llm.py` kecuali rubrik, `ensure_agent_sdk.py`, `sg-python.sh`, `hooks.json` dengan `asyncRewake`, pemilihan model, kredensial gateway): review keamanan oleh model/agen kedua yang tidak terlihat; ditolak dalam disposisi sebelumnya dan tidak ada bukti baru.
- **Pipeline multi-agent sebagai runtime** (`claude-security/workflows/scan.js`, `agents/*`, `code-modernization/workflows/*.js` dan agen yang dipanggil, `code-review` lima agen paralel, `feature-dev` tiga fase paralel, `pr-review-toolkit` enam agen): orkestrasi multi-agent ditolak; hanya prinsipnya dipakai sebagai disiplin Controller (OFA-05, 13, 14, 18).
- **Redactor model** (`claude-security/agents/scan-redactor.md`): penyamaran "usaha terbaik oleh model" sudah diakui README donor sebagai tidak terjamin; Agent Core memiliki `security/redaction.ts` deterministik.
- **`keep-waiting.sh` dan polling `sleep`** (`claude-security`): menahan giliran pada mesin lambat tanpa kebutuhan; pakai Monitor/tugas latar bila perlu.
- **`cwe-categories.json` (30 KB) dan pemetaan CWE-1003**: data besar yang butuh atribusi MITRE; cukup ID CWE per aturan (OFA-02).
- **Pane TUI dan hooks fungsi early access** (`code-modernization/hooks/*.ts[x]`, `x-ray reads`): terikat API TUI Claude Code yang belum stabil; x-ray (menyuntik konteks saat membaca) adalah interceptor; ditolak. Viewer topologi 82 KB, `mermaid.min.js` 3,5 MB, dan media tidak relevan.
- **Indeks kompleksitas COCOMO untuk portofolio** (`portfolio-assess.js`, `modernize-assess.md`): hanya ukuran relatif; tidak ada nilai di luar peringkat sistem.
- **hookify mesin aturan** (`core/*.py`, `hooks/*.py`): otoritas hook, gagal-terbuka, pengaktifan "blokir berhenti" tanpa batas; ditolak (OFA-21).
- **ralph-loop** (seluruh plugin): lihat OFA-20.
- **`commit-commands/commit-push-pr.md`**: commit, push, dan buka PR dalam satu giliran tanpa persetujuan melanggar kebijakan pengguna (commit/push/merge hanya dengan persetujuan eksplisit); `commit.md` (stage + commit) sama.
- **`code-simplifier` (kedua versi)**: lebih tipis daripada Skill `code-simplification` (Chesterton's Fence, Rule of 500, tabel pola); preferensi gaya CLAUDE.md-nya bersifat proyek tertentu. SUDAH-ADA.
- **`feature-dev` tujuh fase**: pertanyaan klarifikasi wajib, eksplorasi, tiga opsi arsitektur (minimal/bersih/pragmatis), persetujuan sebelum implementasi sudah dicakup `interview-me`, `spec-driven-development`, `planning-and-task-breakdown`, `incremental-implementation`, dan alur proposal; eksplorasi paralel oleh beberapa agen ditolak. REFERENSI: pola "tiga opsi dengan rekomendasi" untuk templat proposal, tanpa perubahan.
- **Penerbitan komentar PR otomatis** (`code-review`: `gh pr comment`): mempublikasikan ke pihak ketiga memerlukan persetujuan eksplisit.
- **Pemberian tip setelah `git push`** (`claude-security/hooks`): hook intervensi.
- **Peningkatan "sakelar env per lapisan"** (`security-guidance/README.md` `ENABLE_*`): Agent Core memakai grant dinamis, bukan sakelar env.

---

## Bagian D — Pola lintas-unit dan pertanyaan terbuka

### Pola yang berulang dan layak jadi standar

1. **Konten yang dianalisis adalah data, bukan instruksi**: sama di setiap agen/workflow code-modernization, tiga agen claude-security, dan rubrik security-guidance. Aturan terpadu: klaim nyata hanya bila kode yang berjalan menunjukkannya; teks berbentuk instruksi dilaporkan, tidak dituruti; pagar pembatas dengan penanda yang dibuang; karakter tak terlihat dibersihkan (OFA-15).
2. **Pencari recall tinggi, penyangkal presisi tinggi, vonis dihitung kode** (OFA-05, 08): `PREDATES_CHANGE`, severity hanya turun, kepercayaan dijepit oleh suara, vonis terbelah turun ke Medium dengan catatan.
3. **Yang tidak ada tidak pernah dibaca sebagai bersih**: `deadFinders`, `unverified`, `skippedModules`, `researchersReturned < Dispatched`, tinjauan gagal bukan bersih, tes 0-dieksekusi bukan lulus, berkas melebihi batas dilaporkan (OFA-01, 04, 08, 18).
4. **Angka datang dari berkas yang di-parse, bukan dari ketikan model**; hasil yang lebih tua dari kode adalah basi (OFA-08, 09).
5. **Daftar celah yang dapat diteruskan** (`rerunModules`, `remainingUnits/failedUnits/blockedUnits`) dan "resume, bukan restart" (OFA-18).
6. **Fence tulis**: tiap agen menulis hanya di direktori unitnya; berkas bersama dimiliki pemanggil; agen pencari baca-saja dan hasilnya ditulis sesi pemanggil (batas keamanan, bukan formalitas) (code-modernization `agents/*.md`, `uplift-migrator.md`).
7. **Enam titik keputusan manusia yang tidak pernah diputuskan alat**: jawaban preflight, aturan yang tampak salah, persetujuan brief, perbedaan yang diterima, tanda tangan bukti, penerapan patch keamanan. Perintah yang membangun boleh mencentang/menambah catatan, tidak mengubah kata kriteria.
8. **Kejujuran batas**: "Apa yang tidak dibuktikan" (`proof_pack.not_proven`), pernyataan jaminan sebenarnya (aturan izin tidak mencakup skrip yang membuka berkas sendiri; jaminan keras adalah mount baca-saja/sandbox OS) di `code-modernization/README.md:124-127` dan `modernize-preflight.md` Check 7.
9. **Penahanan rahasia**: petunjuk 2–4 karakter + `file:line`; karantina rahasia di berkas yang diabaikan git dengan verifikasi `git check-ignore` sebelum menulis temuan; patch kredensial dipisah (`*.local.patch`); tanpa VCS → simpan di direktori home pengguna; `--show-secrets` hanya di berkas karantina.
10. **Batas di semua sisi**: byte per berkas, jumlah berkas, panjang baris, kedalaman, ReDoS pada aturan buatan pengguna, hanya file reguler, tautan tidak diikuti, DTD/entitas XML ditolak (`baseline_diff.py`, `proof_pack.py`).
11. **Kebasian dinilai dari isi**: temukan kode lewat `snippet`/`symbol` bukan nomor baris (claude-security `suggest-patches.md`; OFA-03, 07).
12. **Daftar bahaya Windows yang dicatat donor** (berguna untuk skrip `scripts/windows`): `python3` bisa berupa stub Microsoft Store yang keluar diam-diam (kode 49) sehingga launcher mencoba `python` lalu `py -3` (`sg-python.sh`); `bash` bisa menunjuk WSL (ralph README); CRLF merusak skrip bash (`.gitattributes eol=lf`); Python di cp1252 crash pada nama non-ASCII (set UTF-8); direktori junction bukan symlink biasa (`link.py`); nama segmen yang berakhir titik/spasi menjadi alias di NTFS (`uplift-migrate.js:72-78`). Agent Core sudah menolak alias/reparse dalam `verification/evidence-snapshot.ts` (`/[. ]$/`), jadi sebagian besar SUDAH-ADA.

### Pertanyaan terbuka untuk Main

1. **Lisensi claude-security**: apakah tim ingin tetap tidak menyentuh materinya sama sekali (konservatif)? Rekomendasi: ya; semua yang bersumber di sini ditulis ulang dari prinsip, dan sumber penulisan utama adalah `security-guidance` (Apache-2.0).
2. **Persistensi lifecycle scanner** (OFA-03): `Map` proses hilang saat server dimulai ulang. Menyimpannya memerlukan pemilik penyimpanan (Tracker? Memory?). Tanpa pemilik jelas, jangan dibuat.
3. **Field hasil baru** (`coverage`, `fingerprint`, `confidence`, `cwe`): tidak ada `outputSchema` pada `code_analysis` yang ditemukan (grep), jadi tampak aman bagi anggaran manifest; mohon Main konfirmasi ke pemilik MCP bahwa hasil `textResult` bebas bentuk.
4. **Skrip Node vs Python** untuk OFA-09: host pengguna lambat dan belum tentu punya Python; rekomendasi Node tanpa dependensi.
5. **Berkas bernama rahasia** (`.env*`, kunci SSH): `security-guidance/hooks/gitutil.py:1523-1578` tidak mengirimnya ke model. Agent Core punya `security/evidence-capture-policy.ts` berbasis penanda; saya **belum memverifikasi** apakah ada daftar bawaan serupa untuk jalur konteks Native. Pemilik keamanan perlu menjawab.
6. **Bentuk adapter-revision**: apakah Main lebih suka menggabung referensi baru ke satu revisi per Skill (lebih sedikit promosi) atau satu revisi per tema?

---

## Rekap

- Jumlah temuan: 22 (OFA-01 … OFA-22).
- Per disposisi: **ADOPT 1** (OFA-01); **ADAPT 17** (OFA-02 … OFA-17 dan OFA-22); **REFERENSI 4** (OFA-18, 19, 20, 21).
- Lima teratas: OFA-01 (cacat nyata scanner CC-P2), OFA-08 (vonis bukti dihitung skrip), OFA-05 (protokol validasi temuan), OFA-04 (laporan jujur-cakupan), OFA-10 (karakterisasi dan kesetaraan).
- Cakupan: 274 file; penuh 121 (44,2%), skim 78 (28,5%), sampel 54 (19,7%), tidak dibaca 21 (7,7%).
- Hambatan: `claude-security/workflows/scan.js` ter-minify (155 baris), dibaca lewat header dan grep; sebagian tes dan viewer HTML hanya diinventaris.
