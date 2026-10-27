# W3 — claude-code: plugins, examples, scripts, .github, .claude, .devcontainer, Script, berkas root (prefix temuan CCP)

Tanggal studi: 2026-10-27. Pekerja baca-saja. Repo sumber `E:\Projects\Side-Project-Dont-Touch\claude-code` di HEAD `a5b0f2e`; studi lama di revisi `b782847db9a18667f00918ea341197f201b22bb4` (2026-09-15). Irisan: semua file terlacak KECUALI `mods/` dan `CHANGELOG.md` (dikerjakan pekerja lain).

Metode jangkauan (semua baca-saja): `git -c safe.directory=* ls-files` (hitung irisan = 237 file), `git diff --stat` dan `git diff` untuk seluruh perubahan sejak `b782847`, `Read` penuh untuk berkas kecil dan menengah, `grep`/`awk` untuk menjangkau seluruh baris pada berkas besar (struktur `def`/`class`, frontmatter semua `SKILL.md`, outline heading plugin-dev), uji regex inline dengan `node -e` pada contoh baris (bukan menjalankan kode sumber), dan `grep`/`Read`/`git ls-files --eol`/`git status --porcelain` pada `E:\Projects\Agent-Core` untuk memverifikasi baseline. Tidak ada skrip, hook, atau biner dari sumber yang dijalankan. Tidak ada rahasia yang dicatat.

Catatan kepatuhan hak cipta: `claude-code/LICENSE.md` berbunyi "© Anthropic PBC. All rights reserved. Use is subject to Anthropic's Commercial Terms of Service". Semua adaptasi di bawah adalah ide/mekanisme yang harus ditulis ulang mandiri; tidak ada teks panjang yang boleh disalin. Plugin di repo ini tidak membawa `license` di `plugin.json` (14 dari 14 manifest tanpa field itu).

---

## Bagian A — Ledger cakupan

### A.1 Hitungan irisan

`git ls-files` seluruh repo = 1615; dikurangi `mods/` dan `CHANGELOG.md` = **237 file** pada irisan ini. Pada `b782847` irisan yang sama berisi 229 file; delta +8 file baru (lihat A.3). Jumlah per unit di tabel A.2 dijumlahkan: 9 + 1 + 3 + 3 + 1 + 6 + 2 + 14 + 8 + 7 + 7 + 1 + 26 + 149 = 237.

Legenda "dibaca": penuh = seluruh baris dibaca; sebagian = bagian terbesar dibaca, sisanya dipindai lewat grep/heading; skim = hanya baris awal/heading/ukuran; tidak = isi tidak dibuka.

### A.2 Tabel unit

| Unit | Jumlah file | Dibaca | Disposisi | Alasan satu baris | ID temuan |
|---|---:|---|---|---|---|
| root: `README.md`, `SECURITY.md`, `LICENSE.md`, `.gitignore`, `.vscode/extensions.json` | 5 | penuh | TOLAK | Pemasaran/instal Claude Code, HackerOne, rekomendasi ekstensi; `LICENSE.md` hanya penting sebagai bukti hak cipta | CCP-10 |
| root: `.gitattributes` | 1 | penuh | ADAPT | `* text=auto eol=lf` + `*.sh text eol=lf` menjawab drift EOL nyata di repo Agent Core | CCP-14 |
| root: `CLAUDE.md` (baru sejak b782847) | 1 | penuh | REFERENSI | 40 baris pedoman hardening workflow; pola "aturan + pemeriksa mekanis + jalur pengecualian" | CCP-17 |
| root: `feed.xml` | 1 | sampel (header, entri terbaru, grep kompaksi/symlink) | REFERENSI | Atom feed turunan CHANGELOG (20 entri v2.1.289–v2.1.310); isi dikerjakan pekerja CHANGELOG | Bagian D |
| root: `demo.gif` | 1 | tidak | TOLAK | Biner 11 MB, demo pemasaran | — |
| `.claude-plugin/marketplace.json` | 1 | penuh | ADAPT | Bentuk marketplace (`plugins[].source = ./plugins/<nama>`); adapter Agent Core tidak mengenalinya | CCP-08 |
| `.claude/commands/` (`triage-issue.md`, `dedupe.md`, `commit-push-pr.md`) | 3 | penuh | REFERENSI | Pola agen terpicu teks pihak luar dengan `allowed-tools` sempit; `commit-push-pr` duplikat plugin | CCP-18 |
| `.devcontainer/` (`Dockerfile`, `devcontainer.json`, `init-firewall.sh`) | 3 | penuh | TOLAK | Linux/iptables/Docker; host Agent Core Windows 10 tanpa Docker | Bagian C |
| `Script/run_devcontainer_claude_code.ps1` | 1 | penuh | TOLAK | Pembungkus `docker`/`podman` + `devcontainer up` | Bagian C |
| `.github/ISSUE_TEMPLATE/` — `github_connection.yml`, `model_behavior.yml`, `config.yml` | 3 | penuh | ADAPT | Taksonomi perilaku model + bidang diagnostik terisi otomatis | CCP-16 |
| `.github/ISSUE_TEMPLATE/` — `bug_report.yml`, `documentation.yml`, `feature_request.yml` | 3 | skim (±60%) | TOLAK | Formulir bug/dokumen/fitur standar; Agent Core sudah punya bug/feature/config | Bagian C |
| `.github/egress-firewall.yaml`, `.github/scripts/check_workflow_hardening.py` (baru) | 2 | penuh | REFERENSI | Allow list egress bernalar + pemeriksa kebijakan dengan tabel pengecualian beralasan | CCP-17 |
| `.github/workflows/` — `workflow-hardening.yml` (baru), `non-write-users-check.yml` | 2 | penuh | REFERENSI | Penjaga CI untuk workflow yang memanggil Claude dan untuk `allowed_non_write_users` | CCP-17, CCP-18 |
| `.github/workflows/` — `claude.yml`, `claude-issue-triage.yml`, `claude-dedupe-issues.yml` (3 diubah) | 3 | penuh | REFERENSI | Runner firewall + `--permission-mode auto` + `--disallowedTools` + `CLAUDE_CODE_SCRIPT_CAPS` | CCP-18, CCP-19 |
| `.github/workflows/` — `sweep.yml`, `issue-lifecycle-comment.yml`, `lock-closed-issues.yml`, `remove-autoclose-label.yml`, `auto-close-duplicates.yml`, `backfill-duplicate-comments.yml`, `issue-opened-dispatch.yml`, `log-issue-events.yml` | 8 | penuh | TOLAK | Otomasi isu publik, lock, telemetri Statsig, dispatch lintas repo; repo Agent Core privat tanpa workflow | Bagian C |
| `.github/workflows/mod-tests.yml` | 1 | penuh | REFERENSI | Mengetes `mods/` lewat `claude plugin test`; domain pekerja `mods/` | Bagian D |
| `scripts/` — `gh.sh`, `edit-issue-labels.sh`, `comment-on-duplicates.sh` | 3 | penuh | REFERENSI | Pembungkus allowlist, target terikat ke event payload, validasi label nyata | CCP-18 |
| `scripts/` — `issue-lifecycle.ts`, `sweep.ts`, `lifecycle-comment.ts` | 3 | penuh | TOLAK | Tabel umur label dan sapuan harian untuk isu publik | Bagian C |
| `scripts/` — `auto-close-duplicates.ts`, `backfill-duplicate-comments.ts` | 2 | penuh | TOLAK | Penutupan isu otomatis + pemicu workflow massal | Bagian C |
| `examples/settings/` — `README-hipaa.md`, `settings-hipaa.json`, `managed-mcp-hipaa.json` (baru) | 3 | penuh | ADAPT | Daftar kredensial/jalur/tool yang mengirim isi keluar mesin; pola dokumen "tidak mencakup apa" | CCP-07, CCP-20 |
| `examples/settings/` — `README.md` (diubah), `settings-strict.json`, `settings-lax.json`, `settings-bash-sandbox.json` | 4 | penuh | TOLAK | Preset kebijakan terkelola produk Claude Code; Agent Core tak punya lapis terkelola | Bagian C |
| `examples/mdm/` — `README.md`, `managed-settings.json`, `windows/Set-ClaudeCodePolicy.ps1` | 3 | penuh | TOLAK | Distribusi kebijakan lewat Intune/Jamf | Bagian C |
| `examples/mdm/` — `.plist`, `.mobileconfig`, `.admx`, `.adml` | 4 | skim (baris awal) | TOLAK | Format MDM macOS/GPO | Bagian C |
| `examples/hooks/bash_command_validator_example.py` | 1 | penuh | TOLAK | Contoh hook PreToolUse (exit 2 memblokir); hook sebagai otoritas ditolak | Bagian C |
| `examples/gateway/aws/` (13 file) dan `examples/gateway/gcp/` (13 file) | 26 | sampel (±15%: dua README, `gateway.yaml.example` AWS 120 baris, header `setup.sh`, `Dockerfile` AWS, README terraform AWS) | TOLAK | Infrastruktur cloud gateway (Terraform, ECS/Cloud Run, Postgres, OIDC); tidak ada padanan lokal | Bagian C |
| `plugins/README.md` | 1 | penuh | REFERENSI | Indeks plugin; tabel isi tiap plugin | — |
| `plugins/security-guidance/` (v2.0.0): `README.md`, `plugin.json`, `hooks.json`, `patterns.py`, `_base.py`, `extensibility.py`, `session_state.py`, `diffstate.py`, `gitutil.py`, `sg-python.sh`, `ensure_agent_sdk.py`, `review_api.py` | 12 | penuh | ADAPT | Katalog 25 aturan, model kepercayaan tambahan-saja, metode investigasi→sanggahan, penyaringan berkas peninjauan | CCP-01–07, CCP-15 |
| `plugins/security-guidance/hooks/llm.py` (112 KB) | 1 | sebagian (±65%: baris 1–300, 596–1578) | ADAPT | Prompt peninjauan diff, pipeline dua tahap, pembersihan env proses anak | CCP-05, CCP-06 |
| `plugins/security-guidance/hooks/security_reminder_hook.py` (103 KB) | 1 | sebagian (±40%: konfigurasi, state, `check_patterns`, UPS, Stop, `main`; commit/push-sweep dipindai lewat grep) | REFERENSI | Orkestrasi hook Claude Code; lapisan LLM otomatis ditolak | Bagian C |
| `plugins/plugin-dev/` (v0.1.0): 58 file | 58 | penuh 9 (`plugin-validator.md`, `skill-reviewer.md`, `manifest-reference.md`, `skill-development/SKILL.md`, `create-plugin.md`, `plugin-structure/SKILL.md`, `validate-hook-schema.sh`, `hook-linter.sh`, `hook-development/SKILL.md` baris 1–140 dihitung sebagian); sebagian 6; skim 27 (baris awal + heading); sisanya (±16) tidak dibuka isinya, hanya outline heading/ukuran | REFERENSI | Panduan menulis komponen Claude Code; hanya format manifest dan aturan path relevan bagi adapter | CCP-09, CCP-11, Bagian C |
| `plugins/hookify/` (v0.1.0) | 24 | penuh 16; skim 8 (`__init__.py` kosong, `posttooluse.py`, `userpromptsubmit.py`, 2 contoh, `help.md` sebagian) | TOLAK (mesin) / REFERENSI | Aturan regex di markdown + blok via hook; koreksi→kandidat sudah dimiliki Learning | CCP-09, Bagian C |
| `plugins/pr-review-toolkit/` | 9 | penuh 4 (`README.md` sebagian, `silent-failure-hunter.md`, `comment-analyzer.md`, `pr-test-analyzer.md`); skim 5 | ADAPT | Lensa tinjauan: kegagalan senyap, drift komentar, celah tes bernilai 1–10, invarian tipe | CCP-13 |
| `plugins/code-review/` | 3 | penuh (`code-review.md`, `plugin.json`); README sebagian | ADAPT | Daftar "jangan lapor", validasi tiap temuan, kepatuhan CLAUDE.md per cakupan path | CCP-13 |
| `plugins/feature-dev/` | 6 | penuh 5 (command, 3 agen, `plugin.json`); README skim | REFERENSI | 7 fase dengan gerbang persetujuan; sudah dicakup skill spec/plan/interview | Bagian C |
| `plugins/frontend-design/` (v1.1.0) | 3 | penuh (`SKILL.md` ±seluruhnya, `plugin.json`); README skim | ADAPT | Proses desain orisinal: rencana token → tinjau terhadap brief → bangun → kritik; daftar "tanda tangan AI" | CCP-12 |
| `plugins/claude-opus-4-5-migration/` | 5 | penuh | REFERENSI | Migrasi string model + penyesuaian prompt per generasi model; tak ada string Claude di `src/` Agent Core | Bagian C |
| `plugins/agent-sdk-dev/` | 5 | penuh 2 (`new-sdk-app.md` ±60%, `agent-sdk-verifier-ts.md` ±50%); skim 3 | TOLAK | Scaffolding aplikasi Anthropic Agent SDK | Bagian C |
| `plugins/commit-commands/` | 5 | penuh 4 (3 command + `plugin.json`); README skim | TOLAK | Otomasi commit/push/PR satu pesan; `clean_gone` menghapus cabang/worktree tanpa konfirmasi | Bagian C |
| `plugins/explanatory-output-style/`, `plugins/learning-output-style/` | 8 | penuh 6 (hook JSON + skrip sesi + plugin.json); README skim | TOLAK | Injeksi konteks SessionStart menambah token; Agent Core sudah punya kontrak gaya jawaban ringkas | Bagian C |
| `plugins/ralph-wiggum/` | 8 | penuh 4 (`stop-hook.sh`, `setup-ralph-loop.sh` ±40%, `ralph-loop.md` ±40%, `plugin.json`); skim 4 | TOLAK | Loop retry otomatis via hook Stop; tidak ada bukti baru | Bagian C |
| **Total** | **237** | | | | |

Pembagian kedalaman (perkiraan per jumlah file, bukan per byte): penuh ±135 file (57%), sebagian ±14 (6%), skim/sampel ±58 (24%), tidak dibuka ±30 (13%; termasuk `demo.gif`, 13 berkas gateway terraform/GCP, 4 berkas MDM biner/XML, dan ±16 berkas contoh/referensi plugin-dev yang hanya dilihat judul dan ukurannya).

### A.3 Delta `b782847..a5b0f2e` (dibaca semuanya)

Perintah yang diminta dijalankan: `git diff --stat` untuk `plugins examples scripts .github .claude Script .devcontainer` = 11 berkas berubah, +762/-5. Ditambah root non-`mods`: `CLAUDE.md` (+40, baru), `feed.xml`, `CHANGELOG.md` (pekerja lain). Tidak ada perubahan apa pun di `plugins/`. `plugins/claude-opus-4-5-migration` sudah ada di `b782847` dan tidak berubah (jadi "baru" hanya relatif terhadap studi yang lebih lama).

| Berkas | Perubahan | Disposisi | ID |
|---|---|---|---|
| `.github/scripts/check_workflow_hardening.py` (+339, baru) | Pemeriksa: job yang memanggil Claude wajib `runs-on: ubuntu-24.04-firewall`, `--permission-mode auto` pada model ≥ claude-opus-4-6, tanpa `defaultMode`, tanpa `--dangerously-skip-permissions`; kebijakan egress wajib `mode: enforce` tanpa `*` | REFERENSI | CCP-17 |
| `.github/workflows/workflow-hardening.yml` (+23, baru) | CI menjalankan pemeriksa pada PR dan push `main`; `permissions: contents: read`; checkout dipin SHA | REFERENSI | CCP-17 |
| `.github/egress-firewall.yaml` (+27, baru) | Allow list host penuh, tiap entri diberi komentar siapa yang memakai | REFERENSI | CCP-17, CCP-20 |
| `CLAUDE.md` (+40, baru) | Tiga perlindungan + cara menambah pengecualian | REFERENSI | CCP-17 |
| `claude.yml`, `claude-issue-triage.yml`, `claude-dedupe-issues.yml` (±9 tiap berkas) | Runner `ubuntu-24.04-firewall`; `--permission-mode auto`; `--disallowedTools "WebFetch,WebSearch,Write,Edit,MultiEdit,NotebookEdit"`; model dari `claude-sonnet-4-5-20250929` ke `claude-sonnet-4-6` | REFERENSI | CCP-18 |
| `.github/ISSUE_TEMPLATE/github_connection.yml` (+37, baru) | Formulir masalah koneksi GitHub di claude.ai; bidang "Diagnostics" diisi otomatis, `render: text` | ADAPT | CCP-16 |
| `examples/settings/README-hipaa.md` (+155), `settings-hipaa.json` (+152), `managed-mcp-hipaa.json` (+3), `README.md` (+4) | Contoh kebijakan terkelola HIPAA: sandbox wajib, allowlist jaringan, deny kredensial, retensi 30 hari, MCP dimatikan | ADAPT/REFERENSI | CCP-07, CCP-20 |

---

## Bagian B — Temuan

Ringkasan: 20 temuan — ADOPT 1, ADAPT 15, REFERENSI 4. Urutan: scanner keamanan (01–04, 15), Skill baru (05, 12, 13), hardening mesin (06, 07, 14), adapter plugin Claude (08–11), proses repo (16–20).

### CCP-01 Presisi aturan bawaan `changed_source`: false positive tinggi pada `RegExp.exec(`
- Sumber: `plugins/security-guidance/hooks/patterns.py:72-94` (aturan `child_process_exec`, komentar baris 73-77 tentang gating JS/TS), `:100-107` (`eval` dengan lookbehind yang menolak `.`; berkas dokumen dilewati), `:193-196` (TLS hanya cocok bila nilai 0: `rejectUnauthorized\s*:\s*false`, `NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*"?0`), `:128-129` (pickle hanya `load/loads/Unpickler`, bukan `dump`).
- Observasi: sumber membedakan pemanggilan fungsi bebas `exec(` dari pemanggilan metode `.exec(` memakai lookbehind `(?<![a-zA-Z0-9_\.])`, dan komentar menyebut alasannya (menghindari `model.eval()`, `redis.eval`, `exec` Python di prosa). Aturan dibatasi ekstensi (`path_filter`) dan melewati berkas dokumen.
- Nilai untuk Agent Core: scanner yang berisik dan berseverity "high" cepat diabaikan; presisi menentukan apakah hasil `changed_source` dipercaya.
- Baseline Agent Core: `src/code-intelligence/changed-source-security.ts:46` memakai `\b(?:exec|execSync|os\.system)\s*\(` tanpa lookbehind dan tanpa gating ekstensi, severity `high`. Diuji inline di mesin ini dengan regex yang sama: baris `rule.regex.exec(line)` dan `HUNK_RE.exec(line)` ditandai. `grep` pada `src/**/*.ts` non-tes menemukan 113 pemanggilan `.exec(` di 41 berkas — semuanya akan menjadi temuan "high" bila berkas itu berubah. Baris 47 (`TLS.DISABLED`) menandai setiap penyebutan `NODE_TLS_REJECT_UNAUTHORIZED`, termasuk `= "1"` dan `delete process.env.…` (diuji). Tidak ada tes untuk scanner (grep `AC.SECURITY`/`changed_source` di `tests/` dan `src/` tanpa hasil selain implementasi dan pemanggil). Status: SEBAGIAN (aturan ada, presisi rendah).
- Delta/celah: lookbehind yang menolak `.`/`$`/identifier sebelum `exec`; TLS hanya bila nilai menonaktifkan (`=0`, `false`); gating ekstensi per aturan; tes sampel positif dan negatif.
- Cara adaptasi: ubah `BUILTIN_RULES` di berkas yang sama (pemilik tunggal); `CompiledRule` sudah punya `include`/`exclude`, tinggal dipakai untuk aturan bawaan; tambah satu berkas tes kecil di `tests/` berisi baris positif/negatif. Tanpa tool baru.
- Lisensi/hak cipta: pola nama API publik (`exec`, `rejectUnauthorized`) bukan ekspresi yang dilindungi; tulis regex sendiri, jangan salin komentar.
- Perkiraan skala: S · Risiko: rendah (perubahan hanya mengurangi false positive; pastikan `execSync(`/`child_process.exec(` tetap tertangkap) · Nilai: tinggi · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: terverifikasi — kode scanner dibaca penuh, regex diuji pada 8 baris contoh, jumlah 113/41 dari grep. Dugaan: sebagian besar dari 113 itu memang regex, bukan eksekusi shell (sampel 5 baris pertama semuanya regex).
- Disposisi: ADOPT

### CCP-02 Perluas katalog aturan bawaan dan tambah gerbang path/ekstensi
- Sumber: `plugins/security-guidance/hooks/patterns.py:30-261` (25 aturan), terutama `:32-70` (workflow GitHub Actions memakai `path_check` dan daftar field event yang tidak tepercaya), `:109-122` (`dangerouslySetInnerHTML`, `document.write`, `.innerHTML =`), `:219-227` (`outerHTML`, `insertAdjacentHTML`), `:184-192` (`crypto.createCipher`, AES-ECB), `:229-238` (skrip eksternal tanpa `integrity`), `:157-176` (Go `exec.Command("sh", …)`).
- Observasi: tiap aturan punya `ruleName`, `reminder` (pesan perbaikan), dan salah satu dari `path_check`, `path_filter`, `substrings`, `regex`; sebuah `assert` saat impor memaksa setiap aturan punya ID stabil (`RuleId`, baris 328-334).
- Nilai untuk Agent Core: scanner sekarang hanya 7 aturan. Bagian yang relevan bagi proyek TS/JS/PowerShell/UI React ini adalah sink DOM, workflow CI, kripto, dan eksekusi.
- Baseline Agent Core: `changed-source-security.ts:45-51` — 7 aturan (eval, shell exec, TLS, pickle, dangerouslySetInnerHTML, chmod 777, literal kredensial). Tidak ada aturan DOM selain React, tidak ada aturan workflow, kripto, atau deserialisasi YAML/XML. Tidak ada gerbang ekstensi untuk aturan bawaan. Status: SEBAGIAN.
- Delta/celah: tambah aturan berprioritas — `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write` (UI di `src/ui`), `.github/workflows/*.yml` dengan `${{ github.event.* }}` di `run:`, `createCipher`/AES-ECB, `new Function` sudah ada. Aturan Python (yaml.load, torch.load, marshal, shelve, XML stdlib) hanya bila proyek Python ikut berubah (ada Python di `SubProject/` dan skill). Usulan tambahan khusus Windows (inferensi saya, tidak ada di sumber): `Invoke-Expression`, `-ExecutionPolicy Bypass` pada skrip yang dibuat Agent — perhatikan `package.json` sendiri memakai `-ExecutionPolicy Bypass` untuk `recovery:*`, jadi aturan ini perlu diberi severity `info`.
- Cara adaptasi: tambah entri ID `AC.SECURITY.*` di `BUILTIN_RULES` (ID stabil, jangan renumber); simpan batas jumlah wajar (<20 aturan) agar scan 128 berkas × baris tetap cepat di mesin lambat; gerbang ekstensi lewat `include`.
- Lisensi/hak cipta: tulis ulang daftar sendiri; jangan salin pesan `reminder` (teks Anthropic).
- Perkiraan skala: S–M · Risiko: sedang (tiap aturan baru menambah false positive; wajib punya tes negatif) · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: terverifikasi daftar sumber dan baseline; relevansi per aturan adalah penilaian saya.
- Disposisi: ADAPT

### CCP-03 Kejujuran hasil scanner: berkas melewati batas 128 dipotong diam-diam, dan "resolved" palsu untuk berkas yang dilewati
- Sumber: `plugins/security-guidance/hooks/llm.py:158-183` (`_cap_files_for_prompt`: penanda pemotongan ditulis DI DALAM konten dan jumlah byte terbuang dicatat), `security_reminder_hook.py:1835-1844` (berkas melewati batas diprioritaskan berdasarkan risiko, jumlah yang dibuang dicatat), `diffstate.py:332-376` (`sweep_pending_warnings`: berkas yang tidak terbaca dihitung "fixed" hanya karena hilang), `gitutil.py:512-547` (`_prioritize_diff_files`).
- Observasi: sumber tidak pernah memotong tanpa tanda; penghitung berkas yang dijatuhkan dan penanda dalam konten membuat pembaca tahu hasil tidak lengkap. Pengurutan prioritas memakai token risiko di path (`auth`, `token`, `exec`, `route`, `sql`, …) lalu jumlah baris tambahan; sufiks hasil-generate (`.gen.ts`, `.test.ts`) dan folder `migrations`/`fixtures` ke belakang.
- Nilai untuk Agent Core: hasil "bersih" dari scanner dapat dibaca controller sebagai bukti tidak ada temuan padahal sebagian berkas tidak dipindai.
- Baseline Agent Core: `changed-source-security.ts:117` — `[...new Set(input.files.map(normalizeRelative))].slice(0, MAX_FILES)` memotong ke 128 lalu `filesRequested: files.length` (baris 180) melaporkan jumlah SETELAH dipotong; berkas yang jatuh tidak masuk `skipped`. Baris 163-171: `resolved` dihitung sebagai semua kunci sebelumnya yang tidak ada di pindaian sekarang; berkas yang dilewati karena `size-limit` atau `not-regular-file` (baris 130-131) tidak menghasilkan temuan, sehingga temuan lamanya dilaporkan "resolved" padahal belum diperiksa. Hanya `ENOENT` (berkas hilang) layak dianggap resolved. Status: BUG (kejujuran hasil), BELUM-ADA penanda.
- Delta/celah: laporkan `filesRequested` asli, `filesDropped` dan alasannya (`file-cap`), `scanComplete: boolean`; kecualikan kunci dari berkas yang dilewati selain `missing` dari `resolved`; bila perlu urutkan berkas berlebih dengan token risiko path sebelum dipotong.
- Cara adaptasi: perubahan lokal di `scanChangedSourceSecurity` (field output baru, bukan skema input); `lifecycle` tetap di memori. Tanpa tool baru.
- Lisensi/hak cipta: prinsip, tulis sendiri.
- Perkiraan skala: S · Risiko: rendah · Nilai: tinggi (bukti yang tidak menyesatkan) · Butuh skema tool baru: tidak (hanya bentuk keluaran) · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: terverifikasi dengan membaca kode; belum dijalankan (tidak ada tes). Dugaan: controller memang bisa mengirim >128 berkas (batas input ada di `MAX_FILES` saja).
- Disposisi: ADAPT

### CCP-04 Pisahkan temuan "diperkenalkan perubahan ini" dari "sudah ada di berkas"
- Sumber: `plugins/security-guidance/hooks/gitutil.py:657-722` (`filter_preexisting_from_diff`: baris tambahan yang juga ada di baris terhapus diubah menjadi konteks), `security_reminder_hook.py:2134-2146` (aturan pola pada penulisan ulang berkas hanya menandai pola yang TIDAK ada di versi baseline), `review_api.py:291-344` (`tag_diff_anchor`: `in_diff` atau `off_diff`, `off_diff` butuh bukti lebih ketat), `llm.py:751-763` (instruksi: hanya laporkan yang baru di baris `+`, kecuali aliran data baru ke sink lama).
- Observasi: tiga lapis menekan temuan lama: filter diff, supresi berbasis baseline, dan tag jangkar-diff dengan pengecualian eksplisit untuk "jalur data baru ke sink yang sudah ada".
- Nilai untuk Agent Core: `changed_source` memindai seluruh isi berkas yang berubah, jadi mengubah satu baris di berkas besar memunculkan semua pola lama. Controller tidak bisa membedakan regresi baru dari utang lama.
- Baseline Agent Core: scanner membaca seluruh berkas (`changed-source-security.ts:135-155`); `lifecycle: 'new' | 'still-present'` hanya relatif terhadap panggilan sebelumnya di memori proses (`lifecycle` Map, baris 42, maksimal 64 scope; hilang saat restart). Data sumber tersedia di tempat lain: `src/rdc/checkpoints/task-changes.ts` (diff per berkas dengan teks unified, batas 24 KB) dan `src/code-intelligence/change-review.ts:116-151` (hunk dengan rentang baris `+`). Tidak ada hubungan antara keduanya dan scanner. Status: BELUM-ADA.
- Delta/celah: tandai tiap temuan `introducedByChange: true|false|unknown` berdasarkan apakah barisnya ada di rentang baris tambahan diff (`git diff -U0` terhadap `HEAD`, atau diff checkpoint task); `unknown` bila tidak ada baseline.
- Cara adaptasi: hitung rentang baris di dalam scanner lewat `git diff -U0 --no-ext-diff --no-textconv HEAD -- <file>` (tanpa parameter input baru, sehingga manifest tool tidak membesar); gunakan helper git yang diperkuat (CCP-06). Keluaran: satu field per temuan.
- Lisensi/hak cipta: ide umum diff-aware scanning; implementasi mandiri.
- Perkiraan skala: M · Risiko: sedang (berkas untracked/baru: seluruh baris dianggap tambahan; rename perlu `--find-renames`) · Nilai: sedang–tinggi · Butuh skema tool baru: tidak (bila tanpa input baru) · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: baseline terverifikasi; dampak ke kegunaan adalah inferensi. Belum diuji bagaimana controller memakai keluaran saat ini.
- Disposisi: ADAPT

### CCP-05 Skill baru `security-change-review`: metode investigasi→sanggahan untuk diff
- Sumber: `plugins/security-guidance/hooks/review_api.py:71-119` (`AGENTIC_INVESTIGATE_SYSTEM`: fase peta titik masuk/sink, jejak aliran data, "ikuti nilai kembalian", paritas gerbang antar-saudara, selisih parser/validator, 14 pola sering terlewat, anggaran ±15 panggilan alat), `:183-283` (prompt sanggahan: identifikasi penyerang dan korban; daftar kondisi sanggahan; batas "tidak ada batas hak istimewa" dengan pengecualian eksplisit), `llm.py:786-899` (rubrik kelas kerentanan, daftar "JANGAN laporkan", kerangka keputusan), `:1329-1378` (pass kedua dengan hasil pass pertama dibungkus blok data `<excluded_findings>` yang disanitasi), `:1537-1546` (kegagalan skema pada tahap sanggahan = pertahankan semua).
- Observasi: ini bukan sekadar daftar OWASP. Isinya cara berpikir yang spesifik: membandingkan handler dengan saudaranya yang punya gerbang, memeriksa apakah gerbang membaca field yang sama dengan yang dipakai aksi, memeriksa jalur gagal-terbuka (`except: pass`, `unwrap_or({})`, nilai batas yang tepat), memeriksa registri keamanan yang tertinggal saat entitas baru ditambah, dan membedakan korban = penyerang (sanggah) dari lintas-prinsipal (pertahankan), dengan pengecualian untuk gerbang kapabilitas agen LLM, SSRF, dan paparan data.
- Nilai untuk Agent Core: proyek ini mengirim perubahan sensitif (OAuth, token, jalur file, pengamanan tunnel); tinjauan diff yang disiplin mencegah regresi gerbang.
- Baseline Agent Core: `runtime/skills/capability-packs/security-and-hardening/SKILL.md` (19 KB, daftar kontrol saat membangun: trust boundary, SSRF, IDOR, injeksi prompt; `references/hardening-patterns.md`), `doubt-driven-development` (tinjauan adversarial generik, 18 KB), `code-review-and-quality` (22 KB; tidak ada daftar "jangan lapor" atau fase sanggahan). `grep` pada ketiganya untuk `refute|diff-anchor|sibling|fail-open|parity` tidak menemukan metode ini. Status: BELUM-ADA (metode tinjauan diff keamanan); SUDAH-ADA (disiplin adversarial generik dan checklist bangun).
- Delta/celah: satu Skill sumber baru di `runtime/skills/capability-packs/security-change-review/` dengan `## Triggers` / `## Non-triggers` (non-trigger: membangun fitur baru → `security-and-hardening`), badan ≤ 8.192 byte, dan satu atau dua file `references/` (katalog pola sering-terlewat; kondisi sanggahan). Tahap sanggahan dikerjakan oleh model aktif yang sama sebagai langkah eksplisit — bukan model kedua tersembunyi. Bagian "jangan lapor" dan pengecualian batas hak istimewa dipertahankan karena itulah bagian yang menurunkan false positive.
- Cara adaptasi: Skill (konten), melalui proposal Skill/Learning agar lewat gerbang revisi; tambah satu entri ke `agent-core-capability-index` (konten on-demand). Contoh perintah memakai PowerShell/`git`, bukan bash.
- Lisensi/hak cipta: prompt Anthropic berhak cipta penuh — jangan salin kalimat. Tulis ulang konsepnya dengan kata sendiri dan contoh dari kode Agent Core (OAuth `src/oauth`, `src/http/security-policy.ts`). Konsep seperti "paritas gerbang antar-saudara" adalah pengetahuan keamanan umum.
- Perkiraan skala: M · Risiko: rendah (konten); risiko pengkodean ulang yang terlalu mirip sumber · Nilai: sedang–tinggi · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak (indeks kapabilitas bertambah satu baris; dimuat on-demand)
- Bukti vs dugaan: prompt dibaca penuh; klaim "belum ada" didasarkan pada grep pada tiga Skill terdekat, bukan pada seluruh 39 Skill.
- Disposisi: ADAPT

### CCP-06 Perkuat pemanggilan `git` pada repo asing (fsmonitor, `safe.directory`, resolusi biner)
- Sumber: `plugins/security-guidance/hooks/gitutil.py:25-29` (`GIT_CMD` selalu memuat `-c core.fsmonitor=false -c core.hooksPath=/dev/null`), `llm.py:1029-1056` (lingkungan proses anak: `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_EXTERNAL_DIFF=""`, `GIT_DIFF_OPTS=""`, `GIT_PAGER=cat`, `GIT_SSH_COMMAND=/bin/false`, `GIT_TERMINAL_PROMPT=0`, `GIT_OPTIONAL_LOCKS=0`; komentar: allowlist `git diff/log/show` tidak boleh menjadi RCE lewat `diff.external`, `core.pager`, `core.sshCommand`), `:1161-1167` (biner dicari hanya lewat path absolut karena di Windows pencarian bawaan memeriksa direktori kerja lebih dulu; `./claude.exe` yang ada di repo akan terpanggil).
- Observasi: pembuat plugin memperlakukan repo yang sedang diperiksa sebagai tidak tepercaya dan menetralkan konfigurasi yang dapat mengeksekusi perintah.
- Nilai untuk Agent Core: Agent Core membaca banyak repo pihak ketiga (seluruh sumber studi ini adalah klon asing) dan menjalankan `git` di dalamnya dari delapan modul.
- Baseline Agent Core: hanya `src/rdc/checkpoints/task-changes.ts:103` memasang `-c core.fsmonitor=false` dan `GIT_TERMINAL_PROMPT=0`. Tujuh pemanggil lain tidak: `src/code-intelligence/change-review.ts:66`, `src/memory/repository-identity.ts:14`, `src/memory/provenance.ts:99`, `src/semantic-ide/workspace-policy.ts:76`, `src/code-intelligence/graph-observability.ts:294`, `src/code-intelligence/workspace-resolver.ts:163`; `src/workflows/service.ts:73` hanya memakai `GIT_CONFIG_NOSYSTEM` (dan tanpa `-c safe.directory`). Semua pemanggil yang memakai `-c safe.directory=<root>` menonaktifkan pemeriksaan kepemilikan Git untuk repo tersebut. `task-changes.ts:103` juga memanggil `git` (nama polos) dengan opsi `cwd` = workspace pengguna. Status: SEBAGIAN.
- Delta/celah: satu helper bersama yang menambahkan `-c core.fsmonitor=false`, `--no-optional-locks`, `GIT_TERMINAL_PROMPT=0`, dan (bila perlu) `GIT_EXTERNAL_DIFF`/`GIT_PAGER` kosong; semua pemanggil memakainya. `core.hooksPath` tidak perlu untuk perintah baca-saja (hook hanya jalan pada perintah tulis). Opsional: resolusi sekali absolut `git.exe` dari PATH (tanpa direktori kerja) untuk menutup pencarian-cwd.
- Cara adaptasi: modul kecil di `src/process/` (sudah ada `owned-process-tree.ts`) atau `src/security/`; ganti tujuh helper `git()` lokal dengan satu impor. Tanpa tool baru.
- Lisensi/hak cipta: daftar variabel lingkungan Git adalah fakta dokumentasi Git; tulis sendiri.
- Perkiraan skala: S–M · Risiko: rendah–sedang (menggeser perilaku di 8 modul; jalankan tes memori/provenance yang ada) · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: terverifikasi bahwa tujuh pemanggil tidak menetralkan `core.fsmonitor`. DUGAAN yang harus diuji di sandbox sementara sebelum diklaim sebagai kerentanan: (a) apakah `git diff --name-status`/`ls-files` benar-benar menjalankan perintah `core.fsmonitor` dari `.git/config` repo asing pada versi Git di mesin ini; (b) apakah libuv/Node di Windows mencari `git.exe` di `cwd` anak sebelum PATH untuk `execFile('git', …, { cwd })`. Keduanya belum saya uji (membutuhkan eksekusi).
- Disposisi: ADAPT

### CCP-07 Katalog jalur dan variabel kredensial terpusat
- Sumber: `examples/settings/settings-hipaa.json:24-47` (deny Read/Edit untuk `~/.ssh`, `~/.aws`, `~/.config/gh`, `~/.npmrc`, `~/.git-credentials`, `~/.config/git/credentials`, `~/.netrc`, `~/_netrc`, `~/.claude/.credentials.json`, `~/.claude.json`, cadangan dan `~/.claude/backups`), `:88-120` (variabel kredensial: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN`, `GH_ENTERPRISE_TOKEN`, `GITHUB_ENTERPRISE_TOKEN`, `NPM_TOKEN`, `NODE_AUTH_TOKEN`, `YARN_NPM_AUTH_TOKEN`, `YARN_NPM_AUTH_IDENT`, `COREPACK_NPM_TOKEN/PASSWORD/USERNAME`, `BUN_CONFIG_TOKEN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`), `README-hipaa.md:46-50` (peringatan: tolak berdasarkan nama persis; ejaan lain seperti `XDG_CONFIG_HOME` yang dipindah, `npm_config_*`, dan variabel penunjuk `NPM_CONFIG_USERCONFIG`/`NETRC` tidak tercakup).
- Observasi: daftar tunggal, eksplisit, dengan catatan kelemahan nama persis, dipakai di tiga lapis (deny file, deny sandbox, deny env).
- Nilai untuk Agent Core: daftar "jalur rahasia" Agent Core tersebar dan tidak sama.
- Baseline Agent Core: tiga regex terpisah — `src/mcp/external-controller-tool-support.ts:71` (`.env*`, `secrets?`, `credentials?`, `.ssh`, `.aws`, `id_rsa`, `id_ed25519` untuk keputusan menghilangkan bukti), `src/memory/source-snapshot.ts:37-40` (daftar komponen terlarang untuk snapshot sumber memori), `src/security/redaction.ts:2` (`SENSITIVE_KEY`: token|secret|password|passphrase|authorization|api.?key|credential|private.?key|…). Tidak ada `.netrc`/`_netrc` (Windows memakai `_netrc`), `.git-credentials`, `.npmrc`, `.config/gh`, `.docker/config.json`. Nama `YARN_NPM_AUTH_IDENT` dan `AWS_ACCESS_KEY_ID` tidak cocok dengan `SENSITIVE_KEY` (diperiksa langsung pada regex), sehingga `buildOwnedChildEnv` (`src/security/environment.ts:15-24`) akan mewariskannya. Status: SEBAGIAN.
- Delta/celah: satu konstanta bersama (komponen jalur + pola nama variabel) yang dipakai ketiga tempat; tambahan Windows-spesifik `_netrc`, `%APPDATA%` yang setara untuk npm/gh; variabel `*_AUTH_IDENT`, `NPM_CONFIG__AUTH`.
- Cara adaptasi: tambah di `src/security/` (pemilik); ketiga pemanggil mengimpor. Tidak mengubah perilaku `buildMachineShellEnv` (sengaja mempertahankan env pengguna).
- Lisensi/hak cipta: daftar adalah fakta publik tentang lokasi kredensial; tulis sendiri.
- Perkiraan skala: S–M · Risiko: sedang (memperluas penghilangan bukti dan filter env dapat menyembunyikan variabel yang dibutuhkan proses anak; jangan ubah env shell mesin) · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: terverifikasi pada tiga lokasi kode dan regex; belum dihitung berapa banyak panggilan nyata yang terpengaruh.
- Disposisi: ADAPT

### CCP-08 Preview Skill harus mengenali akar marketplace (`.claude-plugin/marketplace.json`)
- Sumber: `.claude-plugin/marketplace.json:1-150` (`name`, `owner`, `plugins[]` dengan `name`, `description`, `version`, `author`, `source: "./plugins/<nama>"`, `category`); dua repo sumber saudara juga berupa akar marketplace (`claude-plugins-official/.claude-plugin/marketplace.json`, `knowledge-work-plugins/.claude-plugin/marketplace.json`, dilihat lewat `ls`/`head`).
- Observasi: semua repo yang sedang dipelajari adalah marketplace; komponennya berada satu tingkat lebih dalam daripada tempat adapter mencari.
- Nilai untuk Agent Core: pengguna wajar mengarahkan `skills(validate)` ke repo itu; hasilnya sekarang kosong dan menyesatkan.
- Baseline Agent Core: `src/skills/claude-plugin.ts:349-352` — `isClaudePluginRoot` bernilai true jika ada `.claude-plugin`; `:355-400` — `inventoryClaudePlugin` hanya membaca `.claude-plugin/plugin.json`, `skills/`, `commands/`, `agents/`, `hooks/`, `.mcp.json` di akar. Pada akar marketplace semuanya tidak ada, jadi pratinjau berisi `manifest: 'absent'` dan nol komponen (`src/skills/service.ts:877-883`). `grep` "marketplace" di `src/` tanpa hasil. Status: BELUM-ADA.
- Delta/celah: bila ada `.claude-plugin/marketplace.json`, laporkan `marketplace: { name, plugins: [{ name, source, version?, category?, sourceExists, sourceKind }] }` dan petunjuk "validasi setiap folder plugin"; `source` non-lokal (objek/URL) hanya dilaporkan, tidak diikuti.
- Cara adaptasi: tambah cabang di `inventoryClaudePlugin` + satu field di `ClaudePluginPreview`; ikuti aturan yang sama (tidak ikuti symlink, `reportLabel` untuk teks pihak luar, batas ukuran `MAX_CONFIG_BYTES`). Fasad `skills(validate)` yang ada; tanpa skema baru.
- Lisensi/hak cipta: format JSON publik; implementasi mandiri.
- Perkiraan skala: S · Risiko: rendah (read-only) · Nilai: tinggi untuk alur studi ini · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: terverifikasi — kode adapter dibaca penuh. Hasil pratinjau kosong adalah penalaran dari kode, tidak dijalankan.
- Disposisi: ADAPT

### CCP-09 Referensi relatif-plugin di badan Skill tidak dilaporkan (`${CLAUDE_PLUGIN_ROOT}`, `../skill-lain/`)
- Sumber: `plugins/hookify/skills/writing-rules/SKILL.md:324` ("See `${CLAUDE_PLUGIN_ROOT}/examples/` for complete examples" — folder `examples/` ada di akar plugin, berisi 4 berkas), `plugins/plugin-dev/skills/plugin-structure/SKILL.md:291-294` ("In component files (commands, agents, skills): Reference scripts at: ${CLAUDE_PLUGIN_ROOT}/scripts/helper.py"), `plugins/plugin-dev/skills/skill-development/SKILL.md:609-614` (daftar "`../hook-development/`" dst.), `plugins/plugin-dev/skills/command-development/SKILL.md:531-565` (`!` + `${CLAUDE_PLUGIN_ROOT}`, `@${CLAUDE_PLUGIN_ROOT}/…`). Jumlah kemunculan `CLAUDE_PLUGIN_ROOT`: 213 di 39 berkas plugin.
- Observasi: panduan plugin-dev secara eksplisit menyuruh memakai `${CLAUDE_PLUGIN_ROOT}` untuk "resource file paths" dalam komponen termasuk Skill.
- Nilai untuk Agent Core: setelah adaptasi, Skill berdiri sendiri; referensi ke akar plugin atau Skill saudara menjadi menggantung tanpa peringatan.
- Baseline Agent Core: `src/skills/claude-plugin.ts:186-209` `findMissingReferences` hanya memeriksa tautan markdown dan code span yang diawali `references|examples|scripts|assets/`; target yang mengandung `$`, `{`, `}` dilewati (baris 199). `${CLAUDE_PLUGIN_ROOT}/examples/` diawali `$` sehingga lolos; `../hook-development/` di code span tidak cocok pola. `grep CLAUDE_PLUGIN_ROOT` di `src/` tanpa hasil. Status: BELUM-ADA.
- Delta/celah: temukan `${CLAUDE_PLUGIN_ROOT}` dan `../` (naik keluar folder Skill) di badan; laporkan sebagai `pluginRootReferences: [{ target, existsInPlugin }]` (cek keberadaan di akar plugin tanpa mengikuti symlink) dan `siblingSkillReferences`. Jangan menyalin folder akar ke dalam Skill otomatis.
- Cara adaptasi: perluas `findMissingReferences` atau fungsi baru berdampingan; tambahkan ke `ClaudeSkillAnalysis`/komponen pratinjau. Tanpa skema tool baru.
- Lisensi/hak cipta: tulis sendiri.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: terverifikasi pada kode adapter dan tiga kutipan sumber.
- Disposisi: ADAPT

### CCP-10 Kontinuitas lisensi dan provenance saat mengadaptasi Skill dari plugin
- Sumber: `plugins/plugin-dev/skills/plugin-structure/references/manifest-reference.md:164-187` (field `license` SPDX di `plugin.json`), `LICENSE.md` akar repo (hak cipta penuh), `plugins/frontend-design/skills/frontend-design/SKILL.md:5` (`license: Complete terms in LICENSE.txt` padahal plugin hanya berisi 3 berkas dan tidak ada `LICENSE.txt`), 14 manifest di `plugins/*/.claude-plugin/plugin.json` (tidak satu pun memuat `license`).
- Observasi: lisensi sebuah Skill dalam plugin berada di tingkat plugin (`plugin.json` atau berkas LICENSE di akar plugin/repo), di luar folder Skill.
- Nilai untuk Agent Core: bila Skill dari repo berlisensi hak-cipta-penuh diimpor, tidak ada peringatan; alur "steal & use" menuntut keputusan lisensi yang terlihat.
- Baseline Agent Core: `src/skills/service.ts:388-402` `captureSkillSourceProvenance` mengisi `declaredLicense` hanya dari `scanned.metadata.license` (frontmatter Skill); `identity` repo dicatat tetapi bukan lisensi. Adapter menjatuhkan `plugin.json.license` dan berkas LICENSE/NOTICE induk. `THIRD_PARTY_NOTICES.md` ada di akar tetapi tidak terhubung ke adaptasi. Status: BELUM-ADA.
- Delta/celah: pada pratinjau dan laporan adaptasi, catat (a) `plugin.json.license` bila ada, (b) nama dan sha256 berkas LICENSE/COPYING/NOTICE di folder plugin dan leluhur sampai akar repo, (c) peringatan eksplisit `LICENSE_NOT_REDISTRIBUTABLE_OR_UNKNOWN` bila tidak ada SPDX dan teks berisi "all rights reserved" (heuristik; hanya peringatan, jangan menolak otomatis). Simpan ke metadata Skill (`source-license`) sehingga muncul di provenance.
- Cara adaptasi: tambah di `analyzeClaudePlugin`/`captureSkillSourceProvenance` (owner Skill); read-only. Tanpa skema baru.
- Lisensi/hak cipta: tidak menyalin teks lisensi ke Skill kecuali lisensinya mengizinkan; hanya jejak hash dan nama.
- Perkiraan skala: S–M · Risiko: sedang (heuristik teks lisensi salah klasifikasi; wajib hanya peringatan) · Nilai: tinggi (kepatuhan, keputusan pengguna) · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: terverifikasi pada kode provenance dan manifest-manifest sumber. Belum memeriksa LICENSE di `claude-plugins-official` dan `knowledge-work-plugins` per plugin (domain pekerja lain).
- Disposisi: ADAPT

### CCP-11 Lint manifest ringan dan itemisasi hooks/MCP inline (hanya melapor)
- Sumber: `plugins/plugin-dev/skills/plugin-structure/references/manifest-reference.md:15-38` (nama kebab-case `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`), `:42-83` (versi semver), `:332-350` (path komponen wajib relatif, diawali `./`, tanpa `../`, garis miring maju), `:259-330` (`hooks` dan `mcpServers` bisa objek inline), `plugins/plugin-dev/agents/plugin-validator.md:56-134` (urutan validasi), `skills/hook-development/scripts/validate-hook-schema.sh` (daftar event valid, tipe hook `command`/`prompt`, rentang timeout).
- Observasi: format dasar sederhana dan terdokumentasi; validator sumber adalah skrip bash/jq.
- Nilai untuk Agent Core: pratinjau hanya menggaungkan `name`/`version`; plugin dengan nama atau path salah tidak diberi tanda.
- Baseline Agent Core: `claude-plugin.ts:355-364` (nama dan versi lewat `reportLabel`, `declares` daftar kunci), `:388-393` (hooks hanya dari `hooks/hooks.json`; hook inline di `plugin.json` hanya muncul di `declares`), `:395-399` (`.mcp.json`). Tidak ada validasi bentuk. Status: SEBAGIAN.
- Delta/celah: tambah `manifestIssues: string[]` (kode saja): `NAME_NOT_KEBAB`, `VERSION_NOT_SEMVER`, `PATH_NOT_RELATIVE`, `PATH_ESCAPES_ROOT`; itemisasi event hook inline.
- Cara adaptasi: fungsi murni kecil di `claude-plugin.ts`; tes tabel sederhana. Nilai rendah karena Agent Core tidak mengeksekusi komponen itu.
- Lisensi/hak cipta: aturan format publik; tulis sendiri.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: terverifikasi. Nilai rendah adalah penilaian saya.
- Disposisi: ADAPT

### CCP-12 Skill baru untuk proses desain orisinal (bukan klon, bukan sekadar rekayasa UI)
- Sumber: `plugins/frontend-design/skills/frontend-design/SKILL.md` (v1.1.0; bagian "Ground your designs in the subject matter", "Process: plan, review against the brief, build, critique", daftar sifat desain hasil-AI yang menjadi "default bukan pilihan", "Restraint and self-critique", "More on writing in design"), `plugins/frontend-design/.claude-plugin/plugin.json` (versi 1.1.0 dan deskripsi baru), `plugins/claude-opus-4-5-migration/skills/claude-opus-4-5-migration/references/prompt-snippets.md` (versi ringkas `<frontend_aesthetics>`).
- Observasi: prosesnya dua lintasan: rencana kompak (4–6 hex bernama, peran huruf, konsep tata letak dengan wireframe ASCII, prinsip) → tinjau rencana terhadap brief dan revisi bagian yang terasa default → baru kode → kritik diri. Ada daftar kebiasaan generatif yang harus dihindari (krem + serif + terakota, hitam + satu aksen neon, layout surat kabar, kit kartu SaaS identik, atribut template seperti label huruf besar di atas setiap judul).
- Nilai untuk Agent Core: pengguna menetapkan standar desain referensi-pimpinan, premium, dengan struktur orisinal per templat dan tanpa meratakan desain; Skill yang ada belum menuntun desain dari nol.
- Baseline Agent Core: `frontend-ui-engineering/SKILL.md` (bagian "Avoid the AI Aesthetic", baris ±151-160: tabel yang menyuruh memakai palet dan sistem desain proyek yang ada); `replica-design` (membangun ulang token dari aplikasi target, sudah ada `tokens.json` dan `contrast.py`) dan `replica-brand` bersifat klon. Tidak ada Skill proses desain orisinal dari brief. Status: SEBAGIAN (anti-estetika-AI ada, proses desain orisinal belum).
- Delta/celah: satu Skill `distinctive-design-process` (nama usulan): langkah rencana token → tinjau terhadap default → bangun → kritik; daftar tanda default; aturan teks UI; batas kualitas (responsif, fokus keyboard, gerak tereduksi, kontras — `replica-design/contrast.py` bisa dirujuk, bukan disalin).
- Cara adaptasi: Skill sumber baru di `capability-packs/`, badan ≤ 8.192 byte, referensi on-demand; bergantung pada Skill `frontend-ui-engineering` untuk implementasi. Contoh kode PowerShell tidak diperlukan.
- Lisensi/hak cipta: SKILL.md berhak cipta penuh; frontmatter-nya menyebut "Complete terms in LICENSE.txt" yang tidak ada di folder. Tulis ulang dari nol dengan struktur dan kata sendiri; jangan menyalin daftar sifat verbatim; kutip hex tertentu (mis. #D97757) tidak perlu.
- Perkiraan skala: M · Risiko: sedang (Skill desain mudah menjadi generik; perlu contoh keputusan nyata) · Nilai: sedang–tinggi · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: terverifikasi isi sumber dan baseline; "pengguna menuntut" berasal dari instruksi global pengguna di sesi ini, bukan dari repo Agent Core.
- Disposisi: ADAPT

### CCP-13 Disiplin tinjauan sinyal-tinggi dan lensa tinjauan tambahan
- Sumber: `plugins/code-review/commands/code-review.md:18-83` (hanya isu sinyal tinggi; daftar "jangan tandai": isu lama, ketidakcermatan gaya, yang ditangkap linter, isu yang dibungkam di kode; setiap isu divalidasi oleh pass terpisah dan yang tidak tervalidasi dibuang; kepatuhan CLAUDE.md hanya dari berkas yang sebapak path-nya), `plugins/feature-dev/agents/code-reviewer.md` (skor 0–100, laporkan ≥ 80), `plugins/pr-review-toolkit/agents/silent-failure-hunter.md` (catch kosong, fallback tak dijelaskan, `?.` yang menyembunyikan kegagalan, fallback ke mock di produksi), `agents/comment-analyzer.md` (akurasi komentar terhadap kode, pembusukan komentar), `agents/pr-test-analyzer.md` (cakupan perilaku, skala 1–10), `agents/type-design-analyzer.md` (skala 1–10 untuk enkapsulasi, ekspresi invarian, kegunaan, penegakan).
- Observasi: README `code-review` masih menggambarkan skor kepercayaan ≥ 80, sedangkan perintah sebenarnya sudah diganti validasi per isu — dokumentasi sumber tertinggal dari perilaku (pelajaran sendiri: baca perintahnya, bukan README).
- Nilai untuk Agent Core: tinjauan yang membanjiri nitpick menurunkan kepercayaan; lensa kegagalan senyap relevan karena kodebase punya banyak `catch {}` (34 `catch {}` kosong dan 5 `catch { return null }` di `src/` non-tes — banyak disengaja sebagai best-effort, tetapi tidak ada lensa untuk membedakannya).
- Baseline Agent Core: `code-review-and-quality/SKILL.md` (22 KB; hanya menyebut "silent fallbacks" sekilas di baris 84; tidak ada daftar "jangan lapor", validasi per isu, atau lensa tes/komentar/invarian tipe); `code-simplification` ada; `doubt-driven-development` ada. `src/code-intelligence/change-review.ts` sudah menyediakan `testEvidence` per seed. Status: SEBAGIAN.
- Delta/celah: referensi/Skill kecil "disiplin sinyal" (hanya laporkan yang bisa dikutip; tolak isu lama/linter; validasi tiap isu dengan membaca ulang kode; skala keparahan) dan lensa kegagalan senyap + celah tes berbasis perilaku. Orkestrasi multi-agen paralel (haiku/sonnet/opus) TIDAK diambil — ditolak sebagai runtime.
- Cara adaptasi: Skill baru terpisah (mis. `review-signal-discipline`) agar pack `code-review-and-quality` yang berasal dari upstream (ada `UPSTREAM.json`, digest tersegel) tidak diubah; atau jadikan referensi pada Skill proposal.
- Lisensi/hak cipta: prompt agen berhak cipta penuh; ambil konsep (skala, daftar tolak), tulis sendiri.
- Perkiraan skala: M · Risiko: rendah · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: terverifikasi pada sumber dan Skill terdekat; angka `catch` adalah hitungan grep kasar, bukan audit.
- Disposisi: ADAPT

### CCP-14 `.gitattributes` untuk normalisasi EOL yang tidak bergantung pada konfigurasi per-pengguna
- Sumber: `.gitattributes:1-2` (`* text=auto eol=lf`, `*.sh text eol=lf`).
- Observasi: dua baris membuat akhir baris deterministik lintas mesin.
- Nilai untuk Agent Core: Windows 10 dengan `core.autocrlf` yang berbeda antar tingkat konfigurasi; banyak berkas dihitung digest (Skill, manifest integritas rilis, fixture memori).
- Baseline Agent Core: `.gitattributes` hanya mengikat dua fixture memori (`text eol=lf`). `git config --show-origin --get-all core.autocrlf` memberi `true` (sistem, `E:/Program Files/Git/etc/gitconfig`) lalu `false` (pengguna, `C:/Users/Ikbal/.gitconfig`). `git ls-files --eol`: 2.577 berkas `i/lf`, di antaranya 818 `w/crlf` dan 66 `w/mixed` (708 di `SubProject/`, 73 di `src/`, 49 di `docs/`, 41 di `tests/`, 3 berkas `.cmd`); `git status --porcelain` saat ini kosong (0 baris), jadi drift ini laten. Status: SEBAGIAN.
- Delta/celah: tidak ada kebijakan EOL tingkat repo; berkas `.cmd`/`.bat` sebaiknya `eol=crlf` dan `.sh` `eol=lf`.
- Cara adaptasi: ubah `.gitattributes` (jalur `.github/` dilindungi CODEOWNERS; `.gitattributes` perlu persetujuan pemilik). Wajib uji kering dahulu: daftar berkas yang akan berubah, dampak pada digest tersegel (Skill, `scripts/release/integrity-manifest.mjs`), baru putuskan. Jangan `git add --renormalize` tanpa persetujuan eksplisit.
- Lisensi/hak cipta: kebiasaan umum Git.
- Perkiraan skala: M · Risiko: tinggi (mengubah byte → digest berubah di artefak tersegel; blast radius repo) · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: angka EOL dari perintah baca-saja pada repo Agent Core. DUGAAN: drift akan muncul sebagai berkas "modified" setelah operasi yang menyegarkan indeks; tidak saya picu.
- Disposisi: ADAPT

### CCP-15 Perketat penyaring ReDoS aturan proyek dengan cek tumpang-tindih alternasi
- Sumber: `plugins/security-guidance/hooks/extensibility.py:262-289` (`_has_redos_structure`: kuantifier bersarang, grup wildcard di bawah pengulangan, dan alternasi di bawah pengulangan yang salah satu cabangnya prefiks cabang lain, mis. `(a|aa)*`), `:43-47` (batas 8 KB panduan, 50 aturan, 1 KB pesan), `:21-33` (model kepercayaan: berkas dikontrol repo hanya boleh MENAMBAH pemeriksaan).
- Observasi: heuristik statis berlapis; aturan yang dicurigai dilewati dengan log, tidak menjatuhkan hook.
- Nilai untuk Agent Core: `securityRules` dikirim controller; regex buruk di mesin lambat bisa menahan scan.
- Baseline Agent Core: `changed-source-security.ts:76` menolak back-reference `\1`–`\9`, kuantifier bersarang sederhana `\([^)]*[+*][^)]*\)[+*{]`, dan dua `.*`; batas `MAX_RULES=32`, pola ≤ 256 karakter, pesan ≤ 500. Tidak menangkap alternasi bertumpang-tindih `(a|aa)*`. Model aditif sudah ada (aturan proyek hanya menambah). Status: SUDAH-ADA (sebagian besar), celah kecil pada alternasi.
- Delta/celah: tambah pemeriksaan prefiks alternasi di bawah pengulangan.
- Cara adaptasi: satu fungsi kecil di berkas yang sama + tes tabel.
- Lisensi/hak cipta: algoritma sederhana; tulis sendiri.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: terverifikasi.
- Disposisi: ADAPT

### CCP-16 Formulir isu perilaku agen + bidang diagnostik terisi otomatis
- Sumber: `.github/ISSUE_TEMPLATE/model_behavior.yml` (dropdown jenis: memodifikasi berkas yang tak diminta, mengakses berkas di luar direktori kerja, mengabaikan instruksi/konfigurasi, mengembalikan perubahan tanpa tanya, asumsi salah, menolak permintaan wajar, perilaku berubah antar sesi, subagen berperilaku tak terduga; bidang "yang diminta / yang dilakukan langkah demi langkah / yang diharapkan / berkas terdampak (diubah vs dibaca tak terduga) / mode izin / bisa direproduksi / dampak Critical–Low / model / versi"), `.github/ISSUE_TEMPLATE/github_connection.yml:29-37` (bidang `diagnostics` "Filled in by claude.ai. Don't edit.", `render: text`, isi dikirim oleh aplikasi lewat tautan "Report an issue").
- Observasi: taksonomi kegagalan perilaku yang terstruktur, dipisah dari "bug".
- Nilai untuk Agent Core: dokumen `docs/Agent-Core-27-BAD-BEHAVIOR.md` hanyalah salinan percakapan; bukti kegagalan Learning (`src/failure-evidence.ts`) berfokus galat alat.
- Baseline Agent Core: `.github/ISSUE_TEMPLATE/` hanya `bug_report.yml` (dropdown subsistem), `feature_request.yml`, `config.yml`. Tidak ada formulir perilaku agen. Status: BELUM-ADA.
- Delta/celah: satu formulir `agent_behavior.yml` dengan taksonomi di atas yang disesuaikan (pengendali: AI eksternal vs Native; grant/tool ceiling; berkas diubah vs dibaca; apakah perilaku melanggar `AGENTS.md`).
- Cara adaptasi: satu berkas `.github/ISSUE_TEMPLATE/agent_behavior.yml` (jalur dilindungi CODEOWNERS). Jangan membuat tautan "report" yang memuat diagnostik di URL: tautan terisi-otomatis menaruh data di query string — bertentangan dengan prinsip jangan taruh data sensitif di URL; pakai penyalinan manual.
- Lisensi/hak cipta: skema formulir generik; tulis sendiri.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: terverifikasi. Repo Agent Core privat dan berpemilik tunggal (`CODEOWNERS`: satu pemilik), jadi manfaat kecil.
- Disposisi: ADAPT

### CCP-17 Pola kebijakan-sebagai-kode: aturan tertulis + pemeriksa mekanis + tabel pengecualian beralasan
- Sumber: `CLAUDE.md:5-40`, `.github/scripts/check_workflow_hardening.py:29-31` (dua tabel pengecualian kosong dengan kunci `<berkas>:<job>` dan nilai alasan), `:231-274` (`check_job`: mencetak alasan pengecualian bila dipakai), `:277-309` (`check_policy`: kebijakan egress harus `mode: enforce`, `allow` tak kosong, tanpa `*`), `:19` dan tiap pesan galat diakhiri penunjuk "See CLAUDE.md, …" sebagai `::error::`, `.github/egress-firewall.yaml:1-4` (aturan penambahan host di kepala berkas: nama penuh, katakan siapa yang memakai), `.github/workflows/workflow-hardening.yml` (CI wajib), `plugins/security-guidance/hooks/patterns.py:328-334` (`assert` saat impor: aturan baru tanpa ID gagal sejak awal).
- Observasi: setiap aturan punya tiga hal — teks aturan singkat, pemeriksa yang gagal-keras dengan pesan yang menunjuk teks itu, dan satu jalur pengecualian yang mewajibkan alasan. Pemeriksa berani menyebut batasnya ("tidak dapat melihat job yang memanggil Claude cara lain, periksa manual").
- Nilai untuk Agent Core: `AGENTS.md` 84 KB sudah masalah teks selalu-dimuat; aturan yang bisa dicek mesin dapat menjadi dua baris penunjuk.
- Baseline Agent Core: `scripts/portability/check-path-policy.mjs` (`npm run path:check`), `scripts/portability/project-structure.mjs` (`structure:check`), `scripts/release/check-release-intent.mjs`, dan `.github/CODEOWNERS` melindungi `.github/`, `scripts/release/`, `src/security/`. `scripts/governance/` ada tetapi kosong. Tidak ada `.github/workflows/` sama sekali. Belum diperiksa apakah pemeriksa yang ada punya tabel pengecualian beralasan. Status: SEBAGIAN (pola ada sebagian; CI tidak ada).
- Delta/celah: jika kelak ada workflow, pemeriksa generik (izin `permissions` minimal, aksi dipin SHA, tidak ada `${{ github.event.* }}` di `run:`, `persist-credentials: false`) berbentuk satu skrip `.mjs`; saat ini tidak ada workflow yang diperiksa, jadi tidak mendesak. Pola "aturan di `AGENTS.md` → penunjuk ke pemeriksa" dapat dipertimbangkan hanya bila aturan itu memang sudah dicek mesin.
- Cara adaptasi: REFERENSI; bila workflow ditambahkan, buat `scripts/governance/check-workflows.mjs` memakai tabel pengecualian `{ "<berkas>:<job>": "alasan" }`. Catatan: pemeriksa sumber sendiri tidak memaksa pin SHA (tiga workflow memakai `actions/checkout@v4`, beberapa lainnya SHA) — jangan mengira repo sumber mencontohkan pin penuh.
- Lisensi/hak cipta: pola; tulis sendiri.
- Perkiraan skala: S (bila workflow ada) · Risiko: rendah · Nilai: rendah sekarang, sedang bila CI ditambahkan · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak (bahkan mengurangi bila menggantikan prosa)
- Bukti vs dugaan: sumber dibaca penuh; baseline Agent Core dari `ls`/`cat` (CODEOWNERS), isi pemeriksa portabilitas tidak dibaca.
- Disposisi: REFERENSI

### CCP-18 Pertahanan injeksi prompt untuk agen yang dipicu teks pihak luar (triage/dedupe) — jawaban untuk "pola proses repo GitHub"
- Sumber: `.claude/commands/triage-issue.md:1-75` (`allowed-tools` hanya dua skrip; "Don't post any comments"; hanya label dari daftar nyata; "false positives are worse than missing labels"), `scripts/gh.sh:23-96` (subperintah dan flag di-allowlist: `issue view|list`, `search issues`, `label list`; `--comments --state --limit --label`; kueri tidak boleh memuat `repo:|org:|user:`; nomor isu harus numerik), `scripts/edit-issue-labels.sh:11-17,44-60` (nomor isu dibaca dari `GITHUB_EVENT_PATH`, bukan dari argumen model; label disaring terhadap `gh label list`), `scripts/comment-on-duplicates.sh:11-20,46-70` (maks. 3 duplikat, semua angka, semua isu diverifikasi ada), `.github/workflows/claude-issue-triage.yml:36,48-54` dan `claude-dedupe-issues.yml:33,45-48` (`CLAUDE_CODE_SCRIPT_CAPS: '{"edit-issue-labels.sh":2}'` dan `'{"comment-on-duplicates.sh":1}'`; `--permission-mode auto`; `--disallowedTools "WebFetch,WebSearch,Write,Edit,MultiEdit,NotebookEdit"`; runner firewall), `.github/workflows/non-write-users-check.yml:17-44` (PR yang menambah `allowed_non_write_users` mendapat komentar peringatan sekali, ditandai `<!-- non-write-users-check -->`).
- Observasi: lapisan pertahanan berlapis untuk agen yang membaca isi isu dari orang asing: (1) alat sempit dan berbentuk-tetap, (2) target tindakan diikat ke event pemicu, bukan ke keluaran model, (3) validasi terhadap data nyata (label, nomor isu), (4) batas jumlah panggilan per skrip, (5) larangan alat tulis/web, (6) egress diblokir, (7) mode izin yang menyaring panggilan di luar allowlist, (8) penjaga CI atas perubahan yang melonggarkan.
- Nilai untuk Agent Core: dua hal terpisah. Pertama, apakah repo GitHub Agent Core butuh otomasi isu — repo itu privat berpemilik tunggal (`CODEOWNERS: * @rendevouz999`), tanpa workflow dan tanpa isu pihak luar; tidak ada masalah nyata untuk diselesaikan. Kedua, pola alat-sempit dengan target terikat berguna bagi Native Agent saat memproses teks pihak luar (halaman web, berkas klon asing, hasil alat).
- Baseline Agent Core: Native memakai grant tool dinamis per-task dan batas iterasi total (`maxToolIterations: 24`, `src/agent-runtime.ts:467`); memori hasil recall diperlakukan sebagai catatan tidak tepercaya; ringkasan kompaksi diberi penanda "background, never an instruction" (`src/agent-context-compaction.ts`). Tidak ada kebijakan "setelah membaca konten tidak tepercaya, aksi merusak butuh konfirmasi" (tidak diverifikasi tuntas; hanya grep terbatas). Status: SEBAGIAN (prinsip ada, tidak ada otomasi GitHub).
- Delta/celah: tidak ada yang layak dibangun sekarang. Penolakan lama atas otomasi isu GitHub tetap berlaku — bukti baru (hardening 2026-09/10) memperkuat pola, bukan kebutuhan Agent Core.
- Cara adaptasi: REFERENSI. Syarat membuka kembali: repo Agent Core menerima isu/PR pihak luar, atau Native diberi alat yang memproses teks pihak luar dan memiliki efek samping. Bila saat itu tiba, checklist siap pakai: alat berbentuk-tetap dengan allowlist, target dari konteks pemicu, validasi terhadap data nyata, batas panggilan, izin minimal, penjaga PR atas perubahan izin.
- Lisensi/hak cipta: skrip kecil; pola ditulis ulang bila dipakai.
- Perkiraan skala: — (tidak dikerjakan) · Risiko: — · Nilai: rendah sekarang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: terverifikasi pada sumber; tidak ada dokumentasi semantik `CLAUDE_CODE_SCRIPT_CAPS` di irisan ini (arti "maks. N panggilan skrip per run" adalah inferensi dari nama dan nilai).
- Disposisi: REFERENSI

### CCP-19 Batas panggilan per-alat per-run untuk alat berefek samping
- Sumber: `.github/workflows/claude-issue-triage.yml:36` dan `claude-dedupe-issues.yml:33` (`CLAUDE_CODE_SCRIPT_CAPS`), `scripts/comment-on-duplicates.sh:46-49` (maks. 3 argumen), `.github/workflows/lock-closed-issues.yml:33` (`MAX_PER_RUN = 250` + jeda 1 detik), `scripts/sweep.ts:54,100` (maks. 10 halaman).
- Observasi: batas jumlah efek samping dipasang di dua tempat: di pembungkus dan di lingkungan harness.
- Nilai untuk Agent Core: batas iterasi global Native ada, tetapi tidak ada batas per alat.
- Baseline Agent Core: `src/agent-runtime.ts:467` `maxToolIterations: 24`; `agent-controller.ts` melacak iterasi; `grep` `maxCalls|callCap|perToolLimit` tanpa hasil. Status: SEBAGIAN.
- Delta/celah: batas per alat untuk alat yang tak bisa dibatalkan (hapus/pindah/kill) dalam satu task.
- Cara adaptasi: REFERENSI, bersyarat. Perubahan akan menyentuh resolver kapabilitas Native; tidak ada insiden nyata yang mendorongnya; risiko menghalangi pekerjaan sah di mesin lambat.
- Lisensi/hak cipta: pola umum.
- Perkiraan skala: M · Risiko: sedang · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: semantik `CLAUDE_CODE_SCRIPT_CAPS` tidak didokumentasikan di irisan ini; inferensi.
- Disposisi: REFERENSI

### CCP-20 Pola dokumen keamanan "apa yang TIDAK dicakup" dan katalog tool yang mengirim isi keluar mesin
- Sumber: `examples/settings/README-hipaa.md` bagian "Edit before you deploy", "Tighten further", "What the keys do", "What developers lose", "Check a computer" (uji negatif: `curl https://example.com` harus gagal; uji positif: host yang diizinkan merespons; peringatan bahwa uji ini hanya menunjukkan jangkauan), "What these files don't cover", `examples/settings/settings-hipaa.json:18-23` (tool yang mengirim isi keluar: WebFetch, Projects, SendUserFile, ShareOnboardingGuide, Artifact), `.devcontainer/init-firewall.sh:134-146` (verifikasi firewall: coba capai host yang harus diblokir dan host yang harus diizinkan).
- Observasi: dokumen mengakui batasnya dan memberi uji verifikasi positif dan negatif.
- Nilai untuk Agent Core: dokumen tunnel dan keamanan sudah ada.
- Baseline Agent Core: `docs/Cloudflare-Tunnel.md` sudah memiliki bagian "What is and is not published" dan "Limits" serta uji `-Action Verify` yang membuktikan `/health` dan `/agent/*` 404 di hostname publik; peringatan `AGENT_CORE_TRUST_PROXY` (baris 20) sudah ada, dan `AGENT_CORE_TRUST_PROXY` default `false` (`src/config.ts:211`). Status: SUDAH-ADA (sebagian besar).
- Delta/celah: tidak ada yang mendesak. Kemungkinan tambahan: satu tabel "tool Agent Core yang mengirim isi keluar mesin" (web, tunnel, provider) di dokumen keamanan.
- Cara adaptasi: REFERENSI untuk gaya dokumen.
- Lisensi/hak cipta: pola dokumen.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: terverifikasi pada `Cloudflare-Tunnel.md` dan `config.ts`.
- Disposisi: REFERENSI

---

## Bagian C — Ditolak atau tidak relevan (alasan spesifik)

- `plugins/ralph-wiggum/` (8 berkas): tetap ditolak, tanpa bukti baru. `hooks/stop-hook.sh` memakai `decision: block` dan memberi masukan prompt yang sama; kondisi berhenti hanya teks `<promise>…</promise>` yang dilaporkan sendiri oleh model, dan jalan keluar default adalah "runs infinitely" (`setup-ralph-loop.sh`, `ralph-loop.md`). Hook merusak state file sendiri bila korup (bagus), tetapi prinsipnya tetap retry otomatis tanpa verifikasi independen. Agent Core punya Stop, anggaran iterasi, dan verifikasi independen.
- `plugins/hookify/` mesin aturan: tetap ditolak. Aturan regex terhadap argumen alat memblokir lewat hook (otoritas hook), mudah dielakkan (`rm\s+-rf` tidak menangkap `rm -fr` atau `rm -r -f`), dan "action: block" pada PostToolUse tidak dapat membatalkan efek yang sudah terjadi. Alur koreksi→aturan dengan persetujuan sebelum menyimpan (`commands/hookify.md` langkah 2-4) sudah dimiliki Learning (checkpoint→review→kandidat) dan Reflexion.
- `plugins/security-guidance` lapisan LLM (Stop review, review commit, push-sweep, `SG_DUAL_OR`, bootstrap venv SDK `ensure_agent_sdk.py`, metrik `emit_metrics` dengan topeng bit `RuleId`, `asyncRewake`, `sg-python.sh`): ditolak sebagai model/agen kedua tersembunyi, otomatis tanpa persetujuan, dan telemetri. `ensure_agent_sdk.py` melewati Windows (`SKIP_WIN32`) sehingga bahkan di sumbernya fitur ini tidak berjalan di host Windows. Isinya yang berguna sudah dipetakan ke CCP-01–06 dan 15.
- `examples/gateway/aws` dan `gcp` (26 berkas): tetap ditolak. Infrastruktur cloud (ECS/Cloud Run, RDS/Cloud SQL, OIDC, Secrets Manager) untuk gateway LLM organisasi; Agent Core bersifat lokal dengan satu pemilik. Pelajaran umum (`public_url` dipin supaya redirect URI/penerbit tidak diturunkan dari header Host; `trusted_proxies`) sudah tercermin di `HttpSecurityPolicy` (`publicBaseUrl`, `trustProxy` default false, dokumentasi tunnel).
- `examples/mdm/` (7) dan `examples/settings` preset `strict`/`lax`/`bash-sandbox` + `README.md`: konfigurasi produk Claude Code (kebijakan terkelola, ADMX/plist). Agent Core tidak punya lapis kebijakan terkelola; pemetaan ke grant tool Native tidak langsung.
- `.devcontainer/` dan `Script/run_devcontainer_claude_code.ps1`: iptables/ipset/Docker/Podman di Linux; host Windows 10 tanpa Docker yang diketahui. Teknik "verifikasi firewall dengan tes positif dan negatif" dicatat di CCP-20.
- Otomasi isu GitHub (`sweep.yml`, `issue-lifecycle-comment.yml`, `lock-closed-issues.yml`, `remove-autoclose-label.yml`, `auto-close-duplicates.yml`, `backfill-duplicate-comments.yml`, `scripts/issue-lifecycle.ts`, `sweep.ts`, `lifecycle-comment.ts`, `auto-close-duplicates.ts`, `backfill-duplicate-comments.ts`): tetap ditolak — repo privat berpemilik tunggal tanpa volume isu. Catatan desain yang boleh dikenang: tabel umur terpusat (`invalid` 3 hari, `needs-repro`/`needs-info` 7, `stale`/`autoclose` 14, ambang 10 jempol, jaring pengaman "ada komentar manusia sejak label dipasang" di `sweep.ts:124-138`, mode `--dry-run`). Tidak ada bukti masalah penuaan proposal Agent Core.
- `issue-opened-dispatch.yml` dan `log-issue-events.yml`: dispatch lintas repo dengan PAT dan telemetri Statsig (`events.statsigapi.net`) — telemetri jarak jauh. Catatan: `log-issue-events.yml` merangkai JSON dengan penggabungan string dari judul isu (hanya `"` yang di-escape); `claude-dedupe-issues.yml` membangun JSON yang sama dengan `jq -n --arg` — contoh baik versus buruk dalam satu repo.
- `plugins/commit-commands/` (5): otomasi commit/push/PR dalam satu pesan tanpa teks lain; `clean_gone.md` menjalankan `git worktree remove --force` dan `git branch -D` tanpa konfirmasi, bertentangan dengan doktrin konfirmasi untuk tindakan destruktif. Agent Core memiliki `git-workflow-and-versioning` dan aturan commit hanya dengan persetujuan.
- `plugins/agent-sdk-dev/` (5): scaffolding aplikasi Anthropic Agent SDK dengan WebFetch/WebSearch dan instal paket; Agent Core memakai loop sendiri dan sudah punya rencana studi SDK (`docs/Anthropic-SDK-*-Steal-Use-Integration-Plan.md`).
- `plugins/explanatory-output-style/` dan `plugins/learning-output-style/` (8): menyuntikkan instruksi SessionStart yang menambah token dan panjang jawaban (README sumber sendiri memperingatkan biaya token); Native memiliki `RESPONSE_STYLE_CONTRACT` ringkas (`src/agent-controller.ts:130`) sesuai preferensi hemat kuota.
- `plugins/feature-dev/` (6): tujuh fase dengan gerbang persetujuan sudah dicakup oleh Skill `spec-driven-development`, `planning-and-task-breakdown`, `interview-me`, `incremental-implementation`; penggunaan 2–3 agen paralel adalah orkestrasi multi-agen sebagai runtime (ditolak).
- `plugins/claude-opus-4-5-migration/` (5): `src/` Agent Core tidak berisi string model Claude (grep `claude-opus|claude-sonnet|claude-haiku` tanpa hasil), jadi tabel string model tidak berlaku. Anjuran melunakkan huruf kapital `CRITICAL/MUST/ALWAYS/NEVER` untuk model baru dicek pada `AGENTS.md`: kata itu hampir tidak muncul (`MUST` 1, `ALWAYS` 1, lainnya 0), jadi tidak ada tindakan. Parameter `effort` beta ditandai REFERENSI untuk lapis provider bila kelak dipakai.
- `plugins/plugin-dev/` bagian yang tidak diadopsi (±50 berkas): `command-development`, `agent-development`, `hook-development`, `mcp-integration`, `plugin-settings` mengajarkan menulis komponen Claude Code yang tidak dijalankan Agent Core; `agents/agent-creator.md` memakai prompt pembuat agen Anthropic. Panduan `skill-development` (pengungkapan progresif, deskripsi orang ketiga dengan frasa pemicu, 1.500–2.000 kata) tidak cocok dengan konvensi Agent Core (`## Triggers`/`## Non-triggers`, badan ≤ 8.192 byte, deskripsi ≤ 1.024 karakter, batas parser di `src/skills/service.ts:179`). Bagian yang diambil: format manifest dan aturan path (CCP-09, CCP-11).
- Berkas root `README.md`, `SECURITY.md`, `.gitignore` (hanya `.DS_Store`), `.vscode/extensions.json` (ESLint, Prettier, Remote Containers, GitLens), `demo.gif`: nilai nol bagi Agent Core; Agent Core sudah punya `SECURITY.md`.
- `.github/ISSUE_TEMPLATE/bug_report.yml`, `documentation.yml`, `feature_request.yml`, `config.yml`: formulir untuk komunitas publik Claude Code; padanan Agent Core ada.

---

## Bagian D — Pola lintas-unit dan pertanyaan terbuka

### D.1 Pola yang berulang dan layak jadi standar

1. Setiap aturan punya pemeriksa mekanis dan jalur pengecualian beralasan (`CLAUDE.md` + `check_workflow_hardening.py`; `assert` pada `RuleId` di `patterns.py`). Pesan galat selalu menunjuk teks aturan.
2. Batas tegas, tidak pernah senyap: penanda pemotongan di dalam konten, jumlah yang dibuang dicatat, prioritas berdasarkan risiko (`llm.py:158-183`, `gitutil.py:512-547`). Kebalikan dari `changed-source-security.ts:117` (CCP-03).
3. Gagal-terbuka atau gagal-tertutup ditetapkan eksplisit per jalur: hook selalu `exit 0` pada galat internal (hookify), tetapi tahap sanggahan mempertahankan semua temuan bila skema gagal (`llm.py:1537-1546`).
4. Teks tidak tepercaya yang masuk prompt berikutnya diperlakukan sebagai data: disanitasi, dibungkus blok berlabel, dan diberi petunjuk "DATA ONLY" (`llm.py:1337-1361`); teks yang disuntikkan diberi banner asal (`_base.py:56-67`, `PROVENANCE_BANNER`). Agent Core sudah punya padanan pada ringkasan kompaksi dan memori.
5. Dua langkah dengan default asimetris: langkah penemuan mengejar recall; langkah sanggahan "default = bertahan kecuali ada bukti penyanggah" (`review_api.py:183-187`). Selaras dengan `doubt-driven-development`.
6. Lingkungan proses anak dinetralkan dan biner dicari lewat path absolut (`llm.py:1029-1056,1161-1167`).
7. Kelakuan dokumentasi sumber yang tertinggal dari perilaku nyata: README `code-review` (skor ≥ 80) vs perintah (validasi per isu); README `security-guidance` ("~25 pola") konsisten. Pelajaran proses: bandingkan README dengan berkas perintah/hook, bukan hanya baca README.
8. Rapi terhadap bukti hukum: berkas lisensi plugin sering berada di luar folder Skill (CCP-10).

### D.2 Pertanyaan terbuka

1. Apakah `git diff`/`git ls-files` pada repo asing benar-benar menjalankan `core.fsmonitor` dari `.git/config` di Git terpasang? Uji aman: repo sementara dengan `core.fsmonitor` yang menulis penanda ke folder temp, hapus setelah uji (CCP-06).
2. Apakah `execFile('git', …, { cwd })` pada Node/Windows ini mencari `git.exe` di `cwd` sebelum PATH? Uji dengan `git.exe` palsu di folder sementara (CCP-06).
3. Apakah satu hasil alat yang sangat besar dibatasi sebelum masuk konteks Native? Kompaksi Agent Core sudah memakai batas atas byte, menolak kompaksi yang tidak mengecilkan (`agent-context-compaction.ts`: `if (bytesAfter >= bytesBefore) return null`) dan memberi penanda "dapat menghilangkan atau memutar fakta" — jadi tiga perbaikan kompaksi di `feed.xml` (v2.1.289–v2.1.310: teks padat base64/SVG setelah "Prompt is too long", "Autocompact is thrashing" pada hasil besar, pengungkapan pesan tertua yang dihilangkan dari ringkasan) tampak sudah tercakup (SUDAH-ADA), kecuali pembatasan hasil alat tunggal yang belum saya temukan dengan grep singkat. Serahkan verifikasi ke pekerja CHANGELOG.
4. Apakah kebijakan EOL tingkat repo (CCP-14) diinginkan mengingat digest tersegel? Butuh daftar berkas dari uji kering dan keputusan pemilik.
5. Bagaimana kebijakan pengguna untuk Skill dari repo hak-cipta-penuh (CCP-10)? Peringatan saja atau penolakan keras pada `import`?
6. Semantik `CLAUDE_CODE_SCRIPT_CAPS` (CCP-18, 19) tidak dijelaskan di irisan ini; mungkin ada di CHANGELOG.
7. `mod-tests.yml` memakai `claude plugin test`, yang tidak ada pada Claude Code lama (skrip melewati langkah bila perintah tidak tersedia); relevansi untuk `mods/` ada pada pekerja lain.
8. Apakah ada pemanggil `git` lain di luar `src/` (skrip `scripts/*.mjs`, `scripts/windows/*.ps1`) yang perlu ikut helper CCP-06? Tidak diperiksa.

### D.3 Hal yang tidak sempat atau tidak dibaca

- `demo.gif` (biner), 13 berkas Terraform/Docker/`setup.sh` GCP dan sisa AWS di `examples/gateway/`, berkas biner/XML MDM, `plugins/plugin-dev` ±16 berkas contoh/referensi (hanya heading dan baris awal), `security_reminder_hook.py` bagian commit-review/push-sweep (baris ±520–1700), `llm.py` baris 300–596 (jalur HTTP mentah dan mode `dual-or`), `bug_report.yml`/`documentation.yml`/`feature_request.yml` bagian akhir.
- Tidak ada skrip atau hook sumber yang dijalankan; semua pengujian perilaku adalah uji regex inline pada kalimat contoh atau perintah baca-saja `git`/`grep` di repo Agent Core.
