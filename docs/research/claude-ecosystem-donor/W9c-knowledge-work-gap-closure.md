# W9c — knowledge-work-plugins: penutupan celah (prefiks GCC)

Pekerja: W9c, baca-saja, 2026-10-27. Sumber: `E:\Projects\Side-Project-Dont-Touch\knowledge-work-plugins`, HEAD `33d3dea`. Pembanding (hanya dibaca): `E:\Projects\Agent-Core\src\skills\{claude-plugin,resource-path,service,discovery}.ts`, `runtime/skills/capability-packs/*`. Tidak ada skrip, hook, atau binary sumber yang dijalankan; semua pengukuran memakai skrip Node baca-saja yang dialirkan lewat stdin (tanpa menulis berkas), dan git hanya `ls-files`/`log`. Tidak ada kode Agent Core yang dijalankan: pemeriksaan adapter dilakukan dengan memportasi logikanya ke skrip saya sendiri (`readFields`, `findMissingReferences`, `normalizeSkillReadResource`) dan menjalankannya pada data sumber.

Ringkasan: 9 temuan (ADOPT 0, ADAPT 7, REFERENSI 2). Hasil terpenting bukan isi domain, melainkan pengukuran adapter dan tool `skills(read)` pada 225 skill nyata: (1) hanya 22–30% berkas pohon skill plugin gaya small-business dan Zoom yang terbaca lewat `skills(read)`, dan 12 pack Agent Core sendiri punya masalah serupa (GCC-01); (2) pratinjau adapter hampir seluruhnya berisi laporan "missing" yang bukan kehilangan (224 dari 231 target, GCC-03).

## Catatan jujur tentang jangkauan baca

Anggaran konteks pekerja ini terbatas, sehingga bagian besar target brief tidak dibaca penuh. Yang benar-benar dilakukan:

1. Dibaca penuh oleh saya: `sales` blok aturan bersama (12 baris; tampilan saya memotong 4 baris terpanjang pada 330 karakter, teks lengkapnya sudah dibaca W6), `forecast`, `crm-hygiene-check`, `deal-signals`, `route-lead` (seluruh baris yang tidak termasuk blok bersama), `create-an-asset` (langkah 2–4 dan tiers), `small-business/skills/build-connector/reference/discovery.md` dan `paths.md`, `partner-built/zoom-plugin/skills/meeting-sdk/ios/SKILL.md`, `cobrowse-sdk/references/settings-reference.md` (stub 199 B), `cowork-plugin-management/.../example-plugins.md` (±65%: struktur dan dua contoh).
2. Dibaca sebagian: `small-business/.../inventory-planner/reference/velocity_and_reorder.md` (±75%, sampai bagian ukuran pesanan), `use-zapier.md` (judul dan baris aturan, ±25%), `data/skills/sql-queries` (judul + bagian penanganan galat), `data/skills/build-dashboard` (judul + bagian performa), `oauth/concepts/pkce.md` (45 baris pertama dari 14.585 B).
3. Dipindai 100% dengan skrip: frontmatter 225 `SKILL.md` tingkat-atas di semua plugin; seluruh pohon 225 skill (ukuran, keterbacaan, tautan); seluruh 694 berkas `zoom-plugin/skills` (distribusi ukuran, rasio, graf tautan, tautan putus, anchor, cacat markdown); 40 pack Agent Core.
4. Tidak saya buka: platform docs Zoom (Windows, Linux, iOS, Android, web, dst.) selain sampel di atas; `rest-api/references`; isi dua tabel scope (hanya diukur strukturnya); 14 berkas `small-business/shared/` (W7 sudah membacanya penuh; saya tidak membaca ulang dan menerima ringkasannya); ±148 berkas `small-business/*/reference/` selain yang disebut; 26 skill `sales` lain hanya disaring dengan regex kalimat-pengaman; skill `marketing`, `legal`, `human-resources`, `customer-support` hanya lewat daftar judul seluruh skill dan grep pengaman. Penilaian untuk bagian ini adalah penilaian dari struktur, bukan dari isi.
5. Koreksi terhadap brief: tiga referensi `build-connector` (`discovery.md`, `paths.md`, `use-zapier.md`) berada di `small-business/skills/build-connector/reference/`, bukan di `bio-research`.

---

# Bagian A — Ledger cakupan (hanya unit yang saya tutup)

Legenda dibaca: penuh = seluruh isi; sampel = bagian isi, kriteria disebut; skrip = dipindai 100% oleh skrip baca-saja; tidak dibuka = alasan disebut.

| Unit | File | Dibaca | Disposisi | Alasan satu baris | Temuan |
|---|---:|---|---|---|---|
| `sales/skills/*` blok aturan bersama (12 baris identik di 36 skill) | 36 (tersalin) | penuh sekali | REFERENSI | satu-satunya konten non-domain; sudah diangkat W6 (KWA-01/02/03) | KWA-01, GCC-09 |
| `sales/skills/{forecast,crm-hygiene-check,deal-signals,route-lead}` | 4 | penuh (semua baris non-bersama) | REFERENSI | ambang dan aturan sapuan layak sebagai pola, domain CRM ditolak | GCC-06, GCC-09 |
| `sales/skills/create-an-asset` | 1 | sampel: langkah 2–4 + tiers | ADAPT kecil | inventaris klaim + gerbang outline sebelum render | GCC-07 |
| `sales/skills/*` 26 skill lain (account-*, call-prep, close-plan, competitive-intelligence, customer-*, deal-*, draft-outreach, expansion-whitespace, inbox-sweep, lead-triage, log-activity, pipeline-review, renewal-radar, schedule-meeting, setup, stakeholder-map, team-pipeline, weekly-wrap, win-loss-review, handle-objection, rep-context, account-tiering) | 26 | sampel: seluruh kalimat non-bersama yang cocok regex pengaman (1–2 kalimat per skill, 39 kalimat) | TOLAK domain; pola dicatat | kriteria: kalimat berisi never/do not/untrusted/label; tidak ada pola baru di luar KWA-01..04 selain yang tertulis di GCC-06/07/09 | GCC-06, GCC-07, GCC-09 |
| `sales` berkas non-skill (plugin.json, .mcp.json, CONNECTORS.md, LICENSE, README.md) | 5 | tidak dibuka ulang | TOLAK | dicakup W6 | KWA-C01 |
| `marketing/skills/*` | 8 | sampel: seluruh judul H2/H3 + grep pengaman privasi | TOLAK domain | kampanye/SEO/konten di luar peran mesin-pendamping engineering | KWA-C06 |
| `legal/skills/*` | 9 | sampel: seluruh judul + grep pengaman/playbook | TOLAK domain; pola "Review Basis" dicatat | domain hukum AS; pola nyatakan-default sudah di KWA-22 | GCC-09 |
| `human-resources/skills/*` | 9 | sampel: seluruh judul + grep pengaman | TOLAK | hanya satu baris kerahasiaan data (`comp-analysis`) dan tidak ada pengaman data pribadi | KWA-C06 |
| `customer-support/skills/*` | 5 | sampel: seluruh judul + grep pengaman | REFERENSI | sudah dicakup KWA-08/13 | KWA-08 |
| `data/skills/sql-queries` | 1 | sampel: judul + bagian galat (±10%) | TOLAK | dialek warehouse; enam langkah debug galat SQL generik | KWA-C09 |
| `data/skills/build-dashboard` | 1 | sampel: judul + bagian performa (±12%) | TOLAK | HTML+Chart.js; satu tabel ambang ukuran data tidak relevan | KWA-C09 |
| `cowork-plugin-management/.../example-plugins.md` | 1 | penuh sebagian (±65%) | REFERENSI | tiga contoh pohon plugin; memakai `description: >` yang diterima adapter | KWP-02 |
| `small-business/skills/build-connector/reference/{discovery,paths}.md` | 2 | penuh | REFERENSI | tangga opsi "yang membosankan dulu" + jawaban "tidak ada" yang jujur | GCC-09 |
| `small-business/skills/build-connector/reference/use-zapier.md` | 1 | sampel: judul + baris aturan | TOLAK | data keluar ke pihak ketiga berbayar per tugas | KWB-C5 |
| `small-business/skills/inventory-planner/reference/velocity_and_reorder.md` | 1 | sampel ±75% | REFERENSI | aturan estimator: jendela ganda, data tersensor, pembagi nol, musim disebut pemilik | GCC-06 |
| `small-business/skills/*/reference/*` lainnya | 148 | tidak dibuka (±30 dibaca W7) | TOLAK/REFERENSI | domain konektor SaaS; diukur kelas dan keterbacaannya oleh skrip | GCC-01 |
| `small-business/shared/` | 15 | 14 tidak dibaca ulang (W7 penuh); `artifact-example.html` diperiksa: 1 `<script`, hanya font Google | TOLAK (html) | tidak ada ancaman; gaya halaman artefak Claude | KWB-C2 |
| Pohon seluruh 225 skill tingkat-atas (15 plugin pengetahuan inti 131 skill/142 file + small-business 44/196 + bio-research 6/73 + partner-built 44/720) | 1.131 | skrip 100% (keterbacaan, tautan, UTF-8, batas MAX_FILES/ukuran) | ADAPT | dasar GCC-01/03 | GCC-01, GCC-03 |
| Frontmatter 225 `SKILL.md` tingkat-atas | 225 | skrip 100% (port `readFields`) | ADAPT | dasar GCC-02 | GCC-02 |
| `partner-built/zoom-plugin/skills/**` | 694 | skrip 100%; baca: `meeting-sdk/ios/SKILL.md` penuh, `pkce.md` ±20%, `settings-reference.md` penuh; sisanya tidak dibuka | REFERENSI (pola) · TOLAK (isi) | pengukuran ukuran, rasio, graf, anchor, cacat | GCC-04, GCC-05, GCC-08 |
| `zoom-plugin` platform docs (windows 47+, linux, android, ios, macos, web 50, unreal, unity, flutter, react-native, electron) | ±380 | tidak dibuka isinya; struktur diukur | TOLAK | domain SDK per platform, cepat basi; polanya (hub kecil + RUNBOOK + peta referensi) sudah di KWP-05/11 | GCC-05 |
| `zoom-plugin/skills/rest-api/references` (41) | 41 | tidak dibuka; ukuran diukur (terbesar `phone.md` 47 KB) | TOLAK | data endpoint domain | GCC-05 |
| `zoom-plugin/skills/oauth/references/{classic,granular}-scopes.md` | 2 | diukur strukturnya saja | TOLAK | 372 KB + 368 KB data scope; bentuk diukur | GCC-05 |
| Pack Agent Core sendiri (40 pack, 353 file) | 353 | skrip 100% + grep rujukan | ADAPT | bukti bahwa masalah GCC-01 terjadi di katalog sendiri | GCC-01 |

Cakupan: sekitar 14 berkas dibaca penuh oleh saya dan sekitar 10 dibaca sebagian; seluruh pohon skill (1.131 berkas di 225 skill) dan 40 pack Agent Core dipindai skrip 100%. Porsi isi yang dibaca terhadap seluruh irisan yang ditugaskan kecil (jauh di bawah 10% byte); jangan menafsirkan "tidak ada temuan" pada bagian yang tidak dibuka sebagai bukti ketiadaan.

---

# Bagian B — Temuan

### GCC-01 Audit keterbacaan pohon Skill: 22–30% terbaca di plugin nyata, dan 12 pack Agent Core terdampak
- Sumber: `src/skills/resource-path.ts:3-12` (hanya `SKILL.md` atau `references/<segmen>/…`, tiap segmen `^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$`), `src/skills/service.ts:834,842` (`read` memakai `normalizeSkillReadResource`), `src/mcp/skills-tools.ts:41` (deskripsi tool menyebut "references/"), `src/skills/claude-plugin.ts:185-208` (`findMissingReferences`); data: skrip atas pohon 225 skill; `runtime/skills/capability-packs/idea-refine/SKILL.md:111,124,183`, `replica-architect/SKILL.md:31`, `replica-recon/SKILL.md:36`, `replica-deploy/SKILL.md:31`, `replica-test/SKILL.md:30-32`. Menguatkan dan memperluas KWP-01 dan KWB-03.
- Observasi: Hitungan nyata (skrip meniru aturan jalur baca): small-business 44 dari 196 berkas pohon terbaca (22,4%) karena seluruh 152 berkas referensinya ada di folder `reference/` (tunggal), nol yang berawalan `references/`; partner-built (5 plugin) 216 dari 720 (30,0%), Zoom saja 190 dari 694 (27,4%); bio-research 38 dari 73 (52,1%; sisanya `scripts/` dan LICENSE); lima belas plugin pengetahuan inti (131 skill) 139 dari 142 (97,9%, karena hampir semuanya hanya SKILL.md). Di tautan `SKILL.md` Zoom: 578 target unik per skill, 160 terbaca, 280 ada tetapi tidak terbaca (tidak dilaporkan pratinjau), 138 di luar akar (dilaporkan sebagai "missing"). Di small-business: 53 target, 33 ada tetapi tidak terbaca, 20 di luar akar, 0 dilaporkan sebagai hilang walau 152 berkas tidak dapat dibuka. Hop kedua: 29 dari 122 tautan di dalam referensi Zoom yang terbaca menunjuk ke berkas tidak terbaca. Skenario pengandaian (aturan alternatif): jika awalan `reference/`, `examples/`, `concepts/`, `troubleshooting/`, `scenarios/`, `use-cases/`, `templates/` diizinkan, terbaca naik menjadi small-business 196/196, partner-built 400/720; jika semua berkas teks non-`scripts/` diizinkan, partner-built 720/720. Di katalog Agent Core sendiri: 40 pack, 353 file, 108 tidak terbaca (sebagian besar LICENSE, UPSTREAM.json, skrip; sah); 12 pack memiliki berkas non-`references/` yang disebut isi `SKILL.md`: `idea-refine` meminta membaca `frameworks.md`, `refinement-criteria.md`, `examples.md` "in this skill directory" (ketiganya di akar pack, terverifikasi `grep` dan `ls`), `replica-architect` (`architecture.md`), `replica-recon` (`recon-map.md`), `replica-deploy` (`preflight.md`), `replica-test` (`test-plan.md`, `bug-report.md`, `e2e.example.spec.ts`), ditambah skrip dan templat JSON/CSV di `replica-brand`, `replica-design`, `replica-diff`, `replica-entrepreneur`, `replica-launch`.
- Nilai untuk Agent Core: kegagalan diam pada pengungkapan bertahap: agen yang hanya punya `skills(read)` diarahkan ke berkas yang tidak dapat ia buka. Jika sebuah plugin gaya small-business diimpor, 78% isinya tak terjangkau dan pratinjau tetap berstatus "compatible/adaptable".
- Baseline Agent Core: aturan jalur dan `findMissingReferences` seperti di atas; tidak ada kategori "ada tetapi tidak terbaca" dan tidak ada relokasi. → SEBAGIAN (mekanisme baca aman ada; pelaporan keterbacaan tidak ada). Apakah controller eksternal membuka berkas pack di luar `references/` lewat tool berkas biasa: tidak diverifikasi (jika ya, masalah untuk pack sendiri berkurang tetapi tidak berlaku bagi Native yang hanya memegang `skills`).
- Delta/celah: (a) pratinjau tidak melaporkan keterbacaan; (b) 12 pack aktif dengan rujukan ke berkas di akar; (c) belum ada keputusan mekanisme untuk plugin impor (relokasi atau allow-list).
- Cara adaptasi: Langkah 1 (tanpa kode): untuk pack sendiri, pindahkan berkas `.md` yang disebut `SKILL.md` ke `references/` dan ubah kalimat "in this skill directory" menjadi `references/<nama>.md`, lewat revisi SkillService (bukan edit langsung); mulai dari `idea-refine`. Langkah 2 (S): tambahkan pada `ClaudePluginSkillComponent` ringkasan `readability: { readable, existsButUnreadable, outsidePluginRoot, missing }` yang dihitung dengan `normalizeSkillReadResource` yang sama; field keluaran, bukan skema masukan. Langkah 3 (keputusan pemilik): untuk plugin impor, pilih relokasi deterministik (`reference/` → `references/` dan tulis ulang tautan, catat di `changes`, simpan asli seperti `ORIGINAL_PATH`) atau memperlebar allow-list awalan di `resource-path.ts`. Saran: relokasi, karena menjaga satu invarian "hanya `references/`" dan deskripsi tool tidak berubah; allow-list lebih murah tetapi mengubah invarian keamanan yang dinyatakan di komentar berkas itu. Segmen yang diawali `_` atau `.` (mis. `__init__.py`) selalu tidak terbaca; ini sah.
- Lisensi/hak cipta: tidak ada teks disalin; Zoom MIT, small-business Apache-2.0.
- Perkiraan skala: S (langkah 1–2); M (langkah 3 relokasi) · Risiko: sedang pada relokasi (mengubah byte dan digest; harus deterministik dan lolos round-trip) · Nilai: tinggi · Butuh skema tool baru: tidak (field hasil; konfirmasi bahwa hasil pratinjau tidak divalidasi skema keluaran) · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: terverifikasi = kode, hitungan skrip, tiga baris `idea-refine`, daftar akar pack. Dugaan = jalur lain yang sah untuk membuka berkas pack; seberapa sering agen gagal pada `idea-refine` (tidak diukur).
- Disposisi: ADAPT

### GCC-02 Frontmatter adapter diukur pada 225 skill: satu-satunya penghalang adalah `triggers:` berbentuk daftar di Zoom
- Sumber: `src/skills/claude-plugin.ts:143-170` (`readFields`), `:218-221` (`text` menolak `list`/`map`), blok pemindahan kunci non-ketat dan perbandingan round-trip di `adaptFrontmatter` (`:211`), `src/skills/service.ts:154` (nilai metadata dipotong 500), `:180` (deskripsi ≤1.024, tanpa `<` `>`); data: port `readFields` dijalankan pada 225 `SKILL.md` tingkat-atas. Menguatkan KWP-02.
- Observasi: 0 dari 225 gagal diurai; 0 deskripsi >1.024 atau berisi `<`/`>`; deskripsi multibaris (blok `>`/`|` atau lanjutan berindentasi) ada di small-business (33 dari 44), cowork-plugin-management (2), brand-voice (3), dan data (1), semuanya diterima adapter sebagai `multiline-folded` (parser ketat memang menolaknya). Satu-satunya kunci berbentuk daftar adalah `triggers` pada 19 dari 30 skill Zoom (63%); 0 kunci peta. Kunci skalar non-ketat: `argument-hint` dan `user-invocable` (dipindah ke `metadata.claude-*`) dan `version` (2 skill small-business). Hasil: 206 dari 225 (91,6%) tidak terblokir; semua 19 yang terblokir ada di satu plugin. Panjang `triggers` digabung dengan " | ": maks 417, median 169 karakter (<500). Catatan: usulan KWP-02 (gabung daftar menjadi string metadata) harus menjaga batas 500, karena nilai metadata yang lebih panjang membuat `parse` memotong dan perbandingan round-trip gagal (`SKILL_PLUGIN_ROUNDTRIP_MISMATCH`). Nama ≠ folder pada 14 dari 30 skill Zoom (adapter memakai `name` frontmatter, jadi aman).
- Nilai untuk Agent Core: menetapkan skala masalah dengan angka: perbaikan hanya berarti jika plugin gaya Zoom benar-benar diimpor; lima belas plugin pengetahuan inti, small-business, bio-research, dan empat plugin partner lain sudah lolos adapter.
- Baseline Agent Core: skalar non-ketat sudah dipetakan; daftar belum → SEBAGIAN.
- Delta/celah: pemetaan kunci daftar dengan pemangkasan eksplisit.
- Cara adaptasi: seperti KWP-02, ditambah aturan: gabungan >500 karakter dipotong pada batas butir dan dicatat sebagai `list-truncated` di `changes` (bukan gagal diam); uji dengan frontmatter sintetis (lihat GCC-08). Prioritas rendah sampai ada rencana impor.
- Lisensi/hak cipta: tidak ada teks disalin.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah-sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: terverifikasi = port logika adapter pada data (bukan menjalankan kode Agent Core); dugaan = port saya sama persis dengan perilaku kode asli pada kasus pinggiran (tidak dibandingkan dengan keluaran aslinya).
- Disposisi: ADAPT (prioritas rendah)

### GCC-03 Laporan "missing reference" didominasi tautan bukan-kehilangan (224 dari 231)
- Sumber: `src/skills/claude-plugin.ts:204` (`../` dan hasil di luar pohon dianggap missing), `:88` (`MAX_REFERENCES = 64`); data: skrip pada 225 `SKILL.md`. Menguatkan KWP-03.
- Observasi: dari 231 target yang akan dicatat sebagai missing, 224 adalah di luar akar skill: 65 tautan `../../CONNECTORS.md` (setiap skill di 12 plugin pengetahuan: customer-support 5, data 6, design 6, engineering 6, enterprise-search 4, finance 3, HR 6, legal 7, marketing 7, operations 6, product-management 7, productivity 2), 138 di Zoom (tautan skill bersaudara dan `CONNECTORS.md`), 20 `../../shared/…` di small-business, 1 di bio-research. Hanya 7 yang benar-benar hilang: 2 direktori `references/examples/` dan `references/instrument_guides/` di bio-research (cacat sumber), 3 `references/my-company-context.md` di `common-room` (cacat sumber nyata: berkas ada di `references/` tingkat plugin, bukan per skill), 1 placeholder `references/[domain].md` di `data-context-extractor` dan 1 `url` di `slack-messaging` (dua positif palsu karena tanda `[` dan kata `url` tidak disaring). Rasio sinyal terhadap derau: 7 dari 231 (3%), dan dua di antaranya palsu.
- Nilai untuk Agent Core: pengguna yang membaca pratinjau akan belajar mengabaikan kolom `missingReferences`, padahal itu yang menangkap cacat nyata seperti milik `common-room`.
- Baseline Agent Core: satu daftar datar terpotong 64 → SEBAGIAN.
- Delta/celah: pisahkan tiga kelas: `outsideSkillRoot` (termasuk sub-jenis `pluginDoc` untuk `CONNECTORS.md` dan `siblingSkill` untuk `../<nama>/SKILL.md` yang ada di plugin yang sama), `missing` (benar-benar hilang), dan abaikan placeholder bertanda `[...]` serta kata kosong tanpa jalur.
- Cara adaptasi: `claude-plugin.ts` + `analyzeClaudePlugin` (`service.ts` sekitar :884-920); hanya pelaporan; `missingReferences` tetap berisi yang benar-benar hilang agar kompatibel. Bersama GCC-01 menjadi satu perubahan pada tipe `ClaudePluginSkillComponent`.
- Lisensi/hak cipta: tidak ada.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: terverifikasi = daftar tujuh target dicetak skrip; seluruh 65 tautan di luar akar pada 12 plugin pengetahuan ternyata satu target identik, `../../CONNECTORS.md` (dihitung dengan skrip kedua); lokasi berkas `my-company-context.md` di tingkat plugin `common-room` dipastikan hanya lewat daftar berkas skrip, tidak dibuka. Dugaan = port regex saya identik dengan aslinya.
- Disposisi: ADAPT

### GCC-04 Pemeriksa tautan yang hanya menguji keberadaan berkas memberi rasa aman palsu (stub, anchor, tautan akar-situs)
- Sumber: `partner-built/zoom-plugin/skills/cobrowse-sdk/SKILL.md:761-766` (tautan ke `references/settings-reference.md#allowcustomerannotation`, `#piimask`, dan satu tautan rusak berspasi `#allowa gentannotation`), `cobrowse-sdk/references/settings-reference.md` (199 B, hanya `# Settings Reference`), `cobrowse-sdk/concepts/jwt-authentication.md` (judul tunggal, anchor `#enable-byop` tidak ada), `oauth/concepts/pkce.md` (satu judul `###Why` tanpa spasi); skrip atas 694 berkas. Menguatkan KWP-06 dan Bagian C butir 9 W8.
- Observasi: pada 694 berkas Zoom: 2.598 tautan relatif, 0 putus di dalam pohon dan 5 keluar akar (pemeriksaan keberadaan berkas lulus); tetapi 44 tautan dengan anchor menunjuk judul yang tidak ada (dua dari enam contoh diperiksa tangan: keduanya benar-benar tidak ada; algoritma slug saya hanya mendekati GitHub), 87 berkas ≤15 baris (stub), dan 5.414 tautan akar-situs `/docs/...` ke situs Zoom yang tidak dapat diselesaikan tanpa jaringan (±65% dari seluruh tautan markdown bukan-anchor termasuk 350 tautan http; asal terbesar belum dirinci per berkas, contoh yang terlihat ada di `classic-scopes.md`). Cacat markdown struktural jarang: 1 judul tanpa spasi, 1 pagar kode tak seimbang, 12 berkas dengan lebih dari satu H1. Aturan sumber "setiap md harus tertaut dari induk" (`CONTRIBUTING.md:80`) justru melahirkan stub: tautan terpenuhi, isi kosong.
- Nilai untuk Agent Core: bila lint struktur Skill (KWP-06) dibuat, pemeriksaan yang bernilai bukan keberadaan berkas, melainkan: anchor ada, target bukan stub, tautan akar-situs diberi tanda, dan keterbacaan (GCC-01). Pemeriksaan sintaks markdown murah tetapi hasilnya rendah (≤14 temuan per 694 berkas).
- Baseline Agent Core: `findMissingReferences` hanya keberadaan berkas dan berjalan pada pratinjau impor; tidak ada lint katalog. → BELUM-ADA (sama dengan KWP-06).
- Delta/celah: urutan prioritas pemeriksaan untuk `scripts/verify/skill-structure-lint.mjs`: (1) keterbacaan (GCC-01), (2) anchor ada, (3) target bukan stub (ambang ≤15 baris atau judul saja), (4) tautan akar-situs ditandai, (5) nama dalam tabel rute ada di katalog (133+75 nama usang di Zoom, W8), (6) baru terakhir sintaks markdown.
- Cara adaptasi: tambahkan butir (2)–(4) pada rancangan lint KWP-06; Node tanpa dependensi, keluaran ringkas, tanpa menulis berkas.
- Lisensi/hak cipta: aturan umum.
- Perkiraan skala: S-M · Risiko: rendah (baca-saja) · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: terverifikasi = hitungan skrip dan dua anchor diperiksa tangan; dugaan = 44 anchor semuanya rusak (empat sisanya dari enam contoh tidak diperiksa tangan, algoritma slug mungkin menghasilkan positif palsu).
- Disposisi: ADAPT

### GCC-05 Angka acuan ukuran dan rasio hub untuk standar penulisan (data nyata Zoom)
- Sumber: ukuran 694 berkas `zoom-plugin/skills`; `oauth/references/classic-scopes.md` (6.271 baris, 494 judul, 0 baris tabel), `granular-scopes.md` (3.458 baris, 247 judul, 2.716 baris tabel); `src/skills/service.ts:834-838` (maxBytes 512–32.768). Mendukung KWP-04 dan KWP-05.
- Observasi: distribusi: ≤2 KB 376 berkas (54,2%, 8,2% byte); 2–8 KB 171 berkas; 8–32 KB 134 berkas (2,0 MB); >32 KB 13 berkas (1,19 MB = 27,7% byte). Berkas >8 KB (21,2% file) memuat 74,6% byte. Rasio: 99 router (30 SKILL tingkat-atas + 27 SKILL bersarang + 42 RUNBOOK) berbanding 595 berkas lain = 1 : 6,0; median router 2,5 KB; median SKILL tingkat-atas 5,2 KB; SKILL bersarang 1,8 KB; referensi 1,6 KB; use-case 5,3 KB; berkas troubleshooting 1,1 KB. Koreksi: `classic-scopes.md` bukan tabel data melainkan 494 bagian per endpoint; hanya `granular-scopes.md` yang berbentuk tabel (±140 B per baris). Pada batas baca 8.192 B, satu berkas scope butuh 46–47 panggilan berurutan; tidak ada pencarian di dalam referensi.
- Nilai untuk Agent Core: angka konkret untuk standar hub tertulis (KWP-05): router ≈2,5 KB, hub produk ≈5 KB, referensi ≈1,6 KB; ambang pemecahan 32 KB; berkas yang tidak mungkin dibaca per fragmen sebaiknya diganti peta + indeks per prefiks (pola KWP-04).
- Baseline Agent Core: tidak ada standar ukuran tertulis; 25 dari 40 SKILL.md melampaui 8.192 B (W8).
- Delta/celah: angka acuan untuk standar tertulis; tidak ada kode.
- Cara adaptasi: docs di `runtime/skills/capability-packs/README.md` atau `docs/PROJECT-STRUCTURE.md` (bersama KWP-05).
- Lisensi/hak cipta: pola; MIT.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah-sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: terverifikasi = hitungan skrip. Dugaan = bahwa angka Zoom adalah target yang baik untuk Agent Core; manfaat kualitas belum diukur.
- Disposisi: REFERENSI

### GCC-06 Aturan estimator dan diff: yang hilang bukan nol, selisih bukan hasil, sebut angka mana yang dipakai
- Sumber: `small-business/skills/inventory-planner/reference/velocity_and_reorder.md` (jendela 7 dan 28 hari, "bila berbeda >50% periksa pesanan dasar", `stockout_velocity` dan `sizing_velocity` berbeda dan harus disebut, hari stok kosong dikeluarkan dari penyebut, kecepatan nol tidak memiliki hari-cakupan, buffer dibatasi 30 hari, musim disebut pemilik dan tidak pernah disimpulkan, entri pantauan harus bertanggal); `sales/skills/weekly-wrap/SKILL.md`, `forecast/SKILL.md` tiers (opp yang hilang dari ekspor baru adalah "closed or removed - outcome not in the upload", tidak pernah dianggap menang); `sales/skills/{account-context,call-prep,draft-outreach}` ("pratinjau pencarian hanya menampilkan pesan terlama: buka thread penuh sebelum mengkarakterisasi"); `inbox-sweep` ("jangan melebarkan jendela diam-diam: sebut email terbaru di luar jendela dan tawarkan"). Menambah KWB-02.
- Observasi: sama keluarga dengan KWB-02 (celah data dibaca sebagai fakta), dengan lima aturan baru yang tidak tertulis di W7: (1) set-selisih bukan hasil: item yang hilang di satu sisi tidak diberi penyebab; (2) dua estimasi yang berselisih besar memicu pemeriksaan data dasar, bukan memilih salah satu; (3) setiap angka menyebut estimasi mana yang dipakai; (4) periode tersensor dikeluarkan dari penyebut; (5) atribut yang hanya bisa dinyatakan pengguna (mis. musim) tidak pernah disimpulkan dari data sepi.
- Nilai untuk Agent Core: kelas kesimpulan keliru yang percaya diri pada hasil tool: "file ini tidak ada di diff" (dihapus atau dipindah?), "tidak ada pemanggil" (grep terpotong), "hanya satu pengujian gagal" (daftar dipotong).
- Baseline Agent Core: `VerifiedValueRegistry`, `statistical_pitfalls.md` (statistika), `source-driven-development` (UNVERIFIED untuk klaim dokumen); belum ada aturan keluaran tool/diff (KWB-02 mengusulkan referensinya). → SEBAGIAN.
- Delta/celah: lima butir di atas sebagai tambahan pada `mind-control/references/tool_output_trust.md` (KWB-02) atau `debugging-and-error-recovery/references/`.
- Cara adaptasi: gabung ke referensi KWB-02 (≤+0,8 KB); tanpa Skill baru; verifikasi lewat kasus beku `evals/cases.json` bila berada di `mind-control`.
- Lisensi/hak cipta: gagasan; Apache-2.0.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang-rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: terverifikasi = teks sumber dibaca; dugaan = frekuensi kegagalan serupa pada sesi Agent Core tidak diukur.
- Disposisi: ADAPT (kecil, digabung ke KWB-02)

### GCC-07 Inventaris klaim, gerbang outline murah, gerbang audiens, dan tanda kutipan-vs-parafrasa untuk keluaran yang dibuat
- Sumber: `sales/skills/create-an-asset/SKILL.md` (langkah 2: urutan sumber; "inventaris isi: setiap klaim dengan sumbernya" sebelum render; tampilkan inventaris + outline lalu tunggu "go" karena "lebih murah memperbaiki outline daripada dek"; langkah 4: setiap klaim terlacak ke inventaris, aset menghadap pelanggan tidak berisi konten internal-saja, setiap angka spesifik pelanggan punya sitasi atau tanda kurung; klaim tak tercakup diberi label UNVERIFIED, "never silently fall back to memory"); `sales/skills/customer-voice` (hanya teks dalam tanda kutip dari sumber yang dihitung kutipan, parafrasa adalah konteks); `call-prep` ("jangan mengangkat angka dari brief tanpa jawaban bersitasi").
- Observasi: alur pembuatan keluaran bernilai tinggi (dek, halaman, template) dengan tiga pengaman murah: inventaris klaim sebelum render, persetujuan outline sebelum generasi mahal, pemeriksaan audiens sebelum penyerahan.
- Nilai untuk Agent Core: pengguna sering meminta keluaran desain dan template; menghasilkan seluruh halaman lalu direvisi dari nol mahal bagi kuota. Gerbang outline mengurangi iterasi.
- Baseline Agent Core: `source-driven-development` memuat label UNVERIFIED untuk klaim dokumentasi kode (grep: satu-satunya SKILL.md yang cocok); alur Replica dan `frontend-ui-engineering` tidak memuat inventaris klaim atau gerbang outline. → SEBAGIAN.
- Delta/celah: referensi singkat "inventaris isi + persetujuan outline" untuk pekerjaan keluaran naratif/desain.
- Cara adaptasi: satu referensi ≤1,5 KB pada `frontend-ui-engineering` atau `idea-refine` lewat revisi SkillService (tanpa baris indeks baru). Jangan menambahkan gerbang pertanyaan yang bertentangan dengan `AGENTS.md:155-156` (tanya hanya bila niat belum jelas): gerbang outline hanya untuk keluaran besar.
- Lisensi/hak cipta: gagasan; Apache-2.0.
- Perkiraan skala: S · Risiko: rendah-sedang (bisa menambah ritual konfirmasi bila terlalu luas) · Nilai: sedang-rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: terverifikasi = langkah sumber dan satu hit grep; dugaan = manfaat nyata terhadap jumlah iterasi pengguna.
- Disposisi: ADAPT (kecil)

### GCC-08 Set fixture sintetis dari bentuk Zoom/small-business yang terukur
- Sumber: seluruh pengukuran di GCC-01..04; `tests/skill-claude-plugin.test.ts:28,74` (per W7: hanya dua kasus tautan). Menjawab pertanyaan Q5 W8.
- Observasi: tujuh bentuk nyata menguji adapter dan belum ada di uji: (1) `triggers:` daftar (63% skill Zoom); (2) deskripsi `|`/`>` (33 dari 44 small-business); (3) folder `reference/` tunggal (152 berkas); (4) tautan skill bersaudara `../<nama>/SKILL.md`; (5) tautan akar-situs `/docs/...` dan `../../CONNECTORS.md`; (6) stub + anchor rusak; (7) `name` ≠ folder (14 dari 30). Ditambah kasus pinggiran: nilai metadata >500 karakter, placeholder `[domain]`, segmen berawalan `_`.
- Nilai untuk Agent Core: bukan menyalin plugin, tetapi menjaga perbaikan GCC-01/02/03 tidak regresi, dengan berkas kecil yang ditulis sendiri.
- Baseline Agent Core: uji adapter ada tetapi sempit → SEBAGIAN.
- Delta/celah: fixture mini (satu plugin sintetis, ≈6 skill, <3 KB per skill) yang mengikat tujuh bentuk di atas ke status yang diharapkan.
- Cara adaptasi: `tests/skill-claude-plugin.test.ts` dan direktori fixture di `tests/`, tanpa menyalin berkas Zoom; kriteria lulus = tidak ada skill `unsupported` kecuali yang disengaja, ringkasan keterbacaan sesuai, kelas "missing" benar.
- Lisensi/hak cipta: ditulis sendiri.
- Perkiraan skala: S · Risiko: rendah · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: terverifikasi = bentuk-bentuk diukur dari data; dugaan = ketiadaan kasus serupa di uji sekarang (hanya dua kasus tautan dilihat lewat W7, berkas uji tidak saya buka).
- Disposisi: ADAPT

### GCC-09 Pola kecil lain yang layak dicatat (tanpa tindakan terpisah)
- Sumber: `sales/skills/deal-signals` (sapuan hanya melaporkan yang melewati ambang; "digest tenang adalah keberhasilan"; buka dengan jumlah item baru sejak run terakhir; ambang menyesuaikan siklus: 14 hari tenang salah untuk siklus 30 hari), `route-lead` ("aturan yang dipakai selalu disebut"; alasan penggantian dicatat dan alasan berulang diajukan sebagai perubahan aturan), `legal/skills/triage-nda` (baris "Review Basis: Playbook / Default Standards" di keluaran), `small-business/skills/build-connector/reference/{discovery,paths}.md` (tangga opsi: berhenti pada kecocokan pertama; "yang membosankan dulu"; jawaban "tidak ada" jujur dengan jalan keluar; biaya, usaha, dan penghalang dalam tiga baris; kegagalan diam pada ekspor terjadwal diatasi dengan pemeriksaan "tidak ada berkas dalam interval ini: katakan keras"; "jangan sebut harga dari ingatan").
- Observasi: pola kecil yang sudah sejalan dengan doktrin Agent Core.
- Nilai untuk Agent Core: (a) digest "hanya yang berubah" cocok bila Native kelak punya run terjadwal (KWA-09); (b) alasan override yang berulang menjadi kandidat aturan adalah bentuk jalur `user-correction` Learning yang sudah ada; (c) tangga opsi sejalan dengan urutan perluasan kapabilitas (Skill → aksi facade → skrip → docs → tool baru); (d) baris "dasar tinjauan" menyatakan standar mana yang dipakai.
- Baseline Agent Core: SUDAH-ADA / SEBAGIAN (`src/learning/triggers.ts:9-13`, doktrin anggaran manifest). 
- Delta/celah: tidak ada yang mendesak.
- Cara adaptasi: tidak ada.
- Lisensi/hak cipta: gagasan.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: terverifikasi = teks sumber; dugaan = relevansi bergantung pada rencana run terjadwal Native.
- Disposisi: REFERENSI

---

# Bagian C — Ditolak atau tidak relevan

- GCC-C1 Isi domain Zoom (platform Windows/Linux/iOS/Android/web, `rest-api/references`, tabel scope 740 KB): domain SDK vendor, cepat basi, dan tidak bernilai bagi Agent Core; bentuknya sudah diukur di GCC-05. `oauth/concepts/pkce.md` adalah penjelasan umum PKCE (14,6 KB dengan diagram ASCII) yang sudah diketahui model, tanpa pengaman khusus.
- GCC-C2 Jalur Zapier (`use-zapier.md`): mengalirkan data pengguna ke layanan pihak ketiga berbayar per tugas; bertentangan dengan local-first. Pola "aktifkan hanya satu aksi; mengaktifkan tanpa nama menghidupkan semua aksi termasuk hapus dan kirim" dicatat sebagai pengingat prinsip hak minimal, tanpa tindakan.
- GCC-C3 Rumus ambang dan skor domain `sales`/`marketing`/`legal`/`human-resources`: tidak diimpor; pola yang berharga sudah di KWA dan GCC-06/07/09.
- GCC-C4 Dashboard HTML Chart.js dan ambang ukuran data (`build-dashboard`): UI paralel tidak diperlukan.
- GCC-C5 Dugaan "adapter perlu membaca `triggers` ke dalam `## Triggers` badan secara otomatis": ditolak karena mengubah isi tanpa persetujuan; cukup metadata (GCC-02).

---

# Bagian D — Pola lintas-unit dan pertanyaan terbuka

Pola:
1. Tautan ada belum berarti isi tersedia: tiga lapis harus diperiksa terpisah: berkas ada, dapat dibaca oleh tool yang tersedia, tidak kosong (GCC-01, 03, 04). Pemeriksa yang hanya menguji keberadaan melahirkan stub.
2. Konvensi folder tidak seragam bahkan dalam repo satu penerbit: `reference/` (small-business) versus `references/` (semua lain); adapter harus menormalkan atau menolak, bukan berasumsi.
3. Laporan pratinjau harus memisahkan kelas sebab (di luar akar, bersaudara, hilang, tak terbaca); satu daftar datar terpotong 64 mengubur 3% sinyal.
4. Keluaran yang jujur: sebut estimasi yang dipakai, sebut yang tidak diketahui, jangan beri penyebab pada selisih (GCC-06).
5. Gerbang yang murah untuk keluaran besar: inventaris klaim dan outline sebelum render (GCC-07).

Pertanyaan terbuka untuk Main:
1. Untuk GCC-01 langkah 1: apakah Native dan controller eksternal membaca berkas pack di luar `references/` lewat tool berkas biasa? Jawabannya menentukan apakah 12 pack yang disebut adalah cacat nyata atau hanya kenyamanan.
2. Relokasi saat impor atau allow-list awalan (GCC-01 langkah 3)?
3. Akankah plugin gaya Zoom atau small-business diimpor sungguhan? Tanpa itu GCC-02 dan sebagian GCC-03 bernilai rendah.
4. Apakah jawaban "tidak dibuka" pada Bagian A (platform docs Zoom, `rest-api/references`, 148 referensi small-business, 14 berkas `shared/`) cukup, atau perlu putaran baca terpisah dengan anggaran konteks lebih besar?
