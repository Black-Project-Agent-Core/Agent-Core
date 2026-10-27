# W10a — claude-plugins-official, putaran penutupan terakhir (prefiks temuan `GCG`)

Tanggal: 2026-10-27. Pekerja baca-saja. Sumber: `E:\Projects\Side-Project-Dont-Touch\claude-plugins-official\plugins` (HEAD `58267944`). Pembanding: `E:\Projects\Agent-Core` (hanya dibaca). File ini melengkapi `W4-official-plugins-A.md` (OFA), `W5-official-plugins-B.md` (OFB) dan `W9b-official-plugins-gap-closure.md` (GCB); ID lama dikutip bila temuan baru memperkuat atau mengoreksinya.

Pengecualian pengguna dipatuhi: tidak ada isi finance, zoom, atau aplikasi lintas-platform (telegram, discord, imessage, fakechat, slack, asana, linear, common-room, apollo) yang dibaca untuk temuan atau dilaporkan. Catatan jujur: satu skrip hitung-kunci pertama saya membuka semua 40 `plugin.json` dan hanya mencetak hitungan agregat; saya ulangi dengan penyaring dan semua angka manifest di bawah berasal dari 34 manifest yang tidak dikecualikan. Pengukuran `.mcp.json` memakai daftar putih eksplisit yang tidak memuat plugin terkecualikan.

## Metode dan batas kejujuran

- Dibaca dengan Read penuh untuk berkas yang berisi aturan/validator/contoh; untuk tutorial panjang saya hanya membaca outline (heading) ditambah grep kata aturan. Berkas semacam itu ditandai "outline" di ledger dan **tidak** diklaim dibaca penuh.
- Pengukuran saya (semuanya baca-saja terhadap sumber; kode Agent Core tidak diimpor atau dijalankan):
  1. Dua repositori git sementara kecil di `C:\Users\Ikbal\AppData\Local\Temp\w10a` dan `...\w10b` (path scratchpad terlalu panjang untuk git di Win32: "File name too long"), git 2.55.0.windows.5, `GIT_CONFIG_GLOBAL=/dev/null`. Keduanya dihapus segera (skrip mencetak `cleaned`). Isinya hanya dua berkas kecil; tidak menyentuh repositori sumber maupun Agent Core.
  2. Skrip Node sekali-pakai yang menyalin teks regex `findMissingReferences` dari `claude-plugin.ts` dan menerapkannya pada `SKILL.md` resmi (bukan impor). File skrip dihapus di akhir.
  3. Tally JSON manifest/`.mcp.json`/`marketplace.json` dengan `node -e` (hanya membaca).
- Tidak ada skrip, hook, atau binari sumber yang dijalankan. Tidak ada yang ditulis di `E:\Projects\Agent-Core`. File yang ditulis: file ini.
- Lisensi: plugin-dev, mcp-server-dev, skill-creator, security-guidance, hookify, code-modernization Apache-2.0 (LICENSE per plugin berukuran 11.560 byte seperti LICENSE root; menurut W4/W5); claude-security proprietary: semua temuan yang bersumber di sana ditulis ulang sebagai ide umum, tanpa menyalin kalimat atau kode.

## Bagian A — Ledger cakupan (hanya unit yang saya tutup)

Kolom "dibaca": **penuh** = seluruh teks dibaca (oleh saya, atau oleh W9b bila disebut "W9b"); **sebagian** = rentang baris disebut; **outline** = heading + grep kata aturan saja; **nama** = nama tes dan docstring saja; **tidak** = tidak dibuka.

| Unit | File | Dibaca | Disposisi | Alasan | ID |
| --- | ---: | --- | --- | --- | --- |
| plugin-dev: 3 agen (`plugin-validator`, `skill-reviewer`, `agent-creator`) | 3 | penuh | REFERENSI | Rubrik validator/reviewer; `plugin-validator.md:175-184` dan `agent-creator.md:167-176` berakhir dengan pagar kode liar dan sisa percakapan ("Excellent work! ...") — cacat kualitas yang bisa dilint | GCG-11 |
| plugin-dev: validator bash (`validate-agent.sh`, `hook-linter.sh`, `validate-hook-schema.sh`, `test-hook.sh`) | 4 | penuh | TOLAK (bash/jq) / REFERENSI aturan | Aturan nama/warna/model agen, lint hook; internal tidak konsisten (lihat Bagian C) | GCG-11 |
| plugin-dev: skrip/contoh hook dan settings (`examples/validate-write.sh`, `validate-bash.sh`, `load-context.sh`; `plugin-settings/scripts/{parse-frontmatter,validate-settings}.sh`, `examples/read-settings-hook.sh`) | 6 | penuh | TOLAK | Hook bash; contoh punya cacat (daftar "aman" `^(ls|pwd|echo)(\s|$)` meloloskan `echo x; rm -rf ~`; JSON dirakit dengan interpolasi `$file_path`) | Bagian C |
| plugin-dev `skills/{agent-development,hook-development,mcp-integration,plugin-structure,command-development}/SKILL.md` | 5 | penuh | REFERENSI | Format `hooks.json` kontradiktif (pembungkus vs langsung), `name: Skill Name` (nama tampilan) dipakai contoh resmi, bentuk `.mcp.json` | GCG-09, GCG-11 |
| plugin-dev `hook-development/references/{advanced,patterns,migration}.md` | 3 | penuh | TOLAK | Hook prompt-ke-model = otoritas hook + model kedua; contoh berstatus-PID `/tmp/hook-state-$$` tidak bisa bekerja antarproses | Bagian C |
| plugin-dev `command-development/references/plugin-features-reference.md`; `skill-development/references/skill-creator-original.md`; `commands/create-plugin.md` (60-450; 1-200 oleh W5); `plugin-structure/references/manifest-reference.md` (1-210; 209-372 oleh W9b) | 4 | penuh | REFERENSI | Sintaks `!`..`` dan `@path` pada badan perintah, `${CLAUDE_PLUGIN_ROOT}`, alur 8 fase dengan gerbang manusia | GCG-09, GCG-11 |
| plugin-dev `command-development/references/frontmatter-reference.md`, `plugin-structure/references/component-patterns.md`, `skill-development/SKILL.md` | 3 | penuh (W9b, tidak dibuka ulang) | REFERENSI | Sudah dipakai GCB-13/15/16 | — |
| plugin-dev `mcp-integration/examples/{stdio,sse,http}-server.json` | 3 | penuh | REFERENSI | `stdio-server.json` memuat kunci `_comment` tingkat-atas; `headersHelper` muncul di `authentication.md` | GCG-09 |
| plugin-dev: `agent-development/references/agent-creation-system-prompt.md` (1-112), `command-development/references/{advanced-workflows (279-490), testing-strategies (73-132)}.md`, `mcp-integration/references/authentication.md` (44-84, 200-280) | 4 | sebagian | TIDAK RELEVAN (alasan di Bagian C) | Prompt pembuat agen; status alur via `.local.md` (penyimpanan paralel) | Bagian C |
| plugin-dev: tutorial/templat (agent-development `examples/{agent-creation-prompt,complete-agent-examples}.md`, `references/{system-prompt-design,triggering-examples}.md`; command-development `README.md`, `references/{documentation-patterns,interactive-commands,marketplace-considerations}.md`; hook-development `scripts/README.md`; mcp-integration `references/{server-types,tool-usage}.md`; plugin-settings `SKILL.md`, `examples/{example-settings,create-settings-command}.md`, `references/{parsing-techniques,real-world-examples}.md`; plugin-structure `README.md`, `examples/{minimal,standard,advanced}-plugin.md`) | 20 | outline | TIDAK RELEVAN (alasan) | Templat penulisan format perintah warisan, prompt agen, status `.local.md`; tidak memuat aturan baru (heading + grep kata "must/never/validate" dicek) | Bagian C |
| plugin-dev: `command-development/examples/{plugin-commands,simple-commands}.md` | 2 | tidak | TIDAK RELEVAN | Contoh perintah warisan | Bagian C |
| plugin-dev: `.claude-plugin/plugin.json`, `LICENSE`, `README.md` | 3 | tidak | TIDAK RELEVAN | Metadata/ikhtisar | — |
| mcp-server-dev `build-mcp-server/SKILL.md` dan `references/{auth,elicitation,server-capabilities,tool-design,versions}.md` | 6 | penuh | REFERENSI | Persyaratan direktori konektor, matriks kapabilitas klien, urutan prioritas auth | GCG-13 (catatan), Bagian D |
| mcp-server-dev `build-mcp-server/references/{deploy-cloudflare-workers,remote-http-scaffold,resources-and-prompts}.md` | 3 | penuh (W9b) | REFERENSI | GCB-20 | — |
| mcp-server-dev `build-mcpb/SKILL.md`, `references/{local-security,manifest-schema}.md` | 3 | penuh | REFERENSI | Daftar periksa keamanan MCP lokal (containment, execFile, batas ukuran); contoh containment memakai `startsWith("..")` yang sama tidak presisinya dengan scanner AC | GCG-04 |
| mcp-server-dev `build-mcp-app/references/{abuse-protection,directory-checklist,iframe-sandbox,payload-budgeting}.md` | 4 | penuh | TIDAK RELEVAN (kecuali catatan kecil) | Widget iframe/MCP app; Agent Core tidak membangun MCP app. Satu jebakan umum dicatat (`String.replace` dengan string pengganti menginterpretasi `$`) | Bagian D |
| mcp-server-dev `build-mcp-app/SKILL.md`, `references/{apps-sdk-messages,widget-templates}.md` | 3 | outline | TIDAK RELEVAN | Widget | Bagian C |
| mcp-server-dev: `.claude-plugin/plugin.json`, `LICENSE`, `README.md` | 3 | tidak | TIDAK RELEVAN | Metadata | — |
| security-guidance tes: `test_notebook_edit_patterns`, `test_review_outcomes`, `test_diff_prefix_config`, `test_baseline_lookup`, `test_nested_repos`, `test_git_index_locks` | 6 | penuh | ADAPT | Kasus tepi git/pola yang menyentuh scanner dan helper git AC | GCG-01, 02, 03, 05, 06 |
| security-guidance tes: `test_untracked_cap`, `test_secret_shaped_paths`, `test_patterns_file_shape`, `test_diff_parsing`, `test_findings_delivery` | 5 | penuh (W9b) | ADAPT | GCB-05 | — |
| security-guidance tes: `test_repo_resolution`, `test_stop_diff_memory`, `test_stop_review_paths` (40-125 dibaca), `test_state_file`, `test_inflight_reviews`, `test_portable_output` | 6 | nama | REFERENSI (tidak tertutup) | Nama dan docstring: pembatas diff, batching path per byte (E2BIG / ERROR_FILENAME_EXCED_RANGE), tulis-atomik state, penanda review berjalan | GCG-07 (catatan) |
| security-guidance tes: `test_temp_index_cleanup` (467 baris), `test_stop_baseline_checkout`, `test_prompt_untracked_snapshot`, `test_stop_scope_metrics`, `test_secret_named_metric` | 5 | tidak | **TIDAK TERTUTUP** | Keluarga yang sama dengan tes git yang saya baca; tidak sempat | — |
| security-guidance tes: launcher (4), SDK bootstrap (3), gateway/TLS/header/kredensial (4), cache prompt, usage log, metrik review/reviewer (4), model review, konfigurasi user, `conftest.py` | 19 | tidak | TIDAK RELEVAN | Infrastruktur pemanggil model/penyedia; tidak ada padanan tanpa model tersembunyi | Bagian C |
| claude-security `skills/claude-security/jobs/suggest-patches.md` | 1 | penuh (126 baris) | REFERENSI | Penutupan item W9b "skim"; konfirmasi flag git penulis patch | GCG-02, GCG-03 |
| claude-security `scripts/patch_artifacts.py` | 1 | sebagian ≈88% (W9b 1-435, 525-720; saya 433-555, 813-1012, 1060-1200; **belum** 721-812, 1012-1059, 1200-akhir: penulis indeks/jsonl, render, argparse) | ADAPT (ide) | Penghapusan berpagar, parser diff yang mengenal nama berkutip, validasi id dari data tak tepercaya | GCG-02, GCG-14 |
| claude-security `scripts/render_report.py` | 1 | sebagian ≈65% (W9b 1-212, 354-493, 612-782; saya 186-355, 905-935; **belum** 494-611, 783-904, 936-akhir) | ADAPT (ide) | Pembaca cakupan toleran (enum/hitung/tanda potong `...[+N chars]`) | GCG-07 |
| math-proof `skills/siege/SKILL.md` baris 355-604 (brief hakim) | 1 | sebagian (sisa 605-akhir oleh W9b) | REFERENSI | Ledger klaim append-only dengan RETRACT, aturan retrieval, audit dua verifier | Bagian D |
| code-modernization `scripts/proof_pack.py` | 1 | sebagian ≈92% (W9b 1-750; saya 753-880, 978-1020; **belum** 881-977 penulis markdown) | ADAPT | Daftar "yang tidak dibuktikan" selalu ditulis; nol modul = NOT PROVEN; exit code | GCG-07 |
| code-modernization `scripts/uplift_checks.py` | 1 | penuh (1-330 dari ±380; sisa: `main`/cetak) | ADAPT | Sinyal "tes dihapus / >25% berubah / tidak ada pembanding" | GCG-12 |
| code-modernization: `scripts/{baseline_diff,compare,trace_rules,make_shards,render_rules,build_report,telemetry}.py` (sisa di luar yang dibaca W9b), `scripts/tests/*` (7), `tests/*.test.ts` (6) | ±20 | tidak dibuka ulang | **TIDAK TERTUTUP** | Anggaran; ringkasan W9b dipakai | GCB-11/12 |
| hookify `core/config_loader.py`, `hooks/{pretooluse,posttooluse,stop}.py` | 4 | penuh | TOLAK | Eksekutor generik gagal-terbuka (`exit 0` di `finally`), parser YAML ad hoc rapuh | Bagian C |
| hookify `hooks/userpromptsubmit.py` | 1 | penuh (W9b) | TOLAK | GCB sudah | — |
| skill-creator `agents/{grader,comparator,analyzer}.md` | 3 | penuh | ADAPT/REFERENSI | Aturan penilaian, pembanding buta, catatan benchmark | GCG-13 |
| skill-creator `scripts/{run_eval,quick_validate,utils}.py` | 3 | penuh | REFERENSI | Cacat harness (galat dihitung "tidak memicu"; berkas sementara di proyek) dan paritas validator | GCG-11, GCG-13 |
| skill-creator `scripts/aggregate_benchmark.py` (1-288 dari ±400; W5 45-224) dan `SKILL.md` (290-333 + grep) | 2 | sebagian | REFERENSI | Zero-fill, `runs_per_configuration: 3` keras, arah delta | GCG-13 |
| skill-creator `references/schemas.md`, `scripts/package_skill.py`, `eval-viewer/generate_review.py` | 3 | tidak dibuka ulang (W5/W9b) | REFERENSI | OFB-07/09 | — |
| skill-creator `scripts/{improve_description,run_loop,generate_report}.py`, `eval-viewer/viewer.html`, `assets/eval_review.html` | 5 | tidak | TOLAK | Loop optimasi memakai model tersembunyi + percobaan ulang buta; penampil memakai CDN | Bagian C |
| skill-creator: `.claude-plugin/plugin.json`, `README.md`, `LICENSE`, `LICENSE.txt`, `scripts/__init__.py` | 5 | tidak | TIDAK RELEVAN | Metadata/kosong | — |
| `.claude-plugin/marketplace.json`, 34 `plugin.json` non-terkecualian, 9 `.mcp.json` non-terkecualian, 27 `SKILL.md` non-terkecualian (ukuran dan tally, bukan teks bebas) | — | tally | REFERENSI | Pengukuran prevalensi format | GCG-08, 09, 10, 11 |

### Hitungan cakupan putaran ini

File plugin-dev 60: penuh oleh saya 28 + penuh W9b 3 = 31 (52%); sebagian 4 (7%); outline 20 (33%); tidak 5 (8%). mcp-server-dev 22: penuh 16 (73%) (13 oleh saya + 3 W9b); outline 3; tidak 3. skill-creator 21: penuh 6 (+ sebagian 2, tidak dibuka ulang 3, tolak 5, metadata 5). hookify scripts: 5 penuh. security-guidance tes 41: penuh 11 (6 saya + 5 W9b = 27%), nama 6, tidak dibuka 24 (19 TIDAK RELEVAN + 5 TIDAK TERTUTUP). Total file yang saya sentuh dengan Read/grep terarah: ±129.

**Yang belum tertutup dan harus dianggap tidak tertutup**: `render_report.py` 494-611/783-904/936-akhir; `patch_artifacts.py` 721-812/1012-1059/1200-akhir; `proof_pack.py` 881-977 (penulis markdown, rendah nilainya); lima tes security-guidance bertema git (`test_temp_index_cleanup` dst.); sisa skrip dan tes `code-modernization`; 20 file tutorial plugin-dev hanya outline.

---

## Bagian B — Temuan

Urutan menurut nilai. Semua usulan tidak menambah teks selalu-dimuat dan tidak butuh skema tool baru; keluaran tambahan lewat `textResult` JSON yang sudah bebas bentuk.

### GCG-01 `git diff` pada pemanggil AC menulis ulang `.git/index` asli meski `--no-optional-locks` (terukur)
- Sumber: `E:\Projects\Agent-Core\src\rdc\checkpoints\task-changes.ts:102-109` (helper `git`, `--no-optional-locks` di :104) dan `:239` (`diff --numstat -z HEAD --`); `src\code-intelligence\change-review.ts:64-76` (helper, timeout 12 detik di :70), `:85-90` (`changeRange` tanpa argumen → `['HEAD']`, yaitu pohon kerja vs HEAD), `:154` (`diff --name-status --find-renames -z HEAD --`), `:158-160`; `src\memory\provenance.ts:96-101,191-193` (`diff --name-only ... <commit> --`, juga membandingkan pohon kerja). Donor: `security-guidance\hooks\gitutil.py:30-65` (komentar :45-48 dan `-c diff.autoRefreshIndex=false`), `tests\test_git_index_locks.py:161-239,243-316` (kelas `TestReadOnlyGitLeavesTheRealIndexAlone`, `_index_sig` = inode+mtime+ukuran, `_make_stat_stale`, shim git yang menegaskan setiap panggilan membawa `GIT_OPTIONAL_LOCKS=0`).
- Observasi: Komentar donor menyatakan `git diff` pohon-kerja yang bertemu entri indeks basi-stat (mtime berubah, isi sama) menulis ulang indeks di bawah `index.lock` "GIT_OPTIONAL_LOCKS atau tidak". Saya ukur di mesin ini (git 2.55.0.windows.5, repo sementara dengan satu berkas yang mtime-nya dimajukan tanpa mengubah isi; indeks dibuat basi ulang sebelum tiap percobaan): `git --no-optional-locks status --porcelain=v1 -z --untracked-files=all` → indeks **tidak berubah**; `git --no-optional-locks diff --numstat -z HEAD --` → **ditulis ulang** (inode dan mtime berganti); `git --no-optional-locks diff --name-status --find-renames -z HEAD --` → **ditulis ulang**; dengan `-c diff.autoRefreshIndex=false` baik `--numstat` maupun `--unified=0 --no-ext-diff` → **tidak berubah**. Jadi panggilan AC yang persis sama (`task-changes.ts:239`, `change-review.ts:154`) mengubah metadata repositori pengguna padahal fitur ini dinyatakan baca-saja. `provenance.ts:191` (`diff --name-only` terhadap satu commit, pohon kerja) adalah kelas panggilan yang sama; varian itu sendiri tidak saya ukur terpisah.
- Nilai untuk Agent Core: (1) `git add`/`git commit` pengguna atau Controller yang berjalan bersamaan dapat gagal karena `index.lock`; (2) bila proses git dibunuh oleh timeout 12 detik di tengah penulisan (mesin pengguna lambat), `index.lock` basi dapat tertinggal (dugaan; tidak saya ukur — donor menguji kasus serupa `test_killed_stash_create_leaves_nothing`); (3) kontrak "baca-saja" yang dipublikasikan panel perubahan per task menjadi tidak benar.
- Baseline Agent Core: Tes `tests\task-changes.test.ts:131-151` ("is read-only: files, Git index and checkpoint state are byte-identical") **tidak** menangkap ini: sidik jarinya mengambil isi berkas (termasuk `.git/index`) tetapi repositori fixture baru saja di-`git add -A` dan satu-satunya berkas yang berubah berubah isinya, jadi tidak ada entri basi-stat; fingerprint juga memanggil `git status` biasa sendiri. Grep `autoRefreshIndex` di `src tests scripts`: 0 hasil. → **BELUM-ADA** (mengoreksi OFA-22 yang hanya mendaftar `--no-optional-locks`).
- Delta/celah: tambahkan `-c diff.autoRefreshIndex=false` pada setiap pemanggilan `diff` terhadap pohon kerja (task-changes, change-review, provenance); idealnya lewat pembantu tunggal OFA-22. Tambah satu tes yang memajukan mtime satu berkas terlacak tanpa mengubah isi lalu menegaskan inode+mtime+ukuran `.git/index` tidak berubah setelah `computeTaskChanges` dan `buildChangedSymbolReview`.
- Cara adaptasi: tiga berkas `src` (satu argumen `-c` tiap helper) + satu kasus di `tests/task-changes.test.ts`. Tes dibuat di folder temp yang dihapus (preferensi pengguna).
- Lisensi/hak cipta: Apache-2.0; satu opsi git dan ide uji ditulis ulang.
- Perkiraan skala: S · Risiko: rendah (hanya berhenti menulis cache stat; hasil diff sama) · Nilai: tinggi · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi (pengukuran, dua putaran, tiap kasus dengan indeks basi baru). Dugaan: frekuensi tabrakan `index.lock` dan sisa kunci setelah timeout.
- Disposisi: **ADOPT**

### GCG-02 `attachPatchHunks` diam-diam kehilangan hunk untuk path non-ASCII dan konfigurasi prefiks diff pengguna (terukur)
- Sumber: `E:\Projects\Agent-Core\src\code-intelligence\change-review.ts:154-165` (`changedFiles`), `:116-150` (`attachPatchHunks`; baris `+++ ` di :126-128 memakai `raw.replace(/^b\//, '')`), `:362` (`file.hunks.length ? file.hunks : [{ start: 1, end: 1 ...}]`); donor `security-guidance\tests\test_diff_prefix_config.py` (empat konfigurasi prefiks), `hooks\gitutil.py:44-55` (`core.quotePath=false`, `diff.mnemonicPrefix=false`, `diff.noprefix=false`, `diff.srcPrefix=a/`, `diff.dstPrefix=b/`), `claude-security\scripts\patch_artifacts.py:456-467` (`display_name` yang mengenal `"a/`/`"b/` berkutip), `jobs\suggest-patches.md:88` (penulis patch memakai `--src-prefix=a/ --dst-prefix=b/`).
- Observasi: Saya jalankan `git diff --unified=0 --no-color --no-ext-diff HEAD --` pada repo sementara berisi `app.ts` dan `é.ts`. Default: `+++ b/app.ts` dan `+++ "b/\303\251.ts"` (nama non-ASCII dikutip dan di-oktal). `-c diff.mnemonicPrefix=true`: `+++ w/app.ts`. `-c diff.noprefix=true`: `+++ app.ts`. Daftar nama dari `--name-status -z` bersih (`é.ts`). Pencocokan AC `byPath.get(normalizePath(raw.replace(/^b\//,'')))` karena itu gagal untuk nama berkutip dan untuk prefiks mnemonik/kustom; pada `noprefix`, direktori sungguhan bernama `b/` di akar ikut terpotong.
- Nilai untuk Agent Core: `code_surface(impact, changeset)` dan evidence review berubah menjadi benih berbasis baris 1 (simbol yang memuat baris 1 atau `<file>`), tanpa catatan di `issues[]`, sehingga hasil tampak `available` padahal presisi hilang. Konfigurasi `diff.mnemonicPrefix` umum dipakai pengembang; nama non-ASCII wajar pada pengguna Indonesia/Asia.
- Baseline Agent Core: Satu tes jalur-senang (`tests\graft-graphify-adoption.test.ts:268-296`, path `src/box.ts`, konfigurasi default). Tidak ada tes untuk path non-ASCII atau konfigurasi prefiks; tidak ada berkas tes khusus `change-review`. → **BELUM-ADA** (kecuali jalur senang).
- Delta/celah: (a) pin keluaran: `-c core.quotePath=false --src-prefix=a/ --dst-prefix=b/` (opsi CLI menimpa konfigurasi pengguna; contoh patch writer donor) pada panggilan patch di :158; (b) bila sebuah berkas `modified/added` tidak mendapat hunk, tambahkan `issues.push('hunks unavailable: <path>')` dan tandai `wholeFile:true` pada benih; (c) tes: `é.ts`, `diff.mnemonicPrefix=true`, `diff.noprefix=true`.
- Cara adaptasi: `change-review.ts:158-160` + `:362-` (satu catatan) + tiga kasus tes; tidak ada penyimpanan baru.
- Lisensi/hak cipta: Apache-2.0 (security-guidance) dan ide umum dari claude-security (proprietary) — hanya tanda git yang merupakan fakta; ditulis ulang.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang-tinggi · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: keluaran git pada tiga konfigurasi, jalur kode yang menghilangkan hunk, fallback baris 1. Dugaan: seberapa banyak pengguna memakai prefiks mnemonik; apakah seed baris-1 benar-benar salah pada setiap kasus (bergantung simbol).
- Disposisi: **ADOPT**

### GCG-03 Rincian pengerasan git yang melengkapi OFA-22: opsi CLI vs konfigurasi, submodul tercatat, `safe.directory`
- Sumber: AC `task-changes.ts:231-239`, `repository-identity.ts:14,74` (`git status --porcelain=v1 -z --untracked-files=all`), `change-review.ts:159` (patch tanpa `--no-textconv`), `-c safe.directory=<root>` di enam pembantu (`change-review.ts:67`, `task-changes.ts:103`, `provenance.ts:99`, `repository-identity.ts:14`, `graph-observability.ts:293-296`, `workspace-resolver.ts:163`). Donor: `gitutil.py:56-70` (komentar tentang repositori bersarang yang konfigurasinya menjalankan perintah; `IGNORE_SUBMODULES = "--ignore-submodules=all"` dengan alasan bahwa `diff.ignoreSubmodules` hanyalah default yang ditimpa `.gitmodules`/`submodule.<nama>.ignore`), `tests\test_nested_repos.py` (`_add_nested_repo`: `filter.probe.clean` dan `diff.external` berpenanda; kasus repo bersarang tak-tercatat, tercatat sebagai gitlink, `.gitmodules ignore = none`, rentang commit dengan `diff.submodule=diff`, nama berkas bentuk-glob).
- Observasi: Donor menunjukkan bahwa git yang membuka repositori bersarang (submodul tercatat sebagai gitlink, hasil ekstrak arsip, checkout vendored) memulai git kedua di dalamnya yang membaca konfigurasi **repo bersarang itu** dan menjalankan perintah yang disebutnya (filter, `diff.external`, `core.fsmonitor`). Mitigasi donor berlapis: `core.fsmonitor=false`, `core.hooksPath=/dev/null`, `diff.ignoreSubmodules=all`, `--ignore-submodules=all` sebagai opsi CLI pada **setiap** `status` dan `diff` pohon-kerja (opsi CLI tidak bisa ditimpa `.gitmodules`), `--no-ext-diff --no-textconv` pada setiap diff. AC memakai `core.fsmonitor=false` hanya di `task-changes.ts` dan `--no-ext-diff` hanya di sebagian; tidak ada `--ignore-submodules` atau `--no-textconv` pada diff patch change-review; `status` di task-changes dan repository-identity tidak membawa `--ignore-submodules=all`.
- Nilai untuk Agent Core: OFA-22 sudah mengusulkan pembantu tunggal; temuan ini menambah **daftar tanda yang benar** (khususnya opsi CLI vs `-c`) dan sumber kasus uji. `-c safe.directory=<root>` mematikan perlindungan "dubious ownership" git; bersama repositori milik pengguna lain atau salinan arsip, konfigurasi repo itu dihormati.
- Baseline Agent Core: grep `ignore-submodules|no-textconv|core.hooksPath` di `src`: hanya `provenance.ts:192` dan `task-changes.ts:115` untuk `--no-textconv`; `--ignore-submodules` 0 hasil. → **SEBAGIAN**.
- Delta/celah: pembantu `runReadOnlyGit` (OFA-22) menyertakan: `-c core.fsmonitor=false -c core.hooksPath=NUL -c core.quotePath=false -c diff.autoRefreshIndex=false -c diff.ignoreSubmodules=all -c diff.submodule=short` + `--no-optional-locks`, dan **opsi CLI** `--ignore-submodules=all` pada `status`/`diff` serta `--no-ext-diff --no-textconv` pada diff; `GIT_TERMINAL_PROMPT=0`. Soal `safe.directory`: pertanyaan terbuka #2.
- Cara adaptasi: Modul tunggal (OFA-22) dan tes dengan repo bersarang sementara bertanda (pola `_add_nested_repo`), dihapus setelah tes. Catatan: saya tidak menjalankan skenario eksploitasi; keberhasilan serangan bergantung versi git (dugaan).
- Lisensi/hak cipta: Apache-2.0; tanda git adalah fakta.
- Perkiraan skala: S-M · Risiko: rendah-sedang (textconv yang sah akan berhenti dipakai pada diff) · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: argumen git di enam lokasi, komentar dan tes donor dibaca penuh. Dugaan: bahwa Agent Core akan membuka repositori bersarang tak tepercaya; eksploitabilitas pada git 2.55.
- Disposisi: **ADAPT**

### GCG-04 Scanner `changed_source`: nama berawalan `..` dianggap lolos dari akar dan membatalkan seluruh scan
- Sumber: `E:\Projects\Agent-Core\src\code-intelligence\changed-source-security.ts:125-127` (`relative.startsWith('..')` → `SECURITY_ADVISORY_PATH_ESCAPE`), `:132-134` (`realRelative.startsWith('..')` → `SECURITY_ADVISORY_REALPATH_ESCAPE`, dilempar di luar penangkapan `ENOENT` sehingga membatalkan scan); pembantu presisi yang sudah ada: `src\semantic-ide\path-safety.ts:11` (`inside(candidate, root)`), dan bentuk presisi `relative === '..' || relative.startsWith('..' + path.sep)` di `learning\proposal-documents.ts:44`, `rdc\checkpoints\service.ts:107`, `security\evidence-capture-policy.ts:249`, `security\verified-result-artifact.ts:28`, `semantic-ide\workspace-policy.ts:323`. Pembanding: contoh `safeJoin` di `mcp-server-dev\...\local-security.md:19-25` memakai `rel.startsWith("..")` yang sama tak presisinya.
- Observasi: Saya hitung dengan `node:path` (Win32): `normalizeRelative('..cache/x.ts')` lolos, `path.relative('C:\\proj', 'C:\\proj\\..cache\\x.ts')` = `..cache\x.ts`, `startsWith('..')` = true → pelemparan. Satu berkas bernama `..sesuatu` (direktori `..cache`, `..tmp`) di daftar berkas membatalkan scan semua berkas lain. Dua tempat lain memakai bentuk tak presisi yang sama (`http\process-identity.ts:28`, `rdc\browser-control\open-browser-use.ts:93`) tetapi gagal-tertutup tanpa membatalkan apa pun (lima tempat lain sudah memakai bentuk presisi).
- Nilai untuk Agent Core: Memperkuat GCB-01(2) (satu berkas membatalkan semua). Murah dan terukur.
- Baseline Agent Core: **BELUM-ADA** pembetulan; repositori sudah punya `inside()`.
- Delta/celah: ganti dua pemeriksaan dengan `inside()` dan ubah pelemparan per-berkas menjadi `skipped.push({file, reason:'outside-root'})` (GCB-01).
- Cara adaptasi: `changed-source-security.ts:125-135`; satu kasus tes `..cache/x.ts` (GCB-05).
- Lisensi/hak cipta: —
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah-sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi (perhitungan `node:path` Win32 dan baca kode).
- Disposisi: **ADOPT**

### GCG-05 Scanner `changed_source`: klasifikasi "diperkenalkan" vs "sudah ada" terhadap baseline git
- Sumber: AC `changed-source-security.ts:111-188` (memindai **seluruh** isi berkas; `lifecycle` hanya dalam-memori antarpanggilan, :42,163-171). Donor: `security-guidance\tests\test_baseline_lookup.py:60-146` (`get_baseline_file_content` membaca `git show <rev>:<path>`; `test_rewrite_does_not_re_flag_code_that_was_already_there`; path dari subdirektori sesi, pemisah asli Windows tidak diteruskan ke git, repo lewat symlink, worktree kedua bukan baseline sesi, isi yang di-commit bukan salinan kerja), `claude-security\jobs\suggest-patches.md:34` (cek isi `git show HEAD:./<file>`, "./" mengaitkan path ke akar scan), `scripts\render_report.py:327-331` (`coverage.preExisting` dilaporkan sebagai bucket tersendiri), `W4 OFA-04` (aturan perubahan vs pra-ada hanya sebagai prinsip laporan).
- Observasi: Nama jenis analisis AC adalah "changed source", tetapi berkas dipindai utuh sehingga temuan lama dan baru tercampur; donor memisahkan keduanya secara deterministik: temuan hanya "baru" bila pasangan (aturan, isi baris ternormalisasi) tidak ada pada isi baseline. Edge case teruji donor menjadi daftar implementasi.
- Nilai untuk Agent Core: Mengurangi kebisingan (GCB-02 mengukur 80 baris `exec(` pada 404 berkas) dan memberi arti pada `lifecycle`: Controller dapat memutuskan hanya atas yang diperkenalkan perubahan ini. Tidak ada otoritas baru, tidak ada model.
- Baseline Agent Core: grep `pre-existing|introduced|preExisting` di `src\code-intelligence`: 0 hasil. → **BELUM-ADA**.
- Delta/celah: bidang `origin: 'introduced' | 'pre-existing' | 'unknown'` pada tiap temuan (dan hitungan di `counts`). Hitung dengan multiset (aturan, baris ternormalisasi spasi) dari isi baseline; baseline = `HEAD` atau `base` bila diberikan; `unknown` bila bukan repo git, berkas tak terlacak (`introduced` untuk berkas baru), atau git gagal. Pakai `git show HEAD:./<path>` lewat pembantu terkeras (GCG-01/03), jalur dengan `/`, berkas harus berada dalam toplevel (bandingkan realpath). Kunci temuan konten-berbasis (GCB-06) cocok sebagai penyokong.
- Cara adaptasi: fungsi baru di `changed-source-security.ts`; tidak ada penyimpanan; tes memakai repo sementara dihapus.
- Lisensi/hak cipta: Apache-2.0 (tes donor, ditulis ulang); claude-security hanya prinsip.
- Perkiraan skala: M · Risiko: sedang (git per berkas; batas 128 berkas × `show`; salah klasifikasi bila baris diedit sedikit — dicatat sebagai heuristik) · Nilai: sedang-tinggi · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: tes donor dibaca penuh; ketiadaan di AC. Dugaan: biaya `git show` pada mesin lambat (tidak diukur); proporsi temuan lama pada kerja nyata.
- Disposisi: **ADAPT**

### GCG-06 Scanner `changed_source`: berkas notebook `.ipynb` sebaiknya dipindai per sel kode, bukan teks JSON mentah
- Sumber: `security-guidance\tests\test_notebook_edit_patterns.py:126-169` (sumber sel dibaca "sebagaimana ditulis", bukan teks JSON ter-escape; `outputs` **tidak** dipindai; BOM ditoleransi; `source` berupa string atau daftar baris; konten yang bukan notebook dipindai apa adanya; hanya `.ipynb` yang dibaca sebagai notebook); AC `changed-source-security.ts:135-139`. W9b GCB-07 hanya bertanya apakah `.ipynb` termasuk kelas `data`.
- Observasi: AC membaca notebook sebagai teks baris: keluaran sel (`outputs[].text`) yang berisi `exec(`/`token = "..."` menimbulkan positif palsu, `source` dalam satu baris JSON panjang memicu pemotongan 20.000 karakter, dan nomor baris tidak bermakna bagi pengguna. Pemindai donor menguraikan JSON, memindai sumber sel kode, dan jatuh balik ke teks mentah bila bukan notebook.
- Nilai untuk Agent Core: Hanya bila pengguna memakai notebook (tidak diketahui; pengguna adalah pengembang Windows). Murah bila diperlukan.
- Baseline Agent Core: `.ipynb` hanya ada di `rdc\document-projection\long-tail-converters.ts:112-118` (konverter dokumen, bukan scanner). → **BELUM-ADA**.
- Delta/celah: bila `file.endsWith('.ipynb')`: `JSON.parse` (batas ukuran sudah ada), ambil `cells[].source` bertipe `code`, pindai dengan pelacakan `cell:<indeks>:<baris>`; bila gagal parse atau bentuk salah → pindai teks mentah dan catat `parse:'raw'`.
- Cara adaptasi: fungsi di berkas scanner; tes dengan notebook sintetis di memori.
- Lisensi/hak cipta: Apache-2.0; kasus ditulis ulang.
- Perkiraan skala: S-M · Risiko: rendah · Nilai: rendah (naik bila pengguna memakai notebook) · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: tes donor dibaca penuh. Dugaan: penggunaan notebook oleh pengguna.
- Disposisi: **ADAPT**

### GCG-07 Kejujuran cakupan scanner: pemotongan bertanda, daftar "yang tidak dideteksi", dan satu-temuan-per-aturan-per-baris
- Sumber: donor `claude-security\scripts\render_report.py:189-193` (`capped` menandai potongan `...[+N chars]`), `:260-272` (`coverage_enum` mengembalikan None untuk nilai tak dikenal, `coverage_count` hanya bilangan bulat — pembaca toleran lintas-versi), `code-modernization\scripts\proof_pack.py:763-785` (`not_proven`: daftar "apa yang bahkan vonis PROVEN tidak katakan" selalu ditulis), `:870-873` (`overall`: nol modul atau ada yang gagal = NOT PROVEN; kode keluar 0 hanya bila PROVEN, :1016), `security-guidance\tests\test_stop_diff_memory.py` (nama: "cut file says so on its last line", "a read that breaks is an error not a short diff"). AC: `changed-source-security.ts:139` (`slice(0, MAX_LINE_CHARS)` tanpa tanda), `:143-153` (`rule.regex.exec(line)` sekali per aturan per baris: hanya kecocokan pertama), `src\code-intelligence\change-review.ts:403` (sudah memakai `status: 'partial'` bila melebihi `MAX_CHANGED_FILES`), `src\skills\claude-plugin.ts:94-96` (`reportLabel` memotong tanpa tanda).
- Observasi: Pola donor: setiap pemotongan menyebut berapa yang dibuang; setiap hasil positif disertai batas klaimnya; hasil "tidak ada yang dinilai" adalah gagal, bukan lulus. AC sudah punya preseden lokal (`change-review.ts:403`) tetapi scanner belum.
- Nilai untuk Agent Core: Melengkapi GCB-01/09: kontrak cakupan perlu (i) penanda potong dengan hitungan, (ii) satu daftar tetap `limits` berisi kode tertutup, (iii) pengakuan bahwa hanya kecocokan pertama per aturan per baris yang dicatat.
- Baseline Agent Core: **SEBAGIAN** (preseden di change-review; scanner belum).
- Delta/celah: tambahkan ke hasil scanner `limits: ['single-line-patterns','first-match-per-rule-per-line','no-dataflow','no-dependency-audit','no-config-audit','heuristic-rules']` (enam kode tetap, ±120 byte), `truncatedLines:[{file,line,droppedChars}]` (GCB-01) dan format potong `...[+N chars]` pada `reportLabel` bila potongan dilaporkan. Verdict `nothing-scanned` bila `filesScanned===0` — kode keluar/`outcome` tidak boleh `clean`.
- Cara adaptasi: `changed-source-security.ts` + `claude-plugin.ts:94-96`; bukan tool baru; bagian dari satu kontrak cakupan (GCB-09 `CoverageReason`).
- Lisensi/hak cipta: Apache-2.0 (proof_pack, security-guidance), claude-security proprietary → hanya prinsip.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi dari kode donor dan AC. Dugaan: bahwa Controller menyusun laporan "bersih" tanpa membaca `limits`.
- Disposisi: **ADAPT**

### GCG-08 Pratinjau plugin: akar marketplace dibaca sebagai plugin kosong tanpa petunjuk
- Sumber: AC `src\skills\claude-plugin.ts:349-352` (`isClaudePluginRoot` benar bila ada direktori `.claude-plugin`), `:355-364` (manifest hanya `.claude-plugin/plugin.json`), `src\skills\service.ts:877-883,948-955` (`validateSource`, `adaptPluginSkill`); sumber: `.claude-plugin\marketplace.json` (195.159 byte, di bawah `MAX_CONFIG_BYTES` 256 KiB di `claude-plugin.ts:87`), `README.md` bagian katalog (W5 OFB-05).
- Observasi: Direktori akar katalog (mis. klon repo marketplace) punya `.claude-plugin/` berisi `marketplace.json`, bukan `plugin.json`. `isClaudePluginRoot` mengembalikan true → pratinjau: `manifest:'absent'`, `declares:[]`, `components:[]`, ringkasan nol. Impor tanpa `pluginSkill` → `SKILL_PLUGIN_SKILL_REQUIRED`; dengan nama → `SKILL_PLUGIN_SKILL_NOT_FOUND`. Tidak ada petunjuk bahwa path yang benar adalah `plugins/<nama>` atau `external_plugins/<nama>`. Ukuran nyata: 315 entri; sumber lokal 53, `git-subdir` 98, `url` 164 → AC (tanpa jaringan) hanya dapat meninjau yang lokal. Satu nama (`42crunch-api-security-testing`) tidak lolos regex nama dokumen resmi `^[a-z][a-z0-9]*(-[a-z0-9]+)*$` (manifest-reference.md:35), jadi nama plugin nyata dapat berawalan angka.
- Nilai untuk Agent Core: Pengguna yang menunjuk klon katalog mendapat jawaban "kosong" yang menyesatkan (kejujuran cakupan kecil, GCB-09/13).
- Baseline Agent Core: grep `marketplace` di `src`: 0 hasil. → **BELUM-ADA** (W5 OFB-05 menilai REFERENSI karena tanpa konsumen; ini adalah konsumen: pratinjau menunjuk akar yang salah).
- Delta/celah: bila `.claude-plugin/marketplace.json` ada dan `plugin.json` tidak: pratinjau `kind:'claude-marketplace-preview'` (read-only, `executionAuthority:false`) dengan `plugins:[{name, source:'local'|'remote', path?}]` maksimum 64 (`reportLabel`), `remoteNotFetched:n`, dan galat jelas `SKILL_PLUGIN_MARKETPLACE_ROOT` pada impor; tidak mengikuti URL, tidak membaca di luar akar. Validasi `name` plugin yang dicatat sebagai identitas (OFB-02) harus longgar: `^[a-z0-9][a-z0-9._-]{0,63}$` lalu `reportLabel`.
- Cara adaptasi: `claude-plugin.ts` (±30 baris) + satu kasus di `tests\skill-claude-plugin.test.ts` (fixture sintetis).
- Lisensi/hak cipta: Apache-2.0; hanya format katalog (fakta).
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang-rendah · Butuh skema tool baru: tidak (keluaran) · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: jalur kode (baca), ukuran/jenis entri dan satu nama (tally). Dugaan: seberapa sering pengguna menunjuk akar katalog.
- Disposisi: **ADAPT**

### GCG-09 Inventaris MCP/hook plugin: kunci non-server, kunci yang memuat perintah, dan prevalensi bentuk manifest
- Sumber: AC `claude-plugin.ts:388-399` (hook: `hooks/hooks.json`; MCP: `Object.keys(record(config.mcpServers ?? config))`); `plugin-dev\skills\mcp-integration\examples\stdio-server.json` (kunci `_comment` tingkat-atas string), `references\authentication.md:228-257` (`headersHelper`: skrip yang dijalankan untuk menghasilkan header), `plugin-structure\SKILL.md:200-255` (hook/MCP "atau inline di plugin.json"), `hook-development\SKILL.md:60-120` vs `plugin-structure\SKILL.md:215-227` (hooks.json berpembungkus vs langsung). Tally: 34 `plugin.json` non-terkecualian → kunci hanya `name, description, author, version, license, keywords, userConfig, homepage, repository`; **nol** memakai `mcpServers/hooks/skills/commands/agents` inline. 9 `.mcp.json` non-terkecualian: 1 berpembungkus (`mcpServers`), 8 datar; bentuk entri `type+url`, `type+url+headers`, `command+args`.
- Observasi: Bentuk datar dan berpembungkus sama-sama sudah ditangani AC (`mcpServers ?? config`) dan hooks.json juga (`config.hooks ?? config`). Dua celah kecil: (a) kunci tingkat-atas yang bukan objek server (contoh resmi `_comment`) dihitung sebagai nama server; (b) pratinjau tidak membedakan entri yang **menjalankan proses lokal** (`command`) atau **skrip pembuat header** (`headersHelper`) dari yang jarak jauh.
- Nilai untuk Agent Core: Pratinjau adalah titik keputusan; memperkuat GCB-14 (jenis hook dan transport) dengan dua syarat konkret dan menurunkan prioritas jalur manifest inline (prevalensi nol di korpus resmi → GCB-13 tidak perlu dikejar).
- Baseline Agent Core: grep `headersHelper|_comment` di `src`: 0 hasil. → **SEBAGIAN**.
- Delta/celah: hitung server hanya dari nilai bertipe objek; tambahkan `launches:{localProcess:n, headerScript:n, remote:n}` tanpa menggemakan perintah/URL; bila `plugin.json` mendeklarasikan `mcpServers`/`hooks` sebagai objek inline, laporkan `inlineNotScanned:true` (bukan diikuti).
- Cara adaptasi: `inventoryClaudePlugin` (±15 baris) + fixture sintetis di tes yang ada.
- Lisensi/hak cipta: Apache-2.0; fakta format.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: kode AC, contoh plugin-dev, tally korpus. Dugaan: bahwa plugin pihak ketiga memakai bentuk inline lebih sering daripada korpus resmi.
- Disposisi: **ADAPT**

### GCG-10 Ketepatan `missingReferences` terukur di korpus resmi; jangan diperluas ke "referensi di luar references/"
- Sumber: AC `claude-plugin.ts:186-209`; korpus: 27 `SKILL.md` non-terkecualian. Skrip salinan regex AC (bukan impor).
- Observasi: Hanya 2 dari 27 skill yang ditandai, total 27 referensi hilang, 0 referensi yang keluar dari pohon (`../`). `m5-onboard` (10 referensi `scripts/*.py`, `references/*.md`, `scripts/vendor/`) adalah **positif benar**: SKILL.md menyebut skrip yang tidak terlacak di repositori sama sekali. `plugin-dev/skills/skill-development` (17) adalah **positif palsu**: jalur ilustrasi dalam prosa tutorial (`scripts/rotate_pdf.py`, `references/finance.md`, `assets/logo.png`, ...). Ketepatan ≈ 10/27. Saya juga mencoba token bertanda-kutip lain berekstensi (`.md/.py/.sh/.json/...`): 104 token tak terselesaikan, hampir semuanya berkas **proyek pengguna** (`CLAUDE.md`, `.mcp.json`, `.claude/settings.json`), bukan sumber daya skill.
- Nilai untuk Agent Core: Menutup celah yang dilaporkan "referensi di luar references/": memperluas pemeriksaan ke token lain akan menambah kebisingan, bukan kejujuran. Pemeriksaan sekarang sudah menangkap kasus nyata.
- Baseline Agent Core: **SUDAH-ADA** (advisori) dengan batas presisi yang kini terukur.
- Delta/celah: tidak ada perubahan kode. Opsional: dokumentasikan bahwa `missingReferences` adalah petunjuk, dan jangan jadikan syarat impor; pada tutorial/meta-skill daftar panjang cenderung ilustratif.
- Cara adaptasi: catatan di dokumen preview (satu kalimat) atau di referensi lint OFB-06.
- Lisensi/hak cipta: —
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi (pengukuran). Dugaan: distribusi pada plugin pihak ketiga.
- Disposisi: **REFERENSI**

### GCG-11 Paritas validator Skill resmi, identitas plugin, dan nama yang tidak sama dengan direktori
- Sumber: `skill-creator\...\scripts\quick_validate.py:42-92` (kunci diizinkan = `name, description, license, allowed-tools, metadata, compatibility`; nama `^[a-z0-9-]+$`, tanpa awal/akhir/ganda `-`, ≤64; deskripsi ≤1024 dan **tanpa `<` `>`** (:80); kompatibilitas ≤500; regex frontmatter `^---\n` hanya LF), `scripts\utils.py:7-47`; AC `claude-plugin.ts:90` (`STRICT_KEYS` identik), `:213` (regex menerima CRLF); tally: 34 manifest dengan `name` sama dengan nama direktori dan `version` semver; 27 skill: satu nama tak sama dengan direktori (`hookify/skills/writing-rules` bernama `writing-hookify-rules`); `plugin-validator.md` dan `agent-creator.md` berakhir dengan pagar kode liar + kalimat percakapan.
- Observasi: (1) Validator resmi Anthropic sendiri **menolak** `<` `>` pada deskripsi, padahal tiga skill resmi `math-proof/example-plugin` melanggarnya → penolakan SkillService AC selaras dengan spesifikasi skill, bukan dengan pemuat plugin; pilihan OFB-01 (sanitasi + catat + simpan asli) adalah jalan tengah yang benar. (2) `STRICT_KEYS` AC sama dengan himpunan kunci validator resmi. (3) Nama skill ≠ direktori terjadi di korpus (1/27), jadi `name-mapped`/`name-from-directory` memang diperlukan. (4) Nama plugin harus divalidasi longgar (GCG-08). (5) Artefak kebocoran percakapan pada berkas agen resmi menunjukkan satu lint murah: pagar kode tak berpasangan atau kalimat penutup di akhir berkas.
- Nilai untuk Agent Core: Mengikat usulan OFB-01/02/06 pada bukti: tidak perlu melonggarkan parser ketat; paritas sudah ada pada kunci; uraian ≤1024 karakter harus tetap diperiksa pada jalur adaptasi (dijamin parser ketat via round trip).
- Baseline Agent Core: **SUDAH-ADA** (kunci, CRLF); **SEBAGIAN** (sanitasi `<>` belum, OFB-01).
- Delta/celah: tidak ada perubahan kode tambahan di luar OFB-01/02 dan GCG-08; lint tambahan opsional "pagar kode tak berpasangan di akhir badan" masuk skrip `skill-lint.mjs` OFB-06.
- Cara adaptasi: dokumentasi dan skrip lint OFB-06.
- Lisensi/hak cipta: Apache-2.0; ditulis ulang.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah-sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi (baca penuh `quick_validate.py`, tally).
- Disposisi: **REFERENSI**

### GCG-12 `change_review`: sinyal tes dihapus/berubah dari `uplift_checks`
- Sumber: donor `code-modernization\scripts\uplift_checks.py:6-21,159-189` (berkas tes dibandingkan antara pohon lama dan kerja; gap bila ada berkas tes yang dihapus, bila >25% berubah, atau tidak ada pembanding; hitungan baris diff; "weakened assertions cannot be detected, only that files changed"); AC `change-review.ts:44-45` (`testFiles`, `changedTestFiles` per benih), `:197` (deteksi jalur tes `test|tests|__tests__|spec`), `:403` (`status`), `:91-110` (status `deleted` sudah diparse).
- Observasi: AC sudah tahu berkas tes mana yang berubah **per benih**, tetapi tidak menyebut tes yang **dihapus** atau pangsa tes yang berubah di seluruh perubahan — mode kegagalan agen yang "lulus" dengan menghapus/melemahkan tes.
- Nilai untuk Agent Core: Sinyal deterministik murah yang menjadi bukti-pendukung bagi verifikasi (GCB-12); data sudah dihitung.
- Baseline Agent Core: **SEBAGIAN**.
- Delta/celah: tambahkan `testSignals:{removed:[≤10 path], added:n, changed:n, changedShare}` dari `diff.files` berstatus `deleted/modified/added` pada jalur tes; `gap:true` bila ada yang dihapus. Tanpa menilai kualitas tes (donor mengakui keterbatasan itu).
- Cara adaptasi: `change-review.ts` (±15 baris) + satu tes di `graft-graphify-adoption.test.ts` atau berkas baru.
- Lisensi/hak cipta: Apache-2.0; ide.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi (baca penuh `uplift_checks.py` 1-330; kode AC).
- Disposisi: **ADAPT**

### GCG-13 Pola eval/grader Skill: apa yang sudah dimiliki AC, apa yang tidak, dan cacat harness donor yang dihindari AC
- Sumber: `skill-creator\agents\{grader,comparator,analyzer}.md` (baca penuh), `scripts\run_eval.py` (penuh), `scripts\aggregate_benchmark.py:45-288`, `SKILL.md:290-333`; AC `runtime\skills\capability-packs\mind-control\evals\grader.md`, `scripts\verify\skill-effectiveness-eval.mjs:60-130` (validasi ketat, `complete` vs `observedRuns`, duplikat ditolak, terikat digest), `skill-routing-eval.mjs`.
- Observasi: Aturan donor: PASS hanya bila ada bukti substansi, tak terverifikasi = FAIL, tanpa kredit parsial, beban bukti pada asersi; grader mengekstrak klaim tersirat (faktual/proses/kualitas) dan mengkritik asersinya sendiri; pembanding buta memberi rubrik 1-5 konten+struktur, pemenang tegas, TIE jarang; analis benchmark hanya melaporkan pola (asersi selalu lulus di kedua kondisi, selalu gagal, hanya lulus dengan skill, varians tinggi), bukan saran. AC `grader.md` sudah mensyaratkan substansi (bukan kata kunci), membekukan rubrik dan kasus sebelum pengumpulan, memisahkan subagen per kondisi, menyimpan keluaran mentah termasuk hasil negatif, dan mengakui plafon ("baseline di plafon dipertahankan, bukan bukti peningkatan"). Cacat donor yang AC hindari: `run_eval.py:221-225` menghitung query yang galat/timeout sebagai `False` ("tidak memicu") sehingga kueri negatif **lulus** saat proses crash; `run_eval.py:53-68` menulis berkas perintah sementara di `.claude/commands` proyek nyata (sisa bila proses mati); `aggregate_benchmark.py:130,138,153` mengisi nol bila data hilang (pass_rate 0.0, waktu 0.0, token = `output_chars`), `:271` `runs_per_configuration: 3` tertulis keras, `:207` arah delta = dua nama konfigurasi pertama berurutan abjad.
- Nilai untuk Agent Core: Konfirmasi bahwa harness AC sudah lebih ketat pada tiga titik di atas; celah nyata kecil: (a) tidak ada langkah "bandingkan dua keluaran secara buta" (label diacak, urutan dirandomisasi) sebagai alternatif penilaian terpisah; (b) tidak ada langkah "kritik eval" eksplisit (OFB-07 sudah mengusulkan); (c) tidak ada tanda pada run yang rusak (`invalid`) selain `complete:false`.
- Baseline Agent Core: **SUDAH-ADA** untuk validasi/agregasi/penilaian-substansi; **SEBAGIAN** untuk pembanding buta dan kritik eval.
- Delta/celah: tambahan dokumen satu paragraf pada `mind-control/evals/grader.md`: kondisi `complete:false` (galat/timeout) tidak pernah dihitung sebagai jawaban negatif atau benar; bila ingin pembanding buta, labeli keluaran A/B secara acak dan catat petanya; sisanya OFB-07. Heuristik penulisan dari `SKILL.md:290-333` (generalisasi dari umpan balik, ringkas, jelaskan alasan, huruf kapital ALWAYS/NEVER = tanda kuning, skrip pembantu yang ditulis ulang di tiap run layak dibundel) cocok sebagai catatan lint OFB-06, bukan aturan.
- Cara adaptasi: docs/rubrik (tanpa kode).
- Lisensi/hak cipta: Apache-2.0; parafrase.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi. Dugaan: nilai praktis pembanding buta bagi AC (evaluasi jarang).
- Disposisi: **REFERENSI**

### GCG-14 Penghapusan direktori berpagar (pola donor) dan pelajaran Windows
- Sumber: donor `claude-security\scripts\patch_artifacts.py:1066-1192` (`misplaced_patch_run_reason`, `refuse_reason`: hanya `<laporan>/.claude-security-run/patch-<ts>/scratch-F<n>` yang berisi `.git` sendiri boleh dihapus; symlink ditolak; `retry_removal` melepas bit read-only di Windows), `:813-827` (`clear_stale_products` hanya menghapus nama produk `F<n>.patch/.md`), `render_report.py:909-927` (`remove_run_dir` menolak bila nama/induk tidak sesuai atau symlink), `security-guidance\tests\test_nested_repos.py:325` ("Moved, not deleted: git's object files are read-only on Windows"). AC: 12 pemanggilan `{ recursive: true, force: true }` di `src` (grep).
- Observasi: Donor tidak pernah menghapus jalur yang diturunkan dari data tanpa lebih dulu mencocokkan bentuk jalur tetap (nama regex, induk, bukan symlink). Node `fs.rm` sudah menangani berkas read-only Windows (libuv), jadi bagian `retry_removal` tidak diperlukan.
- Nilai untuk Agent Core: Preferensi pengguna (tanpa sisa berkas, tanpa kehilangan data) menyarankan pagar bentuk-jalur pada penghapusan rekursif yang bukan staging internal. Tidak ada cacat nyata yang saya buktikan.
- Baseline Agent Core: **SEBAGIAN** (kebanyakan penghapusan menyasar jalur internal; belum diaudit satu per satu).
- Delta/celah: audit 12 lokasi; untuk jalur yang diturunkan dari input, tambahkan fungsi `assertFencedRemoval(path, regex)`.
- Cara adaptasi: internal; bukan prioritas.
- Lisensi/hak cipta: claude-security proprietary → hanya pola umum.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: kode donor. Tidak diaudit: 12 lokasi AC.
- Disposisi: **REFERENSI**

---

## Bagian C — Ditolak / tidak relevan (dengan alasan)

- **Hook bash dan validator hook plugin-dev** (`hook-linter.sh`, `validate-hook-schema.sh`, `test-hook.sh`, contoh `validate-*.sh`, `plugin-settings/scripts/*`): bash/jq, tidak ada hook di Agent Core. Catatan kualitas yang mencegah pengambilan: `validate-hook-schema.sh:43-56` membaca kunci tingkat-atas sebagai nama peristiwa sehingga format pembungkus `{"hooks":{...}}` yang diwajibkan SKILL.md ditandai tak dikenal; `validate-agent.sh` mewajibkan `model` dan `color` sedangkan SKILL.md lain menyebutnya opsional; `validate-bash.sh:20-23` menyetujui `echo x; rm -rf ~` karena awalan aman `^(ls|pwd|echo|date|whoami)(\s|$)`; contoh merakit JSON dengan interpolasi `'"$file_path"'` tanpa escape.
- **Hook prompt-ke-model (`hook-development/references/{advanced,patterns,migration}.md`)**: model kedua tersembunyi sebagai penjaga; menurut doktrin AC ditolak. Tidak ada bukti baru.
- **Pola status/penguncian lewat berkas `.local.md` (`command-development/references/advanced-workflows.md:279-448`, seluruh `plugin-settings`)**: rumah penyimpanan paralel, kunci yang dicek-lalu-dibuat lewat instruksi model tidak atomik; ditolak seperti W5.
- **Tutorial format perintah warisan, prompt pembuat agen, templat plugin-structure**: tidak ada aturan baru; outline dan grep kata aturan dicek.
- **`mcp-server-dev/build-mcp-app/*` (kecuali empat berkas kecil yang dibaca)**: widget iframe MCP; AC tidak membangun MCP app dan tidak menambah tool/skema.
- **`security-guidance/tests` untuk launcher, bootstrap SDK, gateway, TLS store, header kustom, cache prompt, usage log, metrik review**: infrastruktur pemanggil model/penyedia; tidak relevan tanpa model tersembunyi.
- **`skill-creator` `improve_description.py`, `run_loop.py`, `generate_report.py`, penampil HTML**: loop optimasi deskripsi memakai model tersembunyi dan percobaan ulang buta; penampil memakai CDN.
- **`hookify` eksekutor (`pretooluse/posttooluse/stop.py`) dan `config_loader.py`**: gagal-terbuka (`finally: sys.exit(0)`, galat impor hanya `systemMessage`); parser YAML ad hoc rapuh (`content.split('---', 2)`, `value.strip('"')` menghapus semua kutip, pecah item pada koma/titik dua sehingga pola `a{1,3}` rusak, jalur `.claude` relatif ke cwd). AC's `readFields` (claude-plugin.ts:143-171) gagal-tertutup dan lebih ketat; tidak ada yang diambil.
- **`siege` brief hakim (matematika)**: orkestrasi puluhan kueri paralel dan ledger pembuktian; hanya pola umum di Bagian D.

---

## Bagian D — Pola lintas-unit dan pertanyaan terbuka

### Pola yang layak jadi standar di Agent Core

1. **"Baca-saja" berarti inode, mtime, dan ukuran identik, dibuktikan dengan fixture basi-stat** (GCG-01). Tes yang hanya membandingkan isi berkas pada fixture bersih tidak membuktikan apa pun tentang efek samping git.
2. **Sematkan format keluaran alat, jangan mewarisi konfigurasi pengguna** (GCG-02, GCG-03): `core.quotePath`, `diff.*Prefix`, `diff.noprefix`, `diff.mnemonicPrefix` mengubah bentuk keluaran yang diparser; opsi CLI lebih kuat daripada `-c` karena tidak bisa ditimpa `.gitmodules`.
3. **Pisahkan "diperkenalkan" dari "sudah ada" sebagai bucket kelas-satu** (`coverage.preExisting` di claude-security; tes donor baseline) — bukan sekadar `lifecycle` dalam-memori (GCG-05).
4. **Batas klaim selalu ikut hasil**: daftar "tidak dibuktikan" (`not_proven`), nol yang dinilai = tidak terbukti, kode keluar bukan-nol kecuali terbukti penuh (GCG-07).
5. **Pemotongan bertanda dan hitungan**: `...[+N chars]`, "sel yang dipotong menyebutnya di baris terakhir", "baca yang putus adalah galat, bukan diff pendek" (GCG-07).
6. **Pembaca artefak lintas-versi yang toleran**: nilai enum tak dikenal → `None`, hitungan hanya bilangan bulat, daftar dibuang bila bukan daftar (`render_report.py:260-272`) — cocok untuk membaca keluaran AC versi lama.
7. **Ukur presisi heuristik pada korpus sebelum memperluasnya** (GCG-10): 10/27 benar; perluasan menambah kebisingan.
8. **Penghapusan hanya pada bentuk jalur yang dikenal** (GCG-14).
9. **Memori terkompresi bukan sumber**: aturan "Retrieval" siege — ringkasan dapat menjatuhkan atau membalik isi hasil, jadi baca berkas jawaban aslinya sebelum bergantung padanya; sejajar dengan kompaksi konteks durable AC (verifikasi sumber sebelum klaim kritis). Ledger klaim append-only dengan RETRACT eksplisit dan "baris terbaru menggantikan" sudah setara dengan supersede Memory AC (SUDAH-ADA).
10. **Jebakan generik JS**: `String.replace(x, stringPengganti)` menginterpretasi `$&`, `$1` pada string pengganti (iframe-sandbox.md:64-66); gunakan fungsi pengganti bila teks tak tepercaya. Tidak diaudit di AC (pertanyaan terbuka #5).

### Pertanyaan terbuka untuk Main

1. Apakah Main menyetujui `-c diff.autoRefreshIndex=false` sebagai perubahan lintas-pemanggil (GCG-01) bersama pembantu OFA-22, atau perbaikan per berkas? Verifikasi akhir di mesin Controller perlu satu kali menjalankan tes basi-stat.
2. `-c safe.directory=<root>` (enam pembantu) mematikan perlindungan kepemilikan git. Apakah itu sengaja demi drive/arsip Windows yang kepemilikannya aneh? Alternatif: hanya tambahkan setelah git sendiri menolak ("dubious ownership") dan catat di hasil. Mohon keputusan pemilik.
3. Apakah baseline git (`HEAD`) untuk klasifikasi "diperkenalkan" (GCG-05) boleh membuat scanner bergantung pada git, dengan `unknown` bila tidak ada git?
4. Apakah pengguna memakai notebook `.ipynb` (GCG-06)? Bila tidak, turunkan ke REFERENSI.
5. Apakah ada tempat lain di AC yang memakai `String.replace` dengan string pengganti dari data tak tepercaya atau `startsWith('..')` untuk containment? Saya hanya memeriksa pola kedua (lima lokasi memakai bentuk presisi, empat tidak). Pola pertama tidak diaudit.
6. Dua tes baru yang diusulkan (indeks basi-stat; path non-ASCII/prefiks) memakai repositori git sementara. Pengguna tidak mau sisa file; fixture harus dihapus di `afterEach` (sudah pola `task-changes.test.ts:18-21`).

---

## Rekap

- Jumlah temuan: 14 (GCG-01 … GCG-14).
- Per disposisi: **ADOPT 3** (GCG-01, 02, 04); **ADAPT 7** (GCG-03, 05, 06, 07, 08, 09, 12); **REFERENSI 4** (GCG-10, 11, 13, 14).
- Lima teratas: GCG-01 (`git diff` menulis ulang `.git/index`, terukur), GCG-02 (hunk hilang untuk path non-ASCII/prefiks, terukur), GCG-03 (daftar tanda git terkeras), GCG-05 (scanner "diperkenalkan vs sudah ada"), GCG-07 (kontrak cakupan scanner).
- Cakupan: lihat "Hitungan cakupan putaran ini" di Bagian A; yang tidak tertutup tercantum di bawahnya.
- Hambatan: path scratchpad terlalu panjang untuk git Win32 (repo uji sementara di folder temp pendek, dihapus); 20 berkas tutorial plugin-dev hanya outline; lima tes git security-guidance dan sisa skrip/tes code-modernization tidak dibuka.
