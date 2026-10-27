# W9b — claude-plugins-official, putaran penutupan celah (prefiks temuan `GCB`)

Tanggal: 2026-10-27. Pekerja baca-saja. Sumber: `E:\Projects\Side-Project-Dont-Touch\claude-plugins-official\` (HEAD `58267944`). Pembanding: `E:\Projects\Agent-Core` (hanya dibaca). File ini melengkapi `W4-official-plugins-A.md` (prefiks OFA) dan `W5-official-plugins-B.md` (prefiks OFB); ID lama dikutip bila temuan baru memperkuat atau mengoreksinya.

## Metode dan batas kejujuran

- Dibaca dengan Read penuh, `sed`/`cat` dengan CR dibuang, dan `grep`. `plugins/claude-security/workflows/scan.js` (ter-minify, 155 baris, 60 KB) dibaca lewat salinan terformat yang ditulis skrip pemformat sederhana di scratchpad (`w9b-pretty.mjs`: hanya memecah baris pada `;`, `{`, `}` di luar string; tidak mengevaluasi isi file). Nomor baris `scan.js` di bawah merujuk salinan terformat itu (1.027 baris), bukan file asli.
- Tidak ada skrip, hook, atau binari sumber yang dijalankan. Satu-satunya eksekusi kode adalah skrip kecil saya sendiri di scratchpad (`w9b-tally.mjs`, `w9b-redos.mjs`, `w9b-glob.mjs`, dan `node -e` inline) yang **menyalin teks regex** dari `E:\Projects\Agent-Core\src` ke skrip lalu mengukur waktu/hitungan pada string sintetis atau membaca teks `src` secara baca-saja. Kode Agent Core itu sendiri tidak diimpor atau dijalankan. Semua angka waktu di bawah berasal dari salinan regex, pada mesin ini (Node 24.16.0); angka ekstrapolasi saya tandai.
- Tidak ada yang ditulis di `E:\Projects\Agent-Core`. Satu-satunya file yang ditulis selain skrip scratchpad adalah file ini.
- Claude-security berlisensi proprietary (lihat W4): semua temuan bersumber di sana ditulis ulang sebagai ide umum; tidak ada kalimat/kode disalin. Plugin lain dalam irisan ini Apache-2.0 menurut W4/W5 (LICENSE tidak saya hash ulang).

## Bagian A — Ledger cakupan (hanya unit yang saya tutup)

Kolom "dibaca": **penuh** = seluruh teks; **sebagian** = rentang baris yang disebut; **skim** = kepala file/outline/grep terarah; **katalog nama** = nama tes + docstring lewat ekstraksi, tanpa membaca badan tes; **tidak** = tidak dibaca (alasan di kolom disposisi). Jumlah file adalah jumlah file terlacak yang saya sentuh dalam unit itu.

| Unit | File | Dibaca | Disposisi | Alasan | ID |
| --- | ---: | --- | --- | --- | --- |
| claude-security `scripts/write_scan_meta.py` | 1 | penuh (551 baris) | ADAPT (ide) | Meta pemindaian dari git sendiri: revisi `self-reported`, `dirty`, sparse checkout, symlink tak diikuti, biner → baris `None` bukan 0 | GCB-09 |
| claude-security `scripts/save_result.py` | 1 | penuh (534) | ADAPT (ide) | Pelipatan hasil, hitung cakupan terhadap pohon (`checked()`), rantai verifikasi | GCB-01, GCB-09, GCB-10 |
| claude-security `scripts/render_report.py` | 1 | sebagian ±60% (1–212, 354–493, 612–782) | ADAPT (ide) | `verification_summary` (status hanya `verified` bila terbukti), taksonomi notifikasi cakupan, `one_per_site`; penulisan produk/penghapusan run-dir tidak dibaca | GCB-09, GCB-06 |
| claude-security `scripts/patch_artifacts.py` | 1 | sebagian ±55% (1–435, 525–720) | ADAPT (ide) | Validasi lintas-bidang rekaman unit, klaim tiga-lensa, `git apply --check`; penulis catatan/pembersih tidak dibaca | GCB-10 |
| claude-security `scripts/lib/{absolute,finding,sarif,source,strictjson}.py` | 5 | penuh | ADAPT (ide) | Validasi temuan, sidik jari berbasis konteks, penempatan baris lewat kutipan, JSON ketat | GCB-06, GCB-10 |
| claude-security `scripts/lib/cwe-categories.json` | 1 | tidak | TOLAK | Data CWE 30 KB; cukup ID CWE (lihat OFA-02, Bagian C W4) | — |
| claude-security `workflows/scan.js` | 1 | penuh (salinan terformat) | REFERENSI + ADAPT (ide cakupan) | Objek `coverage` lengkap, aturan kelengkapan inventaris, panel 2-dari-3, severity hanya turun, batas anggaran dicatat | GCB-01, GCB-09, GCB-10 |
| claude-security `hooks/hooks.py` | 1 | skim (kepala + outline) | TOLAK | Telemetri dengan kode peristiwa, banner, "tip" setelah push | Bagian C |
| claude-security `skills/.../jobs/scan-codebase.md` | 1 | sebagian (57–126 dibaca; 1–56 skim W4) | REFERENSI | Aturan pelaporan: "jangan klaim lebih dari stempel", `verified` tidak mencakup peneliti yang tidak kembali, laporan kosong adalah hasil sah | GCB-09 |
| claude-security `skills/.../jobs/suggest-patches.md` | 1 | skim (hanya heading) | REFERENSI | Tidak dibaca ulang; isi sudah dirangkum OFA-07 | OFA-07 |
| security-guidance `hooks/patterns.py` | 1 | penuh (361 baris, dibaca ulang) | ADAPT | Sumber regex/gerbang jalur yang diukur terhadap scanner | GCB-02, GCB-08 |
| security-guidance `hooks/llm.py` | 1 | sebagian (1300–1469 penuh: rubrik; outline seluruh file) | ADAPT rubrik; TOLAK pemanggil model | Daftar kategori dan "DO NOT flag" jadi bahan aturan/pengecualian deterministik; sisanya SDK/gateway/cache model | GCB-08 |
| security-guidance `hooks/gitutil.py` | 1 | sebagian (1380–1720 penuh + grep) | ADAPT | Kebijakan klasifikasi berkas, nama bentuk-rahasia, prioritas bila melebihi batas | GCB-07 |
| security-guidance `hooks/extensibility.py` | 1 | sebagian (240–354 penuh) | ADAPT | Validasi aturan pengguna + heuristik ReDoS (alternasi tumpang-tindih) | GCB-03 |
| security-guidance `hooks/security_reminder_hook.py` | 1 | sebagian (1700–1745 + grep `skip_reason`) | REFERENSI | Prinsip "meninjau yang paling berisiko lebih baik daripada tidak sama sekali", `diff_files_dropped` | GCB-01, GCB-07 |
| security-guidance `tests/` — `test_untracked_cap`, `test_secret_shaped_paths`, `test_patterns_file_shape`, `test_diff_parsing`, `test_findings_delivery` | 5 | penuh | ADAPT | Kasus tepi konkret untuk uji scanner/parser diff | GCB-05 |
| security-guidance `tests/` — 35 `test_*.py` lain | 35 | katalog nama + docstring (ekstraksi `def test_`) | REFERENSI | Daftar kasus tepi (indeks git sementara, kunci lock, repo bersarang, batch path per byte); sebagian besar terikat model/SDK/gateway | GCB-05 |
| security-guidance `tests/conftest.py` | 1 | tidak | TOLAK | Fixture hook; tidak relevan | — |
| hookify `hooks/userpromptsubmit.py` | 1 | penuh | TOLAK | Eksekutor hook generik: selalu `exit 0`, galat impor jadi `systemMessage`; sama dengan tiga hook tetangga (W4) | Bagian C |
| code-modernization `scripts/proof_pack.py` | 1 | sebagian ±62% (1–750 penuh; 750–1020 penulis markdown/JSON tidak dibaca) | ADAPT | Aturan vonis, `suite_evidence`, `source_check`, canary, fresh inputs | GCB-11, GCB-12 |
| code-modernization `scripts/baseline_diff.py` | 1 | sebagian ±55% (1–120, 200–460, 587–787) | ADAPT | Tabel regex ringkasan runner, taksonomi regresi/kegagalan baru/dilewati/hilang | GCB-12 |
| code-modernization `scripts/compare.py` | 1 | sebagian ±55% (1–75, 269–450) | ADAPT | `self_check` (pembanding membuktikan ia bisa gagal), toleransi bertanda alasan | GCB-11 |
| code-modernization `scripts/{trace_rules,uplift_checks,make_shards,render_rules}.py` | 4 | skim (docstring 1–38) | REFERENSI | Heuristik "tes menyebut aturan", batas 25% tes berubah, pembagian shard | GCB-12 |
| code-modernization `scripts/tests/test_report_tools.py` | 1 | sebagian (605–790 penuh + nama seluruh tes) | ADAPT | Uji kontrak halaman: kontras WCAG, tanpa URL eksternal, korpus URL | GCB-17 |
| code-modernization `scripts/tests/` — `test_proof_rules_run`, `test_compare_tolerance`, `test_rules_tools`, `test_report_next` | 4 | katalog nama | REFERENSI | Kasus tepi bukti/komparator | GCB-11, GCB-12 |
| code-modernization `scripts/tests/test_proof_tools.py` | 1 | tidak dibaca ulang (nama sudah di W4) | REFERENSI | 137 KB; OFA-08/09 memuat nama kunci | OFA-09 |
| code-modernization `scripts/tests/test_telemetry.py` | 1 | tidak | TOLAK | Telemetri | Bagian C |
| code-modernization `tests/hostile.test.ts`, `tests/fixtures/inputs.ts` | 2 | penuh | ADAPT | Matriks bentuk-hostile × parser dengan batas 1 detik; fixture input TUI | GCB-05 |
| code-modernization `tests/{verification,logic,mount}.test.ts` | 3 | katalog nama | REFERENSI | Vonis palsu dibuang, nama modul bukan satu token tidak masuk perintah | GCB-05, GCB-11 |
| code-modernization `tests/{register,stacks}.test.ts`, `tests/fixtures/{stacks,workspace,world}.ts` | 5 | tidak | TOLAK | API pane TUI Claude Code dan data fixture-nya; tidak ada padanan | Bagian C |
| plugin-dev `skills/plugin-structure/references/manifest-reference.md`, `component-patterns.md`; `skills/skill-development/SKILL.md`; `skills/command-development/references/frontmatter-reference.md` | 4 | penuh | ADAPT | Aturan jalur komponen, frontmatter perintah, konvensi penulisan Skill | GCB-13, GCB-15, GCB-16 |
| plugin-dev `skills/hook-development/SKILL.md`, `skills/plugin-structure/SKILL.md` | 2 | sebagian (1–200; ±55% terpadatkan) | REFERENSI | Format `hooks.json` pembungkus vs pengaturan, jenis hook `command`/`prompt`, `${CLAUDE_PLUGIN_ROOT}` | GCB-14 |
| plugin-dev `skills/agent-development/SKILL.md`, `skills/mcp-integration/SKILL.md` | 2 | skim (frontmatter + heading) | REFERENSI | Bidang frontmatter agen, empat jenis transport MCP, ekspansi `${ENV}` | GCB-14 |
| plugin-dev — 52 file lain (akar 3: plugin.json/LICENSE/README; 3 agen; `create-plugin.md`; agent-development 6; command-development 10; hook-development 10; mcp-integration 6; plugin-settings 8; plugin-structure 4; skill-development 1) | 0 baru | **tidak dibaca ulang** (W5 judul/skim) | REFERENSI / TOLAK | Celah yang **tidak tertutup**: format perintah warisan, contoh panjang, skrip bash hook (bash/jq), `plugin-settings` (penyimpanan paralel ditolak W5) | — |
| mcp-server-dev `build-mcp-server/references/{resources-and-prompts,remote-http-scaffold,deploy-cloudflare-workers}.md` | 3 | penuh | REFERENSI | Primitif resource/prompt, daftar periksa penerapan HTTP jarak jauh | GCB-20 |
| skill-creator `scripts/package_skill.py` | 1 | sebagian (1–60) | REFERENSI | `evals/` di akar tidak ikut paket | GCB-16 |
| skill-creator `scripts/{generate_report,utils}.py`, `assets/eval_review.html`, `eval-viewer/viewer.html` | 4 | skim (kepala, `def`, grep URL) | TOLAK/REFERENSI | Penampil memakai CDN (viewer ber-SRI; eval_review tanpa) — cukup OFB-09 | OFB-09 |
| math-proof `skills/siege/scripts/ledger.py` | 1 | penuh (663 baris) | REFERENSI | Gerbang mekanis, sentinel akhir jawaban, penghitung percobaan milik skrip, gagal-tertutup | GCB-18 |
| math-proof `skills/siege/SKILL.md` | 1 | sebagian ±71% (1–360, 600–732; 360–600 = brief hakim, hanya sampel) | REFERENSI | Orkestrator tidak membaca jawaban, `state.md` sebagai satu-satunya memori, pemeriksaan "berdiri sendiri" | GCB-18 |
| math-olympiad `scripts/{check_latex,compile_pdf}.sh` | 2 | penuh | TOLAK | Kompilasi LaTeX dari `body.tex` tak tepercaya | GCB-19, Bagian C |
| project-artifact `swe.md` (penuh); `template.html` (skim: kepala/ekor + grep) | 2 | campuran | REFERENSI | Penomoran PR X.Y; blok state JSON tertanam dengan `<` → `\u003c` | GCB-19, GCB-17 |
| session-report `template.html`, `analyze-sessions.mjs` | 2 | skim (grep escape, 338–352, 405–420; 478–496) | REFERENSI | Pembenaman JSON tanpa escape `<` (mitigasi parsial) | GCB-17 |
| playground `templates/{code-map,concept-map,data-explorer}.md` | 3 | penuh | REFERENSI | Contoh `innerHTML` tanpa escape pada data-explorer | GCB-19 |
| `.github/scripts/validate-frontmatter.ts`, `.github/workflows/validate-plugins.yml` | 2 | penuh | REFERENSI | Validator toleran: mengutip nilai berkarakter khusus YAML sebelum parse; invarian bertingkat | GCB-16 |
| `.github/` lainnya (policy 2, scripts 2, workflows 8, bump-tracking 1) | 0 baru | **tidak dibaca ulang** (W5 sudah penuh) | — | Tidak ada celah baru | — |

### Hitungan cakupan putaran ini

Jumlah file yang saya sentuh: 114 (tidak termasuk baris "0 baru"). Rincian: **penuh 33** (29%), **sebagian 15** (13%), **skim 15** (13%), **katalog nama 42** (37%), **tidak 9** (8%). Rincian per unit: claude-security 14 (8/3/2/0/1), security-guidance 46 (6/4/0/35/1), hookify 1 (1/0/0/0/0), code-modernization 24 (2/4/4/7/7), plugin-dev 8 (4/2/2/0/0), mcp-server-dev 3 (3/0/0/0/0), skill-creator 5 (0/1/4/0/0), math-proof 2 (1/1/0/0/0), math-olympiad 2 (2/0/0/0/0), project-artifact 2 (1/0/1/0/0), session-report 2 (0/0/2/0/0), playground 3 (3/0/0/0/0), `.github` 2 (2/0/0/0/0).

**Yang belum tertutup dan harus dianggap tidak tertutup**: 52 file plugin-dev di luar enam yang saya baca (hanya judul/skim dari W5), 35 tes security-guidance hanya nama, `proof_pack.py` baris 750–1020, `render_report.py` ±40%, `patch_artifacts.py` ±45%, badan brief hakim siege (360–600), `jobs/suggest-patches.md`, `registrasi/pane` TUI code-modernization.

---

## Bagian B — Temuan

Urutan menurut nilai. Semua usulan tidak menambah teks selalu-dimuat dan tidak butuh skema tool baru kecuali dinyatakan; hasil `code_analysis` dikembalikan lewat `textResult` JSON bebas bentuk (`code-intelligence-tools.ts`, tidak ada `outputSchema` pada tool itu menurut grep W4).

### GCB-01 Scanner `changed_source`: laporan cakupan tidak jujur (batas 128 senyap, "clean" palsu, satu file tak terbaca membatalkan semuanya, "resolved" palsu, baris terpotong tanpa jejak)
- Sumber: `E:\Projects\Agent-Core\src\code-intelligence\changed-source-security.ts:36-42` (konstanta), `:117` (`.slice(0, MAX_FILES)`), `:124-160` (loop per file), `:130-131` (`skipped`), `:139` (`.slice(0, MAX_LINE_CHARS)`), `:156-160` (hanya `ENOENT` ditangkap), `:163-171` (`lifecycle`/`resolved`), `:176-187` (hasil); `src/mcp/code-intelligence-tools.ts:439` (`outcome: scan.findings.length ? 'findings' : 'clean'`). Donor: `claude-security/scripts/save_result.py:221-265` (`checked()`: file ditugaskan / dibaca / dinyatakan tak-tercapai / tak-teraccount), `scripts/render_report.py:680-758` (notifikasi `coverage/skipped-component`, `coverage/sparse-checkout`, `coverage/unaccounted-top-level-dirs`, `coverage/unfollowed-symlinks`, `coverage/files-not-reached`, `coverage/unverified-by-cap`), `workflows/scan.js` (objek `coverage`: `droppedComponents`, `skippedComponents`, `unaccountedTopLevelDirs`, `researchersDispatched/Returned`, `lostResearchers`, `completenessCheckOutcome`, `inventoryFallback`), `security-guidance/hooks/security_reminder_hook.py:1700-1745` ("meninjau nol file lebih buruk daripada meninjau 30 yang paling berisiko"; `diff_files_dropped`; skip 31 hanya untuk kasus patologis >10× batas), `code-modernization/scripts/proof_pack.py:291-335` ("walk yang tidak selesai adalah 'not checked', tidak pernah 'untouched'").
- Observasi: (1) berkas ke-129 dan seterusnya dibuang sebelum `filesRequested` dihitung (`:117` dahulu, `:180` kemudian), jadi hasil tidak pernah menyebut pemotongan. (2) `skipped` hanya berisi `not-regular-file`, `size-limit`, `missing`; berkas yang gagal dibaca dengan `EACCES/EPERM/EBUSY` (dugaan, tidak diuji; plausibel di Windows) atau yang berada di bawah direktori symlink/junction yang keluar dari akar (`SECURITY_ADVISORY_REALPATH_ESCAPE` dilempar di `:134`) **melempar kesalahan dan membatalkan seluruh scan**, termasuk temuan dari 127 berkas lain. (3) Tracker mencatat `clean` bila `findings.length === 0` walau ada berkas dilewati/dibuang. (4) `resolved = previous − current` (`:170`) menganggap temuan "selesai" bila berkas yang sama kini dilewati (mis. tumbuh >1 MB → `size-limit`) atau baris bergeser (kunci memuat nomor baris, `:101-103`); jadi "resolved" bisa berarti "tidak dipindai". (5) Baris >20.000 karakter dipotong tanpa laporan (`:139`): kode ter-minify satu baris kehilangan semua temuan setelah karakter ke-20.000. (6) `ruleApplies` (glob `include/exclude`) dipanggil di dalam loop baris (`:141`), jadi biaya glob dikali jumlah baris × aturan (lihat GCB-03).
- Nilai untuk Agent Core: Controller mengambil keputusan dari `clean` dan `resolved`. Satu `clean` yang sebenarnya "tidak memeriksa 40 dari 168 berkas" adalah pelanggaran kejujuran, persis kelas yang dijaga donor.
- Baseline Agent Core: `skipped`, `filesScanned`, `sourceMutated:false` ada; cakupan terpotong, kegagalan per-berkas, dan syarat `clean` tidak ada. Tidak ada tes scanner (grep `changed-source-security|scanChangedSourceSecurity` di `src tests scripts` hanya mengenai dua berkas `src`). Panjang baris terpanjang di `src` AC 3.202 karakter dan 0 baris >20.000 (pengukuran `w9b-tally.mjs` atas 404 berkas .ts/.tsx/.mjs/.js, 4,3 MB) → pemotongan baris tidak aktif pada kode AC sendiri, tetapi aktif pada bundel/hasil build yang diserahkan Controller. → **SEBAGIAN** (memperkuat OFA-01(c), OFA-03, OFA-04; mengoreksi OFA-04 bagian "tracker cukup" dengan satu invarian wajib).
- Delta/celah: tambah ke hasil `coverage: { requested, accepted, scanned, skipped:[{file,reason}], dropped:{count, first:[≤10 nama]}, truncatedLines:[{file,line}], verdict:'complete'|'partial'|'nothing-scanned' }` dengan himpunan `reason` tertutup (`not-regular-file`, `size-limit`, `missing`, `unreadable:<kode>`, `outside-root`, `binary`, `generated-or-vendored`, `over-file-cap`, `time-budget`). Invarian: `outcome:'clean'` hanya bila `verdict==='complete'` dan `findings===0`; selain itu `partial`/`unavailable`. `resolved` dihitung hanya atas berkas yang **dipindai di kedua putaran**; sisanya masuk `resolvedUnverified`. Tangkap galat per berkas (jangan lempar) dan tetap sebut `outside-root` sebagai alasan skip. Bila berkas melebihi batas, pilih menurut prioritas risiko (token jalur seperti `auth|exec|spawn|shell|token|secret|request|http|parse`; sufiks bersuasana-rendah di belakang) dan catat jumlah yang dibuang, jangan potong urutan masuk; lewati sepenuhnya hanya bila >10× batas dengan alasan eksplisit (donor).
- Cara adaptasi: `src/code-intelligence/changed-source-security.ts` + 6 baris di `src/mcp/code-intelligence-tools.ts` (pemetaan outcome); hasil tetap `textResult`. Tes di GCB-05. Konstanta `MAX_FILES` dinaikkan hanya bila terbukti perlu; jangan tambah parameter input (itu skema).
- Lisensi/hak cipta: claude-security proprietary → hanya ide; `security_reminder_hook.py` dan `proof_pack.py` Apache-2.0 (parafrase).
- Perkiraan skala: S–M · Risiko: rendah (hanya menambah bidang dan mengetatkan label) · Nilai: tinggi · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi dari kode: urutan `slice`→`filesRequested`, tipe galat yang ditangkap, pemetaan `clean`, kunci `resolved`. Dugaan: frekuensi `EACCES/EBUSY`/junction di sesi nyata; berapa sering Controller menyerahkan >128 berkas.
- Disposisi: **ADOPT**

### GCB-02 False positive `exec(`/`eval(`/TLS terukur: 80 baris → 3 pada kode AC sendiri; aturan perlu gerbang jalur dan pengecualian deklarasi
- Sumber: `changed-source-security.ts:45-47`; donor `security-guidance/hooks/patterns.py:71-94` (lookbehind `(?<![a-zA-Z0-9_\.])exec\(` dan gerbang ekstensi JS), `:103-110` (eval: lewati dokumen), `:204-208` (TLS: `NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0`), `:112-133` (komentar donor tentang FP "docs/example HTML … (#410)").
- Observasi: Saya menyalin tiga regex bawaan AC dan menerapkannya baris demi baris ke 404 berkas `.ts/.tsx/.mjs/.js` di `E:\Projects\Agent-Core\src` (tanpa `node_modules`): `AC.SECURITY.SHELL.EXEC` (severity **high**) cocok di **80 baris**, hampir semuanya `RegExp.exec` (contoh: `auth/artifact-authorization.ts:73`, `code-intelligence/service.ts:37`, bahkan `changed-source-security.ts:143` sendiri); `AC.SECURITY.TLS.DISABLED` cocok di 1 baris yang adalah **definisi aturan itu sendiri** (`:47`). Dengan lookbehind `(?<![\w.$])(?:exec|execSync)\s*\(` ditambah `\bchild_process\.exec(?:Sync)?\s*\(`, hasil turun ke **3 baris**: `phone/adb.ts:47` (deklarasi metode `private exec(`: tetap FP), serta `rdc/utils/ripgrep-resolver.ts:40` dan `rdc/utils/system-info.ts:475` (`execSync` dengan templat `${…}`; kandidat sungguhan yang layak ditinjau manusia, sumber nilai `systemRg`/`cmd` tidak saya telusuri).
- Nilai untuk Agent Core: Severity `high` yang menyala 80 kali pada TypeScript biasa membuat advisori diabaikan; padahal dua dari tiga sisanya adalah titik injeksi shell yang sah dilihat.
- Baseline Agent Core: tidak ada lookbehind, tidak ada gerbang jalur bawaan (aturan bawaan tidak punya `include`), tidak ada pengecualian deklarasi/definisi-aturan. → **SEBAGIAN** (mengukur dan memperkuat OFA-01(a,b); OFA-01 menyebut 77 pemakaian `.exec(` — 80 adalah hitungan baris yang dicocokkan regex AC asli, termasuk 3 tanpa titik).
- Delta/celah: (a) JS/TS: `(?<![\w.$])(?:exec|execSync)\s*\(` + `child_process.exec*`; tandai `high` hanya bila argumen pertama adalah templat dengan `${` atau konkatenasi `+`, selain itu `medium`; kecualikan baris deklarasi (`^\s*(?:(?:public|private|protected|static|async)\s+)*exec\w*\s*\(…\)\s*(?::[^={]+)?\{`) dan `function exec`. (b) `os.system`, `subprocess…shell=True`: hanya `.py/.pyi`. (c) TLS: `NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0`, `verify\s*=\s*False` hanya `.py`, `rejectUnauthorized\s*:\s*false` JS/TS; abaikan target `localhost|127.0.0.1|::1`. (d) `eval(`: `(?<![\w.$])eval\s*\(` dan lewati ekstensi dokumen. (e) Jangan memindai berkas yang mendefinisikan aturan (pola aturan sendiri) atau beri penanda penekan opsional `security-advisory-ignore <ID>: alasan` yang **dihitung dan dilaporkan** di `coverage.suppressed` (usulan saya, bukan dari donor; wajib tes).
- Cara adaptasi: `BUILTIN_RULES` + `ruleApplies` di berkas yang sama; tambahkan `include` bawaan per aturan memakai mekanisme `include` aturan proyek yang sudah ada.
- Lisensi/hak cipta: Apache-2.0 (`patterns.py`); regex sederhana ditulis sendiri.
- Perkiraan skala: S · Risiko: rendah-sedang (regex baru bisa menurunkan recall: wajib kasus positif dan negatif) · Nilai: tinggi · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: hitungan 80→3 (skrip baca-saja `w9b-tally.mjs`), baris contoh. Dugaan: kebenaran regex deklarasi (belum diuji pada korpus lain); kelayakan dua `execSync` sebagai kerentanan nyata.
- Disposisi: **ADOPT**

### GCB-03 ReDoS pada scanner: penjaga aturan proyek meloloskan alternasi tumpang-tindih, dan glob `include/exclude` menjadi regex `.*` berantai
- Sumber: `changed-source-security.ts:64-69` (`globRegex`: `*` → `.*`), `:71-93` (`compileProjectRule`; penjaga di `:76`), `:138-141` (`ruleApplies` per baris). Donor: `security-guidance/hooks/extensibility.py:326-353` (`_REDOS_SHAPES` + `_ALT_UNDER_REP`: cabang yang menjadi awalan cabang lain di bawah pengulangan), `tests/test_patterns_file_shape.py` (satu aturan buruk tidak membuang sisanya; `a{99999999999}`).
- Observasi (pengukuran pada salinan regex): (1) Penjaga AC (`\\[1-9]`, `\([^)]*[+*][^)]*\)[+*{]`, `\.\*.*\.\*`) **tidak menolak** `(a|aa)+$` (ketiganya `false`). Pada string `'a'×n + 'b'` waktu eksekusi: n=34 → 471 ms, n=36 → 1.242 ms (≈1,6× per karakter tambahan; n=44 ≈ satu menit, ekstrapolasi). Satu baris perubahan sepanjang 40+ karakter `a` dengan aturan itu mengunci event loop server MCP. (2) `globRegex('*a'×6 + '*b')` terhadap jalur `'a'×60`: **5,6 detik**; delapan bintang tidak selesai dalam 54 detik. Batas AC hanya 16 glob × 160 karakter, jadi glob patologis mudah dibuat; dan karena `ruleApplies` dipanggil per baris, biayanya dikalikan jumlah baris.
- Nilai untuk Agent Core: `securityRules` dan glob datang dari parameter tool yang diisi Controller (bisa terkena prompt-injection). Server MCP berutas tunggal; satu aturan ber-ReDoS membekukan semua tool, bukan hanya scanner.
- Baseline Agent Core: OFA-02 menilai "aturan tambahan: SUDAH-ADA"; ukuran ini mengoreksinya menjadi **SEBAGIAN** (batas jumlah/panjang ada, penjaga ReDoS tidak lengkap, glob tidak dijaga sama sekali). Tidak ada tes.
- Delta/celah: (a) tambahkan pemeriksaan alternasi-awalan donor (`(a|aa)*`, `(ab|a)+`) dan dua bentuk `\(\.\*…\)[+*]`; (b) ganti `globRegex` dengan pencocok glob linear (pisahkan pada `*`, cocokkan potongan berurutan dua-penunjuk; atau gandakan `*` berurutan lalu DP O(n·m)); (c) hoist `ruleApplies` ke luar loop baris (sekali per berkas per aturan); (d) beri baris-maksimum lebih pendek untuk aturan proyek (mis. 2.000 karakter) dan anggaran waktu per scan yang memeriksa `performance.now()` antar-berkas dan melaporkan `time-budget`; (e) akui bahwa semua ini heuristik (donor menyebut "Not a proof").
- Cara adaptasi: berkas yang sama; tes `tests/changed-source-security.test.ts` dengan korpus ReDoS (GCB-05).
- Lisensi/hak cipta: Apache-2.0 → tulis ulang.
- Perkiraan skala: S · Risiko: rendah · Nilai: tinggi · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi (salinan regex, Node 24.16.0): waktu di atas. Ekstrapolasi: n=44 dan seterusnya. Dugaan: bahwa Controller akan pernah memberi aturan seperti itu.
- Disposisi: **ADOPT**

### GCB-04 Adapter plugin Claude: ReDoS dari `SKILL.md` tak tepercaya (regex tautan kuadratik 16 detik per 100 KB), regex komentar frontmatter, dan frontmatter tanpa batas pada jalur adaptasi
- Sumber: `E:\Projects\Agent-Core\src\skills\claude-plugin.ts:195` (regex tautan), `:193` (hapus blok kode), `:138` (`value.replace(/\s+#.*$/, '')`), `:301` (pemanggilan di dalam `adaptClaudeSkill`, `:295`, sebelum parse ketat), `:211` (`adaptFrontmatter` tanpa batas ukuran frontmatter); `src/skills/service.ts:23,26,128-132` (`MAX_FILE_BYTES` 2 MiB, `MAX_FRONTMATTER_BYTES` 64 KiB hanya di parser ketat). Donor sebagai pola uji: `code-modernization/tests/hostile.test.ts` (21 bentuk × 12 parser, tiap pembacaan ≤1.000 ms pada baris 100.000 karakter).
- Observasi (salinan regex, Node 24.16.0): (1) `/\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^)]*["'])?\s*\)/g` pada `'](' × 50.000` (100.000 karakter) = **16,3 detik**; pada `'](a "' × 16.666` = 1,1 detik. Perilaku kuadratik: tiap `](` memindai sampai akhir karena tidak ada `)`. Dengan batas file 2 MiB ekstrapolasi kuadratik ≈ 6.500 detik (±1,8 jam; tidak dijalankan). (2) `scalarText`: `'x' + ' '×60.000 + 'y'` pada `/\s+#.*$/` = 3,5 detik (kuadratik). (3) `findMissingReferences` dipanggil di `adaptClaudeSkill` untuk tiap skill sebelum parser ketat, sehingga `skills(validate)`/preview dari plugin tak tepercaya memicunya; bila frontmatter >64 KiB parser ketat menolak lalu jalur adaptasi memprosesnya **tanpa** batas 64 KiB.
- Nilai untuk Agent Core: Plugin berasal dari repo luar (justru fitur yang baru diadopsi 2026-10-27). Satu `SKILL.md` buatan membekukan server MCP — dan seluruh kemampuan Agent Core — selama menit-jam. Ini kelas cacat yang ditutup donor dengan satu tes matriks.
- Baseline Agent Core: tidak ada tes "hostile text" (`ls tests | grep -i -E "hostile|redos|adversar"` kosong; 224 file tes). → **BELUM-ADA**.
- Delta/celah: (a) batasi teks yang dipindai `findMissingReferences` (mis. 256 KiB pertama) **dan** ikat kuantifier: `/\]\(\s{0,16}<?([^)\s>]{1,256})>?(?:\s+["'][^)\n]{0,256}["'])?\s{0,16}\)/g` — saya ukur 0,3 detik pada 262.144 karakter `'](' ×` dan hasil sama pada contoh normal; (b) komentar frontmatter linear: `const i = value.search(/\s#/); return i < 0 ? value : value.slice(0, i).trimEnd()`; (c) terapkan `MAX_FRONTMATTER_BYTES` juga di `adaptFrontmatter`; (d) tes matriks bentuk × parser (GCB-05) mencakup parser adaptasi, `parseSkillMarkdown`, penemuan Trigger/Non-trigger, dan scanner.
- Cara adaptasi: `src/skills/claude-plugin.ts` (tiga baris) + `tests/skill-claude-plugin.test.ts` atau berkas tes baru `tests/hostile-text.test.ts`.
- Lisensi/hak cipta: pola uji dari Apache-2.0 (`hostile.test.ts`); tulis ulang.
- Perkiraan skala: S · Risiko: rendah (perilaku sama untuk input normal; regex terikat memotong tautan >256 karakter menjadi "tidak cocok") · Nilai: tinggi · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: waktu pada salinan regex, ketiadaan tes hostile, jalur panggil dan batas ukuran dari kode. Dugaan: perilaku `parseSkillMarkdown` strict untuk bentuk yang sama (tidak diukur).
- Disposisi: **ADOPT**

### GCB-05 Katalog kasus uji untuk scanner dan parser hostile (dari tes donor)
- Sumber: `security-guidance/tests/test_untracked_cap.py`, `test_secret_shaped_paths.py`, `test_patterns_file_shape.py`, `test_diff_parsing.py`, `test_findings_delivery.py`, `test_notebook_edit_patterns.py` (nama), `test_review_outcomes.py` (nama), `test_stop_review_paths.py` (nama), `test_stop_diff_memory.py` (nama); `code-modernization/tests/hostile.test.ts`, `tests/verification.test.ts` (nama), `scripts/tests/test_proof_rules_run.py` (nama), `test_report_tools.py` (nama).
- Observasi: Donor menguji perilaku tepi, bukan jalur bahagia: berkas melewati batas diaudit (`preexisting_untracked_excluded`, `diff_files_dropped`); berkas dipindah masuk dengan mtime lama tetap diperiksa; nama berkas bentuk-rahasia positif/negatif (`id_ed25519`, `.env.production.json` vs `src/private_api.py`, `crypto/rsa.py`, `config/credentials.json`); diff dengan teks header palsu di dalam isi berkas; nama berkas dengan kutip/tab/oktal; "review gagal bukan bersih"; pesan tidak boleh memuat isi rahasia; wrong-shape file tidak menyembunyikan aturan lain; satu aturan buruk tidak membuang sisanya; teks sangat panjang tidak boleh lambat; vonis palsu/berlebih dibuang; nama modul bukan satu token tidak masuk perintah.
- Nilai untuk Agent Core: Scanner AC punya nol tes (grep), jadi seluruh perilaku di GCB-01..03 tak terlindungi. Tes tepi donor adalah daftar kasus siap pakai.
- Baseline Agent Core: tidak ada `tests/changed-source-security.test.ts` dan tidak ada tes hostile → **BELUM-ADA**.
- Delta/celah: satu berkas `tests/changed-source-security.test.ts` (vitest 4.1.11 sudah dipakai): (1) per aturan: satu kalimat positif, satu negatif (`RegExp.exec` bukan `SHELL.EXEC`; `model.eval()`; `NODE_TLS_REJECT_UNAUTHORIZED="1"`; `.md` yang menyebut `eval(`); (2) 129 berkas masuk → `dropped.count===1`, `verdict==='partial'`, outcome bukan `clean`; (3) satu berkas `EACCES`/di bawah junction keluar-akar → tercatat `skipped`, berkas lain tetap dipindai; (4) berkas membesar >1 MB di putaran kedua → temuan lamanya **bukan** `resolved`; (5) sisipan satu baris di atas → kunci sama (GCB-06); (6) aturan `(a|aa)+$`, `(a+)+`, `(.*)*`, `\1`, glob 8 bintang → ditolak atau selesai <1 s; (7) baris 20.001 karakter → `truncatedLines`; (8) berkas biner/NUL → `binary`; (9) matriks hostile (spasi, `#`, `[`, `` ` ``, `](`, pipa, digit) × (scanner, `readFields`, `findMissingReferences`, `parseSkillMarkdown`, penemuan Trigger) dengan batas 1.000 ms/100.000 karakter; (10) daftar nama bentuk-rahasia positif/negatif bila kelak ada gerbang jalur-konteks Native (pertanyaan terbuka W4 #5).
- Cara adaptasi: tes saja; tanpa file sementara; fixture sintetis di memori atau folder temp yang dihapus (preferensi pengguna).
- Lisensi/hak cipta: Apache-2.0; kasus ditulis ulang.
- Perkiraan skala: M · Risiko: rendah · Nilai: tinggi · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: lima tes dibaca penuh, nama dari 35 lain. Dugaan: kebutuhan semua kasus.
- Disposisi: **ADAPT**

### GCB-06 Sidik jari temuan berbasis konteks, ditahan dekat kredensial, dan satu catatan per situs (memperkuat OFA-03)
- Sumber: `claude-security/scripts/lib/sarif.py:30-31,164-228,261-275` (`ID_VERSION="v3"`, `CONTEXT_LINES=3`, `placed_one`, `near`, `fingerprint`, `code_at`), `scripts/lib/source.py` (normalisasi spasi, `placing_row`), `scripts/render_report.py:617-662` (`one_per_site`: temuan dengan (aturan, jalur, baris) sama menjadi satu catatan; yang digabung diungkapkan).
- Observasi: Id = `v3:` + sha256 atas `[rule_id, path_repo, ±3 baris ternormalisasi]`; **bila baris berada dalam jendela ±3 dari baris kredensial, konteks tidak di-hash** dan id jatuh ke nomor baris, agar teks rahasia tidak ikut dalam hash. Satu situs (aturan, jalur, baris) = satu rekaman; penggabungan diumumkan.
- Nilai untuk Agent Core: Mengoreksi usul OFA-03 dengan satu syarat keamanan: hash konteks ±3 baris pada aturan `SECRET.LITERAL` akan memasukkan baris berisi kredensial ke dalam hash; donor sengaja menghindarinya.
- Baseline Agent Core: `findingKey = id:file:line` (`:101-103`) → **SEBAGIAN** (OFA-03 benar; belum ada penanganan kredensial/versi id).
- Delta/celah: kunci = `v1:` + hash(id aturan, file, ±3 baris ternormalisasi spasi) ; untuk temuan `AC.SECURITY.SECRET.*` (atau konteks 3 baris yang memuat cocokan aturan rahasia) pakai nomor baris saja; beri ordinal bila dua konteks identik dalam satu berkas; satukan temuan (aturan, file, baris) ganda.
- Cara adaptasi: `findingKey` dan penghitungan di `scanChangedSourceSecurity`; tidak ada penyimpanan baru (pertanyaan persistensi OFA-03/W4 tetap terbuka).
- Lisensi/hak cipta: claude-security proprietary → teknik umum, tulis ulang tanpa konstanta/kode.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi (kode dibaca penuh). Dugaan: dampak praktis pada sesi nyata.
- Disposisi: **ADAPT**

### GCB-07 Kebijakan klasifikasi berkas untuk scanner: kelas sumber, biner, vendored/generated, nama bentuk-rahasia, prioritas
- Sumber: `security-guidance/hooks/gitutil.py:1434-1443` (`SOURCE_CODE_EXTENSIONS` termasuk `.ps1`, `.sh`, `.sql`, `.tf`, `.yaml`, `.json`), `:1448-1451` (basename tanpa ekstensi: `dockerfile`, `makefile`, `jenkinsfile`, …), `:1462-1467` (daftar-tolak extensionless: `license`, `readme`, …), `:1475-1482` (`SKIP_PATH_PATTERNS`: `node_modules/ dist/ build/ .next/ vendor/ __generated__/ .venv/ target/`; `SKIP_FILE_SUFFIXES`: `.min.js .min.css .d.ts .lock _pb2.py .pb.go`), `:1490-1555` (`_is_secret_shaped`), `:1594-1660` (`_prioritize_diff_files`), `:1663-1699` (`_is_reviewable_source`; komentar: executable tanpa ekstensi adalah kelas false-negative terbesar).
- Observasi: Donor memutuskan *apa yang layak ditinjau* sebelum menjalankan aturan, mencatat jumlah yang dilewati (hanya jumlah, tidak nama) dan memberi prioritas risiko saat melebihi batas.
- Nilai untuk Agent Core: Scanner AC membaca apa saja yang diserahkan Controller, termasuk lockfile, `.min.js`, `dist/`, dan berkas biner (dibaca sebagai UTF-8). Bundel satu baris memicu GCB-01(5).
- Baseline Agent Core: hanya `lstat` (reguler), ukuran, symlink → **SEBAGIAN**.
- Delta/celah: fungsi `classifyFile(path, firstBytes)` → `source | data | generated | vendored | binary | secret-shaped | unknown`; yang bukan `source|data` dicatat di `coverage.skipped` dengan alasan (bukan dibuang diam-diam); deteksi biner = NUL di 8 KiB pertama; `.ps1` dan skrip tanpa ekstensi termasuk sumber; nama bentuk-rahasia (`.env*`, `id_*`, `*_rsa`, `.npmrc`, `.pgpass`, `credentials`) **tetap dipindai lokal** (scanner tidak mengirim ke luar) tetapi temuannya tidak memuat nilai (sudah demikian) dan ditandai `secret-shaped` agar jalur konteks Native tidak menyalinnya.
- Cara adaptasi: fungsi baru di berkas scanner; tes pakai daftar positif/negatif donor (GCB-05).
- Lisensi/hak cipta: Apache-2.0; himpunan ekstensi/nama adalah fakta; tulis ulang.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: daftar dibaca penuh. Dugaan: apakah `.ipynb`/`.json` layak masuk kelas `data` bagi pengguna AC.
- Disposisi: **ADAPT**

### GCB-08 Aturan dan pengecualian tambahan dari rubrik review (deterministik, tanpa model)
- Sumber: `security-guidance/hooks/llm.py:1326-1453` (rubrik dan "DO NOT flag"), `hooks/patterns.py:30-276`.
- Observasi: Rubrik donor memuat banyak pola yang dapat dideteksi regex murah dan bukan hanya LLM: `env: {...process.env, ...untrusted}` ke `spawn/exec/Popen` (variabel pembajak `LD_PRELOAD`, `NODE_OPTIONS`, `PYTHONPATH`, `BASH_ENV`, `GIT_SSH_COMMAND`, `PATH`), `Math.random()`/`random.`/`math/rand` pada nilai bernama `token|secret|session|nonce|apikey|reset`, penulisan berkas kredensial dengan mode `0o644/0o666` tanpa 0o600, `--dangerously-skip-permissions|bypassPermissions`, `uses:` pihak ketiga tanpa SHA-40 pada alur yang memakai `secrets.*`, `Condition … :sub … :*`, hash kata sandi MD5/SHA1/SHA256, EJS `<%-`, Jinja `Environment()` tanpa `autoescape`, `redirect(request.args.get('next'))`. Daftar "jangan laporkan": konfigurasi non-kredensial, fallback pengembangan `|| 'dev-…'`, kunci telemetri klien, target `localhost`, berkas tes/seed/skrip (skeptis terhadap kerentanan web), DoS.
- Nilai untuk Agent Core: OFA-02 sudah mendaftar ±12 aturan; yang kurang: (i) pengecualian "jangan laporkan" sebagai heuristik penurun-bising, (ii) tiga aturan yang relevan dengan kode AC sendiri (spawn dengan `env` yang disebar, `Math.random` untuk token, mode berkas kredensial), (iii) aturan Windows/PowerShell (inferensi saya, bukan donor): `Invoke-Expression|\biex\b` pada nilai non-literal, `-EncodedCommand|-enc\b`, `-ExecutionPolicy\s+Bypass`, `DownloadString\(|Invoke-WebRequest[^|]*\|\s*iex`, `cmdkey`, `Start-Process[^\n]*-Verb\s+RunAs` karena host AC adalah Windows + PowerShell.
- Baseline Agent Core: tujuh aturan, tanpa pengecualian kontekstual → **SEBAGIAN** (menambah delta pada OFA-02, tidak mengulang).
- Delta/celah: `SECRET.LITERAL`: turunkan ke `low`/lewati bila jalur `tests?|fixtures?|seed|__mocks__|examples?|\.example`, nilai berisi `example|changeme|xxx+|<.*>|\$\{|process\.env`, atau ada `|| '…dev…'`; TLS: lewati host loopback; aturan baru dengan `confidence:'low'` dan `cwe`. Semua dengan tes positif/negatif.
- Cara adaptasi: `BUILTIN_RULES` + berkas tes GCB-05; tidak ada rumah penyimpanan baru.
- Lisensi/hak cipta: Apache-2.0; parafrase. Aturan PowerShell: tulis sendiri.
- Perkiraan skala: M · Risiko: sedang (FP/FN per aturan) · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: teks rubrik. Dugaan: efektivitas regex tunggal-baris untuk pola multi-baris (donor mengakui keterbatasan yang sama pada `yaml.load`).
- Disposisi: **ADAPT**

### GCB-09 Kontrak "blok cakupan" lintas-alat dan taksonomi alasan tertutup (memperluas OFA-04)
- Sumber: `claude-security/scripts/render_report.py:367-493` (status `verified|unverified` dengan `reason_kind` tertutup: `no-vote-record`, `no-candidate-count`, `nothing-examined`, `finding-panel-incomplete`, `finding-below-quorum`, `candidates-not-paneled`, `no-panel-completed`, `candidate-panel-incomplete`, `continuation-incomplete`, `findings-refused`), `:680-758` (notifikasi bertingkat `note|warning|error` dengan id berawalan `coverage/…`, `verification/…`, `finding/merged`, `cwe/unrecognized`; kalimat dengan "at least/at most" bila hitungan terpotong), `scripts/write_scan_meta.py:120-161,185-205,277-357` (revisi `revision_source:"self-reported"`, `dirty`, `sparse`+`not_checked_out_dirs`, symlink akar tak diikuti dan disebut, baris diff `None` bila biner — bukan 0), `workflows/scan.js` (setiap input yang tak terbaca "dicatat dan diabaikan, laporan akan menyebutnya"; `completenessCheckOutcome: checked|not-checkable|partial|not-applicable`), `jobs/scan-codebase.md:106-122` ("jangan klaim lebih dari stempel", `verified` tidak mencakup peneliti yang tak kembali, laporan kosong adalah hasil sah).
- Observasi: Pola yang konsisten: (1) status positif hanya bila **dibuktikan**; (2) setiap derogasi punya kode tertutup + kalimat, bukan teks bebas; (3) hitungan yang terpotong ditulis sebagai batas bawah/atas; (4) "tidak diketahui" ≠ 0 ≠ gagal; (5) input yang tak terbaca dicatat, tidak diam-diam dipaksa; (6) deskripsi hanya memakai alasan yang tercatat.
- Nilai untuk Agent Core: Banyak hasil advisori (scanner, `code_analysis` penyedia, preview plugin, fingerprint workspace) mengembalikan JSON ad hoc; Controller menyusun narasi "bersih" tanpa kontrak.
- Baseline Agent Core: OFA-04 mengusulkan referensi Skill `finding-report.md`; belum ada daftar kode alasan tertutup atau aturan kata "paling sedikit/paling banyak" → **SEBAGIAN**.
- Delta/celah: tambahkan ke `finding-report.md` (≤6 KB, sudah diusulkan OFA-04) satu tabel kode alasan tertutup (`over-cap`, `unreadable`, `outside-root`, `binary`, `generated`, `time-budget`, `unaccounted`, `not-run`, `sparse`, `unfollowed-symlink`) dan aturan frasa; di kode, ekspor satu tipe `CoverageReason` dipakai scanner dan preview plugin.
- Cara adaptasi: Skill reference + tipe TS kecil di `src/code-intelligence/` (owner existing); tanpa tool baru.
- Lisensi/hak cipta: claude-security proprietary → hanya prinsip; tidak ada kalimat disalin.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang-tinggi · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: kode dibaca. Dugaan: sejauh mana Controller menyusun laporan serupa secara ad hoc.
- Disposisi: **ADAPT**

### GCB-10 Invarian lintas-bidang pada rekaman hasil/vonis, penghitung percobaan milik skrip, gagal-tertutup
- Sumber: `claude-security/scripts/patch_artifacts.py:80-95,220-254,257-299,302-332,335-389` (patch_written butuh tiga klaim `CONFIDENT`; jalur serangan yang tidak "set_aside" memblokir; `confirmed:false` ⇒ harus `declined`; `confirmed:false` + `still_reachable` ditolak; `untested` wajib; `attempts≥1`; id unik; unit harus pernah disiapkan), `scripts/lib/finding.py:164-210` (keyakinan dijepit oleh suara panel: `high` hanya bila bulat), `scripts/save_result.py:311-376` (penggabungan menolak shard salah-urut, `received` ≠ pending, effort berbeda, id ganda), `math-proof/skills/siege/scripts/ledger.py:483-567,632-641` (skrip mencatat sendiri RETRY yang sudah diterbitkan sehingga pemanggil yang bingung tak bisa mengulang tanpa batas; semua galat → verdict gagal-tertutup).
- Observasi: Validasi tidak hanya tipe; ia menolak kombinasi yang saling bertentangan dan setiap penolakan menyebut cara memperbaikinya. Penghitung percobaan dimiliki skrip, bukan klaim model.
- Nilai untuk Agent Core: Rekaman Learning/outcome/proposal bisa memuat kombinasi mustahil (mis. `outcome:'clean'` dengan cakupan parsial) tanpa penolak.
- Baseline Agent Core: `learning/decision-evidence.ts`, `verified-value-registry` memvalidasi bentuk; invarian lintas-bidang untuk hasil advisori tidak ditemukan lewat grep cepat → **SEBAGIAN** (tidak diperiksa mendalam).
- Delta/celah: satu fungsi `assertOutcomeConsistent(result)` yang dipakai Tracker sebelum `recordOutcome` untuk hasil advisori (invarian GCB-01); pola yang sama dapat dipakai pada rekaman keputusan Skill/proposal bila terbukti perlu.
- Cara adaptasi: internal, di pemanggil `activityTracker.recordOutcome`; tanpa penyimpanan baru.
- Lisensi/hak cipta: patch_artifacts proprietary → pola umum; ledger.py/finding invarian ditulis ulang.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: kode donor. Dugaan: ada rekaman AC lain dengan kombinasi mustahil (tidak dicari).
- Disposisi: **ADAPT**

### GCB-11 Verifier yang membuktikan dirinya bisa gagal: kontrol negatif, "tidak bisa jalan = gagal", "semua keluaran kosong = tak terbukti"
- Sumber: `code-modernization/scripts/compare.py:338-372` (`self_check`: ubah satu byte tak-termaskir pada tiap keluaran legacy; pembanding **harus** melaporkan beda; toleransi dites agar mengubah angka pertama tetap terdeteksi), `:415-427` (`verdict_of`: 0 kasus dieksekusi, kasus hilang, self-check gagal, semua keluaran kosong → tak terbukti), `scripts/proof_pack.py:728-749` (canary: pemecah satu-baris yang hasilnya **diparse** dari file hasil/log; baris "Canary:" di catatan hanyalah klaim), `:291-335` (walk yang tak selesai → "not checked"), `scripts/tests/test_report_tools.py` nama (`test_a_mask_that_hides_everything_fails_the_self_check`, `test_empty_outputs_prove_nothing`, `test_missing_alone_is_never_a_pass`).
- Observasi: Alat bukti dilengkapi uji-diri; angka yang diketik tidak pernah cukup; "nihil diperiksa" tidak sama dengan "bersih".
- Nilai untuk Agent Core: Skrip verifikasi AC (`scripts/verify/*.mjs`, harness REA, penilai Skill) tidak menjamin bahwa penilai bisa gagal; grep `selfCheck|self-check|negative control|canary` hanya menemukan `cumulative-workflow-eval.mjs` dan `native-memory-reuse.mjs` (isi tidak dibaca).
- Baseline Agent Core: `code-review-and-quality` "Verify the Verification" (menurut W4) mencakup eksperimen mutasi tunggal → **SEBAGIAN**.
- Delta/celah: konvensi untuk skrip verifikasi baru: (1) satu kasus kontrol-negatif bawaan (masukan yang harus ditolak); (2) hasil "0 dieksekusi" atau "semua kosong" ⇒ kode keluar bukan-nol; (3) scanner: satu kasus uji yang memastikan aturan `SHELL.EXEC` menyala pada `execSync(\`${x}\`)` (kontrol positif) selain kasus negatif.
- Cara adaptasi: konvensi di docs verifikasi + tes GCB-05; tidak ada kode umum.
- Lisensi/hak cipta: Apache-2.0; prinsip.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: kode donor; grep AC. Dugaan: cakupan kontrol negatif pada skrip verifikasi AC yang ada.
- Disposisi: **ADAPT**

### GCB-12 Spesifikasi konkret `scripts/verify/test-run-evidence.mjs` dan heuristik "tes menyebut aturan" (melengkapi OFA-08/09)
- Sumber: `code-modernization/scripts/baseline_diff.py:41-48` (`STATUS`), `:377-422` (tabel regex ringkasan runner: Maven/Gradle/cargo/pytest/unittest/`go test`/`dotnet test`/jest/vitest/ctest/phpunit; tiap pola berjangkar dan dibatasi 2.000 karakter), `:633-712` (regresi: PASS→gagal; kegagalan baru: tidak terdaftar/SKIP→gagal; dilewati-baru; hilang; `renamed` bila hitungan kelas tidak memburuk; `executedDrop`; `skippedGrowth`; flaky dan approved dicatat terpisah), `:587-625` (tabel baseline ketikan tanpa bukti terparse = "typed", tidak bisa jadi PROVEN), `scripts/proof_pack.py:216-253,463-482`, `scripts/trace_rules.py:1-38`, `scripts/uplift_checks.py:1-38`.
- Observasi: Regex vitest donor `^\s*Tests\s{2,}(.*)\(\d+\)\s*$` (kata bilangan dijumlahkan: `passed|failed|skipped`) dan dotnet `^(?:Passed|Failed)!\s+-\s+Failed:\s+(\d+),\s+Passed:\s+(\d+),\s+Skipped:\s+(\d+)` cocok dengan dua runner AC (vitest 4.1.11, .NET). Aturan: log tanpa baris ringkasan = bukan bukti; hasil lebih tua dari kode = basi; angka diketik tidak cukup; XML dengan DTD/entitas ditolak; tautan tidak diikuti; batas ukuran/jumlah. Heuristik jujur dari `trace_rules`: sebuah tes "menyebut" aturan bila id muncul di nama tes/kelas; baris dianggap dilewati bila ia atau 3 baris di atasnya memuat `@Disabled|skip|pending|todo`; status "named, not run"; "claimed only" dari catatan; peringatan eksplisit "menyebut tidak berarti tes baik". `uplift_checks` batasi 25% berkas tes berubah dan akui bahwa asersi yang melemah tidak terdeteksi.
- Nilai untuk Agent Core: Melengkapi OFA-09 yang masih berstatus "dugaan reporter vitest": sekarang ada daftar pola ringkasan runner konkret dan taksonomi diff sebelum/sesudah, plus pola `.NET`. Kegunaan: menangkap agen yang menghapus/melewati tes demi lulus.
- Baseline Agent Core: belum ada pembaca (OFA-09, dikonfirmasi: `scripts/verify/` tak memuatnya) → **BELUM-ADA**.
- Delta/celah: skrip Node tanpa dependensi: terima path log/JSON reporter vitest/XML, hitung `executed/failed/skipped/mtime`, bandingkan dengan ringkasan "sebelum" bila diberikan (`regressions`, `newlySkipped`, `missing`, `executedDrop`), keluar bukan-nol bila nol dieksekusi. **Tidak diverifikasi** terhadap keluaran nyata vitest 4.1.11 / dotnet di mesin ini (tidak dijalankan).
- Cara adaptasi: `scripts/verify/` (skrip baca-saja); pedoman perintah PowerShell di referensi `verification-verdict.md` (OFA-08).
- Lisensi/hak cipta: Apache-2.0; reimplementasi mandiri di Node.
- Perkiraan skala: M · Risiko: rendah-sedang (format runner) · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: teks donor. Dugaan: bentuk ringkasan vitest/dotnet di mesin ini.
- Disposisi: **ADAPT**

### GCB-13 Adapter plugin: jalur komponen yang dideklarasikan dilaporkan sebagai "tidak dipindai" dengan validasi aturan jalur
- Sumber: `plugin-dev/skills/plugin-structure/references/manifest-reference.md:209-372` (jalur kustom *menambah* default, wajib `./`, tanpa `..`, tanpa absolut, tanpa backslash; semua komponen terdaftar dan konflik nama = galat), `plugin-structure/SKILL.md` (auto-discovery `skills/*/SKILL.md`), `component-patterns.md` (perintah bersarang tidak ditemukan otomatis, harus jalur kustom), `.claude-plugin/marketplace.json` (entri `strict:false` dengan `skills:[…]`, OFB-05). AC: `src/skills/claude-plugin.ts:10` (komentar: jalur manifest hanya dilaporkan), `:358-362` (`declares` = nama kunci saja), `:364-399` (hanya `skills/`, `commands/`, `agents/`, `hooks/hooks.json`, `.mcp.json`).
- Observasi: Plugin yang menaruh skill di direktori non-default (mis. `"skills": "./custom"`, atau `"commands": ["./commands/ci", …]`) menghasilkan **nol skill** pada preview AC dan tidak ada peringatan selain kata `skills` di `declares`.
- Nilai untuk Agent Core: "0 skill" yang sebenarnya "tidak dipindai karena jalur kustom" adalah ketidakjujuran cakupan kecil (GCB-09).
- Baseline Agent Core: inventaris default + `declares` → **SEBAGIAN**.
- Delta/celah: untuk tiap kunci komponen yang dideklarasikan, laporkan `declaredPaths:[{key, path, valid, exists, inDefault}]` dengan validasi aturan jalur di atas (tolak absolut, `..`, backslash, tanpa `./`), dan `notScanned:true` bila jalur valid berada di luar lokasi default. Opsional lanjutan: ikuti `skills` kustom **hanya di dalam akar plugin** memakai penjaga symlink/ukuran yang sama (perubahan lebih besar; tidak wajib).
- Cara adaptasi: `inventoryClaudePlugin` (tambah ±20 baris) + satu kasus di `tests/skill-claude-plugin.test.ts`.
- Lisensi/hak cipta: Apache-2.0; fakta format.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang · Butuh skema tool baru: tidak (bidang keluaran) · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: kode AC dan spesifikasi donor. Dugaan: seberapa banyak plugin dunia nyata memakai jalur kustom (korpus ini: hanya entri katalog `strict:false`, OFB-05).
- Disposisi: **ADAPT**

### GCB-14 Adapter plugin: ringkasan hook per jenis/matcher dan konfigurasi MCP per transport, tanpa menggemakan perintah
- Sumber: `plugin-dev/skills/hook-development/SKILL.md:1-200` (jenis `command` vs `prompt`; format `hooks.json` pembungkus `{"hooks":{…}}` vs format pengaturan langsung; matcher `*`/`Write|Edit`), `skills/mcp-integration/SKILL.md` (heading: stdio/SSE/HTTP/WebSocket, ekspansi `${VAR}`, OAuth/token/env), AC `claude-plugin.ts:388-399` (hook: `event (jumlah)`; MCP: nama server saja).
- Observasi: Hook jenis `prompt` memanggil model (otoritas hook dan model kedua), hook `command` menjalankan shell; keduanya muncul hanya sebagai angka. Server MCP dapat berupa `http/sse` jarak jauh atau `stdio` yang menjalankan perintah.
- Nilai untuk Agent Core: Preview adalah titik keputusan pengguna sebelum mengimpor; membedakan "plugin ini punya 3 hook perintah shell dan 1 hook prompt-model" bernilai keselamatan (memperkuat OFB-13).
- Baseline Agent Core: hitungan per event; nama server → **SEBAGIAN**.
- Delta/celah: tambahkan `handlerTypes:{command:n,prompt:m,other:k}`, `matchers:['*', …]` (maks 8, dibersihkan `reportLabel`), `mcpTransports:{stdio:n,http:n,sse:n,ws:n}`, `usesPluginRootVar:boolean`; tetap tidak menggemakan perintah/URL/token.
- Cara adaptasi: `inventoryClaudePlugin`; tes memakai fixture hooks/mcp sintetis.
- Lisensi/hak cipta: Apache-2.0; fakta format.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi untuk bagian yang dibaca (hook SKILL 1–200); transport MCP dari heading dan W5.
- Disposisi: **ADAPT**

### GCB-15 Adapter plugin: kunci pembatas yang jatuh ke metadata inert dan sintaks eksekusi-substitusi pada badan perintah
- Sumber: `plugin-dev/skills/command-development/references/frontmatter-reference.md` (`allowed-tools: "*"`, `Bash(git:*)`, `model`, `disable-model-invocation`; badan memakai `!`perintah``, `@berkas`, `$1`, `$ARGUMENTS`), `math-proof/skills/siege/SKILL.md:1-8` (`disallowed-tools: WebSearch, WebFetch, AskUserQuestion`, `disable-model-invocation: true`, `allowed-tools` panjang), AC `claude-plugin.ts:90,218-221,261-264` (`STRICT_KEYS`; kunci non-ketat → `metadata.claude-<kunci>`; kunci non-ketat berbentuk list/map → `SKILL_PLUGIN_KEY_UNMAPPABLE` lewat `text()`).
- Observasi: Kunci yang *membatasi* (`disallowed-tools`, `disable-model-invocation`, `user-invocable`) diturunkan menjadi metadata tanpa pembaca; kunci berbentuk daftar justru membuat skill `unsupported` (jadi perilaku tidak konsisten antara bentuk CSV dan YAML-list). Bila perintah (`commands/*.md`) kelak dipetakan menjadi skill (OFB-03), badan memuat baris `!`…`` yang di Claude Code *dieksekusi saat pra-pemrosesan*; di AC tidak akan dieksekusi, sehingga skill hasil impor akan menampilkan perintah yang tidak pernah dijalankan.
- Nilai untuk Agent Core: Pemakai harus tahu bahwa pembatas hilang dan bahwa isi tidak setara. Penting: `allowed-tools` pada Skill AC tidak boleh dibaca sebagai hibah (doktrin AC).
- Baseline Agent Core: OFB-04 mengusulkan `invocation:'user-only'` dan daftar placeholder → **SEBAGIAN** (tidak mencakup `disallowed-tools` ataupun sintaks `!`/`@`).
- Delta/celah: tambahkan ke `changes` aksi `restriction-dropped` (nama kunci saja) untuk `disallowed-tools|disable-model-invocation|user-invocable`; hitung (tanpa gema) kemunculan `!` + backtick, `@path`, `$ARGUMENTS`, `$1..$9`, `${CLAUDE_*}` sebagai `executablePreprocessing:n`; konsistenkan perlakuan CSV vs list pada kunci non-ketat (keduanya → metadata atau keduanya laporan).
- Cara adaptasi: `adaptFrontmatter` + `changes`; tes tambahan.
- Lisensi/hak cipta: Apache-2.0.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah-sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: frontmatter siege dan kode AC. Dugaan: bahwa pengguna mengimpor skill ber-pembatas.
- Disposisi: **ADAPT**

### GCB-16 Pemetaan konvensi penulisan Skill resmi vs Agent Core untuk lint advisory (memperkuat OFB-06 dan Bagian D W5 #9)
- Sumber: `plugin-dev/skills/skill-development/SKILL.md` (deskripsi orang ketiga + frasa pemicu; badan 1.500–2.000 kata, maks <5k; imperatif; tiga tingkat pemuatan; daftar periksa struktur/deskripsi/konten/pengungkapan bertahap/uji), `skill-creator/scripts/package_skill.py:16-27` (paket mengecualikan `evals/` di akar skill, `__pycache__`, `node_modules`), `.github/scripts/validate-frontmatter.ts:15-60` (pra-kutip nilai berkarakter khusus YAML sebelum parse), `.github/workflows/validate-plugins.yml` (invarian I1/I3 error, I8/I11 peringatan).
- Observasi: Aturan resmi tidak ada yang mengukur fragmen baca atau bagian Trigger/Non-trigger; ambang kata (1.500–2.000 kata ≈ 9–13 KB) bertabrakan dengan batas AC ≤8.192 B (≈1.300 kata). Saya memeriksa seluruh frontmatter `SKILL.md`/agen/perintah di repo ini: **tidak ada** nilai yang dimulai dengan karakter khusus YAML selain blok `|`, jadi pra-kutip validator donor tidak terbukti perlu bagi AC.
- Nilai untuk Agent Core: Mencegah `skill-lint` (OFB-06) mengimpor ambang yang salah.
- Baseline Agent Core: tidak ada tabel pemetaan → **BELUM-ADA** (dokumentasi).
- Delta/celah: satu tabel di referensi on-demand (bukan AGENTS.md): aturan resmi → aturan AC → tindakan lint (`warn|ignore`). Tambah satu saran: berkas referensi >8 KB sebaiknya diawali daftar isi agar batas fragmen `skills(read)` mudah dinavigasi; paket ekspor (bila ada) mengecualikan `evals/` akar. Tidak ada perubahan kode.
- Cara adaptasi: Skill reference/dokumen on-demand (pemilik: SkillService docs).
- Lisensi/hak cipta: Apache-2.0; parafrase.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah-sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi (baca penuh dan grep seluruh frontmatter).
- Disposisi: **ADAPT**

### GCB-17 Uji kontrak halaman/UI otomatis: kontras WCAG dari token CSS, tanpa URL eksternal/API berbahaya, korpus URL, dan pembenaman JSON aman
- Sumber: `code-modernization/scripts/tests/test_report_tools.py:605-790` (`test_no_external_urls_and_no_dangerous_apis`, `test_theme_and_layout_contract` — paritas token tema gelap antara media query dan `[data-theme]`, `:focus-visible`, `@media print`, gutter 16 px —, `test_every_text_colour_pair_meets_4_5_to_1` dengan rumus luminansi dan 18 pasangan, fokus ≥3:1, `test_the_page_script_parses` via `node --check`, korpus `SAFE_URLS`/`BAD_URLS`/`LINK_CASES` termasuk `java&#10;script:`, `&colon;`, spasi lebar-nol, BOM, NBSP, U+2028), `project-artifact/swe.md` ("tulis `<` sebagai `\u003c` di dalam JSON"), `session-report/template.html:336-352` + `analyze-sessions.mjs:482-490,675` (JSON disisipkan apa adanya; `promptPreview` hanya menghapus `<…>` berpasangan).
- Observasi: Donor memperlakukan halaman laporan sebagai artefak yang dapat diuji (aksesibilitas, CSP, API terlarang). Dua plugin resmi menangani pembenaman JSON dengan benar (project-artifact, receipts: OFB-09), satu tidak sepenuhnya (session-report: `JSON.stringify` tanpa escape `<`, mitigasi parsial lewat penghapusan `<…>` berpasangan pada `promptPreview`; teks `<` tanpa `>` penutup tidak dihapus — apakah itu dapat menutup `<script>` **tidak diuji**, dugaan saja).
- Nilai untuk Agent Core: Pengguna menetapkan standar aksesibilitas/desain tinggi; UI AC tidak memiliki tes kontras (`grep contrast|wcag` di `src/ui/src` dan `tests` kosong). Pengukuran saya atas token `:root` di `src/ui/src/index.css:1-23`: semua pasangan teks yang dipakai lulus ≥4,5:1 (`text/bg` 17,9; `muted/bg` 5,99; `muted/panel-3` 4,96; `red/panel-3` 5,03; `offline/panel-3` 5,40); `cyan-2` 4,48/4,20/3,71 dan `purple/panel-3` 3,97 di bawah 4,5 tetapi **tidak dipakai sebagai `color:` teks** (grep nol hasil); ada 3 `outline:none` yang belum ditinjau.
- Baseline Agent Core: tema gelap tunggal (`color-scheme:dark`), satu aturan `:focus-visible` (`index.css:56`); tidak ada tes kontras → **BELUM-ADA**.
- Delta/celah: satu tes vitest `src/ui/src/theme-contract.test.ts` yang membaca `index.css`, menghitung rasio untuk pasangan teks (dan fokus ≥3:1), dan gagal bila token teks turun di bawah 4,5; tanpa mengubah tampilan. Bila AC kelak menghasilkan halaman HTML laporan: helper `jsonForScript` (escape `<`, `U+2028/2029`) + korpus URL donor.
- Cara adaptasi: tes UI saja (WebView2 tidak dibuka; tidak ada tab/proses sisa).
- Lisensi/hak cipta: Apache-2.0; rumus WCAG adalah standar publik.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: tes donor dibaca penuh; rasio dihitung dengan rumus yang sama pada 24 baris pertama `index.css`. Dugaan: bahwa komponen tidak memakai `cyan-2`/`purple` sebagai teks lewat cara lain (mis. `fill`, inline style).
- Disposisi: **ADAPT**

### GCB-18 Pola jalankan-panjang yang dapat dilanjutkan: sentinel akhir, berkas parsial tak pernah dihapus, penghitung milik skrip, memori satu-berkas
- Sumber: `math-proof/skills/siege/scripts/ledger.py:1-49,374-460,632-641`, `math-proof/skills/siege/SKILL.md:31-37,87-108,208-308`.
- Observasi: Pekerja menutup jawaban dengan baris `=== END OF ANSWER <Q> ===`; skrip (bukan model) mengklasifikasi `answered|partial|no answer`, memindahkan berkas tak-selesai ke `.partial.md` tanpa menghapus apa pun, mengabaikan baris yang hanya menyebut sentinel, dan idempoten. Orkestrator tidak membaca jawaban; `state.md` adalah satu-satunya memori setelah kompaksi; resume = baca `state.md`, jangan ulang langkah yang berkasnya ada; pemeriksaan akhir "dokumen berdiri sendiri" memakai grep untuk memastikan tidak merujuk berkas internal-run. Setiap pencocokan ambigu dibuat gagal-tertutup (kutipan prosa "L12" sengaja tidak dihitung).
- Nilai untuk Agent Core: Padanan sudah ada (kompaksi durable, checkpoint turn, episode task). Relevansi konkret hanya bila child-task Native (BERSYARAT) atau proses evaluasi Skill panjang dibuka: kriteria penerimaan "keluaran terpotong tidak boleh dibaca selesai".
- Baseline Agent Core: `agent-context-compaction.ts`, `agent-turn-checkpoint.ts` → **SEBAGIAN**; tidak ada pembeda `answered/partial` untuk keluaran artefak panjang (tidak dicari mendalam).
- Delta/celah: tidak ada yang diterapkan sekarang; catat sebagai kriteria untuk proposal child-task dan evaluasi Skill (bersama OFA-18).
- Cara adaptasi: dokumen proposal bila dibuka.
- Lisensi/hak cipta: Apache-2.0.
- Perkiraan skala: — · Risiko: — · Nilai: rendah (sekarang) · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: `ledger.py` penuh; SKILL.md ±71%.
- Disposisi: **REFERENSI**

### GCB-19 Catatan kewaspadaan bila skill playground / project-artifact / LaTeX diadopsi
- Sumber: `playground/skills/playground/templates/data-explorer.md` (blok `renderPreview` menyisipkan string ber-`span` ke `el.innerHTML` tanpa escape), `code-map.md`/`concept-map.md` (pola komentar-klik, kanvas), `math-olympiad/skills/math-olympiad/scripts/compile_pdf.sh` (menyalin `body.tex` mentah ke dokumen lalu `pdflatex … >/dev/null` dua kali; kegagalan tidak menampilkan penyebab), `project-artifact/skills/project-artifact/swe.md` (penomoran PR `X.Y`: X naik bila PR terblokir tahap sebelumnya, Y untuk PR paralel; status PR dari `gh` hidup).
- Observasi: Contoh `innerHTML` pada templat data-explorer akan menanamkan XSS-sendiri bila string pengguna disorot; `compile_pdf.sh` tidak mengaktifkan mode aman (`-no-shell-escape`, `-openin_any=p`), sehingga `\input{…}` dalam `body.tex` tak tepercaya dapat membaca berkas lokal ke PDF (inferensi dari perilaku LaTeX; tidak diuji).
- Nilai untuk Agent Core: Bila OFB-27 (playground) diadopsi, contoh harus ditulis ulang dengan `textContent`/penyorotan aman; LaTeX tidak boleh diadopsi tanpa batas. Penomoran `X.Y` berguna untuk dokumen proposal multi-PR (bukan kode).
- Baseline Agent Core: tidak ada skill padanan → **BELUM-ADA**.
- Delta/celah: tidak ada tindakan; pedoman bila diadopsi.
- Cara adaptasi: tulis ulang contoh dengan kata sendiri; tidak membuka tab otomatis.
- Lisensi/hak cipta: Apache-2.0.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: teks dibaca penuh; perilaku LaTeX adalah inferensi.
- Disposisi: **REFERENSI**

### GCB-20 Daftar periksa server MCP HTTP jarak jauh dan primitif resource/prompt
- Sumber: `mcp-server-dev/skills/build-mcp-server/references/remote-http-scaffold.md` (daftar periksa penerapan: `initialize` mengembalikan kapabilitas, galat terstruktur bukan HTML 500, `Origin` divalidasi, header `MCP-Protocol-Version` dihormati dengan 400 bila tak didukung, health terpisah dari `/mcp`; konektor jarak jauh di Claude Desktop lewat Settings → Connectors, bukan `claude_desktop_config.json`), `resources-and-prompts.md` (resource = dikendalikan aplikasi; prompt = dikendalikan pengguna, argumen string-saja), `deploy-cloudflare-workers.md` (template Workers; `wrangler secret put`).
- Observasi: AC memvalidasi `Origin` (W5 OFB-22) dan punya `/health` (`src/http/app.ts:113`); referensi header `MCP-Protocol-Version` **tidak ditemukan** di `src` (grep nol hasil) — SDK mungkin menanganinya, tidak diverifikasi. Prompt/resource MCP: tidak ada di AC (manifest tool hampir penuh; prompt/resource tidak memakai anggaran tool tetapi menambah permukaan — tidak diusulkan).
- Nilai untuk Agent Core: Pemeriksaan satu kali bahwa respons untuk versi protokol tak didukung benar; selebihnya sudah terpenuhi.
- Baseline Agent Core: `Origin`, `/health` ada; header versi tidak diketahui → **SEBAGIAN**.
- Delta/celah: periksa perilaku SDK untuk `MCP-Protocol-Version`; tidak ada tindakan kode sebelum terbukti kurang.
- Cara adaptasi: tes integrasi HTTP kecil bila diperlukan.
- Lisensi/hak cipta: Apache-2.0; fakta protokol.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: teks donor; ketiadaan grep di `src`. Dugaan: perilaku SDK.
- Disposisi: **REFERENSI**

---

## Bagian C — Ditolak / tidak relevan (dengan alasan)

- **Telemetri dan "tip"** (`claude-security/hooks/hooks.py`, `code-modernization/scripts/test_telemetry.py`): kode peristiwa numerik, banner, tip setelah `git push`; bertentangan dengan local-first. Sudah di Bagian C W4.
- **`workflows/scan.js` sebagai runtime**: orkestrasi puluhan peneliti + panel 3 suara + percobaan ulang dengan jeda-berjitter (`$t=[8e3,25e3,9e4,18e4]`) ditolak (multi-agent sebagai runtime; retry buta). Tidak ada bukti baru. Yang diambil hanya bentuk cakupannya (GCB-01, GCB-09).
- **Konfirmasi biaya sebelum peluncuran** (`jobs/scan-codebase.md`, langkah 3): UX khusus Claude Code (token/waktu), tidak relevan untuk scanner deterministik AC.
- **`scripts/lib/cwe-categories.json`** (30 KB, MITRE): cukup ID CWE per aturan (OFA-02).
- **`hookify/hooks/userpromptsubmit.py`**: eksekutor generik; selalu `exit 0`, galat impor dan galat umum hanya `systemMessage`. Gagal-terbuka dan otoritas hook; ditolak seperti tiga hook tetangga (OFA-21).
- **`skill-creator` `viewer.html`/`eval_review.html`**: CDN dan font eksternal (hanya viewer ber-SRI); `generate_report.py` mengikat ke `run_loop.py` yang ditolak (model tersembunyi + retry buta).
- **`math-olympiad/compile_pdf.sh` dan `check_latex.sh`**: kompilasi LaTeX dari teks tak tepercaya tanpa mode aman; tidak diadopsi (GCB-19).
- **`code-modernization` `tests/{register,stacks}.test.ts` dan fixture `stacks/workspace/world`**: terikat API pane TUI Claude Code (fungsi hook early-access); tidak ada padanan.
- **`security-guidance/tests/conftest.py` dan 20+ tes launcher/SDK/gateway/TLS-store/cache-prompt/usage-log**: infrastruktur pemanggil model dan penyedia; tidak relevan tanpa model tersembunyi.
- **Penekan inline sebagai fitur donor**: donor tidak punya penanda penekan; usul GCB-02(e) adalah usulan saya sendiri dan harus dinilai pemilik (risiko menyembunyikan temuan; karena itu wajib dihitung/dilaporkan).
- **Pra-kutip frontmatter donor** (`validate-frontmatter.ts`): tidak terbukti perlu (korpus tidak berisi kasusnya).

---

## Bagian D — Pola lintas-unit dan pertanyaan terbuka

### Pola yang layak jadi standar di Agent Core

1. **"Tidak diperiksa" tidak pernah dibaca sebagai "bersih" atau "terselesaikan".** Muncul di `proof_pack` (walk tak selesai = not checked), `save_result.checked()`, `scan.js` (`completenessCheckOutcome`, peneliti hilang), `render_report` (`verified` hanya bila terbukti), `security_reminder_hook` (nol ditinjau ≠ bersih). Terapkan pada scanner, preview plugin, dan semua hasil advisori (GCB-01, 09, 13).
2. **Alasan tertutup + kalimat + hitungan yang jujur** (batas bawah/atas) alih-alih teks bebas (GCB-09).
3. **Setiap parser/regex pada teks tak tepercaya diuji dengan matriks bentuk-hostile berbatas waktu** (`hostile.test.ts`). AC tidak punya satu pun; dua regex AC terukur kuadratik (GCB-03, GCB-04).
4. **Pemeriksa membuktikan dirinya bisa gagal** (self-check, canary, kontrol negatif) (GCB-11).
5. **Rekaman hasil divalidasi lintas-bidang dan penghitung percobaan dimiliki kode, bukan klaim model** (GCB-10, GCB-18).
6. **Kunci temuan berbasis konten, bukan nomor baris, dan tidak pernah meng-hash konteks yang memuat rahasia** (GCB-06).
7. **Pilih yang paling berisiko bila melebihi batas dan laporkan yang dibuang**, jangan potong urutan masuk (GCB-01, GCB-07).
8. **Halaman/artefak keluaran dapat diuji** (kontras, URL, API terlarang, pembenaman JSON) (GCB-17).

### Pertanyaan terbuka untuk Main

1. Berapa sering Controller menyerahkan >128 berkas ke `code_analysis(kind=security, analysisPreset=changed_source)`? Bila hampir tak pernah, GCB-01(1) tetap perlu karena kejujuran, tetapi prioritas pemilihan GCB-07 turun.
2. Persistensi `lifecycle` (OFA-03/pertanyaan 2 W4): setelah GCB-06, apakah `resolved` lintas-restart diperlukan? Bila ya, pemilik penyimpanan harus ditetapkan (Tracker?); GCB-01 menjaga agar tanpa itu `resolved` tidak lagi menyesatkan.
3. Apakah penanda penekan inline (GCB-02(e)) dapat diterima? Tanpa itu, definisi aturan sendiri dan deklarasi metode `exec` tetap FP kecil.
4. Apakah vitest 4.1.11 pada mesin ini mencetak baris `Tests  N passed (M)` dan reporter `json`/`junit` seperti diasumsikan GCB-12? Perlu satu pengamatan nyata sebelum implementasi.
5. Apakah `SDK @modelcontextprotocol/*` yang dipakai menolak `MCP-Protocol-Version` tak didukung (GCB-20)?
6. Mana yang diinginkan: perbaikan GCB-04 sebagai bagian dari "adapter-revision" Skill atau perubahan kode biasa? (Ini kode `src`, bukan konten Skill; tidak butuh proposal Skill.)
7. Apakah ada tempat lain di AC dengan regex serupa pada teks tak tepercaya (hasil web, catatan Memory, nama berkas)? Saya hanya mengukur dua modul; GCB-05(9) mengusulkan matriks untuk semuanya.

---

## Rekap

- Jumlah temuan: 20 (GCB-01 … GCB-20).
- Per disposisi: **ADOPT 4** (GCB-01, 02, 03, 04); **ADAPT 13** (GCB-05 … 17); **REFERENSI 3** (GCB-18, 19, 20).
- Lima teratas: GCB-04 (ReDoS adapter plugin: 16 detik/100 KB), GCB-03 (ReDoS scanner: alternasi + glob), GCB-01 (cakupan jujur scanner), GCB-02 (80→3 false positive), GCB-05 (katalog uji + matriks hostile).
- Cakupan putaran ini: 114 file disentuh; penuh 33 (29%), sebagian 15 (13%), skim 15 (13%), katalog nama 42 (37%), tidak 9 (8%).
- Hambatan: `scan.js` ter-minify (dibaca lewat salinan terformat); skrip Python besar (`proof_pack`, `render_report`, `patch_artifacts`, `baseline_diff`) hanya sebagian; 35 tes security-guidance hanya nama; 52 file plugin-dev tidak dibaca ulang.
