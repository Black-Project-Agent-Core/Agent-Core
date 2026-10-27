# W8 — knowledge-work-plugins / partner-built (prefix KWP)

Tanggal studi: 2026-10-27. Mode: baca-saja. Irisan: `E:\Projects\Side-Project-Dont-Touch\knowledge-work-plugins\partner-built\` (semua file terlacak git: 765).
Pembanding Agent Core (hanya dibaca): `E:\Projects\Agent-Core` — `src/skills/*`, `src/code-intelligence/changed-source-security.ts`, `runtime/skills/capability-packs/*`, `AGENTS.md`, `docs/Capability-Index.md`, `scripts/verify/skill-routing-eval.mjs`.

## 0. Ringkasan

- Irisan ini berisi lima plugin pihak ketiga: `zoom-plugin` (702 file), `brand-voice` (23), `common-room` (21), `slack` (12), `apollo` (7). Seluruhnya Markdown dan JSON; tidak ada skrip, hook, binary, atau kode yang dapat dieksekusi (748 `.md`, 11 `.json`, 5 `LICENSE`, 1 `.example`). Tidak ditemukan pola rahasia (kunci/token) pada pemindaian regex atas seluruh irisan, dan pada berkas yang dibaca tidak ada instruksi tertanam yang mencoba mengarahkan pembaca di luar fungsi plugin.
- Isi domain (API Zoom, penjualan, merek) tidak bernilai untuk Agent Core. Yang bernilai adalah POLA: (1) cara 694 file referensi Zoom diatur supaya agen memuat selektif; (2) bagaimana pola itu berbenturan dengan batas SkillService/adapter plugin Agent Core hari ini; (3) pola kebijakan tulis-vs-baca pada konektor Slack/Apollo/Common Room.
- Temuan terkuat dan terverifikasi: adapter plugin Claude Agent Core menganggap tata letak gaya Zoom "aman" padahal 76% dokumennya tidak dapat dibaca lewat `skills(read)` (KWP-01); `triggers:` berbentuk daftar membuat 19 dari 30 skill Zoom berstatus unsupported (KWP-02); 25 dari 40 SKILL.md capability pack melebihi satu fragmen 8.192 byte, dan `AGENTS.md` 84 KB mengandung ±22,7 KB blok kondisional/historis (KWP-05, KWP-07).
- Jumlah temuan: ADOPT 0, ADAPT 10, REFERENSI 8, total 18 (KWP-01 s.d. KWP-18). Bagian C mencatat 13 butir yang ditolak.

### 0.1 Lisensi per plugin (diperiksa langsung pada berkas LICENSE tiap plugin; tidak ada berkas NOTICE atau ketentuan penggunaan terpisah di irisan ini)

| Plugin | Lisensi pada `LICENSE` plugin | Pemegang hak cipta pada berkas | Berbeda dari LICENSE root repo (Apache-2.0)? |
|---|---|---|---|
| zoom-plugin | MIT (`plugin.json` juga `"license": "MIT"`) | Zoom Video Communications, Inc. (2025) | Ya |
| brand-voice | MIT | Tribe AI (2025) | Ya |
| apollo | MIT (`plugin.json` `"license": "MIT"`) | Apollo.io (2025) | Ya |
| slack | MIT (`plugin.json` `"license": "MIT"`) | Slack Technologies, LLC (2020-) | Ya |
| common-room | Apache-2.0 | Berkas hanya berisi templat Apache standar dengan placeholder `[yyyy] [name of copyright owner]` yang belum diisi; pemilik hanya tersirat dari `plugin.json` (`author: Common Room`) | Tidak (sama) |

Catatan penggunaan (tegas):
1. Semua lisensi permisif; tidak ada klausul all-rights-reserved seperti pada `claude-code`. Menyalin teks tidak dilarang secara lisensi, tetapi MIT mewajibkan pemberitahuan hak cipta dan teks lisensi ikut pada salinan substansial, dan Apache-2.0 mewajibkan pemberitahuan atribusi/perubahan. Bila ada teks yang disalin ke `runtime/skills/capability-packs/`, tambahkan `LICENSE-<sumber>` dan catatan di `THIRD_PARTY_NOTICES.md` (mengikuti pola `LICENSE-Addy`/`LICENSE-Replica` yang sudah ada).
2. Rekomendasi default studi ini: ambil IDE/pola saja dan tulis ulang mandiri. Tidak ada temuan di bawah yang membutuhkan penyalinan teks.
3. Nama dagang (Zoom, Slack, Apollo, Common Room, Tribe AI) tidak dilisensikan oleh MIT/Apache; jangan memakainya sebagai nama capability Agent Core.
4. "Terikat layanan": semua skill konektor bekerja hanya lewat server MCP vendor (`mcp.apollo.io`, `mcp.slack.com`, `mcp.commonroom.io`, tiga endpoint `*.zoom.us`) dengan autentikasi dan ketentuan layanan vendor sendiri (Slack: persetujuan admin workspace, `slack/README.md` bagian Notes; Apollo: konsumsi kredit, `apollo/README.md` bagian Credits). Lisensi MIT pada berkas tidak memberi hak atas layanan itu. `zoom-plugin/CONTRIBUTING.md` (bagian Code of Conduct) mensyaratkan kontributor mengikuti ketentuan pengembang Zoom. Isi referensi Zoom diturunkan dari dokumentasi Zoom yang di-crawl (lihat `*/references/source-map.md`); Zoom sendiri yang melisensikannya MIT, jadi tidak ada konflik hak, tetapi isinya cepat basi (KWP-04, Bagian C).

---

## Bagian A — Ledger cakupan

### A.1 Metode jangkauan

- M1 (100% berkas): inventaris `git -c safe.directory=* -C ...\knowledge-work-plugins ls-files partner-built` (765 berkas; per-plugin: apollo 7, brand-voice 23, common-room 21, slack 12, zoom-plugin 702).
- M2 (100% dari 694 berkas `zoom-plugin/skills`): skrip shell baca-saja untuk ukuran byte/baris, histogram kunci frontmatter (57 SKILL.md), hash md5 (tidak ada duplikat byte-identik), hitung berkas ≤ 15 baris (87), > 8 KB (147), > 32 KB (13), kedalaman jalur.
- M3 (100% dari 694 berkas): analisis graf tautan Markdown dengan Python `-I` dari stdin (tanpa menulis berkas): 2.598 tautan internal, 5 putus (semua menunjuk ke luar akar `skills/`: 4× `../../CONNECTORS.md`, 1× `../../../.mcp.json`), 693 dari 694 berkas dapat dicapai dari `start/SKILL.md` dan 694/694 dari SKILL.md tingkat-atas mana pun.
- M4 (100% irisan): grep pola rahasia (hasil: 0), injeksi prompt/tidak tepercaya (3 berkas: semuanya di `team-chat`), perbandingan tanda tangan (`===`/`!==` vs `timingSafeEqual`), nama skill vs rujukan.
- M5 (penuh) dan M6 (skim = judul/awal berkas) dicatat per baris. Total: PENUH 136 berkas (17,8%), SKIM ±25 (3,3%), hanya skrip ±604 (78,9%). Berkas "hanya skrip" didominasi dokumen domain Zoom per platform (Windows/Linux/iOS/Android/Unity/Flutter/React Native) yang tidak dibaca isinya; kategori strukturnya divalidasi lewat M2–M4 dan sampel.

### A.2 Tabel ledger

Kolom disposisi: ADOPT / ADAPT / REFERENSI / TOLAK / SUDAH-ADA. Dua disposisi dalam satu sel berarti pola vs isi domain dinilai terpisah.

| Unit | File | Dibaca | Disposisi | Alasan satu baris | Temuan |
|---|---:|---|---|---|---|
| zoom `.claude-plugin/plugin.json`, `.mcp.json` | 2 | penuh | REFERENSI | Manifest minimal; token via `${ENV}` di header HTTP; tiga server terpisah per permukaan produk. | KWP-16, KWP-06 |
| zoom `AGENTS.md`, `README.md`, `CONNECTORS.md`, `CONTRIBUTING.md`, `CHANGELOG.md` | 5 | penuh | ADAPT (AGENTS.md) · REFERENSI | `AGENTS.md` 39 baris berfungsi sebagai penunjuk pintu depan; `CONTRIBUTING` memuat aturan tata letak yang dapat dijadikan lint. | KWP-07, KWP-06, KWP-14 |
| zoom `LICENSE` | 1 | penuh | REFERENSI | MIT © 2025 Zoom Video Communications, Inc. | §0.1 |
| zoom skills/`start` | 1 | penuh | ADAPT | Router 2.005 B/46 baris: tabel rute, satu rekomendasi, klarifikasi hanya bila ambigu. | KWP-05 |
| zoom skills/{`plan-zoom-product`, `plan-zoom-integration`, `choose-zoom-approach`, `design-mcp-workflow`} | 4 | penuh | ADAPT | Skill alur kerja 1,2–1,9 KB: satu keputusan, tabel rute, "Guardrails/Common Mistakes". | KWP-05, KWP-09 |
| zoom skills/{`debug-zoom`, `debug-zoom-integration`} | 2 | penuh | REFERENSI | Urutan triase: lapisan gagal, bukti minimum, 2–4 hipotesis berperingkat, rencana verifikasi. | KWP-10 |
| zoom skills/{`setup-zoom-oauth`, `setup-zoom-mcp`, `build-zoom-meeting-app`, `build-zoom-bot`} | 4 | penuh | REFERENSI | Pola "Workflow + Primary References + Common Mistakes" ≤ 40 baris; isinya domain. | KWP-05, KWP-09 |
| zoom skills/`general` (akar 2, references 17, use-cases 54) | 73 | penuh 10; skim 7; sisanya skrip | REFERENSI (pola) · TOLAK (isi) | Hub lintas produk dengan matriks "jangan rute ke", pseudo-router TypeScript, alur upgrade versi. | KWP-05, KWP-06, KWP-09, KWP-10, KWP-17; Bagian C |
| zoom skills/`meeting-sdk` akar + `references` (SKILL, RUNBOOK, 15 referensi) | 17 | penuh 3; sisanya skrip | REFERENSI | Hub dengan "Hard Routing Guardrail" di 1 KB pertama, intake triase, runbook. | KWP-05, KWP-09, KWP-10 |
| zoom skills/`meeting-sdk` android / ios / macos / unreal | 44 (11 masing-masing) | android penuh 2; sisanya skrip | REFERENSI | Kerangka platform seragam (SKILL ≈ 40 baris, "Start Here" 9 butir, runbook, peta referensi); model hub kecil. | KWP-05, KWP-11 |
| zoom skills/`meeting-sdk` electron, react-native | 32 (14 + 18) | electron penuh 2; sisanya skrip | REFERENSI | Berkas `deprecated-and-contradictions` dan `version-drift` memberi label bukti. | KWP-11 |
| zoom skills/`meeting-sdk` linux | 6 | skrip | TOLAK | SKILL 429 baris + `meeting-sdk-bot.md` 825 baris; domain bot Linux. | Bagian C |
| zoom skills/`meeting-sdk` web | 21 | skim 2; diff client/component view | TOLAK · REFERENSI (kontra-pola) | SKILL 1.127 baris/36 KB; client-view dan component-view masing-masing 620 baris; berkas `references/README.md` berupa stub. | KWP-05, KWP-06 |
| zoom skills/`meeting-sdk` windows | 24 | skrip | TOLAK | SKILL 1.193 baris/46,6 KB, contoh hingga 814 baris; domain C++ Windows. | Bagian C |
| zoom skills/`video-sdk` akar + `references` (SKILL, RUNBOOK, 9 referensi) | 11 | penuh 1; skim 1 | REFERENSI | `token-contract-test-spec.md` = spesifikasi uji kontrak token lintas platform; SKILL memuat Hard Routing Guardrail. | KWP-09, KWP-10 |
| zoom skills/`video-sdk` android, ios, macos, unity | 44 (11 masing-masing) | skrip | REFERENSI | Kerangka platform yang sama dengan meeting-sdk. | KWP-05 |
| zoom skills/`video-sdk` flutter, react-native | 28 (14 + 14) | skrip | REFERENSI | Kerangka platform yang sama. | KWP-05 |
| zoom skills/`video-sdk` linux, web, windows | 62 (21 + 18 + 23) | skrip | TOLAK | SKILL 443/821/1.019 baris; contoh `dotnet-winforms/README.md` 40 KB. | Bagian C |
| zoom skills/`rest-api` (akar 2, concepts 4, examples 5, references 41, troubleshooting 4) | 56 | penuh 1; skim 1; sisanya skrip | REFERENSI · TOLAK | RUNBOOK terstruktur baik; 41 referensi per area API (phone.md 47 KB) adalah data domain; contoh webhook memakai `===`. | KWP-04, KWP-08, KWP-10 |
| zoom skills/`team-chat` (akar 3, concepts 7, examples 13, references 10, troubleshooting 5) | 38 | penuh 3; skim 2; grep | REFERENSI · TOLAK | `concepts/security.md` ringkas dan benar; `examples/llm-integration.md` tanpa pertahanan injeksi prompt. | KWP-08; Bagian C |
| zoom skills/`cobrowse-sdk` (akar 3, concepts 4, examples 9, references 13, troubleshooting 4) | 33 | penuh 2 (stub); skrip | TOLAK · REFERENSI (kontra-pola) | SKILL 894 baris/34 KB; 9 contoh berupa stub 7 baris; tingkatan penyamaran PII ada di use-case `general`. | KWP-17; Bagian C |
| zoom skills/`contact-center` (akar 2, android 6, ios 6, web 6, concepts 1, references 4, scenarios 1, troubleshooting 1) | 27 | penuh 3; skim 2 | REFERENSI | `samples-validation.md` memuat urutan penyelesaian konflik sumber dan "contradictions and drift". | KWP-11 |
| zoom skills/`zoom-apps-sdk` (akar 2, concepts 4, examples 8, references 6, troubleshooting 4) | 24 | penuh 1; skrip | REFERENSI | `concepts/security.md` = daftar periksa keamanan Marketplace (header OWASP, PKCE, state, token sisi server). | KWP-12 (konteks) |
| zoom skills/`virtual-agent` (akar 2, android 5, ios 5, web 5, concepts 1, references 3, scenarios 1, troubleshooting 1) | 23 | penuh 1 | REFERENSI | SKILL 73 baris berpola Routing Guardrail + Quick Links + Chaining. | KWP-05 |
| zoom skills/`oauth` (akar 2, concepts 5, examples 7, references 4, troubleshooting 4) | 22 | penuh 2 (stub); skim judul SKILL | TOLAK · REFERENSI (kontra-pola) | Dua tabel cakupan masing-masing ±380 KB; SKILL 901 baris dengan H1 ganda dan indeks kedua; 11 berkas stub. | KWP-04, KWP-05, KWP-06 |
| zoom skills/`rtms` (akar 2, concepts 2, examples 4, references 6, troubleshooting 1) | 15 | penuh 1; skim 1 | REFERENSI | SKILL 580 baris; RUNBOOK memberi gerbang "pipeline hanya aktif setelah event start" dan probe status. | KWP-10 |
| zoom skills/`zoom-mcp` (akar 2, concepts 2, examples 4, references 2, troubleshooting 1, whiteboard 3) | 14 | penuh 7 | REFERENSI | Nama tool mentah otoritatif; `tools/list` hidup menang atas dokumen; hand-off MCP→REST untuk CRUD deterministik. | KWP-16, KWP-11 |
| zoom skills/`phone` (akar 2, concepts 1, examples 2, references 7, scenarios 1, troubleshooting 1) | 14 | penuh 7; skim 2 | REFERENSI | Pola referensi yang paling lengkap per produk: source-map, validasi sampel, deprecasi, env-vars, FAQ forum, runbook. | KWP-10, KWP-11, KWP-18 |
| zoom skills/`rivet-sdk` | 13 | penuh 1; skrip | REFERENSI | Kerangka sama; `source-map.md` mencatat berkas crawl yang diproses. | KWP-11 |
| zoom skills/`probe-sdk` | 13 | penuh 1; skrip | REFERENSI | Gerbang kesiapan pra-join dengan kebijakan allow/warn/block. | KWP-10 |
| zoom skills/`scribe` | 11 | penuh 3; skim 2 | REFERENSI | `versioning-and-drift.md` memuat "Review Trigger"; runbook menolak kredensial placeholder `${...}`. | KWP-11, KWP-18 |
| zoom skills/`webhooks` (akar 2, references 5, troubleshooting 1) | 8 | penuh 6 | TOLAK (kode) · REFERENSI (checklist) | Checklist verifikasi/idempotensi benar; kode contoh punya bug dan perbandingan tidak konstan-waktu. | KWP-08 |
| zoom skills/`websockets` | 6 | skim 1; skrip | REFERENSI | Tabel pilihan webhook vs websocket sebagai pola keputusan; isi domain. | KWP-05 |
| zoom skills/`ui-toolkit` | 4 | skrip | TOLAK | SKILL 555 baris; domain komponen UI Video SDK. | Bagian C |
| apollo manifest + `.mcp.json` | 2 | penuh | REFERENSI | Satu server HTTP; tanpa kredensial tertanam; OAuth via `/mcp`. | KWP-12 |
| apollo `LICENSE`, `README.md` | 2 | penuh | REFERENSI | MIT © 2025 Apollo.io; README menyatakan peringatan kredit sebelum pemanggilan. | §0.1, KWP-12 |
| apollo skills/{`enrich-lead`, `prospect`, `sequence-load`} | 3 | penuh | REFERENSI (pola) · TOLAK (domain) | Pola pratinjau + biaya + konfirmasi sebelum bulk; default aman. Domain: pengayaan data pribadi (`reveal_personal_emails: true`). | KWP-12; Bagian C |
| brand-voice manifest (`plugin.json`, `marketplace.json`) + `.mcp.json` | 3 | penuh | REFERENSI | Versi `plugin.json` 1.1.0 vs `marketplace.json` 1.0.0 (drift). 7 server MCP. | KWP-06 |
| brand-voice `LICENSE`, `README.md`, `settings/brand-voice.local.md.example` | 3 | penuh | REFERENSI | MIT © 2025 Tribe AI; pengaturan per proyek berbentuk Markdown berfrontmatter. | KWP-15 |
| brand-voice agents (5) | 5 | penuh | REFERENSI | Agen validator read-only (`tools: Read, Glob, Grep`, `maxTurns: 10`) dan skema keluaran Pass/Needs Revision/Fail; orkestrasi multi-agent ditolak. | KWP-15; Bagian C |
| brand-voice commands (3) | 3 | penuh | REFERENSI | Gerbang prasyarat "MANDATORY FIRST STEP" khusus Cowork; orientasi singkat + "nothing is saved until approved". | KWP-15 |
| brand-voice skills (3 SKILL.md) | 3 | penuh | REFERENSI | Urutan pemuatan pedoman (sesi, berkas lokal, tanya); open questions selalu dengan rekomendasi. | KWP-15 |
| brand-voice skills/*/references (6) | 6 | penuh 3; skim 3 | REFERENSI · TOLAK (rumus bobot) | Model suara-konstan/nada-fleksibel, skoring kepercayaan, peringkat sumber berbobot. | KWP-15; Bagian C |
| common-room manifest + `.mcp.json` | 2 | penuh | REFERENSI | Satu server MCP; CONNECTORS memakai placeholder `~~calendar`. | KWP-14 |
| common-room `LICENSE`, `README.md`, `CONNECTORS.md` | 3 | penuh | REFERENSI | Apache-2.0 tanpa pemilik terisi; mode standalone vs supercharged. | §0.1, KWP-14 |
| common-room commands (2) + references akar (2) | 4 | penuh | REFERENSI | Konteks `Me` (cakupan wilayah) dan konteks perusahaan "tanya sekali per sesi". | KWP-13 |
| common-room skills (6 SKILL.md) | 6 | penuh | REFERENSI (pola) · TOLAK (domain) | Pola keluaran jujur: tiap fakta ditelusuri ke tool, templat data-jarang, sumber sekunder hanya bila primer jarang. | KWP-13; Bagian C |
| common-room skills/*/references (6) | 6 | penuh | REFERENSI | Panduan sinyal/format; domain penjualan. | KWP-13 |
| slack manifest + `.mcp.json` | 2 | penuh | TOLAK (OAuth tertanam) · REFERENSI | Klien OAuth dan port callback tetap milik vendor (nilai tidak disalin). | Bagian C |
| slack `LICENSE`, `README.md`, `CLAUDE.md` | 3 | penuh | REFERENSI | MIT © Slack Technologies, LLC; `CLAUDE.md` plugin = daftar perintah/skill 17 baris. | §0.1 |
| slack commands (5) | 5 | penuh | ADAPT (pola draf) | `draft-announcement` menyiapkan DRAF di Slack; pengguna yang mengirim dari klien. Batas keluaran eksplisit (50/100 pesan, 5–10 diskusi). | KWP-12 |
| slack skills (2) | 2 | penuh | REFERENSI | Pencarian publik tanpa persetujuan vs privat dengan persetujuan; batas tool dinyatakan ("tidak bisa menambah reaksi"). | KWP-12 |

### A.3 Rekonsiliasi jumlah

| Plugin | Baris ledger (jumlah) | Total git ls-files |
|---|---:|---:|
| zoom-plugin | 2+5+1 (akar 8) + 1+4+2+4 (alur kerja 11) + 73 + 17+44+32+6+21+24 (meeting-sdk 144) + 11+44+28+62 (video-sdk 145) + 56+38+33+27+24+23+22+15+14+14+13+13+11+8+6+4 (sisa produk 321) = 8+11+73+144+145+321 = 702 | 702 |
| apollo | 2+2+3 | 7 |
| brand-voice | 3+3+5+3+3+6 | 23 |
| common-room | 2+3+4+6+6 | 21 |
| slack | 2+3+5+2 | 12 |
| **Total** | | **765** |

Cek sisa produk zoom: rest-api 56 + team-chat 38 + cobrowse 33 + contact-center 27 + zoom-apps 24 + virtual-agent 23 + oauth 22 + rtms 15 + zoom-mcp 14 + phone 14 + rivet 13 + probe 13 + scribe 11 + webhooks 8 + websockets 6 + ui-toolkit 4 = 321.

### A.4 Yang tidak sempat dibaca isinya

Sekitar 604 berkas hanya diperiksa lewat skrip: seluruh dokumen platform Windows, Linux, iOS, Android, macOS, Unity, Flutter, React Native, Electron, Unreal; mayoritas `rest-api/references` (41 berkas data API), `general/use-cases` (54, dibaca judul), `oauth/concepts` dan `oauth/references` (dua tabel cakupan ±380 KB), `rtms` contoh/konsep, `cobrowse` dan `ui-toolkit` seluruhnya. Alasan: isi domain Zoom, bukan target studi; pola strukturnya sudah tertangkap oleh graf tautan, histogram frontmatter, dan sampel.

---

## Bagian B — Temuan

### KWP-01 Dokumen tertaut di luar `references/` tidak dapat dibaca lewat `skills(read)`, tetapi pratinjau adapter menganggapnya aman
- Sumber: `zoom-plugin/skills/**` (694 berkas; 664 berkas selain 30 SKILL.md tingkat-atas; hanya 160 di `<skill>/references/`, 504 di `concepts/`, `examples/`, `troubleshooting/`, `scenarios/`, `use-cases/`, sub-skill platform `web/`, `windows/`, `ios/`, … dan berkas akar seperti `RUNBOOK.md`); `zoom-plugin/skills/meeting-sdk/SKILL.md:192-229` (tautan ke `android/SKILL.md`, `references/...`); `zoom-plugin/CONTRIBUTING.md:61-67` (aturan "max 3 directory levels", SKILL.md entrypoint). Agent Core: `src/skills/resource-path.ts:3-12`, `src/skills/service.ts:834-867` (`read`) dan `:428-440` (`summary`), `src/skills/claude-plugin.ts:186-209`, `runtime/skills/capability-packs/idea-refine/SKILL.md:111,124,183`.
- Observasi: Plugin gaya Zoom meletakkan pengetahuan di banyak folder bernama bebas dan menautkannya dari SKILL.md dengan tautan relatif. Di Agent Core, satu-satunya jalur baca bersanksi untuk isi Skill adalah `skills(read, resourcePath)` yang hanya menerima `SKILL.md` atau `references/<segmen>/...` (`resource-path.ts:9`). `findMissingReferences` menganggap tautan "ada" bila berkas ikut dalam pohon (`claude-plugin.ts:204`), termasuk code span `examples/…`, `scripts/…`, `assets/…` (`:196`), jadi pratinjau tidak melaporkan bahwa target tidak terbaca. `inspect` hanya mengembalikan `fileCount`/`totalBytes`, tanpa daftar berkas (`service.ts:428-440`).
- Nilai untuk Agent Core: Skill hasil adaptasi tampak "compatible/adaptable", tetapi agen tidak dapat membuka sebagian besar dokumen yang ditunjuk SKILL.md (di Zoom: 76%). Ini kegagalan diam pada progressive disclosure. Bukti dalam repo sendiri: pack `idea-refine` menyuruh membaca `frameworks.md`, `refinement-criteria.md`, `examples.md` "di direktori skill ini", padahal ketiganya di akar pack dan tidak valid sebagai `resourcePath`.
- Baseline Agent Core: aturan path dan pemeriksaan tautan seperti di atas → SEBAGIAN (adaptasi frontmatter dan pelaporan ada; pelaporan keterbacaan dan relokasi tidak ada).
- Delta/celah: (a) tidak ada kategori "tertaut tetapi tidak terbaca" di laporan; (b) tidak ada relokasi ke `references/` saat adaptasi; (c) satu pack aktif sudah terdampak.
- Cara adaptasi: Tahap 1 (S): di `claude-plugin.ts` tambahkan bidang laporan `unreadableLinks` (target yang ada di pohon tetapi gagal `normalizeSkillReadResource`) pada `ClaudePluginSkillComponent` dan `SkillAdaptationReport`. Tahap 2 (M): pada skill berstatus adaptable, relokasi berkas non-`references/` ke `references/<folder-asal>/…`, tulis ulang tautan relatif di SKILL.md dan antarreferensi, catat di `changes` (aksi baru `moved-to-references`), simpan SKILL.md asli seperti `ORIGINAL_PATH`, dan wajib lolos uji round-trip seperti `adaptFrontmatter`. Hindari memperluas root baca (akan memaksa mengubah deskripsi tool `src/mcp/skills-tools.ts:41` dan menyentuh anggaran manifest). `idea-refine`: perbaiki lewat proposal revisi Skill, bukan edit langsung. Uji dengan fixture sintetis mini (bukan salinan Zoom).
- Lisensi/hak cipta: ide struktur; tidak ada teks disalin. Zoom: MIT.
- Perkiraan skala: M (tahap 1 saja = S) · Risiko: sedang (penulisan ulang tautan mengubah byte dan digest; harus deterministik) · Nilai: tinggi · Butuh skema tool baru: tidak (hanya bidang hasil; konfirmasi bahwa hasil pratinjau tidak divalidasi skema keluaran) · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: aturan path (baca kode), hitungan 160/664 (skrip), kasus `idea-refine` (Read + grep). Dugaan: tidak ada jalur sah lain untuk agen membaca berkas katalog (PROJECT-STRUCTURE menyebut katalog hanya dikelola SkillService; tool berkas mungkin tetap dapat membaca `capability-packs/` secara langsung). Tidak diketahui: apakah controller eksternal pernah gagal pada `idea-refine` dalam praktik.
- Disposisi: ADAPT

### KWP-02 Frontmatter `triggers:` berbentuk daftar membuat skill Zoom berstatus unsupported
- Sumber: histogram frontmatter 57 SKILL.md Zoom: `name` 57, `description` 57, `triggers` 46, `user-invocable` 42, `argument-hint` 4; contoh `zoom-plugin/skills/rtms/SKILL.md:5-21` (16 frasa), `general/SKILL.md:5-16`, `webhooks/SKILL.md:4-9`. Agent Core: `src/skills/claude-plugin.ts:90` (STRICT_KEYS), `:218-224` (fungsi `text` menolak kind `list`/`map`), `:260-264` (kunci non-strict dipindah ke `metadata.claude-*` lewat `text(key)`), `src/skills/discovery.ts:87-134`.
- Observasi: Zoom memakai `triggers:` sebagai kosakata pemicu per skill (daftar frasa), `user-invocable: false` untuk menandai skill referensi pasif. 19 dari 30 skill tingkat-atas dan 27 SKILL.md bersarang memakai `triggers` berbentuk daftar YAML.
- Nilai untuk Agent Core: pola ini lazim pada skill pihak ketiga. Adapter akan melempar `SKILL_PLUGIN_KEY_UNMAPPABLE: triggers`, sehingga 19/30 skill Zoom berstatus unsupported walau sisanya valid. `describeSkill` hanya membaca bagian `## Triggers` di badan (maks 8 butir × 240 karakter; `discovery.ts:115-118`), jadi kosakata pemicu dari frontmatter tidak ikut mesin pencari.
- Baseline Agent Core: kunci skalar non-strict (`user-invocable`, `argument-hint`) sudah dipetakan ke `metadata.claude-*`; kunci berbentuk daftar tidak → BELUM-ADA (untuk daftar), SUDAH-ADA (untuk skalar).
- Delta/celah: pemetaan kunci daftar non-strict.
- Cara adaptasi: di `adaptFrontmatter`, perlakukan kunci daftar non-strict sebagai `metadata.claude-<kunci>` bernilai string tergabung (` | `, dibatasi sesuai batas discovery) dan catat `changes` aksi `list-joined`. Opsional: sertakan `metadata['claude-triggers']` dalam `positiveSkillDescriptor` agar BM25/semantik memakainya. Jangan menyisipkan `## Triggers` ke badan secara otomatis (mengubah isi; `applicability` tetap `missing` sampai revisi disetujui pengguna). Tambah uji unit dengan frontmatter sintetis.
- Lisensi/hak cipta: tidak ada teks disalin.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: histogram dan jalur kode. Dugaan: bentuk `triggers:` juga umum di plugin lain (hanya terlihat pada irisan ini).
- Disposisi: ADAPT

### KWP-03 Tautan antar-skill bersaudara dan tautan keluar akar dilaporkan sebagai "missing reference" dan menjenuhkan batas 64
- Sumber: 213 tautan `../` pada 30 SKILL.md tingkat-atas Zoom (terbanyak: `general` 67, `start` 14, `choose-zoom-approach` 12, `rest-api` 10; 1.171 tautan Markdown total di berkas yang sama); 5 tautan putus semuanya ke luar akar `skills/` (`debug-zoom/SKILL.md`, `plan-zoom-integration/SKILL.md`, `plan-zoom-product/SKILL.md`, `setup-zoom-mcp/SKILL.md` → `../../CONNECTORS.md`; `zoom-mcp/concepts/oauth-setup.md` → `../../../.mcp.json`). Agent Core: `src/skills/claude-plugin.ts:186-209` (`:204` memperlakukan `../` sebagai missing; `:88` batas 64).
- Observasi: skill Zoom membentuk graf skill bersaudara; tautan `../x/SKILL.md` adalah tali routing yang sah di dalam plugin, bukan referensi yang hilang.
- Nilai untuk Agent Core: pratinjau satu skill `general` saja menghasilkan ≥ 64 "missing" sehingga tautan yang benar-benar putus tertutup dan laporan kehilangan makna.
- Baseline Agent Core: SEBAGIAN (ada deteksi, tanpa klasifikasi).
- Delta/celah: klasifikasi dua kelas baru: `sibling-skill` (target direktori saudara dengan SKILL.md di plugin yang sama; petakan ke `mappedName`) dan `outside-skill-root`.
- Cara adaptasi: `claude-plugin.ts` + `analyzeClaudePlugin` (`service.ts` sekitar :884-920) yang sudah mengetahui seluruh skill dalam satu plugin; hanya pelaporan, tanpa menulis ulang badan. Saran di laporan: rujuk skill lain dengan nama (`skills(read, name)`), bukan jalur relatif.
- Lisensi/hak cipta: tidak ada.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah-sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: hitung tautan (grep/graf) dan kode. Dugaan: dampak pada plugin lain di studi ini sama.
- Disposisi: ADAPT

### KWP-04 Referensi massal (tabel data) tidak cocok dibaca per fragmen; pola "peta + snapshot crawl" menghindari menyalin dokumen besar
- Sumber: `zoom-plugin/skills/oauth/references/classic-scopes.md` (377.277 B, 6.270 baris) dan `granular-scopes.md` (380.745 B, 3.457 baris); `rest-api/references/phone.md` (47.713 B); distribusi ukuran: 13 berkas > 32 KB, 147 > 8 KB, 547 ≤ 8 KB dari 694; `meeting-sdk/android/references/android-reference-map.md` (peta sumber, "Crawl Coverage Snapshot": 70 halaman dokumen dan 1.003 halaman API tidak disalin, plus "Drift Signals to Watch"); `*/references/source-map.md` (daftar halaman crawl → dokumen skill). Agent Core: `src/skills/service.ts:22-24` (MAX_FILES 256, MAX_FILE_BYTES 2 MB, MAX_TOTAL_BYTES 16 MB), `:838` (maxBytes 512–32.768).
- Observasi: dua pendekatan berdampingan: menyalin tabel data mentah ke dalam skill (oauth) versus menyimpan peta + hitungan cakupan + tautan sumber (platform SDK).
- Nilai untuk Agent Core: satu tabel 380 KB butuh ≥ 12 panggilan berurutan pada batas maksimum 32 KB (≈ 47 pada 8.192) tanpa pencarian dalam-referensi; tidak cocok sebagai muatan instruksi.
- Baseline Agent Core: batas keras ada (2 MB per berkas) tetapi tidak ada peringatan ukuran per referensi → SEBAGIAN.
- Delta/celah: pratinjau adaptasi dan lint (KWP-06) tidak menandai referensi "massal".
- Cara adaptasi: tandai `bulkReferences` untuk berkas referensi > 32 KB pada pratinjau; saran: jangan dipasang, pecah per prefiks + indeks kecil, atau simpan peta + tautan sumber (pola Zoom). Untuk dokumentasi besar yang diadaptasi, tulis `references/source-map.md` berisi halaman yang diproses dan hitungan, bukan salinan.
- Lisensi/hak cipta: MIT; tidak ada salinan.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: ukuran berkas (skrip) dan batas kode. Dugaan: ambang 32 KB dipilih dari batas baca; belum diuji terhadap pack nyata.
- Disposisi: ADAPT

### KWP-05 Arsitektur routing berlapis dan navigasi di fragmen pertama (standar penulisan hub); jalur tumbuh indeks capability
- Sumber: `zoom-plugin/skills/start/SKILL.md:1-46` (router 2.005 B: tabel rute, "one clear recommendation", klarifikasi hanya bila ambigu); skill alur kerja 1,2–1,9 KB (`plan-zoom-product`, `choose-zoom-approach`, `build-zoom-bot`, …); hub kecil per platform (`meeting-sdk/android/SKILL.md:1-46`, 1.849 B, daftar "Start Here" 9 butir berurutan + RUNBOOK); hub produk dengan "Quick Links" di byte ±1–2 KB (`rtms/SKILL.md:52-76`, `team-chat`, `zoom-apps-sdk`, `cobrowse-sdk`, `ui-toolkit`) dan "Hard Routing Guardrail (Read First)" (`meeting-sdk/SKILL.md:30-34`, `video-sdk/SKILL.md:27-31`); `README.md:39-48` (skill pemandu "internal routing"), `user-invocable: false` pada 42 skill referensi, tautan balik "Prefer X first" pada tiap skill referensi (mis. `webhooks/SKILL.md:14`). Kontra-pola: 13 SKILL.md > 500 baris (maks 1.193 baris/46.629 B di `meeting-sdk/windows/SKILL.md`), `oauth/SKILL.md` berisi dua H1 identik (baris 23 dan 27) dan indeks kedua mulai baris 626 (byte ≈ 21.918 dari 33.877, ≈ 65%; ringkasan "By Use Case" baris 700), `rtms/SKILL.md:24-28` H1 ganda. Agent Core: `runtime/skills/capability-packs/agent-core-capability-index/SKILL.md` (6.896 B), `docs/Capability-Index.md:7-13,21-23`.
- Observasi: Zoom membangun empat lapis: router → alur kerja (satu keputusan, ≤ 40 baris) → skill referensi pasif (hub) → daun (concepts/examples/troubleshooting). Dua mekanisme yang menjaga pemuatan selektif: (1) rute dan "jangan rute ke" berada dalam ±1–2 KB pertama; (2) tiap hub menawarkan dua jalur masuk: urutan belajar ("New to X? ikuti ini") dan gejala ("Having issues? gejala → dokumen").
- Nilai untuk Agent Core: SkillService membaca per fragmen 8.192 B; navigasi yang jatuh setelah fragmen pertama memaksa pembacaan berulang atau diabaikan. Pengukuran pada catalog Agent Core: dari 40 pack, 25 `SKILL.md` > 8.192 B (terbesar `constraint-driven-development` 22.915 B, `code-review-and-quality` 22.894 B); bagian referensinya pada `constraint-driven-development` baru muncul pada byte 22.412 dan pada `code-review-and-quality` pada byte 19.352. Indeks capability 6.896 B hanya menyisakan 1.296 B sebelum meluap satu fragmen; bagian Replica 957 B, Engineering 2.360 B, Evidence 1.543 B (pengukuran awk read-only).
- Baseline Agent Core: indeks datar 39 baris di satu fragmen; upgrade manual per skill sudah menurunkan entrypoint ke 7.650 B (`performance-oriented-software-engineering`) dan 7.689 B (`mind-control`) → SEBAGIAN (praktiknya ada pada skill yang di-upgrade; belum ada standar tertulis, pengukuran katalog, maupun jalur tumbuh indeks).
- Delta/celah: (1) standar penulisan hub: peta referensi ≤ 2 KB pertama, SKILL.md ≤ 8.192 B, tautan balik, dua jalur masuk (urutan dan gejala); (2) bila indeks akan melebihi 8.192 B, sub-indeks per kategori (kandidat paling murah: Replica, 957 B, "app reconstruction only") — kondisional, tidak perlu sekarang; (3) konsep skill referensi pasif (dipilih lewat router, bukan lewat pencocokan langsung).
- Cara adaptasi: docs saja (`docs/PROJECT-STRUCTURE.md` atau README di `runtime/skills/capability-packs/`); urutan konversi pack ditentukan lewat lint KWP-06 dan data penggunaan Tracker; setiap konversi lewat proposal Skill seperti upgrade `mind-control`. Tidak ada perubahan kode.
- Lisensi/hak cipta: pola; tidak ada salinan.
- Perkiraan skala: S untuk standar tertulis; M per pack yang dikonversi · Risiko: rendah (docs) · Nilai: sedang-tinggi · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: ukuran dan posisi byte (skrip), isi skill Zoom. Dugaan: bahwa memangkas semua 25 pack akan meningkatkan hasil; manfaat kualitas belum diukur (docs sendiri mengatakan manfaat belum diukur).
- Disposisi: ADAPT

### KWP-06 Lint struktur Skill baca-saja (graf tautan, nama, ukuran, stub, rujukan nama)
- Sumber: `zoom-plugin/CONTRIBUTING.md:61-96` (aturan: SKILL.md < 500 baris, ≤ 3 tingkat folder, tautan nyata dan relatif, setiap md tertaut dari berkas induk, frontmatter akurat, rujuk `.env` bukan nilai); hasil graf: 2.598 tautan, 5 putus, 694/694 dapat dicapai (invarian terjaga walaupun alat pemeriksanya tidak dikirim di repo). Bukti pembusukan yang tidak tertangkap: 14 dari 30 skill tingkat-atas punya `name` ≠ nama folder (mis. folder `oauth` bernama `zoom-oauth`; `rest-api` bernama `build-zoom-rest-api-app`) dan 11 SKILL.md bersarang bernama dengan garis miring (`video-sdk/windows`, `contact-center/web`); 133 penyebutan `zoom-rest-api` dan 75 penyebutan `zoom-meeting-sdk` dalam teks, padahal tidak ada skill bernama demikian (rujukan menurut nama usang setelah penamaan ulang); 87 berkas ≤ 15 baris (stub penunjuk); 13 SKILL.md > 500 baris; 239 berkas (236 dengan 4 segmen jalur, 3 dengan 5) melampaui aturan "max 3 directory levels" (`skill/references/file.md`) milik mereka sendiri; `CHANGELOG.md:11` menyatakan server Whiteboard MCP dihapus tetapi `.mcp.json` dan `CONNECTORS.md:14` masih memuatnya; `brand-voice` versi `plugin.json` 1.1.0 vs `marketplace.json` 1.0.0.
- Observasi: invarian tata letak bisa dijaga murah dengan pemeriksa deterministik; tanpa pemeriksa, penamaan dan stub membusuk meski graf tautan rapi.
- Nilai untuk Agent Core: katalog 40 pack sudah melampaui batas fragmen pada 25 pack dan memuat kasus rujukan tak terbaca (KWP-01) serta 1 referensi yatim (`mind-control/references/core_capabilities.md` tidak disebut di SKILL.md); semuanya ditemukan lewat pengukuran manual sekali pakai.
- Baseline Agent Core: `scripts/verify/skill-routing-eval.mjs` dan `skill-effectiveness-eval.mjs` mengukur pemicuan/efek, bukan struktur; `findMissingReferences` hanya berjalan pada pratinjau impor; `SkillService.validate` memeriksa frontmatter dan batas berkas. Tidak ditemukan lint struktur seluruh katalog di `scripts/` → BELUM-ADA (pencarian terbatas pada isi `scripts/verify` dan grep `8192`).
- Delta/celah: pemeriksa katalog.
- Cara adaptasi: `scripts/verify/skill-structure-lint.mjs` (Node tanpa dependensi, tanpa menulis berkas; keluaran ringkas ke konsol sesuai preferensi pengguna: tidak ada sisa berkas sementara). Pemeriksaan: nama = folder; byte SKILL.md vs 8.192; peta referensi dalam fragmen pertama; tautan relatif selaras `findMissingReferences` dan `resourcePath` valid; referensi yatim; stub ≤ 15 baris; H1 ganda; nama skill yang disebut di tabel rute ada di katalog; bagian `## Triggers`/`## Non-triggers` ada; (untuk plugin yang diimpor) konsistensi versi antar manifest. Jalankan manual atau sebagai langkah verifikasi sebelum promosi Skill.
- Lisensi/hak cipta: aturan umum; ditulis mandiri.
- Perkiraan skala: S-M · Risiko: rendah · Nilai: sedang-tinggi · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: semua angka Zoom dan pengukuran pack (skrip). Dugaan: tidak ada lint serupa di tempat lain di repo; belum melakukan grep penuh repo untuk "orphan".
- Disposisi: ADAPT

### KWP-07 AGENTS.md sebagai penunjuk, bukan tempat prosedur kondisional (ukuran terukur)
- Sumber: `zoom-plugin/AGENTS.md:1-39` (39 baris ≈ 1,6 KB: apa isinya, delapan skill pintu depan, bentuk repo, "workflow skills are the front door; product folders are supporting references"). Agent Core: `AGENTS.md` (84.043 B) — ukuran bagian diukur dengan awk baca-saja per judul `#`/`##`: Code Intelligence protocol 8.252 B; Release intent / version integrity 6.058 B; Storage ownership 5.908 B; Mandatory capability routing 5.010 B; Historical product direction context 4.801 B; Capability awareness and usage disclosure 4.385 B; Verification rule 4.333 B; Self-learning / Hermes-adapted learning 3.918 B; "Historical Hermes A2A partner protocol — RETIRED, NOT CURRENT INSTRUCTIONS" 3.610 B; Failure-learning / Reflexion 2.892 B.
- Observasi: Zoom memisahkan "peta + pintu depan" (kecil, selalu dibaca) dari pengetahuan (skill sesuai kebutuhan). Agent Core menyimpan sebagian prosedur kondisional dan riwayat dalam teks selalu-dimuat.
- Nilai untuk Agent Core: anggaran teks selalu-dimuat dan kapsul bootstrap yang terpotong adalah masalah yang dinyatakan. Empat blok — Code Intelligence 8.252 + Release intent 6.058 + Historical product direction 4.801 + Hermes RETIRED 3.610 = 22.721 B (27,0% dari 84.043 B) — bersifat kondisional (hanya saat analisis graf atau rilis) atau berlabel historis/pensiun.
- Baseline Agent Core: `AGENTS.md:62` menetapkan contoh upstream subordinat pada cakupan pengguna; indeks capability sudah berfungsi sebagai penunjuk untuk Skill; tetapi AGENTS.md sendiri tidak berbentuk penunjuk → SEBAGIAN.
- Delta/celah: pemindahan konten, bukan penambahan.
- Cara adaptasi (usulan, memerlukan keputusan pengguna): (a) arsipkan blok berlabel RETIRED/Historical ke `docs/history-agent-core/` dan sisakan satu baris tautan; (b) jadikan prosedur tugas-spesifik (Code Intelligence, Release intent) Skill operasional on-demand dengan `## Triggers`/`## Non-triggers`, plus satu baris penunjuk di AGENTS.md; (c) pertahankan hanya invarian izin/keselamatan di AGENTS.md. Perubahan AGENTS.md membatalkan receipt handshake (sesuai kontrak: "Contract edits ... require a new handshake") dan harus diumumkan; ukur ulang dengan skrip yang sama sebelum dan sesudah; uji bahwa penunjuk masih sampai ke kapsul. Mitigasi risiko kegagalan diam (agen tidak memuat Skill): `skill-routing-eval` pada Skill baru.
- Lisensi/hak cipta: pola struktural; tidak ada salinan.
- Perkiraan skala: L · Risiko: sedang-tinggi (kontrak ditegakkan runtime; pemindahan aturan keselamatan harus ditinjau pemilik) · Nilai: tinggi · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak (mengurangi sekitar 22 KB bila blok (a)+(b) dipindah).
- Bukti vs dugaan: Terverifikasi: ukuran bagian (awk) dan bentuk AGENTS.md Zoom. Tidak dibaca penuh: isi keempat blok; apakah ada invarian keselamatan di dalam Code Intelligence/Release harus ditentukan pemilik. Dugaan: manfaat konteks sebanding dengan byte; kepatuhan setelah dipindah belum diukur. Kemungkinan tumpang tindih dengan temuan irisan lain tentang memori/CLAUDE.md; Main perlu deduplikasi.
- Disposisi: ADAPT (bersyarat pada keputusan pengguna)

### KWP-08 Aturan pemindai keamanan: perbandingan tanda tangan/HMAC/token tidak konstan-waktu
- Sumber: contoh verifikasi webhook Zoom — `zoom-plugin/skills/webhooks/SKILL.md:35-53` (kode contoh juga mendeklarasikan `const payload` dua kali dalam satu fungsi, baris 40 dan 49, sehingga tidak akan berjalan; perbandingan `signature !== \`v0=${hash}\`` baris 44), `webhooks/references/verification.md:64-82`, `webhooks/references/subscriptions.md:163`, `rest-api/examples/webhook-server.md:145,317`, `general/use-cases/meeting-details-with-events.md:177,445`, `general/use-cases/retrieve-meeting-and-subscribe-events.md:159`, `team-chat/concepts/webhooks.md:116`, `team-chat/examples/chatbot-setup.md:114`, `team-chat/references/samples.md:391`; hanya `rtms/examples/rtms-bot.md:260` dan `scribe/examples/batch-webhook-pipeline.md:63` memakai `timingSafeEqual` (yang kedua tanpa pemeriksaan panjang sehingga melempar bila panjang berbeda); hanya `general/references/distributed-meeting-fallback-architecture.md:137` menegakkan jendela replay 300 detik dalam kode, padahal `webhooks/RUNBOOK.md` bagian 2 mewajibkannya dalam teks. Agent Core: `src/code-intelligence/changed-source-security.ts:44-52` (7 aturan built-in), `:39,:119` (aturan proyek maks 32 per panggilan); kode Agent Core sendiri memakai pola benar (`src/auth/key-store.ts:109,136`, `src/http/app.ts:61`, `src/oauth/store.ts:95`).
- Observasi: panduan keamanan Zoom benar dalam prosa tetapi kode contohnya sering tidak mengikuti prosa. Hitungan grep: 23 berkas menyebut `x-zm-signature`; 11 baris perbandingan polos (`signature ===`/`!==`) di 9 berkas; hanya 2 baris `timingSafeEqual`; hanya 1 penegakan jendela timestamp dalam kode.
- Nilai untuk Agent Core: pola ini kelas kerentanan umum (CWE-208) yang sangat sering muncul pada kode yang ditulis agen dari contoh dokumentasi; pemindai changed_source (CC-P2) dapat menandainya secara deterministik.
- Baseline Agent Core: built-in = eval/`new Function`, shell exec, TLS dimatikan, pickle, `dangerouslySetInnerHTML`, chmod 777, literal rahasia. Tidak ada aturan perbandingan konstan-waktu; pengguna dapat memasoknya sebagai aturan proyek → SEBAGIAN.
- Delta/celah: satu aturan built-in advisory.
- Cara adaptasi: tambah entri `AC.SECURITY.CRYPTO.COMPARE` (severity medium, advisory) pada `BUILTIN_RULES` dengan regex satu-baris yang mengaitkan identifier berisi `signature|hmac|digest|mac` dengan `===`/`!==`; pesan menyarankan `crypto.timingSafeEqual` setelah cek panjang. Hindari pola yang ditolak oleh pengaman ReDoS di `compileProjectRule` (`:74-80`). Tambah uji dengan potongan sintetis. Tidak mendeteksi replay window (tidak layak dengan regex).
- Lisensi/hak cipta: aturan umum; tidak ada salinan kode Zoom.
- Perkiraan skala: S · Risiko: rendah (positif palsu mungkin; pemindai bersifat advisory) · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: lokasi contoh (grep), daftar aturan built-in (Read). Dugaan: tingkat positif palsu; belum diuji pada kode Agent Core.
- Disposisi: ADAPT

### KWP-09 Matriks "jangan rute ke" sebagai korpus negatif keras untuk eval routing
- Sumber: `zoom-plugin/skills/general/SKILL.md:121-135` ("SDK vs REST Routing Matrix (Hard Stop)": niat pengguna | jalur benar | JANGAN rute ke), `:137-151` (API vs MCP), `meeting-sdk/SKILL.md:30-34` dan `video-sdk/SKILL.md:27-31` (Routing Guardrail), `phone/SKILL.md:27-32`, `meeting-sdk/RUNBOOK.md:63-72` ("Wrong-Path Detector"), `choose-zoom-approach/SKILL.md:25-30` (guardrails). Agent Core: `agent-core-capability-index/SKILL.md` (kolom "Do not use for" hanya pada 3 baris di bagian Evidence and specialized engineering), `scripts/verify/skill-routing-eval.mjs:71-90` (fixture butuh ≥ 2 positif dan ≥ 2 negatif; metrik presisi/recall/false-trigger).
- Observasi: Zoom menyatakan pasangan yang sering tertukar secara eksplisit (Meeting SDK vs Video SDK vs REST `join_url`; REST vs MCP) dan menempatkannya di awal hub.
- Nilai untuk Agent Core: capability engineering yang mirip (test-driven-development vs debugging-and-error-recovery; code-review-and-quality vs code-simplification; planning-and-task-breakdown vs spec-driven-development vs incremental-implementation; idea-refine vs interview-me) hanya dibedakan lewat satu kolom "Purpose".
- Baseline Agent Core: alat ukur (eval routing dengan negatif) sudah ada; korpus negatif keras dan pasangan membingungkan belum terdokumentasi → SEBAGIAN.
- Delta/celah: fixture near-miss per pasangan.
- Cara adaptasi: tambahkan fixture (di `tests/` atau `docs/`) berisi kueri near-miss per pasangan; jalankan eval hanya bila controller menghasilkan observasi nyata. Hanya bila eval menunjukkan salah rute, pertimbangkan satu klausa "bukan untuk" pada deskripsi skill yang bersangkutan (bukan menambah indeks).
- Lisensi/hak cipta: pola; tidak ada salinan.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak (kecuali klausa opsional di atas).
- Bukti vs dugaan: Terverifikasi: struktur tabel Zoom dan kemampuan eval. Dugaan: salah rute antar pasangan itu nyata di Agent Core — belum diukur.
- Disposisi: ADAPT

### KWP-10 Templat runbook 5 menit, intake "tanyakan dulu", FAQ forum, dan alur upgrade per jalur versi
- Sumber: 42 `RUNBOOK.md` Zoom dengan kerangka sama (konfirmasi mode/permukaan; kredensial; kebersihan payload; prasyarat lingkungan; routing/base path; probe cepat + perintah salin-tempel; pohon keputusan cepat; detektor jalur salah) — `meeting-sdk/RUNBOOK.md:1-72`, `webhooks/RUNBOOK.md`, `rest-api/RUNBOOK.md`, `rtms/RUNBOOK.md:1-83`, `phone/RUNBOOK.md`, `zoom-mcp/RUNBOOK.md`; `meeting-sdk/references/triage-intake.md:1-52` (apa yang ditanya dulu: platform/versi, view, join vs start, input, gejala, repro+log); `phone/references/forum-top-questions.md` ("Fast Routing Questions (Ask First)" + pola jawaban per keluhan); `debug-zoom/SKILL.md:19-33`; `general/references/sdk-upgrade-workflow.md:1-145` (ledger rilis per jalur produk/platform, hop upgrade, validasi per hop, templat keluaran, aturan "jangan hanya baca rilis terbaru"); `probe-sdk` dan `general/use-cases/probe-sdk-preflight-readiness-gate.md` (kebijakan allow/warn/block sebelum aksi).
- Observasi: konsistensi kerangka membuat triase dapat diprediksi; "bukti minimum yang diminta" mencegah tebakan.
- Nilai untuk Agent Core: bentuk, bukan isi, relevan bila Agent Core menulis Skill operasional/troubleshooting baru.
- Baseline Agent Core: `debugging-and-error-recovery` (12.814 B), protokol Failure-learning/Reflexion (AGENTS.md), `deprecation-and-migration`, `agent-core-runtime-activation-audit` → SUDAH-ADA untuk metode; belum ada templat "intake per domain" maupun ledger rilis per jalur.
- Delta/celah: templat intake + kerangka runbook untuk Skill domain; perintah `curl`/`bash` di runbook Zoom harus diadaptasi ke PowerShell bila dipakai.
- Cara adaptasi: pakai bentuknya saat membuat Skill troubleshooting baru melalui proposal Skill; tidak ada perubahan kode.
- Lisensi/hak cipta: pola; tidak ada salinan.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah-sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: kerangka (7 RUNBOOK dibaca penuh, 42 dihitung). Dugaan: manfaat nyata hanya bila ada Skill domain baru.
- Disposisi: REFERENSI

### KWP-11 Dokumen berlabel bukti: validasi sampel, peta sumber, pemicu tinjau ulang, urutan penyelesaian konflik
- Sumber: `zoom-plugin/skills/contact-center/references/samples-validation.md` (urutan penyelesaian konflik: dokumen resmi terkini, lalu referensi API platform, lalu header/binary SDK terkirim, lalu sampel; sampel diperlakukan sebagai panduan arsitektur), `scribe/references/versioning-and-drift.md` (bagian "Review Trigger": tinjau ulang bila berkas inventori API berubah), `scribe/references/samples-validation.md`, `phone/references/crm-sample-validation.md` (kontradiksi pada sampel resmi), `meeting-sdk/electron/troubleshooting/deprecated-and-contradictions.md`, 29 berkas `source-map`/`versioning`/`samples-validation`/`version-drift`, `zoom-mcp/references/tools.md:11-12` dan `error-codes.md:15-24` (tabel "Exact Scope Errors Observed in Testing"), `scribe/RUNBOOK.md` ("deployment observations, not hard API guarantees"). Agent Core: `runtime/skills/capability-packs/source-driven-development/SKILL.md:89-94,117,121,147-161`, `agent-core-capability-index/UPSTREAM.json`.
- Observasi: Zoom memisahkan klaim yang diverifikasi di dokumentasi, yang diamati dalam uji, dan yang hanya berasal dari sampel/blog, lengkap dengan kontradiksi yang ditemukan.
- Nilai untuk Agent Core: pelabelan seperti ini membuat Skill tahan terhadap pembusukan sumber.
- Baseline Agent Core: hirarki sumber, surfacing konflik, dan perlakuan dokumen sebagai input tidak tepercaya sudah ada pada `source-driven-development`; `UPSTREAM.json` menyimpan repo + commit + `skillSha256`; `evidenceReliability` kualitatif di Learning → SUDAH-ADA (hampir seluruhnya). Celah kecil: belum ada "review trigger" (perubahan upstream apa yang memaksa tinjau ulang) maupun peta bagian-adaptasi → sumber pada pack.
- Delta/celah: dua catatan opsional per pack hasil adaptasi.
- Cara adaptasi: bila sebuah pack diadaptasi dari upstream, tambahkan `references/source-map.md` berisi jalur upstream yang diproses dan pemicu tinjau ulang (isi file, bukan skema). Tidak ada kode.
- Lisensi/hak cipta: pola.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: dokumen dibaca penuh (6 berkas) dan baseline di-Read. Dugaan: pack lain tidak punya catatan serupa (hanya 3 pack yang dilihat).
- Disposisi: REFERENSI

### KWP-12 Kebijakan tulis-vs-baca konektor: draf dulu, kelas efek, pengungkapan biaya, pratinjau sebelum bulk
- Sumber: `slack/commands/draft-announcement.md` (langkah 3–5: tampilkan draf ke pengguna, setelah disetujui buat DRAF di Slack lewat `slack_send_message_draft`, pengguna mengirim dari klien); `slack/skills/slack-search/SKILL.md:16-21,97` (pencarian publik tanpa persetujuan; publik+privat butuh persetujuan pengguna); `slack/skills/slack-messaging/SKILL.md:12,57` (tool tidak bisa menambah reaksi → minta pengguna melakukannya); `apollo/skills/sequence-load/SKILL.md` (Step 4 pratinjau + biaya kredit + "Wait for confirmation"; Step 6 `sequence_active_in_other_campaigns: false` sebagai default aman; Step 3 satu akun email dipakai otomatis tanpa konfirmasi); `apollo/skills/enrich-lead/SKILL.md` Step 2 dan `apollo/README.md` bagian Credits (peringatan kredit sebelum pemanggilan); `common-room/skills/weekly-prep-brief/SKILL.md` Step 2 (konfirmasi daftar rapat sebelum riset mahal); batas keluaran eksplisit (`slack/commands/channel-digest.md` 50 pesan/kanal; `summarize-channel.md` 100; `find-discussions.md` 5–10). Agent Core: `AGENTS.md:62,155-156,369,371`.
- Observasi: Tidak satu plugin pun menuliskan taksonomi efek, tetapi praktik konsisten membentuk lima kelas: BACA, BACA-SENSITIF (butuh persetujuan), STAGE (draf, dapat dibatalkan), COMMIT (kirim/daftarkan), BERBIAYA (kredit). Aturan: pilih jalur reversibel bila konektor menyediakannya; umumkan biaya sebelum panggilan; pratinjau sebelum bulk; default yang aman.
- Nilai untuk Agent Core: Skill konektor yang diadaptasi (Slack/email/CRM) perlu memetakan tool ke kelas efek tanpa menambah ritual konfirmasi.
- Baseline Agent Core: `AGENTS.md:62` (Skill tidak boleh menyimpulkan grant atau pesan keluar), `:155-156` (tanya hanya bila niat untuk komitmen eksternal belum jelas; jangan membuat ritual konfirmasi kedua), `:369` (ungkap panggilan eksternal pada laporan akhir) → SEBAGIAN: prinsip ada; templat penulisan Skill konektor dan preferensi stage-over-commit belum.
- Delta/celah: templat bagian "Effects" (5 baris) untuk Skill pembungkus tool tulis/berbiaya.
- Cara adaptasi: docs/templat di panduan penulisan Skill (bukan AGENTS.md); pada Native hubungkan dengan `executionAuthority: false` yang sudah ada. Batasan penting: jangan menambah konfirmasi di atas kebijakan AGENTS.md; "pilih draf bila konektor menyediakannya" hanya memilih jalur reversibel, bukan menambah pertanyaan. Catatan: pratinjau+biaya Apollo adalah kasus "komitmen berbiaya", tetap sejalan dengan `:369`.
- Lisensi/hak cipta: Slack dan Apollo MIT; pola.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: semua rujukan dibaca penuh. Dugaan: Native/controller eksternal akan benar-benar mengadaptasi Skill konektor (belum ada Skill semacam itu di katalog aktif).
- Disposisi: ADAPT

### KWP-13 Keluaran riset yang jujur: jejak ke tool, templat data-jarang, sumber sekunder bersyarat
- Sumber: `common-room/skills/account-research/SKILL.md` (empat pola interaksi: ringkasan penuh/pertanyaan terarah/data jarang/gabungan; Quality Standards: tiap fakta harus berasal dari satu pemanggilan tool; skor selalu angka mentah); `contact-research/SKILL.md`, `call-prep/SKILL.md` (templat data-jarang dengan baris "Data available: …"; "Never invent deal context"), `compose-outreach/SKILL.md` ("do not draft from thin air"), `prospect/SKILL.md` (clarify object type sebelum query; >50 hasil → ringkas dan tawarkan penyempit; <5 → longgarkan satu kriteria), `weekly-prep-brief/SKILL.md` (kalibrasi kedalaman menurut prioritas; time-box), `references/me-context.md` dan `my-company-context.md` (cakupan default wilayah pengguna dengan override; tanya konteks perusahaan sekali per sesi).
- Observasi: output menyesuaikan jenis pertanyaan; bagian kosong dihilangkan alih-alih diisi tebakan; web search hanya bila sumber utama tipis.
- Nilai untuk Agent Core: konsisten dengan gaya jawaban pendek dan disiplin bukti.
- Baseline Agent Core: `AGENTS.md:57` (gaya jawaban Native: pendek; panjang tumbuh hanya atas permintaan pengguna), `mind-control` (pisahkan fakta, asumsi, tidak diketahui), Verification rule, `src/learning/salience-review.ts:9` (`evidenceReliability`) → SUDAH-ADA.
- Delta/celah: hanya templat "data jarang" berformat tetap untuk keluaran riset Native; manfaat marginal.
- Cara adaptasi: tidak ada tindakan kode; rujukan untuk Skill riset baru.
- Lisensi/hak cipta: Apache-2.0; pola.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: 6 SKILL.md + 6 referensi dibaca penuh. Dugaan: tidak ada celah nyata pada Native (tidak diuji).
- Disposisi: REFERENSI

### KWP-14 Placeholder kategori konektor `~~category` dan mode standalone vs supercharged
- Sumber: `common-room/CONNECTORS.md:1-25` (placeholder `~~calendar`; jatuh balik bertanya ke pengguna bila tidak terhubung), `zoom-plugin/CONNECTORS.md:1-49` ("Standalone" vs "Supercharged"), `common-room/skills/call-prep/SKILL.md` Step 1, `apollo/skills/*` (nama tool terpaku host: `mcp__claude_ai_Apollo_MCP__apollo_*`). Agent Core: `agent-core-capability-index/SKILL.md` langkah 3 ("unavailable tools are an explicit limitation, not a silent skip"), `AGENTS.md:62`.
- Observasi: skill merujuk kategori kemampuan, bukan nama tool; tanpa konektor tetap berjalan dengan input manual.
- Nilai untuk Agent Core: nama tool Agent Core berbeda per controller (`mcp__agent-core__*` vs nama Native), sehingga Skill yang menyebut tool host-spesifik rapuh.
- Baseline Agent Core: kebijakan "keterbatasan eksplisit" ada; adaptor Skill memetakan nama tool per Skill → SUDAH-ADA.
- Delta/celah: hanya relevan bila mengadaptasi skill yang terpaku nama tool host (seperti Apollo).
- Cara adaptasi: tidak ada; gunakan sebagai aturan saat adaptasi (ganti nama tool host-spesifik dengan kategori).
- Lisensi/hak cipta: pola.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: dua CONNECTORS dibaca penuh. Dugaan: bahwa adaptasi lain akan menemui nama tool host.
- Disposisi: REFERENSI

### KWP-15 Brand-voice: pola konsistensi suara, pemuatan pedoman, pertanyaan terbuka berrekomendasi
- Sumber: `brand-voice/skills/brand-voice-enforcement/SKILL.md` + `references/voice-constant-tone-flexes.md` (suara konstan, nada fleksibel menurut formalitas/energi/kedalaman teknis; mode `strictness: strict|balanced|flexible`); urutan pemuatan pedoman (konteks sesi, berkas `.claude/brand-voice-guidelines.md` di folder kerja pengguna, lalu tanya) dengan peringatan tegas untuk tidak memakai jalur relatif ke cwd agen (di Cowork cwd = cache plugin); `settings/brand-voice.local.md.example`; `agents/quality-assurance.md` (keluaran Pass/Needs Revision/Fail; severity Critical/Suggested/Optional; tiap temuan mengutip pedoman; tools hanya Read/Glob/Grep, `maxTurns: 10`); `skills/guideline-generation/references/confidence-scoring.md` (High/Medium/Low dengan kriteria; ambang bukti minimum ≥ 3 percakapan); `skills/discover-brand/references/source-ranking.md` (lima kategori sumber + rumus bobot 30/25/20/15/10 × bobot kategori); semua temuan "open question" wajib berisi rekomendasi agen ("confirm or override"); redaksi PII sepanjang pipeline; pengarsipan versi lama (rename bertanggal) sebelum menimpa.
- Observasi: ini domain penulisan salinan pemasaran; yang berguna hanya pola kontrol mutu dan pemuatan.
- Nilai untuk Agent Core: rendah; sebagian besar sudah ada.
- Baseline Agent Core: gaya jawaban Native (`AGENTS.md:57`); portability/dynamic path protocol (AGENTS.md, bagian "Dynamic path / portability protocol" 2.591 B); `AGENTS.md:369` (tantang dengan alternatif konkret); `AGENTS.md:112` (dukungan independen berulang, bukan satu anekdot); revisi Skill + `file_checkpoint` (arsip sebelum menimpa); `src/security/redaction.ts`; `evidenceReliability` → SUDAH-ADA.
- Delta/celah: tidak ada yang layak ditambah. Rumus skoring berbobot buatan tangan tanpa validasi tidak diadopsi (Bagian C).
- Cara adaptasi: tidak ada.
- Lisensi/hak cipta: MIT Tribe AI.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: 20 dari 23 berkas dibaca penuh, 3 di-skim (judul). Dugaan: tidak ada.
- Disposisi: REFERENSI

### KWP-16 Permukaan MCP: nama mentah otoritatif, daftar negatif hasil probe, satu server per permukaan, hand-off ke REST
- Sumber: `zoom-plugin/skills/zoom-mcp/SKILL.md:39-52,190-199`, `references/tools.md:1-23,144-149`, `references/error-codes.md:8-24,45-52`, `troubleshooting/common-errors.md`, `RUNBOOK.md`, `whiteboard/SKILL.md:30-40,64-78`, `.mcp.json`. Catatan drift: `CHANGELOG.md:11` menyatakan Whiteboard MCP dihapus dari plugin, tetapi `.mcp.json` dan `CONNECTORS.md:14` masih memuatnya.
- Observasi: (1) klien memberi ruang nama pada tool (`zoom-mcp:recordings_list`) sehingga dokumen menyatakan nama mentah dan `tools/list` hidup sebagai sumber kebenaran; (2) dokumen mencantumkan nama tool lama yang "tidak ada" hasil probe; (3) satu server per permukaan produk (Docs, Whiteboard terpisah); (4) CRUD deterministik tidak disediakan lewat MCP → hand-off ke REST; (5) token hanya lewat variabel lingkungan di header; (6) tool tulis (`create_file_with_content`, `create_a_whiteboard*`, `update_a_whiteboard_metadata`) tidak disertai kebijakan konfirmasi tertulis.
- Nilai untuk Agent Core: Agent Core adalah server MCP dengan anggaran manifest hampir habis; Skill/dokumen yang menyebut tool harus memakai nama mentah dan tidak mengasumsikan ruang nama klien.
- Baseline Agent Core: manifest dan "Refresh tools" didokumentasikan di AGENTS.md; adaptor menyebut tool host per Skill → SUDAH-ADA/REFERENSI.
- Delta/celah: tidak ada tindakan; checklist penulisan Skill yang menyebut tool.
- Cara adaptasi: butir (1) dan (6) dimasukkan ke templat penulisan Skill bersama KWP-12 (docs saja).
- Lisensi/hak cipta: pola; MIT.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: 7 berkas dibaca penuh. Dugaan: tidak ada.
- Disposisi: REFERENSI

### KWP-17 Tingkatan penyamaran PII untuk pembacaan layar/DOM oleh agen
- Sumber: `zoom-plugin/skills/general/use-cases/form-completion-assistant.md:208-232` ("Progressive Privacy Masking": Tier 1 tidak pernah terlihat oleh agen — SSN, kata sandi, kartu; Tier 2 tersamar secara default dan dapat dibuka dengan persetujuan); `cobrowse-sdk/examples/privacy-masking.md` (stub 7 baris). Agent Core: `src/security/redaction.ts` dipakai pada `src/rdc/utils/toolHistory.ts:7`, `src/rdc/checkpoints/service.ts:7,348-351`, `src/rdc/checkpoints/task-changes.ts:78,134`, `src/rdc/tools/pdf/lib/evidence.ts:1`; `docs/Browser-Control.md` (grep `sensitive|secret|credential|mask|redact|payment|card` → 0 hasil).
- Observasi: pola dua tingkat: tidak pernah terlihat vs tersamar kecuali ada persetujuan.
- Nilai untuk Agent Core: pembacaan DOM/tangkapan layar oleh `browser_control` dapat membawa isi kolom kata sandi/kartu ke model dan log.
- Baseline Agent Core: redaksi untuk riwayat tool, checkpoint, dan bukti PDF ada; implementasi baca DOM berada di transport open-browser-use di luar `src/` dan tidak saya telusuri → TIDAK-TERVERIFIKASI untuk jalur browser.
- Delta/celah: jika belum ada, kebijakan "nilai kolom password/kartu tidak dikembalikan ke model" pada lapisan transport.
- Cara adaptasi: verifikasi dahulu (lihat pertanyaan terbuka Q4); jika belum ada, dokumen + uji pada lapisan transport; bukan perubahan skema tool.
- Lisensi/hak cipta: pola; MIT.
- Perkiraan skala: M (setelah verifikasi) · Risiko: sedang · Nilai: rendah-sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: teks Zoom dan keberadaan redaksi di jalur lain. Tidak diketahui: perilaku nyata pembacaan DOM.
- Disposisi: REFERENSI

### KWP-18 Menolak kredensial placeholder sebelum memanggil layanan; dokumentasi variabel lingkungan hanya nama
- Sumber: `zoom-plugin/skills/scribe/RUNBOOK.md` bagian 2 (tolak nilai seperti `${ZOOM_API_KEY}` karena health check naif tampak terkonfigurasi), `scribe/troubleshooting/common-drift-and-breaks.md` bagian 7 (gagal cepat sebelum memanggil Zoom); 26 berkas `*/references/environment-variables.md` (tabel: variabel | wajib | kegunaan | di mana ditemukan; bagian "runtime-only values"; hanya nama, tidak ada nilai; mis. `phone/references/environment-variables.md`). Agent Core: grep `\$\{[A-Z_]+\}|YOUR_API_KEY|changeme|placeholder` pada `agent-provider-readiness.ts`, `agent-provider.ts`, `config.ts`, `security/`, `auth/` → 0 hasil (tidak konklusif); kesiapan provider memakai probe nyata (`agent-provider-readiness.ts`).
- Observasi: satu kelas kegagalan kecil yang membuang waktu: placeholder lolos pemeriksaan "ada".
- Nilai untuk Agent Core: pesan galat lebih jelas dan menghindari panggilan jaringan sia-sia pada konfigurasi provider/kunci.
- Baseline Agent Core: probe jaringan mendeteksi kunci tidak valid setelah panggilan; pra-pemeriksaan placeholder belum terlihat → SEBAGIAN (dugaan).
- Delta/celah: pra-pemeriksaan murah.
- Cara adaptasi: internal kecil pada validasi kunci provider; nilai rendah, tidak mendesak.
- Lisensi/hak cipta: pola.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: teks Zoom. Dugaan: ketiadaan pra-pemeriksaan di Agent Core (grep terbatas pada lima berkas).
- Disposisi: REFERENSI

---

## Bagian C — Ditolak / tidak relevan

1. Router kata-kunci runtime (`zoom-plugin/skills/general/references/routing-implementation.md:72-131`, `general/SKILL.md:31-71`): pencocokan substring `includes` pada prompt huruf kecil (mis. `'crc'`, `'zva'`, `'phone'`, `'rtms'`) rawan positif palsu; `confidence` hanya menghitung jumlah sinyal (0,5–0,9 tanpa kalibrasi); ID skill ditanam. Menjadikannya runtime adalah gerbang tersembunyi yang bertentangan dengan doktrin. Hanya kosakata hasil rute (primary, chained, rationale, warnings, needsClarification) yang layak sebagai format laporan, dan itu sudah setara dengan hasil `skills(search)` (rank, channels) dan CAPABILITY USAGE NOTICE.
2. Isi domain Zoom (≈ 4,8 MB, 694 berkas): bukan kebutuhan Agent Core, cepat basi (tanggal deprecasi 2026, versi SDK tertanam di `meeting-sdk/SKILL.md:51-56`), dan memasukkannya melanggar anggaran serta aturan satu-owner.
3. Kode contoh webhook Zoom: bug sintaks (`webhooks/SKILL.md:40,49`), perbandingan tidak konstan-waktu (11 baris di 9 berkas), guard panjang hilang (`scribe/examples/batch-webhook-pipeline.md:63`), jendela replay hanya ditegakkan di 1 contoh. Jangan disalin; hanya checklist prosanya yang benar.
4. Panduan bot LLM Team Chat (`team-chat/examples/llm-integration.md:1-16`): pesan pengguna langsung diklasifikasi LLM lalu memicu aksi backend, tanpa pertahanan injeksi prompt, walau `team-chat/concepts/security.md` menyebut payload tidak tepercaya. Bukan model keamanan untuk Native.
5. Prospecting/pengayaan Apollo dan Common Room: `reveal_personal_emails: true` secara default (`apollo/skills/enrich-lead` Step 2, `prospect` Step 5, `sequence-load` Step 5) dan kompilasi data pribadi pihak ketiga bertentangan dengan kebijakan privasi/local-first; domain penjualan. `apollo/skills/prospect/SKILL.md` Step 7 merujuk `/apollo:company-intel` yang tidak ada di plugin (rujukan menggantung).
6. Nama tool terpaku host (`mcp__claude_ai_Apollo_MCP__apollo_*`): rapuh lintas klien; adaptasi lewat KWP-14.
7. Orkestrasi multi-agent brand-voice (5 agen dengan `model: haiku|sonnet`, `maxTurns` 10–25, delegasi via Task): runtime multi-agent sudah DITOLAK pada disposisi sebelumnya; hanya pola reviewer baca-saja dicatat di KWP-15.
8. Rumus skor kepercayaan dan peringkat sumber brand-voice (bobot tangan 0,30/0,25/0,20/0,15/0,10 × bobot kategori 1,0/0,8/0,6/0,3/0,1; ambang 0,85/0,60): angka buatan tangan tanpa validasi; `evidenceReliability` kualitatif Agent Core lebih jujur.
9. Berkas penunjuk/stub (87 berkas ≤ 15 baris; mis. `cobrowse-sdk/references/api.md` 5 baris, `oauth/examples/device-flow.md` 9 baris, `webhooks/references/signature-verification.md` 6 baris): lahir dari aturan "setiap md harus tertaut" (`CONTRIBUTING.md:80,96`) dan menambah satu round-trip `skills(read)` tanpa isi.
10. Hub raksasa dan gabungan ganda (13 SKILL.md > 500 baris; `oauth/SKILL.md` H1 ganda + indeks kedua; `meeting-sdk/web/client-view` dan `component-view` masing-masing 620 baris dengan 1.005 baris diff): kebalikan dari progressive disclosure.
11. Gerbang "MANDATORY FIRST STEP" folder kerja (`brand-voice/commands/enforce-voice.md`, `generate-guidelines.md`): khusus Cowork (agen berjalan dari cache plugin); tidak berlaku bagi Agent Core.
12. Klien OAuth tertanam dan port callback tetap di `slack/.mcp.json` (nilai tidak disalin): pendaftaran vendor, bukan pola untuk Agent Core.
13. Perintah `curl`/`bash` pada runbook (mis. `rest-api/RUNBOOK.md` bagian 6, `meeting-sdk/RUNBOOK.md` bagian 6): bukan PowerShell; pakai ulang hanya dengan adaptasi (lihat KWP-10).

---

## Bagian D — Pola lintas-unit dan pertanyaan terbuka

### D.1 Pola yang berulang dan layak jadi standar

1. Routing berlapis dengan skill referensi pasif dan tautan balik (zoom: `start` → alur kerja → hub → daun; 42 skill `user-invocable: false`; "Prefer X first") — KWP-05.
2. Tabel "jangan rute ke" di awal hub; deteksi jalur salah di runbook — KWP-09.
3. Kerangka folder produk yang seragam (SKILL, RUNBOOK, concepts, examples, references, scenarios, troubleshooting) dengan kerangka runbook 7–8 bagian; 71 berkas troubleshooting, 26 `environment-variables.md` hanya nama — KWP-10, KWP-18. Kerangka seragam memudahkan lint (KWP-06).
4. Peta + snapshot cakupan, bukan salinan dokumen besar (`android-reference-map.md`, `source-map.md`) — KWP-04, KWP-11.
5. Dokumen berlabel bukti (diverifikasi vs diamati vs sampel) dengan urutan penyelesaian konflik dan pemicu tinjau ulang — KWP-11.
6. Kelas efek konektor (BACA, BACA-SENSITIF, STAGE, COMMIT, BERBIAYA) dengan jalur reversibel lebih dahulu, pengumuman biaya, pratinjau sebelum bulk, default aman, batas keluaran eksplisit — KWP-12.
7. Keluaran jujur: tiap fakta dapat ditelusuri ke satu pemanggilan tool; bagian kosong dihilangkan; sumber sekunder bersyarat; templat data-jarang — KWP-13.
8. Invarian tata letak dijaga alat (graf tautan Zoom bersih), tetapi penamaan/stub/versi membusuk tanpa alat — KWP-06.
9. Kontra-pola yang berulang: hub raksasa, H1 ganda dan penggabungan sisa, stub penunjuk, nama usang di tabel rute, konten data besar di dalam skill, kode contoh yang tidak dijalankan.

### D.2 Pertanyaan terbuka untuk Main/pengguna

- Q1 (KWP-01): relokasi otomatis ke `references/` saat adaptasi (mengubah byte tetapi mempertahankan batas baca) atau perluasan root baca (mengubah deskripsi tool dan anggaran manifest)? Rekomendasi studi: relokasi, tahap pelaporan lebih dahulu.
- Q2 (KWP-05): sub-indeks sekarang atau menunggu indeks melebihi 8.192 B (sisa 1.296 B)? Rekomendasi studi: tunggu; siapkan kandidat Replica (957 B).
- Q3 (KWP-07): blok AGENTS.md mana yang boleh pindah? Perlu tinjauan pemilik untuk memastikan tidak ada invarian izin/keselamatan di dalam Code Intelligence/Release intent; juga jadwal handshake ulang.
- Q4 (KWP-17): apakah transport browser (open-browser-use) sudah menyamarkan nilai kolom password/kartu sebelum sampai ke model dan log? Belum ditelusuri karena di luar `src/` dan di luar irisan.
- Q5 (KWP-01..03): akankah plugin bergaya Zoom benar-benar diimpor? Bila tidak, fixture sintetis mini sudah cukup untuk uji adapter dan tidak perlu menyalin berkas Zoom.
- Q6 (KWP-02): simpan `triggers` sebagai metadata saja, atau ubah menjadi bagian `## Triggers` lewat revisi Skill yang disetujui pengguna?
- Q7 (KWP-05/06): apakah semua 25 pack > 8.192 B perlu dipangkas, atau cukup yang sering dipakai (butuh data penggunaan dari Activity Tracker)?
