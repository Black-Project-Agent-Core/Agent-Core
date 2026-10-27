# W5 (prefiks OFB) — claude-plugins-official, irisan B

Tanggal studi: 2026-10-27. Pekerja baca-saja. Sumber: `E:\Projects\Side-Project-Dont-Touch\claude-plugins-official\` (HEAD `58267944`). Pembanding: `E:\Projects\Agent-Core` (hanya dibaca).

## Catatan awal: pembacaan dan keadaan working tree

- Repo memiliki 591 file terlacak (`git -c safe.directory=* ls-files`). 274 file milik pekerja lain (plugin yang dikecualikan). Irisan saya: **317 file** (19 infrastruktur + 63 `external_plugins` + 235 `plugins`).
- Working tree menampilkan 521 file berstatus termodifikasi, termasuk `.claude-plugin/marketplace.json`, `.github/bump-tracking.json` dan `.github/policy/*`. Pemeriksaan `git diff --ignore-space-at-eol`, `--ignore-cr-at-eol` dan `--ignore-all-space` semuanya menghasilkan nol perbedaan. Jadi perbedaannya hanya akhir baris: indeks LF, working tree CRLF (`git ls-files --eol` menunjukkan `i/lf w/crlf`; `core.autocrlf` tidak diset). Isi kerja saat ini identik dengan HEAD; tidak ada perubahan substantif yang tak terkomit. Tidak ada yang saya ubah.
- Metode jangkauan: Read penuh untuk file kecil/menengah; `cat -n` dengan CR dibuang untuk batch; skrip node baca-saja untuk statistik `marketplace.json` (315 entri), tally frontmatter 31 `SKILL.md`, ukuran deskripsi/badan, hash MD5 seluruh LICENSE; `grep` terarah untuk `server.ts` besar; satu skrip baca-saja (`scratchpad\ofb-audit-agents.mjs`) mengaudit `AGENTS.md` Agent Core. Satu PNG dilihat (claude-md-improver-example.png). Tidak ada skrip/hook/binari sumber yang dijalankan, tidak ada `npm install`.
- Estimasi jangkauan (per file, lihat ledger): penuh 185 (58%), skim/sampel 118 (37%), tidak dibaca 14 (4%: 4 `bun.lock`, 4 PNG, 2 skrip LaTeX, 3 berkas project-artifact, 1 `template.html` session-report).
- Baseline Agent Core diverifikasi dengan grep/Read; bila sebuah klaim "belum ada" hanya berdasar grep, itu dinyatakan sebagai bukti grep, bukan bukti absolut.

---

## Bagian A — Ledger cakupan

Kolom jumlah file harus menjumlah ke 317. "Dibaca": P = penuh, S = skim/sampel (judul, bagian kunci, grep), T = tidak dibaca isinya.

| Unit | File | Dibaca | Disposisi | Alasan | Temuan |
|---|---:|---|---|---|---|
| `.claude-plugin/marketplace.json` | 1 | S: struktur penuh via skrip node; 315 deskripsi disampel | REFERENSI | Skema katalog (source: url/git-subdir/lokal, `strict:false`, `lspServers`, `renames`); sumber konfigurasi LSP | OFB-05, OFB-23 |
| `.github/bump-tracking.json` | 1 | P | REFERENSI | Daftar 14 slug `releases-only` vs pelacakan HEAD | OFB-15 |
| `.github/policy/` (prompt.md, schema.json) | 2 | P | ADAPT | Kebijakan telaah admisi payload: bahan daftar periksa admisi Skill | OFB-13 |
| `.github/scripts/` (3) | 3 | P | ADAPT | discover_bumps.py (drift upstream), external-pr-scope.js (prinsip scope), validate-frontmatter.ts | OFB-06, OFB-13, OFB-15 |
| `.github/workflows/` (9) | 9 | P | REFERENSI | Cache verdict, pemisahan infra-error vs policy-fail, revert terbatas, probe liveness MCP | OFB-14, OFB-15, OFB-21 |
| Root: README.md, LICENSE, .gitignore | 3 | P | REFERENSI | Nama plugin immutable, `renames`, skill-bundle; LICENSE Apache-2.0 | OFB-05 |
| `external_plugins/telegram` | 11 | P 9 (server.ts ±95%), S 1 (configure), T 1 (bun.lock) | REFERENSI | Model kepercayaan kanal masuk paling matang | OFB-22 |
| `external_plugins/discord` | 11 | P 6, S 4 (server.ts grep, 2 skill dibanding telegram, README), T 1 (bun.lock) | REFERENSI | Sama dengan telegram, lebih tua; ACCESS.md dibaca penuh | OFB-22 |
| `external_plugins/imessage` | 11 | P 6, S 4 (server.ts grep, ACCESS.md awal, 2 skill), T 1 (bun.lock) | REFERENSI / TOLAK | macOS saja; pola watermark, SMS spoofable, argv-bukan-escape berguna | OFB-22 |
| `external_plugins/fakechat` | 8 | P 6, S 1 (server.ts baris 1-200 dari 295), T 1 (bun.lock) | REFERENSI | Contoh tandingan: endpoint localhost tanpa cek Origin | OFB-22 |
| `external_plugins/asana` | 3 | P | REFERENSI | OAuth bawa-sendiri, rahasia lewat prompt tersembunyi ke keychain | OFB-22 |
| `external_plugins/context7` | 3 | P | REFERENSI | Konfigurasi MCP http jarak jauh; kunci API opsional lewat env | OFB-22 |
| `external_plugins/firebase` | 2 | P | REFERENSI | Konfigurasi stdio `npx ... @latest` (tanpa pin) | OFB-22 |
| `external_plugins/github` | 2 | P | REFERENSI | Header Authorization dengan interpolasi `${ENV}` | OFB-22 |
| `external_plugins/gitlab` | 2 | P | REFERENSI | MCP http tanpa kredensial di berkas | OFB-22 |
| `external_plugins/laravel-boost` | 2 | P | TOLAK | Spesifik PHP/Laravel; tidak ada pola baru | — |
| `external_plugins/linear` | 2 | P | REFERENSI | MCP http jarak jauh, OAuth sisi server | OFB-22 |
| `external_plugins/playwright` | 2 | P | SUDAH-ADA | Agent Core punya mesin browser sendiri; konfigurasi `@latest` tak dipin | — |
| `external_plugins/serena` | 2 | P | SUDAH-ADA | Padanan Semantic IDE; gelombang adopsi Serena sudah terdokumentasi | OFB-23 |
| `external_plugins/terraform` | 2 | P | REFERENSI | Contoh pin versi image (`0.4.0`) dan token lewat env | OFB-22 |
| `plugins/skill-creator` | 21 | P 18, S 3 (viewer.html, eval_review.html, generate_report.py) | ADAPT | Alur eval/iterasi Skill; sebagian besar mekanisme sudah diadopsi | OFB-06 s/d OFB-10 |
| `plugins/claude-md-management` | 10 | P 9, T 1 (PNG) | ADAPT | Rubrik audit instruksi proyek; relevan untuk AGENTS.md 84 KB | OFB-11 |
| `plugins/claude-code-setup` | 10 | P 4, S 5 (5 referensi), T 1 (PNG) | REFERENSI | Pemetaan sinyal-proyek ke rekomendasi; sebagian berguna sebagai indeks | OFB-12 |
| `plugins/plugin-dev` — root/manifest/README/LICENSE | 3 | P 2, S 1 | REFERENSI | Ikhtisar toolkit | OFB-03 |
| `plugins/plugin-dev/agents` | 3 | P 2, S 1 (agent-creator) | ADAPT | Rubrik skill-reviewer dan plugin-validator | OFB-06, OFB-13 |
| `plugins/plugin-dev/commands/create-plugin.md` | 1 | S (baris 1-200) | REFERENSI | Alur 8 fase; catatan: `commands/` kini warisan, setara skill | OFB-03 |
| `plugins/plugin-dev/skills/agent-development` | 7 | S | ADAPT | Deskripsi pendek, contoh dipindah ke badan | OFB-12 |
| `plugins/plugin-dev/skills/command-development` | 11 | S (judul) | REFERENSI | Format perintah warisan | OFB-03 |
| `plugins/plugin-dev/skills/hook-development` | 11 | P 3 (SKILL.md, 2 skrip), S 8 | REFERENSI | Peristiwa hook, hook berbasis prompt (ditolak) | OFB-04 |
| `plugins/plugin-dev/skills/mcp-integration` | 7 | S | REFERENSI | Bentuk konfigurasi MCP plugin | OFB-05 |
| `plugins/plugin-dev/skills/plugin-settings` | 8 | S | TOLAK | Penyimpanan `.local.md` paralel; dilarang kebijakan penyimpanan | — |
| `plugins/plugin-dev/skills/plugin-structure` | 7 | P 1 (manifest-reference), S 6 | REFERENSI | Referensi field manifest | OFB-05 |
| `plugins/plugin-dev/skills/skill-development` | 2 | S | ADAPT | Panduan penulisan Skill; berselisih gaya dengan skill-creator | OFB-06, Bagian D |
| `plugins/mcp-server-dev` — root/manifest | 3 | P 2, S 1 | REFERENSI | — | — |
| `plugins/mcp-server-dev/skills/build-mcp-server` | 9 | P 5, S 4 | ADAPT | Elisitasi, kapabilitas server, autentikasi (CIMD/DCR), desain tool | OFB-16 s/d OFB-19 |
| `plugins/mcp-server-dev/skills/build-mcp-app` | 7 | P 3, S 4 | REFERENSI | Perlindungan penyalahgunaan, anggaran payload; widget tidak relevan | OFB-17, OFB-20 |
| `plugins/mcp-server-dev/skills/build-mcpb` | 3 | P 1, S 2 | REFERENSI | Daftar periksa keamanan MCP lokal sudah dipenuhi Agent Core | OFB-19 |
| `plugins/agent-sdk-dev` | 6 | P 2, S 4 | TOLAK | Perancah aplikasi SDK Anthropic; Native Agent memakai loop sendiri | — |
| `plugins/example-plugin` | 7 | P 3, S 4 | REFERENSI | Contoh struktur; `commands/` setara skill | OFB-03 |
| `plugins/math-olympiad` | 14 | P 4, S 8, T 2 (skrip LaTeX) | ADAPT | Verifikasi terisolasi + pola serangan; domain matematika tidak relevan | OFB-10 |
| `plugins/math-proof` | 10 | P 4, S 5, T 1 (PNG) | REFERENSI | Gerbang mekanis, sentinel akhir, resume; runtime multi-agen ditolak | OFB-29 |
| `plugins/playground` | 10 | P 3, S 7 | ADAPT | Skill templat HTML satu-berkas dengan keluaran prompt | OFB-27 |
| `plugins/project-artifact` | 6 | P 2, S 1, T 3 | REFERENSI | Refresh berbasis delta; bergantung Artifact claude.ai | OFB-28 |
| `plugins/receipts` | 6 | P 2, S 3, T 1 (PNG) | ADAPT | Laporan dampak lokal dengan aturan kejujuran metrik | OFB-25 |
| `plugins/session-report` | 4 | P 2, S 1, T 1 (template.html) | REFERENSI | Analisis biaya sesi; spesifik cache Anthropic | OFB-26 |
| `plugins/cwc-makers` | 6 | P 3, S 3 | TOLAK | Onboarding perangkat keras ESP32 | — |
| `plugins/mcp-tunnels` | 4 | P | ADAPT | Matriks troubleshooting terurut; terowongan Anthropic sendiri ditolak | OFB-21 |
| `plugins/learning-output-style` | 5 | P | TOLAK | Teks selalu-dimuat bernilai negatif | — |
| `plugins/explanatory-output-style` | 5 | P | TOLAK | Sama | — |
| `plugins/frontend-design` | 5 | P | ADAPT | Proses rencana-tinjau-bangun dan daftar "tell" desain generik | OFB-24 |
| Plugin `*-lsp` (clangd, csharp, gopls, jdtls, kotlin, lua, php, pyright, ruby, rust-analyzer, swift, typescript) | 24 | P (12 README + 12 LICENSE via hash) | ADAPT | Hanya README+LICENSE; konfigurasi server ada di entri marketplace | OFB-23 |

Pemeriksaan jumlah: 1+1+2+3+9+3 = 19 (infra); 11+11+11+8+3+3+2+2+2+2+2+2+2+2 = 63 (`external_plugins`); 21+10+10+3+3+1+7+11+11+7+8+7+2+3+9+7+3+6+7+14+10+10+6+6+4+6+4+5+5+5+24 = 235 (`plugins`). Total 317.

Catatan lisensi: LICENSE semua plugin internal dalam irisan ini identik dengan LICENSE root (Apache-2.0, MD5 teks sama setelah CR dibuang). Perbedaan: (a) `skill-creator/skills/skill-creator/LICENSE.txt` dan `frontend-design/skills/frontend-design/LICENSE.txt` adalah teks Apache-2.0 tanpa lampiran/baris akhir (frontend-design tanpa APPENDIX); (b) empat plugin kanal (`telegram`, `discord`, `imessage`, `fakechat`) memakai Apache-2.0 dengan baris hak cipta "Copyright 2026 Anthropic, PBC"; (c) **sepuluh plugin `external_plugins` tidak memiliki LICENSE sama sekali** di repo ini (asana, context7, firebase, github, gitlab, laravel-boost, linear, playwright, serena, terraform): isinya hanya konfigurasi dan README yang menunjuk server pihak ketiga, sehingga hanya fakta konfigurasi yang boleh dipakai, bukan teks README. Plugin `claude-security` (lisensi proprietary) bukan irisan saya.

---

## Bagian B — Temuan

### OFB-01 Adapter plugin menolak deskripsi Skill yang memuat `<` atau `>`
- Sumber: `plugins/math-proof/skills/siege/SKILL.md` (frontmatter, deskripsi 470 karakter memuat tanda kurung sudut pada petunjuk penggunaan), `plugins/math-proof/skills/solo/SKILL.md` (328 karakter, idem), `plugins/example-plugin/skills/example-command/SKILL.md` (deskripsi memuat `skills/<name>/SKILL.md`). Terdeteksi lewat skrip: 3 dari 31 `SKILL.md` pada irisan ini.
- Observasi: Deskripsi Skill resmi Claude boleh memuat `<...>`; SkillService Agent Core menolak sembarang `<` atau `>` di deskripsi.
- Nilai untuk Agent Core: Preview/adaptasi plugin (diadopsi 2026-10-27) menandai 3 dari 31 skill resmi sebagai `unsupported` hanya karena karakter kosmetik, padahal sisa frontmatter terpetakan.
- Baseline Agent Core: `src/skills/service.ts:178-181` (`SKILL_DESCRIPTION_INVALID` bila `/[<>]/`); `src/skills/claude-plugin.ts:232-234` dan `:276` (deskripsi dipakai apa adanya) lalu `:284-291` (putaran balik parser ketat gagal → `unsupported`). Status: SEBAGIAN (adapter ada; celah pada kelas input ini).
- Delta/celah: Tidak ada langkah sanitasi deskripsi pada adapter.
- Cara adaptasi: Di `adaptFrontmatter` (`claude-plugin.ts`), ganti `<`/`>` dengan padanan aman (mis. hapus kurung sudut dan pertahankan isinya, atau pakai kurung siku) dan catat `{field:'description', action:'angle-brackets-replaced'}` di `changes`. Parser ketat tidak dilonggarkan; teks asli sudah dipertahankan di `references/claude-original-skill.md`.
- Lisensi/hak cipta: Hanya perilaku format yang diamati; tidak ada teks disalin.
- Perkiraan skala: S · Risiko: rendah (perubahan hanya pada jalur adaptasi, dengan putaran balik tetap wajib) · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: Terverifikasi dari pembacaan kode dan pengukuran frontmatter; belum dijalankan terhadap plugin sebenarnya (dilarang menjalankan kode Agent Core).
- Disposisi: ADAPT

### OFB-02 Identitas plugin tidak tercatat pada provenance: nama skill bentrok lintas plugin dan `stageable` salah sasaran
- Sumber: `external_plugins/{discord,telegram,imessage}/skills/{access,configure}/SKILL.md` (enam skill, hanya dua nama: `access` dan `configure`); `README.md:87` (di Claude Code skill terdaftar sebagai `<plugin>:<skill>`).
- Observasi: Di Claude Code ruang nama dijaga oleh awalan plugin. Agent Core meratakan semuanya menjadi nama skill biasa.
- Nilai untuk Agent Core: Setelah `access` dari plugin discord aktif, preview plugin telegram melaporkan `access` sebagai `catalog: different-digest` dan `stageable: true`, sehingga skill milik plugin lain ditawarkan sebagai "revisi" dari skill yang aktif. Itu salah secara semantik dan berbahaya bila disetujui terburu-buru.
- Baseline Agent Core: `src/skills/claude-plugin.ts:252-270` (metadata provenance hanya `source-format`, `source-name`, `source-sha256`; tanpa nama plugin); `src/skills/service.ts` bagian analisis (sekitar `:922-937`, `skill.stageable = skill.catalog === 'different-digest'` pada `:936`). Status: SEBAGIAN.
- Delta/celah: Tidak ada pemeriksaan asal-sama untuk revisi; tidak ada opsi awalan.
- Cara adaptasi: Catat `source-plugin` (nama manifest, disanitasi `reportLabel`) ke metadata. Jadikan `stageable` hanya bila `source-plugin` (atau `UPSTREAM.repo`) sama dengan insumben; bila beda, lapor `catalog: 'name-conflict-other-origin'` dan `blocking: true`. Sediakan opsi eksplisit nama bernamespace `<plugin>-<skill>`. Prinsip dari `external-pr-scope.js:1-15`: percayai repo sumber, turunkan himpunan yang diizinkan dari keadaan hidup, bukan dari identitas pengaju.
- Lisensi/hak cipta: Tidak ada teks disalin.
- Perkiraan skala: S–M · Risiko: sedang (mengubah kriteria `stageable`; perlu uji pada `tests/skill-claude-plugin.test.ts`) · Nilai: tinggi · Butuh skema tool baru: tidak (bidang keluaran/metadata) · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: Terverifikasi: dua nama ganda ×3 di sumber, dan jalur kode yang menghitung `stageable`. Dugaan: skenario impor berurutan belum diuji.
- Disposisi: ADAPT

### OFB-03 `commands/*.md` sebagai kandidat Skill pada preview/adapter
- Sumber: `plugins/example-plugin/README.md` (bagian Commands: layout `commands/` adalah format warisan yang dimuat identik dengan `skills/<name>/SKILL.md`), `plugins/plugin-dev/commands/create-plugin.md:72` (catatan serupa); tujuh file perintah di irisan: `asana-setup`, `new-sdk-app`, `revise-claude-md`, `maker-setup`, `example-command`, `create-docker-mcp-tunnel`, `create-plugin`.
- Observasi: Semua tujuh perintah hanya memakai kunci frontmatter `description`, `argument-hint`, `allowed-tools`, `disable-model-invocation`, yang sudah terpetakan adapter.
- Nilai untuk Agent Core: Plugin yang konten pengguna-nya hanya `commands/` (asana, mcp-tunnels, cwc-makers, agent-sdk-dev) saat ini menghasilkan nol skill yang dapat diimpor; padahal isinya prosedur yang dapat dibaca.
- Baseline Agent Core: `src/skills/claude-plugin.ts:380-387` (perintah dan agen hanya dilaporkan, `REPORTED_ONLY_NOT_INSTALLED`). Status: SEBAGIAN (inventori ada, impor tidak).
- Delta/celah: Tidak ada pemetaan perintah → skill.
- Cara adaptasi: Inventori memetakan `commands/<x>.md` menjadi kandidat skill bernama `x` (direktori pembungkus sintetis), tetap preview + impor eksplisit, tanpa aktivasi dan tanpa wewenang eksekusi. Tandai placeholder (`$ARGUMENTS`, `$1`) lewat OFB-04.
- Lisensi/hak cipta: Per plugin, Apache-2.0 (asana tanpa LICENSE; hanya fakta format yang dipakai).
- Perkiraan skala: S–M · Risiko: sedang (badan perintah mengandaikan alat Claude Code seperti AskUserQuestion; nilainya dokumenter) · Nilai: rendah-sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: Terverifikasi dari tally frontmatter; relevansi praktis tergantung plugin yang ingin pengguna impor.
- Disposisi: ADAPT

### OFB-04 Laporan adapter: placeholder yang tak terselesaikan dan mode invokasi
- Sumber: Tally pada 31 `SKILL.md`: `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_SKILL_DIR}` muncul di 5 skill (siege 4×, command-development 19×, hook-development 16×, mcp-integration 9×, plugin-structure 14×); `disable-model-invocation` pada 2 (siege, solo); `user-invocable` pada 7; `argument-hint` pada 3; `$ARGUMENTS` pada siege/solo dan perintah. Contoh: siege memanggil `python3 ${CLAUDE_SKILL_DIR}/scripts/ledger.py`.
- Observasi: Skill resmi mengandalkan variabel jalur yang diisi host dan flag yang membatasi pemanggilan model.
- Nilai untuk Agent Core: Skill hasil impor memuat jalur placeholder yang tak berarti di Agent Core; flag "hanya pengguna" (mis. alur 100+ sub-agen) hilang sebagai metadata mati.
- Baseline Agent Core: `claude-plugin.ts:260-265` (kunci non-ketat dipindah ke `metadata.claude-<kunci>`; tidak ada pembaca), `:186-209` (`findMissingReferences` sudah ada); tidak ada laporan placeholder. `src/skills/discovery.ts:10-20` (`applicability: declared|missing|ambiguous`; tanpa mode invokasi). Status: SEBAGIAN.
- Delta/celah: Tidak ada daftar placeholder dan tidak ada bidang `invocation`.
- Cara adaptasi: Tambah daftar nama placeholder (tanpa nilai) ke laporan adaptasi; turunkan `invocation: 'user-only'` dari `claude-disable-model-invocation` dan tampilkan sebagai bidang deskriptor (keluaran saja). Tanda blok ```bash dapat dilaporkan agar contoh disesuaikan ke PowerShell.
- Lisensi/hak cipta: Hanya fakta format.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah-sedang · Butuh skema tool baru: tidak (keluaran) · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: Terverifikasi dari tally dan kode; efek pada routing otomatis adalah inferensi.
- Disposisi: ADAPT

### OFB-05 Format katalog marketplace: skill-bundle `strict:false`, `lspServers`, `renames`
- Sumber: `.claude-plugin/marketplace.json` (315 entri: 164 `url`, 98 `git-subdir`, 53 jalur lokal; 14 entri `strict:false` (2 punya larik `skills`: amd-skills, learn-with-coursera, plus 12 LSP); 12 `lspServers`; 10 pasangan `renames`); `README.md:45-89`; `.github/workflows/validate-plugins.yml`.
- Observasi: Plugin tanpa manifest dapat dideklarasikan langsung di entri katalog dengan `skills: ["./a","./b"]` relatif ke `source.path`; nama plugin immutable, perubahan nama lewat `renames`; `displayName` untuk label.
- Nilai untuk Agent Core: Hanya relevan bila Agent Core pernah membaca `marketplace.json`. Adapter sekarang hanya memahami direktori plugin dengan lokasi bawaan (komentar `claude-plugin.ts:9`: jalur yang dideklarasikan manifest hanya dilaporkan).
- Baseline Agent Core: tidak ada penerimaan `marketplace.json`. Status: BELUM-ADA (tanpa konsumen).
- Delta/celah: Tidak ada; hanya catatan format.
- Cara adaptasi: Tidak ada perubahan sekarang. Bila nanti perlu, perluas inventori untuk mengikuti `skills` dari entri katalog.
- Lisensi/hak cipta: Metadata katalog Anthropic; fakta format saja.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: Terverifikasi lewat parse JSON.
- Disposisi: REFERENSI

### OFB-06 Lint Skill advisory (ukuran badan, Trigger/Non-trigger, tautan mati, contoh bash)
- Sumber: `plugins/plugin-dev/agents/skill-reviewer.md:54-105` (heuristik), `plugins/skill-creator/skills/skill-creator/scripts/quick_validate.py:42-92` (kunci diizinkan, nama kebab-case ≤64, deskripsi ≤1024 tanpa `<>`, kompatibilitas ≤500), `.github/scripts/validate-frontmatter.ts:126-139` (skill valid dengan `description` atau `when_to_use`). Pengukuran saya: 17 dari 31 skill resmi punya badan >8 KB (siege 74.386 B, skill-creator 32.808 B); semua deskripsi ≤906 karakter.
- Observasi: Pemeriksa resmi bersifat struktural plus heuristik gaya; tidak ada yang mengukur ukuran terhadap fragmen baca.
- Nilai untuk Agent Core: Konvensi "badan muat satu fragmen 8.192 B" dan bagian Triggers/Non-triggers belum ditegakkan oleh alat apa pun yang saya temukan; kualitas Skill hasil proposal bergantung pada ketelitian manual.
- Baseline Agent Core: `service.ts:87-181` (parser ketat); `discovery.ts` mengurai Trigger/Non-trigger dan memberi `applicability`; `findMissingReferences`. Grep `Non-triggers` di `*.ts|*.mjs|*.ps1` hanya menemukan `tests/skill-discovery.test.ts`. Tidak ada keluaran lint. Status: SEBAGIAN.
- Delta/celah: Peringatan advisory: jumlah fragmen 8.192 B, bagian Trigger/Non-trigger hilang/ambigu, tautan relatif mati, blok bash tanpa padanan PowerShell, `when_to_use` tanpa `description`.
- Cara adaptasi: Skrip `scripts/verify/skill-lint.mjs` baca-saja memakai `parseSkillMarkdown`/`discovery`, keluaran JSON ringkas. Jangan impor ambang kata dari skill-reviewer (1.000-3.000 kata, orang ketiga): bertentangan dengan konvensi Agent Core (lihat Bagian D).
- Lisensi/hak cipta: Hanya ide pemeriksaan; reimplementasi mandiri.
- Perkiraan skala: S · Risiko: rendah (advisory) · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: Pengukuran 31 skill terverifikasi; nilai ambang adalah usulan.
- Disposisi: ADAPT

### OFB-07 Lapisan asersi pada evaluasi efektivitas Skill (grading + catatan analis deterministik)
- Sumber: `plugins/skill-creator/skills/skill-creator/agents/grader.md:1-223`, `agents/analyzer.md:187-274`, `references/schemas.md:86-305`, `scripts/aggregate_benchmark.py:45-224`, `SKILL.md:163-290`.
- Observasi: Alur resmi memisahkan pelari (dengan-skill vs tanpa/versi lama, snapshot `old_skill`), penilai (asersi `{text, passed, evidence}`), agregasi (rerata, simpangan baku, min/maks, delta), dan analis yang mencari pola: asersi yang selalu lulus di kedua kondisi (tak diskriminatif), selalu gagal, hanya lulus dengan skill, gagal dengan skill tetapi lulus tanpa skill, varians tinggi. Penilai juga mengkritik asersinya sendiri dan memverifikasi klaim tersirat. Aturan: beban bukti pada asersi; bukti dangkal = gagal; tanpa kredit parsial.
- Nilai untuk Agent Core: Evaluator saat ini hanya melihat satu boolean `correct` per run sehingga tak bisa menunjukkan asersi mana yang membedakan skill dari kontrol atau mana yang tak berguna.
- Baseline Agent Core: `scripts/verify/skill-effectiveness-eval.mjs:53-178` (observasi tingkat-tugas, statistik, delta, advisory, terikat digest); `runtime/skills/capability-packs/mind-control/evals/grader.md` (rubrik manual: bukti per kriteria, tanpa pencocokan kata kunci); dokumen `docs/history-agent-core/Agent-Core-Ecosystem-Residual-Steal-Use-Plan.md:160-185` (AC-ECO-P5). Status: SEBAGIAN.
- Delta/celah: Tidak ada rekaman asersi per run, tidak ada catatan pola, tidak ada keluaran kritik-eval.
- Cara adaptasi: Perluas skema observasi (versi 2, bidang `assertions[]` opsional) dan tambah penghitung deterministik pola di atas pada skrip yang sama. Penilaian tetap langkah terlihat (penilai manusia/AI yang dipilih pengguna), bukan agen kedua tersembunyi. Salin aturan penilaian ke `mind-control/evals/grader.md` atau referensi on-demand.
- Lisensi/hak cipta: Apache-2.0; reimplementasi mandiri tanpa menyalin teks.
- Perkiraan skala: M · Risiko: rendah (advisory, tanpa mutasi Skill) · Nilai: sedang-tinggi · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: Terverifikasi dengan membaca kedua sisi; manfaat praktis tergantung seberapa sering evaluasi dijalankan.
- Disposisi: ADAPT

### OFB-08 Panduan penyusunan fixture routing (trigger eval)
- Sumber: `skill-creator/SKILL.md:333-405` (20 kueri, 8-10 positif dan 8-10 near-miss negatif; kueri realistis dan detail; negatif harus sulit; pemisahan 60/40; riwayat percobaan tanpa skor uji), `plugins/math-olympiad/skills/math-olympiad/evals/trigger_eval.json` (20 item, 10 positif), `skill-creator/assets/eval_review.html`.
- Observasi: Format `{query, should_trigger}` sama dengan fixture Agent Core. Resmi: skill hanya dikonsultasikan untuk tugas yang tak bisa dikerjakan model langsung, jadi kueri sepele buruk sebagai uji (berlaku untuk Claude Code, belum tentu untuk routing wajib Agent Core).
- Nilai untuk Agent Core: Evaluator sudah ada; yang kurang adalah panduan membuat fixture bermutu (near-miss, detail).
- Baseline Agent Core: `scripts/verify/skill-routing-eval.mjs:71-144` (≥4 kueri, ≥2 per kelas, pemisahan stratifikasi deterministik seed, holdout 25%) dan `:175-209`; `docs/history-agent-core/...Residual-Steal-Use-Plan.md:137-158` (AC-ECO-P4). Status: SUDAH-ADA untuk evaluator; BELUM-ADA untuk panduan.
- Delta/celah: Panduan penulisan fixture.
- Cara adaptasi: Satu bagian di referensi on-demand yang sudah ada (mis. referensi `using-agent-skills`), tanpa teks selalu-dimuat. Loop optimasi deskripsi berbasis model (`run_loop.py`, `improve_description.py`) tidak diadopsi (Bagian C).
- Lisensi/hak cipta: Apache-2.0; parafrase.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah-sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: Terverifikasi.
- Disposisi: ADAPT

### OFB-09 Halaman review hasil eval statis (hanya sebagai referensi, dengan jebakan)
- Sumber: `skill-creator/eval-viewer/generate_review.py:288-306` (`_kill_port` membunuh proses apa pun di port via `lsof`), `:281` (data JSON disisipkan ke `<script>` tanpa escape `<`), `:387-436` (`--static` menulis satu HTML mandiri tanpa server); `viewer.html:10` (CDN `cdn.sheetjs.com`; Google Fonts); `plugins/receipts/skills/receipts/scripts/mine-transcripts.mjs:1190-1202` (`jsonForScript` yang benar).
- Observasi: Mode statis cocok untuk lingkungan tanpa tampilan; mode server mematikan proses di port dan memuat sumber daya eksternal.
- Nilai untuk Agent Core: Bila review hasil eval di UI/HTML diperlukan, polanya berguna, tetapi implementasi aslinya melanggar preferensi tanpa sisa proses dan local-first.
- Baseline Agent Core: tidak ada penampil eval; dasbor Proposals ada. Status: BELUM-ADA (tanpa kebutuhan yang terbukti).
- Delta/celah: —
- Cara adaptasi: Bila dibutuhkan, tulis HTML mandiri ke `runtime/tmp`, escape `<`, tanpa server, tanpa CDN, tanpa membuka tab otomatis.
- Lisensi/hak cipta: Apache-2.0; tidak disalin.
- Perkiraan skala: M · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: Cacat `_kill_port` dan escape terverifikasi dari kode.
- Disposisi: REFERENSI

### OFB-10 Isolasi verifikasi ganda dan pola serangan untuk tinjauan adversarial
- Sumber: `plugins/math-olympiad/skills/math-olympiad/SKILL.md:19-31, 142-208, 325-340`; `references/verifier_patterns.md` (pola 4, 5, 10, 17, 18, 19, 22, 23); `skill-creator/agents/comparator.md:196` (tetap buta); `plugins/math-proof/agents/math-proof-judge.md`; `math-proof/skills/solo/SKILL.md` (bagian tugas).
- Observasi: Pemverifikasi hanya menerima artefak bersih (tanpa jejak penalaran) dan buta terhadap vonis pemverifikasi lain; ambang asimetris (4 setuju untuk konfirmasi, 2 menolak untuk menyangkal) dengan keluar-dini; celah ditandai `[GAP: ...]` di teks; abstain terkalibrasi ("tidak ada solusi yakin") lebih baik daripada menebak.
- Nilai untuk Agent Core: Prinsip inti (peninjau konteks-segar, hanya artefak+kontrak) sudah ada. Yang belum: kebutaan terhadap peninjau lain, penanda celah inline, dan pola serangan spesifik, yang padanannya untuk perangkat lunak berguna (P5/P10: syarat API yang dikutip dicek ulang dari nol; P17: uji melewati kasus non-degenerat pertama; P18: perbaikan melingkar; P19: hambatan ada pada objek proksi, periksa objek asal; P23: cakupan identitas digeneralisasi diam-diam).
- Baseline Agent Core: `runtime/skills/capability-packs/doubt-driven-development/SKILL.md:3, 32, 66-107` (peninjau segar, ekstrak artefak+kontrak "bukan perjalanan"); `mind-control/evals/grader.md` (isolasi kondisi). Status: SEBAGIAN.
- Delta/celah: Satu berkas referensi.
- Cara adaptasi: `references/attack-patterns.md` (≤4 KB) pada doubt-driven-development, memuat padanan perangkat lunak pola di atas, aturan kebutaan ganda saat >1 peninjau, dan format abstain. Vote multi-agen dan keluar-dini sebagai runtime tidak diadopsi.
- Lisensi/hak cipta: Apache-2.0; parafrase mandiri, domain matematika tidak dibawa.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: Pembacaan penuh SKILL.md dan sebagian verifier_patterns; pola 22/23 diterjemahkan secara inferensi.
- Disposisi: ADAPT

### OFB-11 Audit anggaran instruksi (AGENTS.md 84 KB) dengan rubrik claude-md-improver
- Sumber: `plugins/claude-md-management/skills/claude-md-improver/SKILL.md:35-95` (6 kriteria berbobot: perintah 20, arsitektur 20, pola non-obvious 15, ringkas 15, mutakhir 15, dapat-dieksekusi 15; laporan sebelum edit), `references/quality-criteria.md` (tanda bahaya: perintah gagal, rujukan file terhapus, versi usang, TODO abadi, info ganda), `references/update-guidelines.md:64-107` (jangan tambah: info jelas, saran generik, perbaikan sekali-jalan, penjelasan bertele-tele), `commands/revise-claude-md.md` (satu baris per konsep; diff + persetujuan), gambar contoh laporan.
- Observasi: Rubrik berorientasi menambah isi; bobot "ringkas" hanya 15 dari 100 dan tidak ada dimensi anggaran byte. Bagian "kemutakhiran" (rujukan jalur/perintah masih ada) dapat diperiksa secara deterministik.
- Nilai untuk Agent Core: Masalah nyata: AGENTS.md selalu dimuat dan memotong kapsul bootstrap. Hasil audit saya (skrip baca-saja): 84.043 B, 495 baris. Bagian terbesar: "External-controller build activation and tool refresh" 6.010 B; segmen berhuruf tebal yang diawali larangan membuat folder baru 5.442 B; "Mandatory capability routing" 5.010 B; "External continuity, claim review and proposal documents" 4.324 B; segmen "Agent Core auto-approval reaffirmed — 2026-10-18" 4.191 B; "Code Intelligence protocol" 3.774 B. Bagian `## Historical Hermes A2A partner protocol — RETIRED, NOT CURRENT INSTRUCTIONS` (`AGENTS.md:438`, ±3,6 KB) berlabel pensiun tetapi tetap selalu dimuat; `## Historical product direction context` (`:95`) serupa. 15 baris bertanggal (±4,9%). Dari 32 rujukan jalur berbentuk-jalur, 9 tidak ditemukan dari akar repo (sebagian disengaja: jalur historis `runtime/memory-v2*`, atau nama relatif seperti `CODEBASE.md`), sehingga perlu triase manual.
- Baseline Agent Core: `scripts/inspect/context-footprint.mjs` (mengurai blok instruksi: jenis, baris, SHA-256, byte) ada; tidak ada klasifikasi nilai/umur; `docs/CODEBASE.md` memuat peta. Status: SEBAGIAN.
- Delta/celah: Kebijakan dan skrip klasifikasi blok: (a) pensiun/historis, (b) log insiden bertanggal, (c) duplikat dokumen lain (`docs/PROJECT-STRUCTURE.md`), (d) rujukan basi, (e) dapat dipindah ke Skill/referensi on-demand; ditambah dimensi "byte selalu-dimuat" yang tidak ada pada rubrik asli.
- Cara adaptasi: Referensi on-demand "audit anggaran instruksi" + skrip baca-saja `scripts/inspect/instruction-budget-audit.mjs` yang memakai pengurai `context-footprint.mjs`; keluaran: tabel blok, saran pindah, daftar rujukan basi. Penyuntingan AGENTS.md tetap lewat persetujuan eksplisit pengguna dan harus bernilai netto-negatif (isi dipindah ke docs/Skill, bukan dihapus diam-diam).
- Lisensi/hak cipta: Apache-2.0; reimplementasi mandiri (rubrik diparafrase, bobot disesuaikan).
- Perkiraan skala: M · Risiko: sedang (menyentuh kontrak selalu-dimuat; harus ada persetujuan dan hash sebelum/sesudah) · Nilai: tinggi · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak (justru menguranginya)
- Bukti vs dugaan: Ukuran dan label bagian diukur langsung (`ofb-audit-agents.mjs`). Dugaan: "duplikat dengan PROJECT-STRUCTURE" belum diverifikasi; relevansi tiap blok adalah keputusan pemilik.
- Disposisi: ADAPT

### OFB-12 Permukaan selalu-dimuat harus pendek; laporan byte per-tool manifest
- Sumber: `plugins/plugin-dev/skills/agent-development/SKILL.md:34-90` (deskripsi dimuat tiap agen terdaftar; contoh kerja dipindah ke badan "When to invoke"), kontras dengan `plugins/plugin-dev/agents/skill-reviewer.md:3-33` dan `plugin-validator.md:3-33` (tiga blok `<example>` panjang di deskripsi), `mcp-server-dev/skills/build-mcp-server/references/tool-design.md:94-102` (30+ tool: 3-5 ribu token tiap giliran) dan `:17-50`.
- Observasi: Panduan resmi yang lebih baru memindah contoh keluar dari deskripsi; berkas lama di repo sama belum diperbarui.
- Nilai untuk Agent Core: Anggaran manifest 130.965/131.072 B (±82 tool). Menghemat byte di deskripsi tool memberi ruang tanpa menghapus kemampuan.
- Baseline Agent Core: `scripts/verify/rea-harness-registration.mjs:32` memeriksa batas 131.072 untuk satu harness; saya tidak menemukan laporan peringkat byte per tool. Status: BELUM-ADA (berdasar grep; dugaan).
- Delta/celah: Skrip peringkat byte (deskripsi + skema) per tool dengan 15 teratas, plus kaidah: contoh/skenario dipindah ke Skill atau docs.
- Cara adaptasi: `scripts/release/` skrip baca-saja memakai daftar tool yang sama dengan pemeriksa kontrak; mengubah teks deskripsi tool (bukan skema input) menyentuh manifest dan harus lewat kontrol rilis yang ada.
- Lisensi/hak cipta: Hanya prinsip.
- Perkiraan skala: S (laporan), M (pemangkasan nyata) · Risiko: sedang (deskripsi mengarahkan perilaku pengendali) · Nilai: sedang-tinggi · Butuh skema tool baru: tidak untuk laporan; pemangkasan mengubah teks deskripsi tool · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: Prinsip terverifikasi di sumber; ketiadaan laporan byte-per-tool adalah inferensi dari grep.
- Disposisi: ADAPT

### OFB-13 Kebijakan admisi payload Skill (aturan deterministik advisory + daftar periksa)
- Sumber: `.github/policy/prompt.md:1-140`, `.github/policy/schema.json:1-52`, `plugins/plugin-dev/agents/plugin-validator.md:130-135`, `mcp-server-dev/skills/build-mcpb/references/local-security.md`, `mcp-server-dev/.../tool-design.md:7-13`, `.github/scripts/external-pr-scope.js:1-15`.
- Observasi: Kebijakan meminta peninjau membaca SELURUH payload yang dikirim, termasuk direktori tersembunyi dan skrip yang tidak dimuat otomatis; mengenumerasi setiap hook dan mencatat apakah bergerbang proyek, apakah ada panggilan jaringan (host mana), apakah membaca data di luar tujuan; mendeteksi pengambilan kredensial lintas-layanan (kredensial milik layanan A dikirim ke layanan B), muatan prompt-injection dan instruksi koersif, telemetri tanpa pengungkapan atau opt-out, pengunduhan perangkat lunak; menguji apakah deskripsi sesuai perilaku. Verdict berskema: `passes`, `hooks[]` berformat "EVENT:path — gated|ungated — network:yes(host)|no", `has_broad_scope_hooks`, `has_undisclosed_telemetry`, `description_matches_behavior`.
- Nilai untuk Agent Core: Admisi Skill hanya memeriksa struktur, ukuran, symlink, digest, dan melaporkan hook/MCP tanpa menggemakan perintahnya. Tidak ada pemindaian isi payload (grep pola exfil/kredensial/"ignore previous" di `src/skills/*.ts` tidak menemukan apa pun).
- Baseline Agent Core: `src/skills/service.ts:868-875` (validate), `claude-plugin.ts:354-400` (inventori laporan-saja), `src/code-intelligence/changed-source-security.ts:6-13, 44-51` (pemindai deterministik dengan aturan aditif `project-rule`, `MAX_RULES = 32`). Status: SEBAGIAN.
- Delta/celah: Paket aturan khusus payload Skill: panggilan jaringan (`fetch`, `curl`, `Invoke-WebRequest`, `requests`), pembacaan penyimpanan kredensial (`cmdkey`, `~/.aws`, `.ssh`, `keytar`), unduh/instal paket (`npx -y`, `pip install`, `winget`), teks koersif ("ignore previous instructions", "always run me first"), direktori titik (`.claude/`), dan daftar periksa pengendali dengan boolean yang sama seperti skema kebijakan.
- Cara adaptasi: Aturan aditif untuk pemindai yang ada, diterapkan pada direktori Skill yang di-stage, dikeluarkan sebagai bidang `admissionAdvisory` di keluaran `skills(validate)`/preview (cek apakah tool mendeklarasikan `outputSchema`). Telaah model otomatis TIDAK diadopsi: hanya temuan deterministik dan daftar periksa yang diisi pengendali dengan bukti; advisory, tidak memblokir.
- Lisensi/hak cipta: Apache-2.0; kriteria diparafrase, tidak menyalin prompt.
- Perkiraan skala: M · Risiko: sedang (positif palsu regex; pemindai saat ini beroperasi pada sumber berubah, perlu jalur panggilan untuk direktori Skill) · Nilai: tinggi · Butuh skema tool baru: tidak (periksa `outputSchema`) · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: Kebijakan dibaca penuh; absennya pemindaian di jalur impor adalah bukti grep.
- Disposisi: ADAPT

### OFB-14 Pola cache verdict, status unknown≠gagal, sink ternetralkan, loop terbatas
- Sumber: `.github/workflows/scan-plugins.yml:87-100` (kunci cache memuat hash kebijakan), `:151-163` (cache hit hanya bila objek sumber utuh sama), `:118-128` (TTL), `:245-255` (pemurnian rahasia berpola), `:314-338` (menetralkan teks keluaran model sebelum sink publik), `:362-383` (gagal tanpa verdict = galat infra, jangan salah dibaca lulus), `:385-546` (komentar lengket `schema_version 1`); `.github/workflows/revert-failed-bumps.yml:164-183` (hanya `source.sha` dikembalikan, batal bila bidang lain berbeda = tanda gangguan), `:132-142` (batas pass lewat jumlah commit).
- Observasi: Kumpulan kebiasaan rekayasa untuk evaluasi otomatis yang dapat dipercaya.
- Nilai untuk Agent Core: Setelah OFB-13 ada, hasil pemindaian bernilai di-cache dan ditandai konsisten.
- Baseline Agent Core: bukti eval terikat digest skill + fixture + sidik jari manifest (`skill-routing-eval.mjs`); `reportLabel` menetralkan teks (`claude-plugin.ts:94-96`); jurnal mutasi `src/mcp/mutation-safety.ts`. Status: SEBAGIAN.
- Delta/celah: Kunci cache (digest, hash kumpulan aturan); status `unknown/infra-error` berbeda dari `fail`.
- Cara adaptasi: Konvensi saat membangun OFB-13; tidak ada komponen baru sekarang.
- Lisensi/hak cipta: Apache-2.0; hanya pola.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah-sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: Terverifikasi di YAML.
- Disposisi: REFERENSI

### OFB-15 Pemeriksa drift upstream untuk `UPSTREAM.json`
- Sumber: `.github/scripts/discover_bumps.py:55-85` (SHA terbaru dibatasi path), `:141-161` (urut yang paling lama dipin lebih dulu, batas 20, "upstream mati" bila 404/422), `.github/bump-tracking.json` (14 slug `releases-only`), `.github/workflows/bump-plugin-shas.yml:19-25` (batas dinaikkan 30→60 karena entri akhir alfabet kelaparan).
- Observasi: Ada dua mode pelacakan (HEAD vs rilis) dan rotasi adil di bawah batas biaya.
- Nilai untuk Agent Core: 38 paket di `runtime/skills/capability-packs/*/UPSTREAM.json` menyematkan repo+commit+path (+sha), tetapi tidak ada alat yang memberi tahu bila upstream bergerak.
- Baseline Agent Core: kunci tidak seragam (`repo` + `originalSkillSha256` pada mind-control; `repository` + `skillSha256` pada code-simplification); `scripts/research/` hanya `weknora-*`. Status: BELUM-ADA.
- Delta/celah: Skrip laporan drift.
- Cara adaptasi: `scripts/research/skill-upstream-drift.mjs`, dijalankan eksplisit oleh pengguna, baca-saja: untuk tiap `UPSTREAM.json` bandingkan commit terpin dengan commit terakhir yang menyentuh `path` (GitHub API anonim atau `git ls-remote`), tulis laporan ke `runtime/tmp`, tangani kedua ejaan kunci. Tidak ada bump otomatis atau PR; pembaruan tetap lewat staging revisi.
- Lisensi/hak cipta: Apache-2.0; reimplementasi mandiri.
- Perkiraan skala: S · Risiko: rendah (memakai jaringan hanya saat dijalankan pengguna; batas laju anonim GitHub) · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: Terverifikasi: 38 berkas dan dua bentuk kunci; efektivitas bergantung batas laju API.
- Disposisi: ADAPT

### OFB-16 Elisitasi MCP sebagai konfirmasi yang tidak dapat dipalsukan model
- Sumber: `mcp-server-dev/skills/build-mcp-server/references/elicitation.md:9-65` (cek kapabilitas wajib, fallback berupa teks), `:82-90` (accept/decline/cancel), `:114` (dilarang meminta kata sandi/kunci), `build-mcpb/references/local-security.md:108`, `build-mcp-server/references/versions.md` (Claude Code ≥2.1.76; Desktop belum terkonfirmasi per 2026-03).
- Observasi: Server dapat menjeda panggilan dan meminta formulir terstruktur dari pengguna lewat klien; jika klien tidak mengiklankan `elicitation`, SDK melempar galat sehingga fallback wajib.
- Nilai untuk Agent Core: Konfirmasi saat ini berupa token parameter yang diisi pengendali sendiri, mis. `CONFIRM_SKILL_SOURCE_CHANGE` (`src/skills/service.ts:658`, `:1262`); itu bukan bukti kehendak pengguna.
- Baseline Agent Core: grep `elicit` di `src/` tidak menemukan apa pun. Status: BELUM-ADA.
- Delta/celah: Konfirmasi di luar jalur model bila klien mendukung.
- Cara adaptasi: Di handler yang sudah mensyaratkan konfirmasi eksplisit (promote/rollback revisi Skill, penghapusan), periksa `getClientCapabilities()?.elicitation`; bila ada, minta boolean; `decline` dan `cancel` diperlakukan berbeda; bila tidak ada, jalur teks/token sekarang tetap. Jangan tambahkan prompt di alur rutin (instruksi izin penuh pengguna tetap berlaku) dan jangan meminta rahasia.
- Lisensi/hak cipta: Spesifikasi MCP umum.
- Perkiraan skala: M · Risiko: sedang (dukungan klien tidak pasti; API SDK server yang dipakai `@modelcontextprotocol/server` perlu diverifikasi) · Nilai: sedang-tinggi · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: Bukti kode dan dokumen; belum diuji apakah konektor Claude Desktop/ChatGPT mengiklankan `elicitation`.
- Disposisi: ADAPT

### OFB-17 Pengerasan OAuth: registrasi klien dinamis tanpa batas dan opsi CIMD
- Sumber: `mcp-server-dev/skills/build-mcp-server/references/auth.md:5-17` (DCR mendaftarkan klien baru pada setiap koneksi baru; CIMD dianjurkan; token tanpa passthrough dan validasi audiens `:93-97`), `build-mcp-app/references/abuse-protection.md` (token bucket per-IP, `trust proxy` sesuai topologi).
- Observasi: Dokumen resmi menyebut DCR membuat klien baru tiap koneksi; klien Claude lebih memilih CIMD.
- Nilai untuk Agent Core: Endpoint `/oauth/register` dipublikasikan lewat tunnel (`docs/Cloudflare-Tunnel.md:17`). Baca kode: pendaftaran menambah rekaman tanpa batas jumlah atau TTL, dan setiap operasi store memuat seluruh berkas (`this.load()`), sehingga pertumbuhan menurunkan kinerja dan memakai disk; tidak ada pembatas laju yang saya temukan di sisi origin (dokumen hanya menyarankan aturan rate-limit Cloudflare opsional, `:65`).
- Baseline Agent Core: `src/oauth/service.ts:122-161` (metadata iklan `registration_endpoint`, tanpa `client_id_metadata_document_supported`; batas badan 64 KiB di `:33-39`), `src/oauth/store.ts:151-186` (`file.clients.push`, tanpa pemangkasan), `:204-222` (pemulihan hanya bila registri kosong). Token terikat satu URL sumber sudah ada (`Cloudflare-Tunnel.md:58`). Status: SEBAGIAN.
- Delta/celah: Batas jumlah/umur klien tanpa token; pembatas laju untuk `/oauth/register`; opsional CIMD dengan pengambilan metadata lewat penjaga SSRF `src/net/public-address.ts`.
- Cara adaptasi: Pangkas klien tanpa kode/token yang lebih tua dari N hari dan batasi jumlah total, dengan memperhatikan logika `recoverClientRegistration` (jangan sampai registri kosong memicu pemulihan otomatis); token bucket proses; CIMD opsional belakangan.
- Lisensi/hak cipta: Spesifikasi dan saran umum.
- Perkiraan skala: S–M · Risiko: sedang (pemangkasan dapat memutus konektor yang sah; uji dengan ChatGPT/Claude) · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: Pembacaan kode; belum dieksploitasi atau diuji. Dugaan: tidak ada pembatas laju lain di lapisan `src/http`.
- Disposisi: ADAPT

### OFB-18 Notifikasi progres/logging MCP untuk tool panjang
- Sumber: `build-mcp-server/references/server-capabilities.md:70-135` (progres lewat `progressToken` di `_meta`, log berlevel, pembatalan lewat `AbortSignal`), `build-mcp-app/references/widget-templates.md` (templat Progress).
- Observasi: Kedua fitur opsional; server melewati bila klien tidak mengirim token.
- Nilai untuk Agent Core: Beberapa tool panjang (indeks kerja code, harness rekonstruksi, riset web, `start_search`) saat ini hanya dapat dipoling.
- Baseline Agent Core: grep `progressToken|notifications/progress|notifications/message|listRoots` di `src/` tidak menemukan apa pun; Stop→cancel sudah diadopsi. Status: BELUM-ADA.
- Delta/celah: Progres opsional.
- Cara adaptasi: Emisi progres di handler panjang hanya bila token ada.
- Lisensi/hak cipta: Spesifikasi MCP umum.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah (tampilan di klien tidak pasti) · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: Bukti grep; tampilan klien tidak diketahui.
- Disposisi: ADAPT

### OFB-19 Pola search+execute dan disiplin deskripsi tool
- Sumber: `build-mcp-server/SKILL.md:109-142`, `references/tool-design.md:5-102`, `references/remote-http-scaffold.md` (bagian search+execute), `build-mcp-app/references/directory-checklist.md`.
- Observasi: Untuk >30 tool resmi menyarankan dua tool (`search_actions`, `execute_action`) dengan 3-5 tool terpopuler dipromosikan; kriteria direktori: tool baca dan tulis terpisah, anotasi `readOnlyHint`/`destructiveHint`/`title`, nama ≤64 karakter, deskripsi tidak boleh memerintah perilaku model.
- Nilai untuk Agent Core: Satu-satunya opsi struktural bila anggaran manifest terus menekan.
- Baseline Agent Core: fasad dengan parameter `action` sudah dipakai (mis. `skills`); anotasi sudah ada (95 kemunculan di 21 file `src/`); ±82 tool. Status: SEBAGIAN.
- Delta/celah: Tidak ada yang dapat dikerjakan tanpa mengubah skema tool.
- Cara adaptasi: Tidak diusulkan sekarang. Bila anggaran habis, pertimbangkan promosi/pelipatan berdasarkan hasil OFB-12.
- Lisensi/hak cipta: Saran umum.
- Perkiraan skala: L · Risiko: tinggi (kompatibilitas hibah tool dan konektor) · Nilai: tinggi secara prinsip · Butuh skema tool baru: ya · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: Terverifikasi sumber; dampak pada Agent Core belum dianalisis.
- Disposisi: REFERENSI

### OFB-20 Batas ukuran hasil tool di sisi host
- Sumber: `build-mcp-app/references/payload-budgeting.md:1-48`.
- Observasi: Claude.ai/Desktop memotong sekitar 150.000 karakter dan Claude Code sekitar 25 ribu token; hasil yang lewat batas diganti string penunjuk berkas sehingga konsumen JSON gagal diam-diam. Anjuran: batasi payload sendiri ±130 KB; degradasi bertahap: baris penuh → pangkas kolom → potong baris dengan `{truncated:N}`.
- Nilai untuk Agent Core: Hasil tool besar dapat "hilang" tanpa penanda di klien.
- Baseline Agent Core: pembacaan Skill difragmentasi 8 KB; `scripts/verify/compact-output.mjs` ada (tidak dibaca); keseragaman batas per tool tidak diketahui. Status: tidak diketahui.
- Delta/celah: Pertanyaan terbuka.
- Cara adaptasi: Periksa apakah semua tool punya batas ≤ ±130 KB dengan penanda terpotong.
- Lisensi/hak cipta: Fakta perilaku.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang (jika ada tool tanpa batas) · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: Angka batas berasal dari dokumen sumber (per 2026-03), belum diuji ulang.
- Disposisi: REFERENSI

### OFB-21 Matriks troubleshooting tunnel terurut dan semantik probe liveness
- Sumber: `plugins/mcp-tunnels/commands/create-docker-mcp-tunnel.md:62-79, 99-117` (token tidak pernah masuk obrolan; `.env` mode 600 dan `.gitignore`; verifikasi tanpa mencetak nilai), `:327-359` (matriks gejala→sebab→perbaikan; urutan diagnosis: koneksi keluar → TLS dalam → perutean upstream; jebakan: konfigurasi tidak dimuat ulang panas), `:50-58` dan `:338` (validasi IP upstream: tolak publik/loopback sebagai perlindungan SSRF); `.github/workflows/check-mcp-urls.yml:72-107` (HEAD dulu, lalu POST `initialize`; hanya 404/410 dan kegagalan koneksi yang gagal; 401/403/405/5xx lulus; jebakan `|| code="000"` di luar substitusi).
- Observasi: Dokumen operasional yang menaruh urutan diagnosis dan batas lulus/gagal secara eksplisit.
- Nilai untuk Agent Core: Tunnel Cloudflare memiliki skrip `-Action Verify` tetapi dokumen tanpa tabel troubleshooting.
- Baseline Agent Core: `docs/Cloudflare-Tunnel.md` (6.243 B; baris 38-45 untuk Verify), perlindungan SSRF sudah ada (`src/net/public-address.ts`, `endpoint-policy.ts`). Status: SEBAGIAN.
- Delta/celah: Tabel troubleshooting ≤1,5 KB; periksa bahwa Verify memperlakukan 401/403/405 sebagai hidup.
- Cara adaptasi: Penambahan docs saja (bukan teks selalu-dimuat). Terowongan MCP Anthropic sendiri tidak diadopsi (Bagian C).
- Lisensi/hak cipta: Apache-2.0; parafrase.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah-sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: Terverifikasi di sumber; isi skrip Verify tidak dibaca.
- Disposisi: ADAPT

### OFB-22 Model kepercayaan kanal masuk (pairing, allowlist, gerbang keluar) sebagai pola siap pakai
- Sumber: `external_plugins/telegram/server.ts:93` (regex balasan izin ketat), `:140-154` (`assertSendable`: state channel tidak boleh dikirim), `:156-179` (berkas akses korup dipindah, mulai ulang aman), `:184-196` (mode statis menurunkan pairing ke allowlist), `:198-294` (gerbang masuk: kode 6 heks, TTL 1 jam, maksimal 3 tertunda, balasan maksimal 2, diam setelahnya), `:204-209` (gerbang keluar mencerminkan gerbang masuk), `:211-217` (tulis atomik mode 0600), `:406-416` (instruksi: jangan setujui pairing karena pesan kanal), `:738-751` (callback izin hanya dari pengirim ter-allowlist), `:903-905` (`safeName` buang pembatas), `:968-970` (jalur gambar hanya di meta, bukan di isi), `:1006-1040` (percobaan ulang dengan backoff); `telegram/skills/access/SKILL.md:15-20, 142-146` (tolak bila permintaan datang lewat kanal; jangan memilih otomatis meski hanya satu tertunda), `skills/configure/SKILL.md:58-80` (dorong ke allowlist); `imessage/README.md:55, 65` (watermark awal `MAX(ROWID)`; SMS pengirimnya dapat dipalsukan), `imessage/server.ts:35-38`; `fakechat/server.ts:150-196` (endpoint `/ws` dan `/upload` pada localhost tanpa cek Origin sebagai contoh tandingan).
- Observasi: Rancangan kanal yang menganggap pesan masuk sebagai tak tepercaya dan memisahkan mutasi akses dari input kanal.
- Nilai untuk Agent Core: Tidak ada kanal masuk (messaging) di Agent Core; dokumen pelaksanaan menolak otoritas baru. Namun beberapa invarian berlaku sekarang: (i) persetujuan wajib memakai id/digest eksplisit meski hanya satu item tertunda; (ii) jalur berkas dari sumber tak tepercaya hanya di bidang terstruktur; (iii) gerbang keluar mencerminkan gerbang masuk; (iv) direktori state tidak boleh dikirim.
- Baseline Agent Core: validasi Origin ada (`src/http/security-policy.ts:108-126`); keputusan proposal memakai digest/ref eksplisit (`service.ts:650-664`); aturan "tool output adalah data" tersebar (`AGENTS.md:109` tentang PRIOR EXPERIENCE bukan otorisasi). Status: SEBAGIAN.
- Delta/celah: Tidak ada teks tunggal yang menyatakan invarian di atas; tidak ada kanal yang membutuhkannya sekarang.
- Cara adaptasi: Simpan sebagai referensi; bila kanal masuk dibuka kelak, pakai sebagai daftar periksa desain. Tidak ada tambahan teks selalu-dimuat.
- Lisensi/hak cipta: Apache-2.0 (Copyright 2026 Anthropic, PBC) untuk telegram/discord/imessage/fakechat; plugin `external_plugins` lain tanpa LICENSE (hanya fakta konfigurasi).
- Perkiraan skala: M (bila diadopsi penuh) · Risiko: tinggi (otoritas baru) · Nilai: sedang · Butuh skema tool baru: tidak (bila hanya prinsip) · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: Terverifikasi lewat pembacaan; keputusan proposal "tak memilih otomatis" di Agent Core adalah inferensi dari `service.ts`.
- Disposisi: REFERENSI

### OFB-23 Paket konfigurasi LSP tambahan (hanya konfigurasi)
- Sumber: `.claude-plugin/marketplace.json` (12 entri `lspServers`): gopls (`.go`), rust-analyzer (`.rs`), clangd (`--background-index`; `.c .h .cpp .cc .cxx .hpp .hxx`), jdtls (`.java`, `startupTimeout` 120000), kotlin-lsp (`--stdio`; `.kt .kts`; 120000), lua-language-server (`.lua`), intelephense (`--stdio`; `.php`), ruby-lsp (`.rb .rake .gemspec .ru .erb`), sourcekit-lsp (`.swift`), csharp-ls, pyright-langserver, typescript-language-server; README tiap plugin `*-lsp` (cara pasang).
- Observasi: Plugin LSP hanya README + LICENSE; definisinya adalah data deklaratif di entri katalog.
- Nilai untuk Agent Core: Semantic IDE hanya membawa typescript/python/csharp/powershell. Bahasa lain dapat ditambah dengan konfigurasi saja.
- Baseline Agent Core: `src/config.ts:151-155` (berkas server default `runtime/semantic-ide/servers.json`), `src/semantic-ide/provider-registry.ts:627-650` (`validServerDefinition`), `:676-690` (gabungan; berkas memiliki prioritas ≥2000), adaptor generik `baseAdapter` (`:88-103`), `src/semantic-ide/types.ts:59` (`readinessTimeoutMs` setara `startupTimeout`). Status: SUDAH-ADA mekanisme; BELUM-ADA contoh/paket.
- Delta/celah: Contoh definisi siap salin dan caveat Windows. `src/semantic-ide/protocol.ts:125` memanggil `spawn(command, args)` langsung; `windowsShim` hanya dipakai untuk pyright (`provider-registry.ts:432-437, 492`) dan probe versi (`:757`). Server yang terpasang lewat npm sebagai `.cmd` (mis. intelephense) mungkin gagal di Node modern; gunakan biner `.exe` asli (gopls, rust-analyzer, clangd, lua-language-server) atau `node <entry.js>` (dugaan, belum diuji).
- Cara adaptasi: Berkas contoh `servers.json` + catatan di docs (bukan runtime), dijalankan pengguna bila perlu. Tidak ada kode.
- Lisensi/hak cipta: Konfigurasi katalog Anthropic (fakta); server masing-masing berlisensi sendiri.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah-sedang (bahasa yang dipakai pengguna belum diketahui) · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: Pemetaan terverifikasi; perilaku spawn `.cmd` di Node 24 adalah dugaan.
- Disposisi: ADAPT

### OFB-24 Referensi proses dan "tell" desain generik
- Sumber: `plugins/frontend-design/skills/frontend-design/SKILL.md:9-71`.
- Observasi: Proses dua tahap (rencana token ringkas: 4-6 warna bernama, peran huruf, tata letak, prinsip; lalu tinjau terhadap versi generik sebelum membangun), daftar lima kelompok "tell" desain buatan AI, daftar perlakuan tipografi yang dihindari, aturan penulisan antarmuka (CTA memakai kata kerja spesifik, nama aksi konsisten di seluruh alur, galat tidak meminta maaf dan jelas).
- Nilai untuk Agent Core: Pengguna mengerjakan desain/templat dengan standar tinggi (instruksi global). Tabel "Avoid the AI Aesthetic" sekarang tipis.
- Baseline Agent Core: `runtime/skills/capability-packs/frontend-ui-engineering/SKILL.md:142-160` (bukti referensi dan tabel hindari estetika AI), `replica-design/` (token, kontras). Status: SEBAGIAN.
- Delta/celah: Proses rencana-tinjau-bangun, daftar tell terkalibrasi, aturan salinan teks.
- Cara adaptasi: Berkas `references/design-plan-and-tells.md` pada frontend-ui-engineering (on-demand), ditulis ulang dengan kata sendiri; abaikan rujukan warna merek Anthropic.
- Lisensi/hak cipta: Apache-2.0 (`LICENSE` plugin + `LICENSE.txt` skill, tanpa lampiran); parafrase.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: Terverifikasi (dibaca penuh).
- Disposisi: ADAPT

### OFB-25 Laporan dampak kerja lokal dengan aturan kejujuran metrik
- Sumber: `plugins/receipts/skills/receipts/SKILL.md:54-263`, `scripts/mine-transcripts.mjs:188-212` (bobot relatif token, bukan dolar), `:273-296` (mesin internal agen dikecualikan), `:1190-1202` (`jsonForScript`), `README.md:47-50` (apa yang sengaja tidak dilaporkan), `assets/make-sample.mjs:1-30` (contoh README dirender dari korpus sintetis).
- Observasi: Aturan yang membuat laporan tahan bantahan: tanpa angka dolar atau "jam dihemat"; tanpa rincian biaya per aktivitas; atribusi proyek di tempat pekerjaan mendarat (akar git), bukan di tempat shell; kolom yang bukan jumlah (sesi, hari aktif, commit) diberi catatan kaki; "git gagal dibaca" ditampilkan "?" bukan nol; "commit membawa pekerjaan agen" = penulis pengguna DAN file yang diubah beririsan dengan yang disentuh agen, de-duplikasi SHA; hari aktif dihitung per tanggal kalender; nama proyek diperlakukan sebagai label inert.
- Nilai untuk Agent Core: Tidak ada laporan periodik "apa yang dikerjakan agen per proyek".
- Baseline Agent Core: `src/tracker/activity-tracker.ts` (log aktivitas terbatas), bukti perubahan working-tree per path (CC-P1), panel perubahan per task; grep tidak menemukan laporan periode. Status: BELUM-ADA.
- Delta/celah: Skrip ringkasan baca-saja.
- Cara adaptasi: `scripts/inspect/work-receipt.mjs` membaca log tracker (terbatas retensi) dan `git log` lokal (baca-saja), menulis markdown ke `runtime/tmp`; ikuti aturan kejujuran di atas.
- Lisensi/hak cipta: Apache-2.0; reimplementasi mandiri.
- Perkiraan skala: M · Risiko: rendah-sedang (retensi log membatasi periode) · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: Bagian skrip dibaca sebagian (±15% `mine-transcripts.mjs`); ketersediaan bidang tracker untuk atribusi proyek belum diverifikasi.
- Disposisi: ADAPT

### OFB-26 Analisis biaya sesi (dedup, jeda idle, prompt termahal)
- Sumber: `plugins/session-report/skills/session-report/analyze-sessions.mjs:1-30, 49` (satu respons dipecah beberapa entri sehingga dedup per `requestId` dengan `output_tokens` maksimum; dedup global per `uuid` untuk sesi yang dilanjutkan; jeda >5 menit tidak dihitung aktif; "cache break" bila input tak ter-cache >100 ribu), `SKILL.md:10-41` (3-5 temuan satu baris sebagai persen total).
- Observasi: Teknik kebersihan data untuk menghitung penggunaan token dari log.
- Nilai untuk Agent Core: Native Agent perlu hemat kuota; laporan giliran termahal dapat membantu.
- Baseline Agent Core: `src/agent-context-accounting.ts:7-30` (`ObservedContextUsage` input token per permintaan); apakah penggunaan per giliran dipersistensikan di chat store tidak diverifikasi. Status: tidak diketahui.
- Delta/celah: Tergantung ketersediaan data; semantik cache spesifik Anthropic.
- Cara adaptasi: Simpan sebagai referensi bila data penggunaan per giliran tersedia.
- Lisensi/hak cipta: Apache-2.0.
- Perkiraan skala: M · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: Header dan struktur dibaca; `template.html` tidak dibaca.
- Disposisi: REFERENSI

### OFB-27 Skill "playground" (HTML satu berkas dengan keluaran prompt)
- Sumber: `plugins/playground/skills/playground/SKILL.md:27-76`, templat `design-playground.md`, `diff-review.md`, `document-critique.md` (tiga dibaca sebagian; `code-map`, `concept-map`, `data-explorer` hanya ukuran).
- Observasi: Aturan inti: satu HTML mandiri, pratinjau langsung, keluaran prompt bahasa alami yang hanya menyebut nilai non-default, tombol salin, preset, tanpa dependensi eksternal. Templat ulasan diff/dokumen memakai komentar per baris yang menjadi prompt.
- Nilai untuk Agent Core: Alat bantu keputusan pengguna untuk desain/ulasan, murni konten on-demand.
- Baseline Agent Core: tidak ada padanan (artifact inspect untuk analisis, bukan pembuatan). Status: BELUM-ADA.
- Delta/celah: Skill opsional.
- Cara adaptasi: Skill on-demand di `capability-packs` dengan referensi templat; hasilkan berkas saja dan JANGAN membuka tab otomatis (pengguna tidak ingin sisa tab).
- Lisensi/hak cipta: Apache-2.0.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: Terverifikasi sebagian.
- Disposisi: ADAPT

### OFB-28 Refresh berbasis delta dengan blok state tertanam
- Sumber: `plugins/project-artifact/skills/project-artifact/SKILL.md:131-157`, katalog tab (`:186-199`).
- Observasi: Setiap render menanam blok JSON state (`as_of`, daftar alur kerja); refresh membaca render sebelumnya, memperbarui di tempat, dan hanya melaporkan perubahan; "tidak ada perubahan sejak <waktu>" adalah jawaban sah; tab kosong tidak pernah dikirim.
- Nilai untuk Agent Core: Pola untuk dokumen status hidup. Bergantung pada tool Artifact claude.ai, tidak portabel.
- Baseline Agent Core: `docs/CODEBASE.md` diperbarui manual dengan entri bertanggal. Status: BELUM-ADA padanan otomatis.
- Delta/celah: —
- Cara adaptasi: Tidak diusulkan.
- Lisensi/hak cipta: Apache-2.0.
- Perkiraan skala: M · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: Dibaca sekitar separuh; `swe.md` dan `template.html` tidak dibaca.
- Disposisi: REFERENSI

### OFB-29 Gerbang mekanis, sentinel akhir, dan resume dari berkas (math-proof)
- Sumber: `plugins/math-proof/skills/siege/scripts/ledger.py:1-45` (empat keputusan siklus ronde diserahkan ke skrip; selalu keluar 0 dan mencetak satu vonis; gagal-tertutup), `siege/SKILL.md:208-300` (baris akhir `=== END OF ANSWER <Q> ===` menandai jawaban selesai; berkas terpotong dipindah ke `.partial.md` dan tidak pernah dihapus; orkestrator tidak membaca jawaban; `state.md` adalah satu-satunya memori setelah kompaksi), `solo/SKILL.md` (tulis catatan sebelum bernalar lanjut; resume dengan membaca ulang; cek masalah sama lewat perbandingan byte).
- Observasi: Pola ketahanan untuk eksekusi panjang yang dapat terpotong.
- Nilai untuk Agent Core: Padanan: kompaksi konteks durable, checkpoint turn, episode task. Sentinel untuk mendeteksi keluaran terpotong mungkin berguna bila Native menulis artefak panjang.
- Baseline Agent Core: `src/agent-context-compaction.ts`, `src/agent-turn-checkpoint.ts`; penanganan alasan berhenti di `src/agent-provider.ts` (tidak dibaca). Status: SEBAGIAN.
- Delta/celah: Tidak ada yang terbukti kurang. Runtime multi-agen (puluhan hingga lebih dari seratus sub-agen) ditolak.
- Cara adaptasi: Referensi untuk Bagian D.
- Lisensi/hak cipta: Apache-2.0.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: Header `ledger.py` dan sebagian SKILL.md siege dibaca (±35%).
- Disposisi: REFERENSI

### OFB-30 Buku besar klaim sensitif-versi untuk Skill/dokumen
- Sumber: `mcp-server-dev/skills/build-mcp-server/references/versions.md:1-30` (tabel klaim | tempat dinyatakan | terakhir diverifikasi | cara verifikasi), `receipts/assets/make-sample.mjs:1-30` (sampel dari korpus sintetis), `.github/workflows/validate-plugins.yml:83-90` (invarian bertingkat: error vs peringatan).
- Observasi: Konvensi kecil agar fakta yang cepat basi (versi, host dukung fitur) mudah diaudit ulang.
- Nilai untuk Agent Core: Dokumen operasional (tunnel, Cloudflare) dan Skill yang merujuk fakta eksternal mudah basi.
- Baseline Agent Core: provenance `UPSTREAM.json`; ulasan klaim di Memory. Status: SEBAGIAN.
- Delta/celah: Konvensi `references/versions.md` pada Skill/dokumen dengan klaim eksternal.
- Cara adaptasi: Satu kalimat konvensi di panduan penulisan Skill (on-demand), bukan di AGENTS.md.
- Lisensi/hak cipta: Apache-2.0.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah-sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak
- Bukti vs dugaan: Terverifikasi.
- Disposisi: ADAPT

---

## Bagian C — Ditolak / tidak relevan

- `explanatory-output-style` dan `learning-output-style`: mekanisme hook SessionStart yang menyuntikkan teks selalu-dimuat tiap sesi (README sendiri memperingatkan biaya token); nilai negatif untuk anggaran selalu-dimuat dan bertentangan dengan jawaban ringkas yang diminta pengguna.
- `agent-sdk-dev`: perancah aplikasi SDK Anthropic yang bergantung pada pengambilan dokumen web dan versi paket terbaru; Native Agent memakai loop dan routing provider sendiri. Satu-satunya hal yang dapat dibawa: format laporan PASS / PASS WITH WARNINGS / FAIL dan daftar "yang tidak perlu dipermasalahkan" untuk membatasi cakupan verifier (nilai rendah).
- `cwc-makers`: onboarding perangkat keras ESP32/M5Stack. Pola pemantauan latar belakang + log + filter dan relai langkah fisik sudah tercakup alat proses Agent Core.
- Terowongan MCP Anthropic (`mcp-tunnels` sebagai mekanisme): memerlukan Docker, Console Anthropic, pratinjau riset, dan hanya untuk Managed Agents/Messages API; berat untuk mesin Windows lambat dan tidak melayani konektor Desktop/ChatGPT. Tunnel Cloudflare yang ada dipertahankan.
- Loop optimasi deskripsi berbasis model (`run_loop.py`, `improve_description.py`): iterasi otomatis dengan `claude -p` bersarang (model tersembunyi dan percobaan ulang buta) bertentangan dengan doktrin; tidak ada bukti baru untuk membuka kembali. Pemisahan train/holdout dan buta terhadap skor uji sudah tercermin di `skill-routing-eval.mjs`.
- Hook berbasis prompt (`hook-development`): evaluasi LLM pada PreToolUse/Stop berarti model kedua tersembunyi dan hook sebagai otoritas, sudah ditolak; tidak ada bukti baru.
- Runtime multi-agen `siege` (hakim/pekerja/ronde): ditolak; hanya pola ketahanan yang dicatat (OFB-29).
- `plugin-dev/skills/plugin-settings` (berkas `.claude/<plugin>.local.md`): rumah penyimpanan paralel, dilarang oleh kebijakan penyimpanan.
- Skrip hook bash (`hook-linter.sh`, `validate-hook-schema.sh`, `test-hook.sh`): bash/jq, tidak ada hook di Agent Core. Catatan: validator skema membaca kunci tingkat-atas sebagai nama peristiwa, padahal format `hooks.json` plugin memakai pembungkus `{ "hooks": ... }` sehingga akan menandai kunci pembungkus sebagai peristiwa tak dikenal (inkonsistensi internal plugin-dev).
- Widget MCP App dan paket MCPB: anggaran manifest dan UI Agent Core sendiri (WebView2); tidak relevan.
- Sampling MCP (server meminta inferensi dari host): model kedua tersembunyi.
- `imessage`: bergantung `chat.db` dan `osascript` macOS; tidak ada padanan Windows.
- Kanal Telegram/Discord sebagai fitur runtime: akan menambah otoritas masukan jarak jauh dan layanan awan; tidak diadopsi (pola disimpan di OFB-22).
- `external_plugins` MCP-config (asana, github, gitlab, linear, playwright, firebase, terraform, laravel-boost, context7, serena): Agent Core adalah server, bukan klien konektor tersebut; berguna hanya sebagai contoh konfigurasi. Sepuluh di antaranya tanpa LICENSE.
- Pemetaan `renames`/`displayName` marketplace: revisi Skill mensyaratkan nama sama (AC-ECO-P5) dan tidak ada pemasang eksternal yang bergantung pada slug; tidak diusulkan (lihat Bagian D).
- Deteksi `cache break` pada `session-report`: spesifik cache prompt Anthropic.

---

## Bagian D — Pola lintas-unit dan pertanyaan terbuka

### Pola yang layak menjadi standar di Agent Core

1. **Permukaan selalu-dimuat harus pendek, rincian di badan on-demand.** Muncul di agent-development (deskripsi pendek, contoh di badan), tool-design (3-5 ribu token tiap giliran untuk 30 tool), `versions.md`, dan perilaku `description` Skill. Terapkan pada deskripsi tool manifest dan teks routing (OFB-12, OFB-11).
2. **Keputusan mekanis oleh skrip deterministik, model hanya penasihat.** `ledger.py`, verdict cache, gerbang lulus/gagal. Agent Core sudah condong ke ini (evaluator advisory); jadikan konvensi untuk fitur advisory baru (OFB-13, OFB-14).
3. **Tidak diketahui bukan nol dan bukan gagal.** `gitUnavailable` pada receipts; galat infra bukan kegagalan kebijakan pada scan-plugins. Berlaku untuk keluaran status dan evaluasi.
4. **Teks tak tepercaya adalah data inert.** Nama proyek di receipts, `violations` model di revert-failed-bumps (dinetralkan), nama file lampiran di kanal (`safeName`), jalur gambar hanya di meta. Agent Core sudah punya `reportLabel`; pastikan konsisten pada semua sink.
5. **Percayai sumber, bukan pengaju; turunkan himpunan izin dari keadaan hidup.** `external-pr-scope.js`: relevan untuk revisi Skill (OFB-02).
6. **Ikat bukti pada konten dan kebijakan.** Kunci cache (nama@sha + objek sumber utuh + hash kebijakan). Agent Core sudah mengikat digest; tambahkan hash aturan untuk pemindaian (OFB-14).
7. **Resume idempoten dan deteksi keluaran terpotong.** Sentinel akhir, berkas parsial tidak pernah dihapus (OFB-29).
8. **HTML mandiri tanpa sumber daya eksternal dan penyisipan JSON yang aman.** `jsonForScript` pada receipts benar; `viewer.html` memakai CDN dan penyisipan tanpa escape (OFB-09). Contoh di dokumentasi dirender dari korpus sintetis.
9. **Dua pedoman resmi yang saling bertentangan tentang gaya deskripsi Skill.** plugin-dev: orang ketiga ("This skill should be used when…") dengan frasa pemicu, badan 1.000-3.000 kata; skill-creator: imperatif dan sengaja "agresif" agar tidak kurang-memicu. Agent Core memakai bagian Triggers/Non-triggers dan badan ≤8.192 B; jangan mengimpor ambang gaya mana pun tanpa keputusan pemilik.
10. **Buku besar klaim sensitif-versi** (OFB-30).
11. **Aturan kejujuran metrik** (receipts): tanpa biaya turunan yang tak terukur, kolom bukan-jumlah diberi catatan, definisi metrik tertulis (OFB-25).

### Pertanyaan terbuka

1. Apakah konektor Claude Desktop/Claude Code/ChatGPT yang dipakai pengguna mengiklankan kapabilitas `elicitation`? Perlu diperiksa dalam sesi nyata sebelum OFB-16.
2. Berapa batas ukuran hasil tiap tool Agent Core dibanding batas host (±150.000 karakter; ±25 ribu token Claude Code)? (OFB-20)
3. Apakah penggunaan token per giliran Native dipersistensikan (untuk OFB-26)?
4. Adakah pembatas laju di lapisan depan tunnel Cloudflare saat ini, dan adakah pemangkasan klien OAuth di tempat lain selain `store.ts`? (OFB-17)
5. Bahasa pemrograman apa yang dipakai pengguna selain C#, TypeScript, PowerShell, Python? Itu menentukan nilai OFB-23.
6. Perilaku `spawn` untuk `.cmd` pada Node 24 di mesin ini (dugaan OFB-23) belum diuji.
7. Apakah keputusan proposal/Skill menolak "setujui yang tertunda" tanpa id? (analog dengan pola access/pairing; OFB-22)
